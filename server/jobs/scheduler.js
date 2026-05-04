const cron = require('node-cron');
const { Op } = require('sequelize');
const { Shop, GoogleAccount, AnalyticsCache, ShopSettings, Subscription } = require('../models');
const { getKeywordRankings } = require('../services/googleSearchConsole');
const { getSessionsAndUsers } = require('../services/googleAnalytics');
const { getCampaignPerformance } = require('../services/googleAds');
const { submitSitemap } = require('../services/googleSearchConsole');
const { sendWeeklyReportsToAll } = require('../services/emailReports');
const { sendPlanReminder } = require('../services/email');
const { sendDailyBriefingsToAll } = require('../services/dailyBriefing');

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getStartDate(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

async function fetchAndCacheForShop(shop) {
  const account = await GoogleAccount.findOne({ where: { shop_id: shop.id, is_active: true } });
  if (!account) return;

  const endDate = getYesterday();
  const startDate = getStartDate(30);
  const expires = new Date();
  expires.setDate(expires.getDate() + 1);

  const tasks = [
    { type: 'search_console', fn: () => getKeywordRankings(account, startDate, endDate) },
    { type: 'ga4', fn: () => getSessionsAndUsers(account, startDate, endDate) },
    { type: 'google_ads', fn: () => getCampaignPerformance(account, startDate, endDate) },
  ];

  for (const { type, fn } of tasks) {
    try {
      const data = await fn();
      await AnalyticsCache.upsert({
        shop_id: shop.id,
        data_type: type,
        date_range_start: startDate,
        date_range_end: endDate,
        data,
        fetched_at: new Date(),
        expires_at: expires,
      });
      console.log(`[Cron] Cached ${type} for ${shop.shop_domain}`);
    } catch (err) {
      console.error(`[Cron] Failed ${type} for ${shop.shop_domain}:`, err.message);
    }
  }
}

async function autoSubmitSitemaps() {
  console.log('[Cron] Starting auto sitemap submission...');
  try {
    const settings = await ShopSettings.findAll({ where: { auto_sitemap_enabled: true } });
    for (const s of settings) {
      if (!s.auto_sitemap_url) continue;
      try {
        const account = await GoogleAccount.findOne({ where: { shop_id: s.shop_id, is_active: true } });
        if (!account) continue;
        await submitSitemap(account, s.auto_sitemap_url);
        console.log(`[Cron] Auto-submitted sitemap for shop_id=${s.shop_id}: ${s.auto_sitemap_url}`);
      } catch (err) {
        console.error(`[Cron] Auto-sitemap failed for shop_id=${s.shop_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Auto sitemap error:', err.message);
  }
}

async function runDailyFetch() {
  console.log('[Cron] Starting daily analytics fetch...');
  const shops = await Shop.findAll({ where: { is_active: true } });
  for (const shop of shops) {
    await fetchAndCacheForShop(shop);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('[Cron] Daily fetch complete');

  // Auto-submit sitemaps for shops that have it enabled
  await autoSubmitSitemaps();
}

function startScheduler() {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', runDailyFetch, { timezone: 'UTC' });

  // Cleanup expired cache every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    const deleted = await AnalyticsCache.destroy({ where: { expires_at: { [require('sequelize').Op.lt]: new Date() } } });
    console.log(`[Cron] Cleaned ${deleted} expired cache entries`);
  });

  // Weekly email reports — every Monday at 8 AM UTC
  cron.schedule('0 8 * * 1', async () => {
    console.log('[Cron] Sending weekly email reports...');
    await sendWeeklyReportsToAll().catch(err => console.error('[Cron] Email reports error:', err.message));
  }, { timezone: 'UTC' });

  // Plan-reminder email — every hour at :05, find shops installed between
  // 24–25h ago that still have no active/trial subscription and email them
  // a one-time reminder. The narrow 1-hour install window guarantees we
  // send exactly once per shop without needing a sent-flag column.
  cron.schedule('5 * * * *', sendPlanReminders, { timezone: 'UTC' });

  // Daily AI briefing — once a day at 7 AM UTC. Opt-in only (per shop).
  cron.schedule('0 7 * * *', async () => {
    console.log('[Cron] Sending daily AI briefings...');
    const r = await sendDailyBriefingsToAll().catch(err => ({ error: err.message }));
    console.log('[Cron] Daily briefings:', r);
  }, { timezone: 'UTC' });

  console.log('[Scheduler] Jobs registered');
}

async function sendPlanReminders() {
  const now = Date.now();
  const windowStart = new Date(now - 25 * 60 * 60 * 1000); // 25h ago
  const windowEnd   = new Date(now - 24 * 60 * 60 * 1000); // 24h ago
  const shops = await Shop.findAll({
    where: {
      is_active: true,
      installed_at: { [Op.gte]: windowStart, [Op.lt]: windowEnd },
    },
  });
  for (const shop of shops) {
    const sub = await Subscription.findOne({
      where: { shop_id: shop.id, status: { [Op.in]: ['active', 'trial'] } },
    });
    if (sub) continue; // already on a plan
    try {
      await sendPlanReminder(shop);
      console.log(`[Cron] Plan-reminder sent to ${shop.shop_domain}`);
    } catch (err) {
      console.error(`[Cron] Plan-reminder failed for ${shop.shop_domain}:`, err.message);
    }
  }
}

module.exports = { startScheduler, runDailyFetch, fetchAndCacheForShop };
