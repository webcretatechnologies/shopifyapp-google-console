const express = require('express');
const router = express.Router();
const { getGoogleAuthUrl, createShopOAuthClient } = require('../config/google');
const { GoogleAccount, ShopSettings, Shop } = require('../models');
const { encrypt, decrypt } = require('../services/encryption');
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { getSites } = require('../services/googleSearchConsole');
const { getGA4Properties } = require('../services/googleAnalytics');
const { sendGoogleConnected } = require('../services/email');

// Helper: load decrypted shop credentials
async function getShopCredentials(shopId) {
  const s = await ShopSettings.findOne({ where: { shop_id: shopId } });
  if (!s || !s.google_client_id_enc || !s.google_client_secret_enc) return null;
  return {
    clientId: decrypt(s.google_client_id_enc),
    clientSecret: decrypt(s.google_client_secret_enc),
    adsToken: s.google_ads_developer_token_enc ? decrypt(s.google_ads_developer_token_enc) : null,
  };
}

router.get('/connect', shopifyAuth, async (req, res) => {
  const shopCreds = await getShopCredentials(req.shop.id);
  const hasEnvCreds = process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id';

  if (!shopCreds && !hasEnvCreds) {
    return res.status(400).json({
      error: 'Google credentials not configured',
      setup_required: true,
      message: 'Google OAuth credentials are not set up. Contact the app administrator.',
    });
  }

  const clientId = shopCreds?.clientId || null;
  const clientSecret = shopCreds?.clientSecret || null;
  const loginHint = req.query.email || null;
  const url = getGoogleAuthUrl(req.shop.shop_domain, clientId, clientSecret, loginHint);
  res.json({ url });
});

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    const stateData = state ? JSON.parse(Buffer.from(state, 'base64').toString()) : {};
    const shop = stateData.shop || '';
    return res.redirect(`${process.env.APP_URL}/connect-google?google_error=${error}&shop=${shop}`);
  }

  let shop = '';
  try {
    if (!state) throw new Error('Missing state parameter');
    const stateObj = JSON.parse(Buffer.from(state, 'base64').toString());
    shop = stateObj.shop || '';

    const shopRecord = await Shop.findOne({ where: { shop_domain: shop } });
    if (!shopRecord) return res.redirect(`${process.env.APP_URL}/connect-google?google_error=shop_not_found&shop=${shop}`);

    const shopCreds = await getShopCredentials(shopRecord.id);
    // Use shop credentials if configured, otherwise fall back to app-level env credentials
    const client = shopCreds
      ? createShopOAuthClient(shopCreds.clientId, shopCreds.clientSecret)
      : require('../config/google').oauth2Client;
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const { google } = require('googleapis');
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    const existing = await GoogleAccount.findOne({ where: { shop_id: shopRecord.id } });
    const accountData = {
      google_email: userInfo.email,
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      is_active: true,
      connected_at: new Date(),
    };

    let isFirstConnection = false;
    if (existing) {
      await existing.update(accountData);
    } else {
      await GoogleAccount.create({ shop_id: shopRecord.id, ...accountData });
      isFirstConnection = true;
    }

    // Mark setup as completed (upsert so it works even if shop has no settings row yet)
    const [shopSettings] = await ShopSettings.findOrCreate({ where: { shop_id: shopRecord.id }, defaults: {} });
    await shopSettings.update({ setup_completed: true, setup_step: 5 });

    // Confirmation email — only on first connection (not on token refresh / reauth)
    if (isFirstConnection) {
      sendGoogleConnected(shopRecord, { google_email: userInfo.email })
        .catch(e => console.error('[Email] google-connected failed:', e.message));
    }

    res.redirect(`${process.env.APP_URL}/connect-google?google_connected=1&shop=${shop}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${process.env.APP_URL}/connect-google?google_error=auth_failed&shop=${encodeURIComponent(shop)}`);
  }
});

router.get('/status', shopifyAuth, async (req, res) => {
  const account = await GoogleAccount.findOne({
    where: { shop_id: req.shop.id, is_active: true },
    attributes: ['id', 'google_email', 'search_console_property', 'ga4_property_id', 'google_ads_customer_id', 'connected_at'],
  });
  const shopCreds = await getShopCredentials(req.shop.id);
  const hasEnvCreds = process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id';
  res.json({ connected: !!account, account, credentials_configured: !!(shopCreds || hasEnvCreds) });
});

router.put('/settings', shopifyAuth, async (req, res) => {
  const { search_console_property, ga4_property_id, google_ads_customer_id } = req.body;
  const account = await GoogleAccount.findOne({ where: { shop_id: req.shop.id, is_active: true } });
  if (!account) return res.status(404).json({ error: 'Google account not connected' });

  await account.update({ search_console_property, ga4_property_id, google_ads_customer_id });
  res.json({ success: true });
});

// List Search Console properties the connected account has access to
router.get('/search-console-sites', shopifyAuth, async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ where: { shop_id: req.shop.id, is_active: true } });
    if (!account) return res.status(400).json({ error: 'Google account not connected' });
    const sites = await getSites(account);
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List GA4 properties the connected account has access to
router.get('/ga4-properties', shopifyAuth, async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ where: { shop_id: req.shop.id, is_active: true } });
    if (!account) return res.status(400).json({ error: 'Google account not connected' });
    const properties = await getGA4Properties(account);
    res.json(properties);
  } catch (err) {
    console.error('[GA4 Properties] Error:', err.message, err.response?.data || '');
    res.status(500).json({ error: err.message });
  }
});

router.delete('/disconnect', shopifyAuth, async (req, res) => {
  await GoogleAccount.update({ is_active: false }, { where: { shop_id: req.shop.id } });
  res.json({ success: true });
});

module.exports = router;
