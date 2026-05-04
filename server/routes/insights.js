const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { getLowStockAlerts, getProductSeoReport, getSeoSuggestions, getAdsOrderCorrelation } = require('../services/insights');
const { syncAllOrders } = require('../services/orderSync');
const { fetchAndCacheForShop } = require('../jobs/scheduler');
const { Shop, AnalyticsCache, GoogleAccount } = require('../models');
const { requireFeature } = require('../services/planFeatures');

router.get('/alerts', shopifyAuth, async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold || '5');
    const alerts = await getLowStockAlerts(req.shop.id, threshold);
    res.json(alerts);
  } catch (err) {
    console.error('[Insights] alerts error:', err.message);
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

// AI-generated "why prioritize this restock" reasoning for the current
// stock alerts. Returns one short line per alert, keyed by product_id.
router.post('/alerts/ai-reasoning', shopifyAuth, requireFeature('aiRestockReasoning'), async (req, res) => {
  try {
    const { askLLMJson } = require('../services/llm');
    const threshold = parseInt(req.query.threshold || '5');
    const alerts = await getLowStockAlerts(req.shop.id, threshold);
    if (!alerts.length) return res.json({ reasoning: {} });

    // Cap to top 10 by traffic to keep prompt small.
    const top = alerts
      .slice()
      .sort((a, b) => (b.monthly_clicks || 0) - (a.monthly_clicks || 0))
      .slice(0, 10);

    const userPrompt = `Each line below is a stock alert: a Shopify product that's low on inventory but is still drawing organic Google traffic. For each, write ONE short sentence on why this product should be prioritized for restock — referencing the actual numbers.

${top.map(a => `- ${a.product_title} | inventory ${a.inventory ?? 0} | ${a.monthly_clicks ?? 0} clicks/month from Google${a.monthly_impressions ? ` | ${a.monthly_impressions} impressions` : ''}`).join('\n')}

Reply as JSON with key "reasoning" — an OBJECT keyed by the EXACT product_title where each value is the one-sentence reason.`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are a merchandising consultant.',
      maxTokens: 800,
      temperature: 0.3,
    });
    res.json({ reasoning: out.reasoning || {} });
  } catch (err) {
    console.error('[Insights] ai-reasoning error:', err.message);
    res.status(500).json({ error: 'Failed to generate reasoning' });
  }
});

router.get('/product-seo', shopifyAuth, async (req, res) => {
  try {
    const report = await getProductSeoReport(req.shop.id);
    res.json(report);
  } catch (err) {
    console.error('[Insights] product-seo error:', err.message);
    res.status(500).json({ error: 'Failed to load product SEO report' });
  }
});

router.get('/seo-suggestions', shopifyAuth, async (req, res) => {
  try {
    const suggestions = await getSeoSuggestions(req.shop.id);
    res.json(suggestions);
  } catch (err) {
    console.error('[Insights] seo-suggestions error:', err.message);
    res.status(500).json({ error: 'Failed to load SEO suggestions' });
  }
});

router.get('/ads-correlation', shopifyAuth, async (req, res) => {
  try {
    const data = await getAdsOrderCorrelation(req.shop.id);
    res.json(data);
  } catch (err) {
    console.error('[Insights] ads-correlation error:', err.message);
    res.status(500).json({ error: 'Failed to load ads correlation' });
  }
});

// Sync orders from Shopify (waits for completion, returns count)
router.post('/sync-orders', shopifyAuth, async (req, res) => {
  try {
    const synced = await syncAllOrders(req.shop.id, req.shop.shop_domain, req.shop.access_token);
    res.json({ success: true, synced, message: `${synced} orders synced from Shopify` });
  } catch (err) {
    console.error('[OrderSync] Error:', err.message);
    const status = err.response?.status;
    const errBody = err.response?.data;
    if (status === 403) {
      const isPcd = JSON.stringify(errBody || '').includes('protected customer data');
      if (isPcd) {
        return res.status(403).json({
          error: 'protected_customer_data',
          message: 'Shopify requires Protected Customer Data approval before this app can access orders.',
        });
      }
      return res.status(403).json({
        error: 'needs_reauth',
        message: 'The app needs permission to read orders. Click "Re-authorize App" to grant access.',
      });
    }
    if (status === 401) {
      return res.status(403).json({
        error: 'needs_reauth',
        message: 'The app needs permission to read orders. Click "Re-authorize App" to grant access.',
      });
    }
    res.status(500).json({ error: 'Order sync failed: ' + err.message });
  }
});

