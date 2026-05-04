const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { ShopSettings, AIVisibilityRun, AIVisibilityResult } = require('../models');
const { runVisibility, PROVIDERS, buildDefaultPrompts, getPlatformKeys } = require('../services/aiVisibility');
const { requireFeature } = require('../services/planFeatures');

// GET /api/ai-visibility/settings
// Returns brand name + read-only provider list. Keys are platform-level (.env)
// so the response only tells the UI which providers are *available*.
router.get('/settings', shopifyAuth, async (req, res) => {
  const s = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  const platformKeys = await getPlatformKeys();

  const providers = Object.entries(PROVIDERS).map(([id, v]) => ({
    id,
    name: v.name,
    label: v.label,
    color: v.color,
    icon: v.icon,
    iconBg: v.iconBg,
    defaultModel: v.defaultModel,
    freeTier: v.freeTier,
    available: !!platformKeys[id],
  }));

  res.json({
    brand_name: s?.ai_brand_name || req.shop.shop_name || '',
    brand_domain: req.shop.shop_domain || null,
    providers,
    available_count: providers.filter(p => p.available).length,
  });
});

// PUT /api/ai-visibility/settings — only brand_name is editable per-shop
router.put('/settings', shopifyAuth, async (req, res) => {
  const { brand_name } = req.body || {};

  let settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  if (!settings) settings = await ShopSettings.create({ shop_id: req.shop.id });

  const updates = {};
  if (brand_name !== undefined) updates.ai_brand_name = brand_name || null;
  await settings.update(updates);

  res.json({ brand_name: settings.ai_brand_name });
});

// GET /api/ai-visibility/latest
router.get('/latest', shopifyAuth, async (req, res) => {
  const run = await AIVisibilityRun.findOne({
    where: { shop_id: req.shop.id },
    order: [['created_at', 'DESC']],
  });
  res.json(run);
});

// GET /api/ai-visibility/history
router.get('/history', shopifyAuth, async (req, res) => {
  const runs = await AIVisibilityRun.findAll({
    where: { shop_id: req.shop.id },
    order: [['created_at', 'DESC']],
    limit: 30,
  });
  res.json(runs);
});

// GET /api/ai-visibility/runs/:id/results
router.get('/runs/:id/results', shopifyAuth, async (req, res) => {
  const run = await AIVisibilityRun.findOne({
    where: { id: req.params.id, shop_id: req.shop.id },
    attributes: ['id'],
  });
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const where = { run_id: run.id };
  if (req.query.provider) where.provider = req.query.provider;
  const results = await AIVisibilityResult.findAll({ where, order: [['id', 'ASC']] });
  res.json(results);
});

// GET /api/ai-visibility/default-prompts
router.get('/default-prompts', shopifyAuth, async (req, res) => {
  const settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  const brand = settings?.ai_brand_name || req.shop.shop_name || req.shop.shop_domain;
  const prompts = await buildDefaultPrompts(req.shop.id, brand);
  res.json({ brand_name: brand, prompts });
});

// POST /api/ai-visibility/run
router.post('/run', shopifyAuth, async (req, res) => {
  const platformKeys = await getPlatformKeys();
  if (!Object.keys(platformKeys).length) {
    return res.status(503).json({ error: 'AI Visibility is not available — platform admin has not configured any provider keys.' });
  }

  const requested = Array.isArray(req.body?.providers)
    ? req.body.providers.filter(p => platformKeys[p])
    : null;
  const usable = requested && requested.length ? requested : Object.keys(platformKeys);

  const inFlight = await AIVisibilityRun.findOne({
    where: { shop_id: req.shop.id },
    order: [['created_at', 'DESC']],
  });
  if (inFlight && ['queued', 'running'].includes(inFlight.status)) {
    return res.status(409).json({ error: 'Visibility run already in progress', run: inFlight });
  }

  const settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  const brandName = settings?.ai_brand_name || req.shop.shop_name || req.shop.shop_domain;

  const run = await AIVisibilityRun.create({
    shop_id: req.shop.id,
    status: 'queued',
    brand_name: brandName,
    providers: usable,
    config: {
      prompts: req.body?.prompts || null,
      brand_domain: req.body?.brand_domain || null,
      providers: usable,
    },
  });

  setImmediate(() => runVisibility(run.id));
  res.json({ success: true, run });
});

