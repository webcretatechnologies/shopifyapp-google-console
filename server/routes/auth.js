const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { Shop } = require('../models');

const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SHOPIFY_SCOPES || '';
const APP_URL = process.env.APP_URL;
const REDIRECT_URI = `${APP_URL}/api/auth/callback`;

function verifyHmac(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('&');
  const digest = crypto.createHmac('sha256', API_SECRET).update(message).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
}

// Shopify OAuth – begin
router.get('/install', (req, res) => {
  const { shop } = req.query;
  if (!shop || !shop.endsWith('.myshopify.com')) {
    return res.status(400).send('Missing or invalid shop parameter');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const authUrl = `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
    client_id: API_KEY,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: nonce,
  });

  // Store nonce in session for verification
  if (req.session) req.session.oauthNonce = nonce;
  console.log('[OAuth Install] Redirecting shop:', shop, '→', authUrl.substring(0, 80));
  res.redirect(authUrl);
});

// Shopify OAuth – callback
router.get('/callback', async (req, res) => {
  console.log('[OAuth Callback] Received params:', JSON.stringify(req.query));

  const { shop, code, state, hmac } = req.query;

  if (!shop || !code) {
    return res.status(400).send('Missing shop or code');
  }

  // Verify HMAC
  if (!verifyHmac(req.query)) {
    console.error('[OAuth Callback] HMAC verification FAILED for shop:', shop);
    return res.status(403).send('HMAC verification failed');
  }

  console.log('[OAuth Callback] HMAC OK. Exchanging code for token...');

  try {
    // Exchange code for access token
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: API_KEY,
      client_secret: API_SECRET,
      code,
    });

    const { access_token, scope } = tokenRes.data;
    console.log('[OAuth Callback] Got access token for shop:', shop);

    // Fetch shop info
    const shopRes = await axios.get(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': access_token },
    });
    const shopInfo = shopRes.data.shop;
    console.log('[OAuth Callback] Shop info fetched:', shopInfo.name);

    // Save shop to DB
    let shopRecord = await Shop.findOne({ where: { shop_domain: shop } });
    if (!shopRecord) {
      shopRecord = await Shop.create({
        shop_domain: shop,
        access_token,
        scope,
        email: shopInfo.email,
        shop_name: shopInfo.name,
        shop_owner: shopInfo.shop_owner,
        country: shopInfo.country_code,
        currency: shopInfo.currency,
        timezone: shopInfo.iana_timezone,
        is_active: true,
        installed_at: new Date(),
      });
      console.log('[OAuth Callback] Shop created in DB, id:', shopRecord.id);
    } else {
      await shopRecord.update({ access_token, scope, is_active: true, uninstalled_at: null });
      console.log('[OAuth Callback] Existing shop re-activated in DB');
    }

    // Register webhooks with Shopify (re-register on every install to pick up new tunnel URL)
    const webhookTopics = [
      { topic: 'app/uninstalled',  address: `${APP_URL}/api/webhooks/app/uninstalled` },
      { topic: 'shop/update',      address: `${APP_URL}/api/webhooks/shop/update` },
      { topic: 'products/create',  address: `${APP_URL}/api/webhooks/products/create` },
      { topic: 'products/update',  address: `${APP_URL}/api/webhooks/products/update` },
      { topic: 'products/delete',  address: `${APP_URL}/api/webhooks/products/delete` },
      { topic: 'orders/create',    address: `${APP_URL}/api/webhooks/orders/create` },
      { topic: 'orders/updated',   address: `${APP_URL}/api/webhooks/orders/updated` },
    ];
    for (const wh of webhookTopics) {
      try {
        await axios.post(
          `https://${shop}/admin/api/2024-01/webhooks.json`,
          { webhook: { topic: wh.topic, address: wh.address, format: 'json' } },
          { headers: { 'X-Shopify-Access-Token': access_token } }
        );
        console.log('[OAuth Callback] Webhook registered:', wh.topic);
      } catch (whErr) {
        // 422 = webhook already exists with that address, safe to ignore
        if (whErr.response?.status !== 422) {
          console.warn('[OAuth Callback] Webhook register warning:', wh.topic, whErr.response?.data || whErr.message);
        }
      }
    }

    const redirectUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
    console.log('[OAuth Callback] SUCCESS — redirecting into Shopify app:', redirectUrl);
    res.redirect(redirectUrl);

  } catch (err) {
    console.error('[OAuth Callback] FAILED:', err.response?.data || err.message);
    res.status(500).send(`
      <h2>OAuth Error</h2>
      <pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>
      <p><a href="/api/auth/install?shop=${shop}">Try again</a></p>
    `);
  }
});

// Verify shop installation status
router.get('/verify', async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'shop required' });

  const shopRecord = await Shop.findOne({
    where: { shop_domain: shop, is_active: true },
    include: [
      { association: 'subscription', include: ['plan'] },
      { association: 'googleAccount' },
    ],
  });

  if (!shopRecord) return res.json({ installed: false });

  res.json({
    installed: true,
    shop: {
      id: shopRecord.id,
      domain: shopRecord.shop_domain,
      name: shopRecord.shop_name,
      email: shopRecord.email,
    },
    subscription: shopRecord.subscription,
    googleConnected: !!shopRecord.googleAccount?.is_active,
  });
});

module.exports = router;
