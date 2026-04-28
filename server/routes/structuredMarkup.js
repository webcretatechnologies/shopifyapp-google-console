const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { ShopSettings, Shop } = require('../models');
const { buildAllForProduct, installScriptTag, uninstallScriptTag } = require('../services/structuredMarkup');

const DEFAULT_TYPES = { product: true, faq: true, breadcrumb: true, organization: true };

// GET /api/structured-markup/config
router.get('/config', shopifyAuth, async (req, res) => {
  const s = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  res.json({
    injection_mode: s?.markup_injection_mode || 'paste',
    script_tag_installed: !!s?.markup_script_tag_id,
    enabled_types: { ...DEFAULT_TYPES, ...(s?.markup_enabled_types || {}) },
    org_logo_url: s?.org_logo_url || '',
    org_social_profiles: Array.isArray(s?.org_social_profiles) ? s.org_social_profiles : [],
  });
});

// PUT /api/structured-markup/config — body: { enabled_types?, org_logo_url?, org_social_profiles? }
router.put('/config', shopifyAuth, async (req, res) => {
  const { enabled_types, org_logo_url, org_social_profiles } = req.body || {};
  let s = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  if (!s) s = await ShopSettings.create({ shop_id: req.shop.id });

  const updates = {};
  if (enabled_types && typeof enabled_types === 'object') {
    updates.markup_enabled_types = { ...DEFAULT_TYPES, ...enabled_types };
  }
  if (org_logo_url !== undefined) updates.org_logo_url = org_logo_url || null;
  if (org_social_profiles !== undefined) {
    updates.org_social_profiles = Array.isArray(org_social_profiles) ? org_social_profiles : null;
  }
  await s.update(updates);
  res.json({ success: true });
});

// GET /api/structured-markup/preview/:productId — JSON-LD blocks for a product
router.get('/preview/:productId', shopifyAuth, async (req, res) => {
  try {
    const { blocks, html } = await buildAllForProduct({
      productId: req.params.productId, shopId: req.shop.id,
    });
    res.json({ blocks, html });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/structured-markup/script-tag/install
router.post('/script-tag/install', shopifyAuth, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.shop.id);
    const scriptSrcUrl = `${process.env.APP_URL}/api/structured-markup/script.js?shop=${encodeURIComponent(shop.shop_domain)}`;
    const r = await installScriptTag({ shop, scriptSrcUrl });
    res.json({ success: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.errors || err.message });
  }
});

// POST /api/structured-markup/script-tag/uninstall
router.post('/script-tag/uninstall', shopifyAuth, async (req, res) => {
  try {
    const shop = await Shop.findByPk(req.shop.id);
    const r = await uninstallScriptTag({ shop });
    res.json({ success: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/structured-markup/script.js?shop=foo.myshopify.com
// Public endpoint loaded by the Shopify Script Tag. Detects the current
// product page from window.location.pathname and injects matching JSON-LD.
router.get('/script.js', async (req, res) => {
  const shopDomain = (req.query.shop || '').toString();
  if (!shopDomain) return res.status(400).type('application/javascript').send('// missing shop param');

  const apiBase = `${process.env.APP_URL}/api/structured-markup/storefront-blocks`;
  res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(`
(function(){
  var path = window.location.pathname || '';
  var m = path.match(/\\/products\\/([^\\/?#]+)/);
  if (!m) return;
  var url = '${apiBase}?shop=' + encodeURIComponent('${shopDomain}') + '&handle=' + encodeURIComponent(m[1]);
  fetch(url, { credentials: 'omit' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){
      if (!data || !data.blocks) return;
      data.blocks.forEach(function(b){
        var s = document.createElement('script');
        s.type = 'application/ld+json';
        s.textContent = JSON.stringify(b.json);
        document.head.appendChild(s);
      });
    })
    .catch(function(){});
})();
  `);
});

// GET /api/structured-markup/storefront-blocks?shop=...&handle=...
// Public — returns the same blocks the merchant sees in the preview, looked
// up by product handle. No auth: the shop param + handle are the lookup key.
router.get('/storefront-blocks', async (req, res) => {
  try {
    const shopDomain = (req.query.shop || '').toString();
    const handle = (req.query.handle || '').toString();
    if (!shopDomain || !handle) return res.status(400).json({ error: 'shop and handle required' });

    const shop = await Shop.findOne({ where: { shop_domain: shopDomain, is_active: true } });
    if (!shop) return res.status(404).json({ error: 'shop not found' });

    const { Product } = require('../models');
    const product = await Product.findOne({ where: { shop_id: shop.id, handle } });
    if (!product) return res.json({ blocks: [] });

    const { blocks } = await buildAllForProduct({ productId: product.id, shopId: shop.id });
    res.set('Cache-Control', 'public, max-age=600').json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
