// Shared LLM caller used by every AI feature in the app (Site Audit fix-its,
// keyword finders, AI digests, etc.). Wraps Gemini / Groq / OpenRouter with
// automatic failover so a single rate-limit or outage doesn't take a feature
// down. Keys live in DB (via appConfig) with .env fallback — same pattern as
// the AI Visibility service.

const axios = require('axios');
const { AsyncLocalStorage } = require('async_hooks');
const { getConfig } = require('./appConfig');

// Per-request shop context. shopifyAuth wraps each authenticated request so
// askLLM() can pick up the shop id without every call site passing it. Cron
// and background tasks set this manually via withShop().
const shopContext = new AsyncLocalStorage();

function withShop(shopId, fn) {
  return shopContext.run(shopId, fn);
}

function getCurrentShopId() {
  return shopContext.getStore() || null;
}

// Map provider id → encrypted column on ShopSettings.
const SHOP_KEY_FIELDS = {
  openai:     'openai_key_enc',
  anthropic:  'anthropic_key_enc',
  gemini:     'gemini_key_enc',
  groq:       'groq_key_enc',
  openrouter: 'openrouter_key_enc',
};

// Resolve a per-shop API key for the given provider. Returns null if no
// override is configured. Loaded fresh from DB each call (no cache) — keys
// change rarely and LLM calls are seconds-long, so the DB hit is negligible.
async function getShopProviderKey(shopId, providerId) {
  if (!shopId) return null;
  const field = SHOP_KEY_FIELDS[providerId];
  if (!field) return null;
  try {
    const { ShopSettings } = require('../models');
    const { decrypt } = require('./encryption');
    const settings = await ShopSettings.findOne({
      where: { shop_id: shopId },
      attributes: [field],
    });
    if (!settings || !settings[field]) return null;
    return decrypt(settings[field]);
  } catch (err) {
    console.warn(`[llm] shop key lookup failed for shop ${shopId}/${providerId}:`, err.message);
    return null;
  }
}

const PROVIDERS = {
  // ── Paid (preferred when configured) ──────────────────────────────────
  openai: {
    envVar: 'OPENAI_API_KEY',
    paid: true,
    async run(apiKey, system, user, opts) {
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: opts.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 800,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: opts.timeout ?? 60000 }
      );
      return res.data.choices?.[0]?.message?.content || '';
    },
  },

  anthropic: {
    envVar: 'ANTHROPIC_API_KEY',
    paid: true,
    async run(apiKey, system, user, opts) {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: opts.model || 'claude-3-5-haiku-latest',
          max_tokens: opts.maxTokens ?? 800,
          temperature: opts.temperature ?? 0.4,
          system,
          messages: [{ role: 'user', content: user }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: opts.timeout ?? 60000,
        }
      );
      const blocks = res.data.content || [];
      return blocks.filter(b => b.type === 'text').map(b => b.text).join('');
    },
  },

  // ── Free tier (fallback) ──────────────────────────────────────────────
  gemini: {
    envVar: 'GEMINI_API_KEY',
    async run(apiKey, system, user, opts) {
      const model = opts.model || 'gemini-flash-latest';
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.4,
            maxOutputTokens: opts.maxTokens ?? 800,
            responseMimeType: opts.json ? 'application/json' : 'text/plain',
          },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: opts.timeout ?? 60000 }
      );
      const parts = res.data.candidates?.[0]?.content?.parts || [];
      return parts.map(p => p.text || '').join('');
    },
  },

  groq: {
    envVar: 'GROQ_API_KEY',
    async run(apiKey, system, user, opts) {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: opts.model || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 800,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: opts.timeout ?? 60000 }
      );
      return res.data.choices?.[0]?.message?.content || '';
    },
  },

  openrouter: {
    envVar: 'OPENROUTER_API_KEY',
    async run(apiKey, system, user, opts) {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: opts.model || 'openai/gpt-oss-120b:free',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 800,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'https://analytics.boxtasks.com',
            'X-Title': 'Shopify Google Console Analytics',
          },
          timeout: opts.timeout ?? 60000,
        }
      );
      return res.data.choices?.[0]?.message?.content || '';
    },
  },
};

// Provider try-order: paid providers first (better quality + reliability),
// then free-tier fallbacks. The first one with a configured key wins per call.
const ORDER = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter'];

async function configuredProviders(shopId = null) {
  const out = [];
  for (const id of ORDER) {
    let key = null;
    let source = null;
    // Prefer shop-level override when a shop context is active.
    if (shopId) {
      key = await getShopProviderKey(shopId, id);
      if (key) source = 'shop';
    }
    // Fall back to platform key (DB AppConfig → process.env)
    if (!key) {
      key = await getConfig(PROVIDERS[id].envVar);
      if (key) source = 'platform';
    }
    if (key && key.trim()) out.push({ id, key: key.trim(), source });
  }
  return out;
}

// askLLM(user, options)
//   options:
//     system   — system prompt (default: helpful assistant)
//     json     — true to ask provider for JSON output
//     temperature, maxTokens, model, timeout — passthrough
// Returns the model's text response. Throws if every provider fails.
async function askLLM(user, options = {}) {
  const system = options.system || 'You are a helpful assistant.';
  // Resolve shop id: explicit option > AsyncLocalStorage (set by shopifyAuth) > none
  const shopId = options.shopId ?? getCurrentShopId();
  const providers = await configuredProviders(shopId);
  if (!providers.length) {
    throw new Error('No LLM provider key configured. Set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.');
  }
  // Diagnostic — shows whether shop-level overrides are in effect for this call
  console.log(`[llm] shop=${shopId || 'none'} try-order=${providers.map(p => `${p.id}(${p.source})`).join(',')}`);
  const errors = [];
  for (const { id, key, source } of providers) {
    try {
      const text = await PROVIDERS[id].run(key, system, user, options);
      if (text && text.trim()) {
        console.log(`[llm] used=${id} source=${source} shop=${shopId || 'none'}`);
        return text;
      }
      errors.push(`${id}: empty response`);
    } catch (err) {
      errors.push(`${id}: ${err.response?.status || ''} ${err.message}`);
    }
  }
  throw new Error(`All LLM providers failed: ${errors.join(' | ')}`);
}

