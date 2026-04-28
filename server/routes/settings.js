const express = require('express');
const router = express.Router();
const { ShopSettings } = require('../models');
const { encrypt, decrypt } = require('../services/encryption');
const { shopifyAuth } = require('../middleware/shopifyAuth');

// Default opt-in for every event type — used when shop has no email_prefs row yet
const DEFAULT_EMAIL_PREFS = {
  welcome:         true,
  googleConnected: true,
  subscription:    true,
  audit:           true,
  aiVisibility:    true,
  stockAlerts:     true,
  weeklyReport:    true,
};

router.get('/', shopifyAuth, async (req, res) => {
  try {
    const settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
    if (!settings) {
      return res.json({
        has_credentials: false, setup_step: 1, setup_completed: false,
        auto_sitemap_enabled: false, auto_sitemap_url: null, brand_keywords: '',
        notification_email: req.shop.email || '',
        shop_email: req.shop.email || '',
        email_prefs: DEFAULT_EMAIL_PREFS,
        default_date_range: '28d',
      });
    }
    res.json({
      has_credentials: !!settings.google_client_id_enc,
      has_ads_token: !!settings.google_ads_developer_token_enc,
      setup_step: settings.setup_step,
      setup_completed: settings.setup_completed,
      google_client_id_preview: settings.google_client_id_enc
        ? decrypt(settings.google_client_id_enc).slice(0, 12) + '...'
        : null,
      auto_sitemap_enabled: !!settings.auto_sitemap_enabled,
      auto_sitemap_url: settings.auto_sitemap_url || '',
      brand_keywords: settings.brand_keywords || '',
      ai_brand_name: settings.ai_brand_name || req.shop.shop_name || '',
      notification_email: settings.notification_email || req.shop.email || '',
      shop_email: req.shop.email || '',
      email_prefs: { ...DEFAULT_EMAIL_PREFS, ...(settings.email_prefs || {}) },
      default_date_range: settings.default_date_range || '28d',
    });
  } catch (err) {
    console.error('Settings GET error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/', shopifyAuth, async (req, res) => {
  try {
    const {
      google_client_id, google_client_secret, google_ads_developer_token,
      setup_step, setup_completed,
      auto_sitemap_enabled, auto_sitemap_url, brand_keywords, ai_brand_name,
      notification_email, email_prefs, default_date_range,
    } = req.body;

    const data = {};
    if (setup_step !== undefined) data.setup_step = setup_step;
    if (setup_completed !== undefined) data.setup_completed = setup_completed;
    if (google_client_id) data.google_client_id_enc = encrypt(google_client_id.trim());
    if (google_client_secret) data.google_client_secret_enc = encrypt(google_client_secret.trim());
    if (google_ads_developer_token !== undefined) {
      data.google_ads_developer_token_enc = google_ads_developer_token
        ? encrypt(google_ads_developer_token.trim())
        : null;
    }
    if (auto_sitemap_enabled !== undefined) data.auto_sitemap_enabled = !!auto_sitemap_enabled;
    if (auto_sitemap_url !== undefined) data.auto_sitemap_url = auto_sitemap_url || null;
    if (brand_keywords !== undefined) data.brand_keywords = brand_keywords || null;
    if (ai_brand_name !== undefined) data.ai_brand_name = ai_brand_name?.trim() || null;
    if (notification_email !== undefined) data.notification_email = notification_email?.trim() || null;
    if (email_prefs !== undefined) data.email_prefs = email_prefs || null;
    if (default_date_range !== undefined) data.default_date_range = default_date_range || '28d';

    const existing = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
    if (existing) {
      await existing.update(data);
    } else {
      await ShopSettings.create({ shop_id: req.shop.id, ...data });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Settings PUT error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

router.delete('/credentials', shopifyAuth, async (req, res) => {
  try {
    await ShopSettings.update(
      { google_client_id_enc: null, google_client_secret_enc: null, google_ads_developer_token_enc: null, setup_completed: false, setup_step: 1 },
      { where: { shop_id: req.shop.id } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear credentials' });
  }
});

module.exports = router;
