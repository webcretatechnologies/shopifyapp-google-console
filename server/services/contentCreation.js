// AI-driven product copy generation. Reuses the LLM providers wired up
// in services/aiVisibility.js and the platform-managed keys from appConfig.
const { Product, ContentDraft } = require('../models');
const { PROVIDERS } = require('./aiVisibility');
const { getConfig } = require('./appConfig');

// Pick the first available provider from a preference order
async function pickProvider(preferred = ['gemini', 'groq', 'openrouter']) {
  for (const pid of preferred) {
    const provider = PROVIDERS[pid];
    if (!provider) continue;
    const key = await getConfig(provider.envVar);
    if (key) return { pid, provider, key };
  }
  throw new Error('No AI provider keys configured at the platform level');
}

// Return EVERY configured provider in preference order — driver for failover.
async function listProviders(preferred = ['gemini', 'groq', 'openrouter']) {
  const out = [];
  for (const pid of preferred) {
    const provider = PROVIDERS[pid];
    if (!provider) continue;
    const key = await getConfig(provider.envVar);
    if (key) out.push({ pid, provider, key });
  }
  return out;
}

// Run `op({ pid, provider, key })` against each configured provider in order
// until one returns a successful result. `op` may:
//   - throw                                    → skip provider, try next
//   - return { invalid: true, reason }         → same as throw with reason
//   - return any other value                   → success, returned to caller
//
// Resolves: { result, providerUsed, attempts: [{pid, error}] }. Rejects only
// if every provider failed, with all individual errors merged into one.
async function withProviderFailover(op, preferred) {
  const providers = await listProviders(preferred);
  if (!providers.length) {
    throw new Error('No AI provider keys configured at the platform level (.env)');
  }

  const attempts = [];
  for (const ctx of providers) {
    try {
      const result = await op(ctx);
      if (result && result.invalid) {
        attempts.push({ pid: ctx.pid, error: result.reason || 'invalid output' });
        console.warn(`[failover] ${ctx.pid} returned invalid output — trying next`);
        continue;
      }
      return { result, providerUsed: ctx.pid, attempts };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      attempts.push({ pid: ctx.pid, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
      console.warn(`[failover] ${ctx.pid} threw — trying next:`, msg);
    }
  }

  const summary = attempts.map(a => `${a.pid}: ${a.error}`).join(' | ');
  const e = new Error(`All AI providers failed. ${summary}`);
  e.attempts = attempts;
  throw e;
}

// ── Prompt builders — each returns a focused, single-output instruction ────
function descriptionPrompt(p) {
  return `You are an e-commerce copywriter. Write a compelling, SEO-friendly product description for the following product.

Product title: ${p.title}
${p.product_type ? `Product type: ${p.product_type}\n` : ''}${p.vendor ? `Vendor / brand: ${p.vendor}\n` : ''}${p.tags ? `Tags: ${p.tags}\n` : ''}${p.body_html ? `Existing description (rewrite/improve, do not just paraphrase):\n${stripHtml(p.body_html).slice(0, 800)}\n` : ''}
Requirements:
- 90–160 words
- Lead with the strongest benefit
- Include 2–4 specific feature bullets formatted as plain text bullets (•)
- Conversational tone, no marketing fluff like "revolutionary" or "best-in-class"
- End with a soft call-to-action sentence

Return only the description text — no headings, no quotes, no preamble.`;
}

function titlePrompt(p) {
  return `Suggest a single SEO-optimized product title for this Shopify product.

Current title: ${p.title}
${p.product_type ? `Product type: ${p.product_type}\n` : ''}${p.vendor ? `Brand: ${p.vendor}\n` : ''}
Rules:
- Maximum 70 characters
- Include the brand name if relevant
- Include the most important keyword shoppers would search
- No emoji, no ALL CAPS, no quotes

Return only the suggested title text on a single line — nothing else.`;
}

function metaTitlePrompt(p) {
  return `Write an SEO meta title (the <title> tag) for this product page.

Product: ${p.title}
${p.vendor ? `Brand: ${p.vendor}\n` : ''}${p.product_type ? `Type: ${p.product_type}\n` : ''}
Rules:
- 50–60 characters (Google truncates beyond ~60)
- Front-load the main keyword
- Include the brand name when it fits

Return only the meta title text — no quotes, no preamble.`;
}

function metaDescriptionPrompt(p) {
  return `Write an SEO meta description for this product page.

Product: ${p.title}
${p.product_type ? `Type: ${p.product_type}\n` : ''}${p.body_html ? `Source (summarize, do not copy):\n${stripHtml(p.body_html).slice(0, 600)}\n` : ''}
Rules:
- 140–160 characters
- One sentence, action-oriented
- Mention a unique benefit and end with implicit CTA ("Shop now.", "Discover...", etc.)

Return only the meta description text — no quotes, no preamble.`;
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const PROMPT_BY_KIND = {
  description:      descriptionPrompt,
  title:            titlePrompt,
  meta_title:       metaTitlePrompt,
  meta_description: metaDescriptionPrompt,
};

// ── Public API ──────────────────────────────────────────────────────────────
// generateForProduct({ productId, shopId, kinds, providerPreference }) → array of saved ContentDraft
// Each kind tries every configured provider in order until one returns
// non-empty text. The provider that actually produced the text is recorded
// on the draft.
async function generateForProduct({ productId, shopId, kinds, providerPreference }) {
  if (!Array.isArray(kinds) || !kinds.length) {
    throw new Error('At least one `kind` is required');
  }
  for (const k of kinds) {
    if (!PROMPT_BY_KIND[k]) throw new Error(`Unknown content kind: ${k}`);
  }

  const product = await Product.findOne({ where: { id: productId, shop_id: shopId } });
  if (!product) throw new Error('Product not found');

  const drafts = [];
  for (const kind of kinds) {
    const prompt = PROMPT_BY_KIND[kind](product);
    let text = '', usage = {}, providerUsed = null, lastError = null, attempts = null;

    try {
      const out = await withProviderFailover(async (ctx) => {
        const r = await ctx.provider.run(ctx.key, prompt, ctx.provider.defaultModel);
        const t = (r.text || '').trim();
        if (!t) return { invalid: true, reason: 'empty response' };
        return { text: t, usage: r.usage || {} };
      }, providerPreference);
      text = out.result.text;
      usage = out.result.usage;
      providerUsed = out.providerUsed;
      attempts = out.attempts;
    } catch (err) {
      lastError = err.message;
      attempts = err.attempts || null;
      console.error(`[ContentCreation] ${kind} all providers failed:`, lastError);
    }

    const draft = await ContentDraft.create({
      shop_id: shopId,
      product_id: productId,
      kind,
      generated_text: text || `[generation failed: ${lastError}]`,
      status: lastError ? 'discarded' : 'draft',
      provider: providerUsed,
      prompt_tokens: usage.prompt_tokens || null,
      completion_tokens: usage.completion_tokens || null,
    });
    drafts.push(draft);
  }
  return drafts;
}

module.exports = { generateForProduct, pickProvider, listProviders, withProviderFailover, PROMPT_BY_KIND };