// POST /api/ai-visibility/cancel — abort the latest in-flight run for this
// shop. Doesn't actually kill the LLM calls (those will finish in the
// background and write their results), it just flips the run row to 'failed'
// so the UI unblocks. Useful when a run is hung on an upstream LLM provider.
router.post('/cancel', shopifyAuth, async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const stuck = await AIVisibilityRun.findOne({
      where: { shop_id: req.shop.id, status: { [Op.in]: ['queued', 'running'] } },
      order: [['created_at', 'DESC']],
    });
    if (!stuck) return res.json({ success: true, cancelled: 0 });
    await stuck.update({
      status: 'failed',
      error_message: 'Cancelled by user',
      completed_at: new Date(),
    });
    res.json({ success: true, cancelled: 1, run_id: stuck.id });
  } catch (err) {
    console.error('POST /ai-visibility/cancel:', err.message);
    res.status(500).json({ error: err.message || 'Cancel failed' });
  }
});

// POST /api/ai-visibility/why-not-mentioned
// Body: { result_id }
// Returns AI-generated explanation of why the store wasn't mentioned + suggestions.
router.post('/why-not-mentioned', shopifyAuth, requireFeature('aiWhyNotMentioned'), async (req, res) => {
  try {
    const { askLLMJson } = require('../services/llm');
    const { Shop, ShopSettings } = require('../models');
    const result = await AIVisibilityResult.findByPk(req.body?.result_id, {
      include: [{ model: AIVisibilityRun, as: 'run' || undefined }],
    });
    if (!result) return res.status(404).json({ error: 'Result not found' });
    // Authorize: result.run.shop_id must match
    const run = await AIVisibilityRun.findByPk(result.run_id);
    if (!run || run.shop_id !== req.shop.id) return res.status(404).json({ error: 'Result not found' });

    const settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
    const brandName = settings?.ai_brand_name || req.shop.shop_name || req.shop.shop_domain;

    const userPrompt = `An AI assistant was asked the following question and did NOT meaningfully mention the store "${brandName}":

Question: "${result.prompt}"
AI provider: ${result.provider}
AI's answer: "${(result.response_text || '').slice(0, 1500)}"

Reply as JSON with these keys:
- "why_not":            one or two sentences in plain English explaining the most likely reason the AI didn't mention this store (e.g. AI doesn't know the brand, brand has weak online presence in this category, AI cited only well-established names, etc.)
- "suggestions":        an array of 3 short, concrete actions the merchant can take to start showing up for this question. Each suggestion must be 1 short sentence.
- "content_to_create":  a short string describing the single most useful piece of content the merchant should publish to start ranking for this prompt. e.g. "A category page titled 'Best organic candles' with brand keywords in the H1 and body."`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are an expert in AI search visibility and content strategy.',
      maxTokens: 600,
      temperature: 0.4,
    });

    res.json({
      result_id: result.id,
      provider: result.provider,
      prompt: result.prompt,
      ...out,
    });
  } catch (err) {
    console.error('POST /ai-visibility/why-not-mentioned:', err.message);
    res.status(500).json({ error: err.message || 'Failed to analyze' });
  }
});