// Best-effort repair for JSON truncated mid-output (the LLM hit maxTokens
// before finishing). Strategy:
//   1. Find first { or [
//   2. Walk forward tracking string state + bracket stack + checkpoints (a
//      checkpoint is a comma at depth >= 1, marking a position between two
//      complete sibling elements)
//   3. Try closing the current state (close string if open, close stack)
//      and parsing
//   4. If that fails, try truncating at each checkpoint from latest to
//      earliest, closing brackets, parsing
function tryRepairTruncated(text) {
  if (!text || typeof text !== 'string') return null;
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  let start = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
  else if (arrStart >= 0) start = arrStart;
  if (start < 0) return null;
  const body = text.slice(start);

  // Walk once to collect checkpoints + final state
  const checkpoints = [];
  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') stack.pop();
    else if (c === ',' && stack.length >= 1) checkpoints.push(i);
  }

  // Attempt A: close current state and parse
  const closeStack = (s) => {
    let out = '';
    for (let i = s.length - 1; i >= 0; i--) out += s[i];
    return out;
  };
  let attempt = body;
  if (inString) attempt += '"';
  attempt += closeStack(stack);
  try { return JSON.parse(attempt); } catch {}

  // Attempt B: truncate at each checkpoint (latest → earliest), drop everything
  // after the comma (which presumably contained the partially-built element),
  // close brackets at that point's depth.
  for (let i = checkpoints.length - 1; i >= 0; i--) {
    const pos = checkpoints[i];
    const candidate = body.slice(0, pos); // up to but not including the comma
    // Recompute stack at this position
    const sub = [];
    let s = false, e = false;
    for (let j = 0; j < candidate.length; j++) {
      const c = candidate[j];
      if (e) { e = false; continue; }
      if (c === '\\') { e = true; continue; }
      if (c === '"') { s = !s; continue; }
      if (s) continue;
      if (c === '{' || c === '[') sub.push(c === '{' ? '}' : ']');
      else if (c === '}' || c === ']') sub.pop();
    }
    const closed = candidate + closeStack(sub);
    try { return JSON.parse(closed); } catch {}
  }
  return null;
}

// askLLMJson(user, options) — same as askLLM but parses the response as JSON.
// Tolerates code fences, leading/trailing prose, and the model picking arrays
// vs objects. Tries hard to recover before throwing.
async function askLLMJson(user, options = {}) {
  const stricten = (s) => `${s}\n\nIMPORTANT: Respond with ONLY valid JSON. No prose, no markdown fences, no commentary before or after. Start with { or [ and end with } or ].`;

  // Best-effort cleaner. Tries (in order): direct parse, fence-stripped parse,
  // first {...}/[...] block extraction with brace-balancing.
  const tryParse = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();

    // 1. Direct parse.
    try { return JSON.parse(trimmed); } catch {}

    // 2. Strip ```json or ``` fences (anywhere in the response).
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      try { return JSON.parse(fenceMatch[1].trim()); } catch {}
    }

    // 3. Find the first balanced { ... } or [ ... ] block. The model often
    //    prepends "Sure, here's the JSON:" or appends notes — extract just
    //    the JSON.
    const extractBalanced = (open, close) => {
      const start = trimmed.indexOf(open);
      if (start < 0) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < trimmed.length; i++) {
        const c = trimmed[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) return trimmed.slice(start, i + 1);
        }
      }
      return null;
    };
    const objBlock = extractBalanced('{', '}');
    if (objBlock) { try { return JSON.parse(objBlock); } catch {} }
    const arrBlock = extractBalanced('[', ']');
    if (arrBlock) { try { return JSON.parse(arrBlock); } catch {} }

    // 4. Repair truncated JSON. Common cause: model hits maxTokens limit
    //    mid-string. We:
    //      a) close any open string and brackets, try parsing.
    //      b) walk back to the last "checkpoint" (a comma at depth >=1 between
    //         complete elements), drop everything after, close brackets, retry.
    return tryRepairTruncated(trimmed);
  };

  const opts = { ...options, json: true };

  // Attempt 1.
  const first = await askLLM(stricten(user), opts);
  let parsed = tryParse(first);
  if (parsed != null) return parsed;

  // Attempt 2 — stricter, forced lower temperature.
  const second = await askLLM(
    `${stricten(user)}\n\nThe previous response was not valid JSON. Output ONLY the JSON object now, nothing else.`,
    { ...opts, temperature: 0.1 },
  );
  parsed = tryParse(second);
  if (parsed != null) return parsed;

  // Log the actual response to help debugging without spamming user-facing errors.
  console.warn('[askLLMJson] Could not parse:', String(second).slice(0, 300));
  throw new Error('LLM returned non-JSON response after two attempts');
}

module.exports = {
  askLLM,
  askLLMJson,
  configuredProviders,
  // Shop-context helpers — called from shopifyAuth middleware and cron tasks.
  withShop,
  getCurrentShopId,
  getShopProviderKey,
  SHOP_KEY_FIELDS,
};
