const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  Shop, Product, ProductVariant, Order, GoogleAccount,
  ShopSettings, AnalyticsCache, Subscription,
} = require('../models');
const { upsertProduct } = require('../services/productSync');
const { upsertOrder } = require('../services/orderSync');

// req.rawBody is saved by express.json verify callback in index.js
function verifyWebhook(req, res, next) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return res.status(401).json({ error: 'Missing HMAC header' });

  const rawBody = req.rawBody;
  if (!rawBody) return res.status(401).json({ error: 'Missing raw body' });

  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
    .update(rawBody)
    .digest('base64');

  if (digest !== hmac) {
    console.error('[Webhook] HMAC mismatch');
    return res.status(401).json({ error: 'Webhook verification failed' });
  }
  next();
}

// Helper: find shop from webhook header
async function findShop(req) {
  const domain = req.headers['x-shopify-shop-domain'];
  if (!domain) return null;
  return Shop.findOne({ where: { shop_domain: domain, is_active: true } });
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
router.post('/app/uninstalled', verifyWebhook, async (req, res) => {
  res.status(200).json({ received: true }); // respond immediately to Shopify
  const { domain } = req.body;
  if (!domain) return;

  console.log('[Webhook] app/uninstalled — deleting all data for:', domain);
  try {
    const shop = await Shop.findOne({ where: { shop_domain: domain } });
    if (!shop) return;

    const shopId = shop.id;

    // Delete child records first (foreign key order)
    const products = await Product.findAll({ where: { shop_id: shopId }, attributes: ['id'] });
    const productIds = products.map(p => p.id);
    if (productIds.length > 0) {
      await ProductVariant.destroy({ where: { product_id: productIds } });
    }
    await Product.destroy({ where: { shop_id: shopId } });
    await Order.destroy({ where: { shop_id: shopId } });
    await AnalyticsCache.destroy({ where: { shop_id: shopId } });
    await GoogleAccount.destroy({ where: { shop_id: shopId } });
    await ShopSettings.destroy({ where: { shop_id: shopId } });
    await Subscription.destroy({ where: { shop_id: shopId } });
    await shop.destroy();

    console.log('[Webhook] app/uninstalled — all data deleted for:', domain);
  } catch (err) {
    console.error('[Webhook] app/uninstalled error:', err.message);
  }
});

router.post('/shop/update', verifyWebhook, async (req, res) => {
  const { domain, email, name, shop_owner, country_code, currency, iana_timezone } = req.body;
  if (domain) {
    await Shop.update(
      { email, shop_name: name, shop_owner, country: country_code, currency, timezone: iana_timezone },
      { where: { shop_domain: domain } }
    );
  }
  res.status(200).json({ received: true });
});

// ── Product webhooks ───────────────────────────────────────────────────────────
router.post('/products/create', verifyWebhook, async (req, res) => {
  res.status(200).json({ received: true }); // respond immediately
  try {
    const shop = await findShop(req);
    if (!shop) return;
    await upsertProduct(shop.id, shop.shop_domain, req.body);
    console.log('[Webhook] products/create:', req.body.id, req.body.title);
  } catch (err) {
    console.error('[Webhook] products/create error:', err.message);
  }
});

router.post('/products/update', verifyWebhook, async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const shop = await findShop(req);
    if (!shop) return;
    await upsertProduct(shop.id, shop.shop_domain, req.body);
    console.log('[Webhook] products/update:', req.body.id, req.body.title);
  } catch (err) {
    console.error('[Webhook] products/update error:', err.message);
  }
});

router.post('/products/delete', verifyWebhook, async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const shop = await findShop(req);
    if (!shop) return;
    const shopifyProductId = req.body.id;
    const product = await Product.findOne({ where: { shop_id: shop.id, shopify_product_id: shopifyProductId } });
    if (product) {
      await ProductVariant.destroy({ where: { product_id: product.id } });
      await product.destroy();
      console.log('[Webhook] products/delete:', shopifyProductId);
    }
  } catch (err) {
    console.error('[Webhook] products/delete error:', err.message);
  }
});

// ── Order webhooks ─────────────────────────────────────────────────────────────
router.post('/orders/create', verifyWebhook, async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const shop = await findShop(req);
    if (!shop) return;
    await upsertOrder(shop.id, req.body);
    console.log('[Webhook] orders/create:', req.body.id, req.body.order_number);
  } catch (err) {
    console.error('[Webhook] orders/create error:', err.message);
  }
});

router.post('/orders/updated', verifyWebhook, async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const shop = await findShop(req);
    if (!shop) return;
    await upsertOrder(shop.id, req.body);
    console.log('[Webhook] orders/updated:', req.body.id, req.body.order_number);
  } catch (err) {
    console.error('[Webhook] orders/updated error:', err.message);
  }
});

module.exports = router;