// POST /api/ai-visibility/suggest-prompts
// Returns AI-generated prompt suggestions based on the shop's catalog and brand.
router.post('/suggest-prompts', shopifyAuth, requireFeature('aiPromptSuggest'), async (req, res) => {
  try {
    const { askLLMJson } = require('../services/llm');
    const { Product, ShopSettings } = require('../models');
    const settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
    const brandName = settings?.ai_brand_name || req.shop.shop_name || req.shop.shop_domain;
    const products = await Product.findAll({
      where: { shop_id: req.shop.id, status: 'active' },
      order: [['updated_at', 'DESC']],
      limit: 30,
    });
    const types = [...new Set(products.map(p => p.product_type).filter(Boolean))].slice(0, 6);
    const categories = types.length ? types.join(', ') : 'general products';

    const userPrompt = `A Shopify store called "${brandName}" sells: ${categories}.
Sample products: ${products.slice(0, 8).map(p => p.title).join(', ')}.

Suggest 8 fresh prompts a real shopper might ask AI assistants (ChatGPT, Gemini, Perplexity) where the store SHOULD ideally be mentioned. Mix prompt intents:
- Some commercial ("where to buy ...", "best ... online")
- Some informational ("what is the best ... for ...?")
- Some brand ("is ${brandName} a good place to shop?")
- Some long-tail ("eco-friendly ... under $50")

Reply as JSON with key "prompts" — an array of objects with keys:
- "topic":  one short word category (e.g. "Brand", or a product type)
- "intent": "navigational" | "commercial" | "informational"
- "prompt": the question text (12–25 words, no quotes)`;

    const out = await askLLMJson(userPrompt, {
      system: 'You generate realistic shopper prompts for AI visibility tracking.',
      maxTokens: 2000,
      temperature: 0.7,
    });
    res.json({ prompts: Array.isArray(out.prompts) ? out.prompts : [] });
  } catch (err) {
    console.error('POST /ai-visibility/suggest-prompts:', err.message);
    res.status(500).json({ error: err.message || 'Failed to suggest prompts' });
  }
});

// POST /api/ai-visibility/competitor-check
// Body: { competitor_name, prompts? }
// Runs the most-recent active prompt set against every configured AI provider
// and counts mentions of the competitor — returned alongside the merchant's
// own latest mention counts so the UI can render side-by-side scores.
router.post('/competitor-check', shopifyAuth, requireFeature('aiCompetitor'), async (req, res) => {
  try {
    const { askLLM } = require('../services/llm');
    const { ShopSettings } = require('../models');
    const competitor = (req.body?.competitor_name || '').trim();
    if (!competitor) return res.status(400).json({ error: 'competitor_name required' });

    const latest = await AIVisibilityRun.findOne({
      where: { shop_id: req.shop.id, status: 'completed' },
      order: [['created_at', 'DESC']],
    });
    if (!latest) return res.status(400).json({ error: 'Run an AI Visibility analysis first.' });

    const myResults = await AIVisibilityResult.findAll({ where: { run_id: latest.id } });
    if (!myResults.length) return res.status(400).json({ error: 'No results in latest run.' });

    const settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
    const brandName = settings?.ai_brand_name || req.shop.shop_name || req.shop.shop_domain;

    // Re-run the same prompts but only count mentions of the competitor.
    // To keep this fast, sample up to 5 distinct prompts.
    const seen = new Set();
    const samples = myResults.filter(r => {
      if (seen.has(r.prompt)) return false;
      seen.add(r.prompt);
      return true;
    }).slice(0, 5);

    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reCompetitor = new RegExp(`\\b${escapeRe(competitor)}\\b`, 'gi');

    const perPrompt = [];
    let competitorMentions = 0;
    for (const sample of samples) {
      const text = await askLLM(sample.prompt, {
        system: 'You are a helpful assistant. Recommend specific brands, products, and websites with citations when possible.',
        maxTokens: 600,
        temperature: 0.7,
      }).catch(() => '');
      const cMatches = (text.match(reCompetitor) || []).length;
      competitorMentions += cMatches;
      perPrompt.push({ prompt: sample.prompt, competitor_mentions: cMatches });
    }

    // Sum the merchant's own mentions across the same sampled prompts in
    // the latest run.
    const myMentions = myResults
      .filter(r => seen.has(r.prompt))
      .reduce((sum, r) => sum + (r.brand_mentions || 0), 0);

    res.json({
      brand_name: brandName,
      competitor_name: competitor,
      sampled_prompts: samples.length,
      brand_mentions: myMentions,
      competitor_mentions: competitorMentions,
      per_prompt: perPrompt,
    });
  } catch (err) {
    console.error('POST /ai-visibility/competitor-check:', err.message);
    res.status(500).json({ error: err.message || 'Competitor check failed' });
  }
});

module.exports = router;
