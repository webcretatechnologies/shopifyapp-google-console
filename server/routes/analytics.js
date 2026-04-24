const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { GoogleAccount, AnalyticsCache } = require('../models');
const { getKeywordRankings, getTrafficOverview, getPageRankings, getSCCountries, getSCDevices, getSites, getSitemaps, submitSitemap, deleteSitemap } = require('../services/googleSearchConsole');
const { getSessionsAndUsers, getTopCountries, getTopPages, getTrafficSources, getDeviceBreakdown, getEcommerceData } = require('../services/googleAnalytics');
const { getCampaignPerformance } = require('../services/googleAds');

function getDateRange(query = {}) {
  const { period, startDate, endDate } = typeof query === 'string'
    ? { period: query } : query;
  if (startDate && endDate) return { startDate, endDate };
  const end = new Date();
  const start = new Date();
  const days = { '7d': 7, '30d': 30, '90d': 90 }[period] || 30;
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

async function getCached(shopId, type, startDate, endDate) {
  const cached = await AnalyticsCache.findOne({
    where: { shop_id: shopId, data_type: type, date_range_start: startDate, date_range_end: endDate },
  });
  if (cached && new Date(cached.expires_at) > new Date()) return cached.data;
  return null;
}

async function setCache(shopId, type, startDate, endDate, data) {
  const expires = new Date();
  expires.setHours(expires.getHours() + 6);
  await AnalyticsCache.upsert({
    shop_id: shopId, data_type: type, date_range_start: startDate, date_range_end: endDate,
    data, fetched_at: new Date(), expires_at: expires,
  });
}

async function getGoogleAccount(shopId, res) {
  const account = await GoogleAccount.findOne({ where: { shop_id: shopId, is_active: true } });
  if (!account) {
    res.status(400).json({ error: 'Google account not connected', action: 'connect_google' });
    return null;
  }
  return account;
}

// SEO – keyword rankings
router.get('/seo/keywords', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    const cached = await getCached(req.shop.id, 'search_console', startDate, endDate);
    if (cached) return res.json(cached);
    const data = await getKeywordRankings(account, startDate, endDate);
    await setCache(req.shop.id, 'search_console', startDate, endDate, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seo/overview', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    const data = await getTrafficOverview(account, startDate, endDate);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seo/sites', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const data = await getSites(account);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seo/countries', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    res.json(await getSCCountries(account, startDate, endDate));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/seo/devices', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    res.json(await getSCDevices(account, startDate, endDate));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/seo/pages', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    const data = await getPageRankings(account, startDate, endDate);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GA4 – traffic & sessions
router.get('/ga4/sessions', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    const cached = await getCached(req.shop.id, 'ga4', startDate, endDate);
    if (cached) return res.json(cached);
    const data = await getSessionsAndUsers(account, startDate, endDate);
    await setCache(req.shop.id, 'ga4', startDate, endDate, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ga4/countries', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    res.json(await getTopCountries(account, startDate, endDate));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ga4/pages', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    res.json(await getTopPages(account, startDate, endDate));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ga4/sources', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    res.json(await getTrafficSources(account, startDate, endDate));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ga4/devices', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    res.json(await getDeviceBreakdown(account, startDate, endDate));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ga4/ecommerce', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    res.json(await getEcommerceData(account, startDate, endDate));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google Ads
router.get('/ads/campaigns', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { startDate, endDate } = getDateRange(req.query);
    const cached = await getCached(req.shop.id, 'google_ads', startDate, endDate);
    if (cached) return res.json(cached);
    const data = await getCampaignPerformance(account, startDate, endDate);
    await setCache(req.shop.id, 'google_ads', startDate, endDate, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard overview
router.get('/overview', shopifyAuth, async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ where: { shop_id: req.shop.id, is_active: true } });
    if (!account) return res.json({ google_connected: false });

    const { startDate, endDate } = getDateRange('30d');
    const [sessions, keywords] = await Promise.allSettled([
      getSessionsAndUsers(account, startDate, endDate),
      getKeywordRankings(account, startDate, endDate),
    ]);

    const sessionData = sessions.status === 'fulfilled' ? sessions.value : [];
    const keywordData = keywords.status === 'fulfilled' ? keywords.value : [];

    const totals = sessionData.reduce((acc, d) => ({
      sessions: acc.sessions + d.sessions,
      users: acc.users + d.users,
      new_users: acc.new_users + d.new_users,
    }), { sessions: 0, users: 0, new_users: 0 });

    res.json({
      google_connected: true,
      period: { startDate, endDate },
      totals,
      top_keywords: keywordData.slice(0, 10),
      daily_sessions: sessionData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sitemaps
router.get('/seo/sitemaps', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const data = await getSitemaps(account);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/seo/sitemaps/submit', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { sitemapUrl } = req.body;
    if (!sitemapUrl) return res.status(400).json({ error: 'sitemapUrl is required' });
    const data = await submitSitemap(account, sitemapUrl);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/seo/sitemaps', shopifyAuth, async (req, res) => {
  try {
    const account = await getGoogleAccount(req.shop.id, res);
    if (!account) return;
    const { sitemapUrl } = req.body;
    if (!sitemapUrl) return res.status(400).json({ error: 'sitemapUrl is required' });
    const data = await deleteSitemap(account, sitemapUrl);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
