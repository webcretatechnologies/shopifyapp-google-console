const axios = require('axios');
const { Shop, ShopSettings, Product, AIVisibilityRun, AIVisibilityResult } = require('../models');
const { sendAIVisibilityComplete } = require('./email');
const { getConfig } = require('./appConfig');

const SYSTEM_PROMPT =
  'You are a helpful assistant. Recommend specific brands, products, and websites with citations when possible.';

// ── Provider abstraction ────────────────────────────────────────────────────
// Every provider here is FREE-tier. Keys live in .env at the platform level
// so shop owners never configure them. `envVar` names the .env variable each
// provider reads from.
const PROVIDERS = {
  gemini: {
    name: 'Gemini',
    label: 'Google Gemini',
    color: '#1a73e8',
    icon: 'G',
    iconBg: '#1a73e8',
    defaultModel: 'gemini-flash-latest',
    envVar: 'GEMINI_API_KEY',
    freeTier: '1500 requests/day on Flash models',
    async run(apiKey, prompt, model) {
      const m = model || 'gemini-flash-latest';
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      const cand = res.data.candidates?.[0];
      const parts = cand?.content?.parts || [];
      const text = parts.map(p => p.text || '').join('');
      const meta = res.data.usageMetadata || {};
      return {
        text,
        usage: {
          prompt_tokens: meta.promptTokenCount,
          completion_tokens: meta.candidatesTokenCount,
        },
      };
    },
  },

  groq: {
    name: 'Groq (Llama)',
    label: 'Groq — Llama 3.3 70B',
    color: '#f55036',
    icon: 'GQ',
    iconBg: '#f55036',
    defaultModel: 'llama-3.3-70b-versatile',
    envVar: 'GROQ_API_KEY',
    freeTier: 'Generous free tier',
    async run(apiKey, prompt, model) {
      const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: model || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 700,
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      const choice = res.data.choices?.[0];
      return {
        text: choice?.message?.content || '',
        usage: {
          prompt_tokens: res.data.usage?.prompt_tokens,
          completion_tokens: res.data.usage?.completion_tokens,
        },
      };
    },
  },

  openrouter: {
    name: 'GPT-OSS',
    label: 'OpenAI GPT-OSS 120B (via OpenRouter)',
    color: '#10a37f',
    icon: 'GPT',
    iconBg: '#10a37f',
    defaultModel: 'openai/gpt-oss-120b:free',
    envVar: 'OPENROUTER_API_KEY',
    freeTier: 'Uses OpenRouter\'s ":free" model tier',
    async run(apiKey, prompt, model) {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model || 'openai/gpt-oss-120b:free',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 700,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'https://analytics.boxtasks.com',
            'X-Title': 'Shopify AI Visibility',
          },
          timeout: 60000,
        }
      );
      const choice = res.data.choices?.[0];
      return {
        text: choice?.message?.content || '',
        usage: {
          prompt_tokens: res.data.usage?.prompt_tokens,
          completion_tokens: res.data.usage?.completion_tokens,
        },
      };
    },
  },
};

// Read all platform keys via the appConfig service (DB → .env fallback).
// Only providers with a configured key end up in the returned object.
async function getPlatformKeys() {
  const out = {};
  for (const [pid, provider] of Object.entries(PROVIDERS)) {
    const v = await getConfig(provider.envVar);
    if (v && v.trim()) out[pid] = v.trim();
  }
  return out;
}

// ── Mention + citation parsing ──────────────────────────────────────────────
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function countBrandMentions(text, brandName) {
  if (!text || !brandName) return 0;
  const re = new RegExp(`\\b${escapeRegex(brandName)}\\b`, 'gi');
  return (text.match(re) || []).length;
}

function extractCitations(text) {
  if (!text) return [];
  const urls = [...text.matchAll(/https?:\/\/[^\s)\]<>"']+/gi)]
    .map(m => m[0].replace(/[.,;:!?)\]]+$/, ''));
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ url: u });
  }
  return out;
}

function isBrandUrl(url, brandDomain) {
  if (!url || !brandDomain) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const brand = brandDomain.replace(/^www\./, '').toLowerCase();
    return host === brand || host.endsWith('.' + brand);
  } catch { return false; }
}

// ── Default prompt set ───────────────────────────────────────────────────────
async function buildDefaultPrompts(shopId, brandName) {
  const products = await Product.findAll({
    where: { shop_id: shopId, status: 'active' },
    order: [['updated_at', 'DESC']],
    limit: 6,
  });

  const types = [...new Set(products.map(p => p.product_type).filter(Boolean))].slice(0, 4);
  const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))].slice(0, 2);

  const prompts = [
    { topic: 'Brand', intent: 'navigational',  prompt: `What is ${brandName}? What do they sell?` },
    { topic: 'Brand', intent: 'commercial',    prompt: `Is ${brandName} a good place to shop? What products are they known for?` },
    { topic: 'Brand', intent: 'informational', prompt: `Tell me about the brand ${brandName} — what makes them different from competitors?` },
  ];

  for (const t of types) {
    prompts.push({
      topic: t,
      intent: 'commercial',
      prompt: `Recommend the best ${t.toLowerCase()} to buy online. Mention specific brands and stores with links.`,
    });
    prompts.push({
      topic: t,
      intent: 'commercial',
      prompt: `Where can I buy ${t.toLowerCase()} online? List trustworthy stores and websites.`,
    });
  }

  for (const v of vendors) {
    prompts.push({
      topic: v,
      intent: 'commercial',
      prompt: `Where can I buy ${v} products online? Which stores stock them?`,
    });
  }

  return prompts.slice(0, 12);
}

