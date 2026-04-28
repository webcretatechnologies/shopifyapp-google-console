const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { ShopSettings, AIVisibilityRun, AIVisibilityResult } = require('../models');
const { runVisibility, PROVIDERS, buildDefaultPrompts, getPlatformKeys } = require('../services/aiVisibility');

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

module.exports = router;