// Status of cached analytics data — used by the Sync banner / button to show
// when the daily fetch last ran, what's in cache, and whether the SC property
// actually overlaps with this store's products.
router.get('/sync-status', shopifyAuth, async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ where: { shop_id: req.shop.id, is_active: true } });
    const caches = await AnalyticsCache.findAll({
      where: { shop_id: req.shop.id },
      order: [['fetched_at', 'DESC']],
    });

    // For Search Console: count rows that look like product pages
    const sc = caches.find(c => c.data_type === 'search_console');
    let productPageRows = 0, scRows = 0;
    if (sc?.data?.length) {
      scRows = sc.data.length;
      for (const r of sc.data) {
        if (r.page && /\/products\/[^/?#]+/.test(r.page)) productPageRows++;
      }
    }

    res.json({
      google_connected: !!account,
      google_email: account?.google_email || null,
      search_console_property: account?.search_console_property || null,
      ga4_property_id: account?.ga4_property_id || null,
      caches: caches.map(c => ({
        data_type: c.data_type,
        date_range_start: c.date_range_start,
        date_range_end: c.date_range_end,
        rows: Array.isArray(c.data) ? c.data.length : 0,
        fetched_at: c.fetched_at,
      })),
      sc_diagnostic: {
        total_rows: scRows,
        product_page_rows: productPageRows,
        // Heuristic: configured SC property and shop domain disagree
        property_matches_shop: account?.search_console_property
          ? (account.search_console_property.includes(req.shop.shop_domain.replace('.myshopify.com', '')) ||
             req.shop.shop_domain.includes(new URL(account.search_console_property).hostname.replace(/^www\./, '').split('.')[0]))
          : null,
      },
    });
  } catch (err) {
    console.error('[Insights] sync-status error:', err.message);
    res.status(500).json({ error: 'Failed to load sync status' });
  }
});

// Manually trigger the same daily fetch the cron normally runs at 02:00 UTC.
// Useful while testing / when the merchant wants fresh data right now.
router.post('/sync-now', shopifyAuth, async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ where: { shop_id: req.shop.id, is_active: true } });
    if (!account) {
      return res.status(400).json({
        error: 'google_not_connected',
        message: 'Connect Google before syncing — open Connect Google in the sidebar.',
      });
    }
    if (!account.search_console_property && !account.ga4_property_id) {
      return res.status(400).json({
        error: 'no_property_configured',
        message: 'Pick a Search Console property and/or a GA4 property in Connect Google before syncing.',
      });
    }

    const shop = await Shop.findByPk(req.shop.id);
    const startedAt = new Date();
    await fetchAndCacheForShop(shop);
    const finishedAt = new Date();

    // Re-read cache to report what we ended up with
    const caches = await AnalyticsCache.findAll({
      where: { shop_id: req.shop.id },
      order: [['fetched_at', 'DESC']],
    });
    const summary = caches
      .filter(c => new Date(c.fetched_at) >= startedAt)
      .map(c => ({ data_type: c.data_type, rows: Array.isArray(c.data) ? c.data.length : 0 }));

    res.json({
      success: true,
      duration_ms: finishedAt - startedAt,
      synced: summary,
      message: summary.length
        ? `Synced: ${summary.map(s => `${s.data_type} (${s.rows} rows)`).join(', ')}`
        : 'Sync ran but no new data was returned by Google',
    });
  } catch (err) {
    console.error('[Insights] sync-now error:', err.message);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

module.exports = router;
