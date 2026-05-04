const { shopify } = require('../config/shopify');
const { Shop } = require('../models');
const { withShop } = require('../services/llm');

async function shopifyAuth(req, res, next) {
  try {
    const sessionId = req.headers['x-shopify-session-id'] || req.query.session;
    const shop = req.headers['x-shopify-shop-domain'] || req.query.shop;

    if (!shop) return res.status(401).json({ error: 'Missing shop domain' });

    const shopRecord = await Shop.findOne({ where: { shop_domain: shop, is_active: true } });
    if (!shopRecord || !shopRecord.access_token) {
      return res.status(401).json({ error: 'Shop not installed', redirect: '/api/auth/install' });
    }

    req.shop = shopRecord;
    req.shopDomain = shop;
    // Run the rest of the request inside an AsyncLocalStorage context so any
    // askLLM() call downstream picks up this shop's per-shop API key overrides
    // without each call site having to pass shopId explicitly.
    return withShop(shopRecord.id, () => next());
  } catch (err) {
    console.error('Shopify auth error:', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = { shopifyAuth };
