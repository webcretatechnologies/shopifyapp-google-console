// Builds and sends the daily AI briefing email. Aggregates yesterday's
// signals from audit + analytics + ads + stock alerts, then asks the LLM
// to summarize them into 3 short action bullets.

const { Op } = require('sequelize');
const { Shop, Audit, AnalyticsCache, ShopSettings } = require('../models');
const { askLLMJson } = require('./llm');
const { sendDailyBriefing } = require('./email');
const { getLowStockAlerts } = require('./insights');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function gatherSignals(shopId) {
  const signals = [];

  try {
    const recent = await Audit.findAll({
      where: { shop_id: shopId, status: 'completed' },
      order: [['created_at', 'DESC']],
      limit: 2,
      attributes: ['score', 'errors_count', 'created_at'],
    });
    if (recent.length === 2) {
      const delta = (recent[0].score || 0) - (recent[1].score || 0);
      if (Math.abs(delta) >= 3) {
        signals.push(`Site Audit score ${delta < 0 ? 'dropped' : 'improved'} by ${Math.abs(delta)} points (${recent[1].score} → ${recent[0].score}).`);
      }
    }
  } catch {}

  try {
    const ads = await AnalyticsCache.findOne({
      where: { shop_id: shopId, data_type: 'google_ads' },
      order: [['fetched_at', 'DESC']],
    });
    const camps = ads?.data?.campaigns || ads?.data?.by_campaign || [];
    if (Array.isArray(camps) && camps.length) {
      const wasted = camps.filter(c => Number(c.cost) >= 50 && (c.conversions || 0) === 0);
      if (wasted.length) {
        const total = wasted.reduce((s, c) => s + Number(c.cost || 0), 0);
        signals.push(`${wasted.length} Google Ads campaign(s) spent ~$${total.toFixed(0)} with 0 conversions in the last sync.`);
      }
    }
  } catch {}

  try {
    const alerts = await getLowStockAlerts(shopId, 5);
    const top = alerts.slice().sort((a, b) => (b.monthly_clicks || 0) - (a.monthly_clicks || 0)).slice(0, 3);
    if (top.length) {
      signals.push(`Stock alerts on traffic-getters: ${top.map(a => `"${a.product_title}" (${a.monthly_clicks || 0} clicks/mo, ${a.inventory ?? 0} in stock)`).join('; ')}.`);
    }
  } catch {}

  try {
    const ga4 = await AnalyticsCache.findOne({
      where: { shop_id: shopId, data_type: 'ga4' },
      order: [['fetched_at', 'DESC']],
    });
    const series = ga4?.data?.sessions || ga4?.data?.daily || [];
    if (Array.isArray(series) && series.length >= 8) {
      const yesterday = Number(series[series.length - 1]?.sessions || series[series.length - 1]?.value || 0);
      const baseline7 = series.slice(-8, -1).reduce((s, p) => s + (Number(p.sessions || p.value) || 0), 0) / 7;
      if (baseline7 > 0) {
        const pct = ((yesterday - baseline7) / baseline7) * 100;
        if (Math.abs(pct) >= 25) {
          signals.push(`Yesterday's sessions ${pct < 0 ? 'fell' : 'rose'} ${Math.abs(pct).toFixed(0)}% vs. the 7-day average (${yesterday} vs ${baseline7.toFixed(0)}).`);
        }
      }
    }
  } catch {}

  return signals;
}

async function sendDailyBriefingForShop(shop) {
  // Plan-gate: skip if shop's plan doesn't include the feature.
  const { shopHasFeature } = require('./planFeatures');
  if (!(await shopHasFeature(shop, 'aiDailyBriefing'))) {
    return { skipped: true, reason: 'plan-feature-missing' };
  }
  // Respect opt-in. Briefing is opt-IN (default off) so we don't spam.
  const settings = await ShopSettings.findOne({ where: { shop_id: shop.id } });
  const prefs = settings?.email_prefs || {};
  if (prefs.dailyBriefing !== true) return { skipped: true, reason: 'not-opted-in' };

  const signals = await gatherSignals(shop.id);
  if (!signals.length) return { skipped: true, reason: 'no-signals' };

  // Ask AI to consolidate signals into 3 short action bullets.
  let bullets = signals.slice(0, 3);
  try {
    const out = await askLLMJson(
      `These are signals about a Shopify merchant's store from yesterday:

${signals.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Reply as JSON with key "bullets" — exactly 3 short sentences ranked by urgency. Each must be a concrete action the merchant can take TODAY (verb-led, e.g. "Pause campaign X", "Restock product Y", "Check audit errors on /pages/about").`,
      { system: 'You write short, actionable daily briefings for ecommerce operators.', maxTokens: 350, temperature: 0.4 }
    );
    if (Array.isArray(out.bullets) && out.bullets.length) bullets = out.bullets.slice(0, 3);
  } catch (err) {
    console.warn(`[dailyBriefing] LLM failed for ${shop.shop_domain}: ${err.message}`);
  }

  const html = `<ul style="margin:8px 0;padding-left:20px;line-height:1.7;">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
  return sendDailyBriefing(shop, html);
}

async function sendDailyBriefingsToAll() {
  const shops = await Shop.findAll({ where: { is_active: true } });
  let sent = 0, skipped = 0;
  for (const shop of shops) {
    const r = await sendDailyBriefingForShop(shop).catch(err => ({ error: err.message }));
    if (r?.sent) sent++;
    else skipped++;
  }
  return { sent, skipped };
}

module.exports = { sendDailyBriefingForShop, sendDailyBriefingsToAll };
