const express = require('express');
const router = express.Router();
const { ShopSettings } = require('../models');
const { encrypt, decrypt } = require('../services/encryption');
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { configuredProviders } = require('../services/llm');

// Default opt-in for every event the merchant CAN opt out of. The "admin-only"
// events (welcome / googleConnected / subscription) are not toggleable here —
// they're system events controlled by the super admin.
const DEFAULT_EMAIL_PREFS = {
  audit:         true,
  aiVisibility:  true,
  stockAlerts:   true,
  weeklyReport:  true,
  // Opt-in only — defaults to false so we don't send daily emails to every
  // newly-installed merchant unless they explicitly turn it on in Settings.
  dailyBriefing: false,
};

const VALID_WEEKLY_DAYS = [0, 1, 2, 3, 4, 5, 6];

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
        weekly_report_day: 1,
        default_date_range: '28d',
        llm_keys: { openai: false, anthropic: false, gemini: false, groq: false, openrouter: false },
      });
    }
    // Strip any legacy admin-only event keys from prefs so the UI never shows them
    const rawPrefs = settings.email_prefs || {};
    const cleanPrefs = {};
    for (const k of Object.keys(DEFAULT_EMAIL_PREFS)) {
      cleanPrefs[k] = rawPrefs[k] !== undefined ? rawPrefs[k] : DEFAULT_EMAIL_PREFS[k];
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
      email_prefs: cleanPrefs,
      weekly_report_day: settings.weekly_report_day != null ? settings.weekly_report_day : 1,
      default_date_range: settings.default_date_range || '28d',
      // LLM key presence flags (we never return the actual key — only whether one is set)
      llm_keys: {
        openai:     !!settings.openai_key_enc,
        anthropic:  !!settings.anthropic_key_enc,
        gemini:     !!settings.gemini_key_enc,
        groq:       !!settings.groq_key_enc,
        openrouter: !!settings.openrouter_key_enc,
      },
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
      notification_email, email_prefs, weekly_report_day, default_date_range,
      // Per-shop LLM API key overrides — pass an empty string to clear
      llm_keys, // { openai?, anthropic?, gemini?, groq?, openrouter? }
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
    if (email_prefs !== undefined) {
      // Whitelist only the keys the merchant is allowed to control; ignore admin-only events
      const cleaned = {};
      for (const k of Object.keys(DEFAULT_EMAIL_PREFS)) {
        if (k in (email_prefs || {})) cleaned[k] = !!email_prefs[k];
      }
      data.email_prefs = cleaned;
    }
    if (weekly_report_day !== undefined) {
      const day = parseInt(weekly_report_day, 10);
      data.weekly_report_day = VALID_WEEKLY_DAYS.includes(day) ? day : 1;
    }
    if (default_date_range !== undefined) data.default_date_range = default_date_range || '28d';

    // LLM key overrides — only the keys explicitly present in the body are
    // touched. Empty string clears the override (re-enables platform fallback);
    // a non-empty value is encrypted before storage.
    if (llm_keys && typeof llm_keys === 'object') {
      const fieldByProvider = {
        openai:     'openai_key_enc',
        anthropic:  'anthropic_key_enc',
        gemini:     'gemini_key_enc',
        groq:       'groq_key_enc',
        openrouter: 'openrouter_key_enc',
      };
      for (const [provider, raw] of Object.entries(llm_keys)) {
        const field = fieldByProvider[provider];
        if (!field) continue;
        if (raw === '' || raw === null) {
          data[field] = null;
        } else if (typeof raw === 'string' && raw.trim()) {
          data[field] = encrypt(raw.trim());
        }
      }
    }

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

// Returns the resolved LLM provider try-order for THIS shop, with the source
// of each key (shop-level override or platform default). Used by the AI Keys
// tab so the merchant can see which provider will actually be called.
router.get('/llm-status', shopifyAuth, async (req, res) => {
  try {
    const providers = await configuredProviders(req.shop.id);
    res.json({
      active: providers[0]
        ? { id: providers[0].id, source: providers[0].source }
        : null,
      try_order: providers.map(p => ({ id: p.id, source: p.source })),
    });
  } catch (err) {
    console.error('GET /settings/llm-status:', err.message);
    res.status(500).json({ error: err.message || 'Failed to resolve LLM status' });
  }
});

module.exports = router;
