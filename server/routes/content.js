const express = require('express');
const router = express.Router();
const axios = require('axios');
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { Product, ContentDraft } = require('../models');
const { generateForProduct } = require('../services/contentCreation');
const { requireFeature } = require('../services/planFeatures');

const SHOPIFY_API_VERSION = '2024-01';
const VALID_KINDS = ['description', 'title', 'meta_title', 'meta_description'];

// GET /api/content/drafts/:productId — drafts for one product
router.get('/drafts/:productId', shopifyAuth, async (req, res) => {
  const drafts = await ContentDraft.findAll({
    where: { shop_id: req.shop.id, product_id: req.params.productId },
    order: [['created_at', 'DESC']],
  });
  res.json(drafts);
});

// POST /api/content/generate — body: { product_id, kinds }
router.post('/generate', shopifyAuth, async (req, res) => {
  try {
    const { product_id, kinds } = req.body || {};
    if (!product_id) return res.status(400).json({ error: 'product_id required' });
    const useKinds = Array.isArray(kinds) && kinds.length ? kinds : VALID_KINDS;
    const drafts = await generateForProduct({
      productId: product_id, shopId: req.shop.id, kinds: useKinds,
    });
    res.json({ success: true, drafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/content/bulk-generate — body: { product_ids: [...], kinds: [...] }
// Generates drafts for many products in one batch. Returns per-product status.
router.post('/bulk-generate', shopifyAuth, requireFeature('aiBulkContent'), async (req, res) => {
  try {
    const { product_ids, kinds } = req.body || {};
    if (!Array.isArray(product_ids) || !product_ids.length) {
      return res.status(400).json({ error: 'product_ids array required' });
    }
    if (product_ids.length > 100) {
      return res.status(400).json({ error: 'Max 100 products per batch' });
    }
    const useKinds = Array.isArray(kinds) && kinds.length ? kinds : VALID_KINDS;
    const results = [];
    // Run sequentially to avoid hammering the LLM provider; 1s gap between
    // products tends to keep us under any per-minute rate limits.
    for (const pid of product_ids) {
      try {
        const drafts = await generateForProduct({
          productId: pid, shopId: req.shop.id, kinds: useKinds,
        });
        results.push({ product_id: pid, ok: true, draft_count: drafts.length });
      } catch (err) {
        results.push({ product_id: pid, ok: false, error: err.message });
      }
    }
    const succeeded = results.filter(r => r.ok).length;
    res.json({
      total: results.length, succeeded, failed: results.length - succeeded, results,
    });
  } catch (err) {
    console.error('[Content] bulk-generate error:', err.message);
    res.status(500).json({ error: err.message || 'Bulk generation failed' });
  }
});

// POST /api/content/brand-voice
// Returns { profile: { tone, style, dos, donts } } learned from existing
// product copy + flags products whose copy doesn't match.
router.post('/brand-voice', shopifyAuth, requireFeature('aiBrandVoice'), async (req, res) => {
  try {
    const { askLLMJson } = require('../services/llm');
    const products = await Product.findAll({
      where: { shop_id: req.shop.id, status: 'active' },
      order: [['updated_at', 'DESC']],
      limit: 20,
    });
    if (!products.length) return res.json({ profile: null, mismatches: [], message: 'Add some active products first.' });

    const samples = products.slice(0, 8).map(p => ({
      title: p.title,
      desc: (p.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
    }));
    const userPrompt = `Below are 8 product titles and descriptions from a Shopify store. Infer the BRAND VOICE.

${samples.map((s, i) => `${i + 1}. ${s.title}\n   ${s.desc}`).join('\n\n')}

Reply as JSON with these keys:
- "profile": object with keys
    - "tone":         one or two adjectives (e.g. "playful and witty", "premium and minimal")
    - "style":        one short sentence describing sentence structure / vocabulary
    - "dos":          array of 3 short rules to follow
    - "donts":        array of 3 short rules to avoid
- "mismatches": array of up to 3 product TITLES whose copy noticeably DOESN'T match the inferred voice (empty array if all consistent), with a 1-sentence reason each:
    [ { "title": "...", "reason": "..." } ]`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are a brand-voice consultant for ecommerce stores.',
      maxTokens: 800,
      temperature: 0.3,
    });
    res.json({ profile: out.profile || null, mismatches: out.mismatches || [] });
  } catch (err) {
    console.error('[Content] brand-voice error:', err.message);
    res.status(500).json({ error: err.message || 'Brand-voice analysis failed' });
  }
});

// PUT /api/content/drafts/:id — edit / approve a draft
router.put('/drafts/:id', shopifyAuth, async (req, res) => {
  const draft = await ContentDraft.findOne({ where: { id: req.params.id, shop_id: req.shop.id } });
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const { edited_text, status } = req.body || {};
  const updates = {};
  if (edited_text !== undefined) updates.edited_text = edited_text;
  if (status && ['draft', 'approved', 'discarded'].includes(status)) updates.status = status;
  await draft.update(updates);
  res.json(draft);
});

// POST /api/content/drafts/:id/publish — push draft to Shopify
router.post('/drafts/:id/publish', shopifyAuth, async (req, res) => {
  const draft = await ContentDraft.findOne({ where: { id: req.params.id, shop_id: req.shop.id } });
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const product = await Product.findOne({ where: { id: draft.product_id, shop_id: req.shop.id } });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const text = (draft.edited_text || draft.generated_text || '').trim();
  if (!text) return res.status(400).json({ error: 'Empty content — nothing to publish' });

  try {
    if (draft.kind === 'description' || draft.kind === 'title') {
      const updates = { id: product.shopify_product_id };
      if (draft.kind === 'description') updates.body_html = text;
      if (draft.kind === 'title') updates.title = text;
      await axios.put(
        `https://${req.shop.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/products/${product.shopify_product_id}.json`,
        { product: updates },
        { headers: { 'X-Shopify-Access-Token': req.shop.access_token, 'Content-Type': 'application/json' } }
      );
      // Reflect locally
      await product.update(draft.kind === 'description' ? { body_html: text } : { title: text });
    } else {
      // meta_title / meta_description live in product metafields under namespace=global
      const metafieldKey = draft.kind === 'meta_title' ? 'title_tag' : 'description_tag';
      await axios.post(
        `https://${req.shop.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/products/${product.shopify_product_id}/metafields.json`,
        {
          metafield: {
            namespace: 'global',
            key: metafieldKey,
            type: draft.kind === 'meta_title' ? 'single_line_text_field' : 'multi_line_text_field',
            value: text,
          },
        },
        { headers: { 'X-Shopify-Access-Token': req.shop.access_token, 'Content-Type': 'application/json' } }
      );
    }
    await draft.update({ status: 'published', published_at: new Date(), publish_error: null });
    res.json({ success: true, draft });
  } catch (err) {
    const errMsg = err.response?.data?.errors || err.response?.data?.error || err.message;
    const friendly = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
    await draft.update({ publish_error: friendly.slice(0, 500) });
    res.status(500).json({ error: friendly });
  }
});

// DELETE /api/content/drafts/:id
router.delete('/drafts/:id', shopifyAuth, async (req, res) => {
  await ContentDraft.destroy({ where: { id: req.params.id, shop_id: req.shop.id } });
  res.json({ success: true });
});

module.exports = router;
