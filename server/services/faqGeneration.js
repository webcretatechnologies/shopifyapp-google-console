// AI-driven FAQ generation per product. Returns 5–8 Q&A pairs, parsed
// from a strict JSON-array prompt to keep the LLM output predictable.
const { Product, ProductFaq } = require('../models');
const { withProviderFailover } = require('./contentCreation');

function faqPrompt(p) {
  const desc = (p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
  return `You are an e-commerce assistant. Generate the most useful FAQs a customer would ask before buying this product.

Product: ${p.title}
${p.product_type ? `Type: ${p.product_type}\n` : ''}${p.vendor ? `Brand: ${p.vendor}\n` : ''}${desc ? `Description: ${desc}\n` : ''}
Generate exactly 6 question-and-answer pairs. Each question should be something a real shopper would type (not marketing fluff). Each answer should be 1–3 sentences, factual, and helpful.

CRITICAL: Output ONLY the raw JSON array below. No prose before or after. No markdown code fences. No explanation. The first character of your response must be "[" and the last must be "]".

[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]`;
}

// Robust JSON extractor. Handles: markdown fences, prose-wrapped output,
// trailing commas, smart quotes. Returns [] if nothing parseable.
function extractJsonArray(text) {
  if (!text) return [];
  let s = text.trim()
    // strip markdown code fences anywhere
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    // normalize curly quotes that some models slip in
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  s = s.slice(start, end + 1);
  // Strip trailing commas before ] or } (common JSON-from-LLM defect)
  s = s.replace(/,\s*([\]}])/g, '$1');
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(x => x && typeof x.question === 'string' && typeof x.answer === 'string')
      .map(x => ({ question: x.question.trim(), answer: x.answer.trim() }))
      .filter(x => x.question && x.answer);
  } catch (e) {
    return [];
  }
}

// generateForProduct({ productId, shopId, replace }) → array of saved ProductFaq
// Tries every configured AI provider in order until one returns a parseable
// JSON array of at least one Q&A pair. `replace=true` deletes existing
// AI-source FAQs first; manual FAQs are always preserved.
async function generateForProduct({ productId, shopId, replace = false, providerPreference }) {
  const product = await Product.findOne({ where: { id: productId, shop_id: shopId } });
  if (!product) throw new Error('Product not found');

  // Try each provider — accept the first that gives us 1+ valid pairs
  const { result, providerUsed } = await withProviderFailover(async (ctx) => {
    const r = await ctx.provider.run(ctx.key, faqPrompt(product), ctx.provider.defaultModel);
    const pairs = extractJsonArray(r.text || '');
    if (!pairs.length) {
      const preview = (r.text || '').slice(0, 120).replace(/\s+/g, ' ');
      return { invalid: true, reason: `0 pairs parsed from "${preview}…"` };
    }
    return { pairs };
  }, providerPreference);
  const pairs = result.pairs;

  if (replace) {
    await ProductFaq.destroy({ where: { product_id: productId, shop_id: shopId, source: 'ai' } });
  }

  // Append after any existing FAQs to preserve manual entries
  const lastSort = await ProductFaq.max('sort_order', { where: { product_id: productId } }) || 0;

  const saved = [];
  for (let i = 0; i < pairs.length; i++) {
    const f = await ProductFaq.create({
      shop_id: shopId,
      product_id: productId,
      question: pairs[i].question.slice(0, 500),
      answer: pairs[i].answer,
      sort_order: lastSort + 1 + i,
      source: 'ai',
      provider: providerUsed,
      status: 'draft',
    });
    saved.push(f);
  }
  return saved;
}

module.exports = { generateForProduct, extractJsonArray };