// ── Main runner ──────────────────────────────────────────────────────────────
async function runVisibility(runId) {
  const run = await AIVisibilityRun.findByPk(runId);
  if (!run) return;

  await run.update({ status: 'running', started_at: new Date() });

  try {
    const shop = await Shop.findByPk(run.shop_id);
    const settings = await ShopSettings.findOne({ where: { shop_id: run.shop_id } });
    const allKeys = await getPlatformKeys();
    if (!Object.keys(allKeys).length) {
      throw new Error('No AI provider keys configured at the platform level (.env)');
    }

    const requested = run.config?.providers;
    const activeProviders = Object.keys(allKeys).filter(p => !requested || requested.includes(p));
    if (!activeProviders.length) throw new Error('No matching providers configured');

    const brandName = run.brand_name;
    const brandDomain = run.config?.brand_domain || shop.shop_domain;

    let prompts = run.config?.prompts;
    if (!prompts || !prompts.length) {
      prompts = await buildDefaultPrompts(run.shop_id, brandName);
    }

    const totalResults = prompts.length * activeProviders.length;
    await run.update({ prompts_total: totalResults, providers: activeProviders });

    let mentions = 0, citations = 0, completed = 0;

    // Once a provider returns a permanent failure (rate-limit / auth / quota),
    // we skip it for the rest of the run instead of hammering it 9 more times
    // and waiting for 9 timeouts. Re-tryable network blips DON'T trigger this.
    const PERMANENT_FAIL_RE = /quota|billing|insufficient|payment_required|credit balance|out of credit|rate.?limit|429|invalid.api.key|invalid_api_key|unauthor|401|403/i;
    const skip = new Set();

    for (const p of prompts) {
      const tryProviders = activeProviders.filter(pid => !skip.has(pid));
      const perProvider = await Promise.all(tryProviders.map(async (pid) => {
        const provider = PROVIDERS[pid];
        const startedAt = Date.now();
        let text = '', usage = {}, errMsg = null;
        try {
          const r = await provider.run(allKeys[pid], p.prompt, provider.defaultModel);
          text = r.text;
          usage = r.usage || {};
        } catch (err) {
          errMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message;
          if (typeof errMsg !== 'string') errMsg = JSON.stringify(errMsg).slice(0, 500);
          console.error(`[AIVisibility] ${pid} prompt failed: ${errMsg}`);
          if (PERMANENT_FAIL_RE.test(errMsg)) {
            console.warn(`[AIVisibility] ${pid} skipped for the rest of run #${run.id} (permanent failure: rate-limit / auth)`);
            skip.add(pid);
          }
        }

        const mentionCount = countBrandMentions(text, brandName);
        const cites = extractCitations(text);
        const brandCited = cites.some(c => isBrandUrl(c.url, brandDomain));

        await AIVisibilityResult.create({
          run_id: run.id,
          shop_id: run.shop_id,
          prompt: p.prompt,
          topic: p.topic || null,
          intent: p.intent || null,
          provider: pid,
          response_text: text,
          brand_mentioned: mentionCount > 0,
          brand_mention_count: mentionCount,
          citations: cites.length ? cites : null,
          citation_count: cites.length,
          brand_cited: brandCited,
          prompt_tokens: usage.prompt_tokens || null,
          completion_tokens: usage.completion_tokens || null,
          duration_ms: Date.now() - startedAt,
          error: errMsg ? errMsg.slice(0, 500) : null,
        });

        return { mentionCount, citationCount: cites.length };
      }));

      for (const r of perProvider) {
        mentions += r.mentionCount;
        citations += r.citationCount;
      }
      // Count attempted providers (not the ones we skipped) toward completion
      // so the progress indicator advances naturally.
      completed += tryProviders.length;
      await run.update({ prompts_completed: completed });
    }

    const mentionedCount = await AIVisibilityResult.count({ where: { run_id: run.id, brand_mentioned: true } });
    const brandCitedCount = await AIVisibilityResult.count({ where: { run_id: run.id, brand_cited: true } });
    const mentionRate = totalResults ? mentionedCount / totalResults : 0;
    const brandCitedRate = totalResults ? brandCitedCount / totalResults : 0;
    const score = Math.round((mentionRate * 70 + brandCitedRate * 30) * 100);

    await run.update({
      status: 'completed',
      completed_at: new Date(),
      mentions_total: mentions,
      citations_total: citations,
      cited_pages_total: brandCitedCount,
      visibility_score: score,
      cost_usd: 0,
    });

    console.log(`[AIVisibility] Run #${run.id} done: score=${score}, ${mentions} mentions across ${prompts.length} prompts × ${activeProviders.length} providers (FREE)`);

    // Completion email — non-blocking
    if (shop?.email) {
      await run.reload();
      sendAIVisibilityComplete(shop, run).catch(e => console.error('[Email] ai-visibility-complete failed:', e.message));
    }
  } catch (err) {
    console.error(`[AIVisibility] Run #${run.id} failed:`, err.message);
    await run.update({
      status: 'failed',
      error_message: err.message,
      completed_at: new Date(),
    });
  }
}

module.exports = { runVisibility, PROVIDERS, buildDefaultPrompts, getPlatformKeys };
