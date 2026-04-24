const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { getLowStockAlerts, getProductSeoReport, getSeoSuggestions, getAdsOrderCorrelation } = require('../services/insights');
const { syncAllOrders } = require('../services/orderSync');

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

module.exports = router;
