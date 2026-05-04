// Analytics-focused AI endpoints — weekly digest, anomaly detection,
// and wasted Ads spend. All consume cached GA4 / Search Console / Ads
// data so no extra Google API calls are made.

const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { askLLMJson } = require('../services/llm');
const { AnalyticsCache } = require('../models');
const { requireFeature } = require('../services/planFeatures');

async function loadCache(shopId, dataType) {
  const row = await AnalyticsCache.findOne({
    where: { shop_id: shopId, data_type: dataType },
    order: [['fetched_at', 'DESC']],
  });
  return row?.data || null;
}

// Compute a simple delta versus previous week from a daily-series array.
function summarizeSeries(series, key) {
  if (!Array.isArray(series) || series.length < 14) return null;
  const last7 = series.slice(-7).reduce((s, p) => s + (Number(p[key]) || 0), 0);
  const prev7 = series.slice(-14, -7).reduce((s, p) => s + (Number(p[key]) || 0), 0);
  const pct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;
  return { last7, prev7, pct };
}

// POST /api/analytics-ai/weekly-digest
// Returns { bullets: ["...", "..."], headline: "..." }
router.post('/weekly-digest', shopifyAuth, requireFeature('aiWeeklyDigest'), async (req, res) => {
  try {
    const ga4 = await loadCache(req.shop.id, 'ga4');
    const sc  = await loadCache(req.shop.id, 'search_console');
    const ads = await loadCache(req.shop.id, 'google_ads');

    // Pull whatever daily-resolution data the caches expose.
    const sessionsSeries = ga4?.sessions || ga4?.daily || [];
    const usersSeries    = ga4?.users    || sessionsSeries;
    const clicksSeries   = sc?.daily     || sc?.overview || [];

    const sessions = summarizeSeries(sessionsSeries, 'sessions') || summarizeSeries(sessionsSeries, 'value');
    const users    = summarizeSeries(usersSeries, 'users');
    const clicks   = summarizeSeries(clicksSeries, 'clicks');

    if (!sessions && !clicks) {
      return res.json({
        headline: 'Not enough data yet',
        bullets: ['Once we have 14+ days of analytics, this digest will show what changed this week vs. last week.'],
      });
    }

    const userPrompt = `A Shopify merchant wants a short weekly digest of how their store performed this week vs. last week. Here's the data:

${sessions ? `Sessions: ${sessions.last7} this week vs ${sessions.prev7} last week (${sessions.pct?.toFixed(1)}%)` : ''}
${users    ? `Users:    ${users.last7} this week vs ${users.prev7} last week (${users.pct?.toFixed(1)}%)`    : ''}
${clicks   ? `Search Console clicks: ${clicks.last7} this week vs ${clicks.prev7} last week (${clicks.pct?.toFixed(1)}%)` : ''}
${ads ? `Google Ads spend last week: $${(ads.cost_last7 || 0).toFixed?.(2) || 'n/a'}` : ''}

Reply as JSON with these keys:
- "headline":  one short sentence summarizing the week (max 70 chars)
- "bullets":   exactly 3 bullets, each one short sentence, mixing wins/concerns/recommendations.`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are an analytics consultant writing crisp weekly digests for ecommerce merchants.',
      maxTokens: 350,
      temperature: 0.4,
    });
    res.json({
      headline: out.headline || '',
      bullets:  Array.isArray(out.bullets) ? out.bullets.slice(0, 3) : [],
    });
  } catch (err) {
    console.error('POST /analytics-ai/weekly-digest:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate digest' });
  }
});

// POST /api/analytics-ai/anomalies
// Detect days where sessions/revenue/clicks deviated from the 30-day baseline
// (statistical) and ask AI to interpret each anomaly.
router.post('/anomalies', shopifyAuth, requireFeature('aiAnomalies'), async (req, res) => {
  try {
    const ga4 = await loadCache(req.shop.id, 'ga4');
    const sc  = await loadCache(req.shop.id, 'search_console');

    function findAnomalies(series, key, label) {
      if (!Array.isArray(series) || series.length < 14) return [];
      const values = series.map(p => Number(p[key]) || 0);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      if (std === 0) return [];
      const out = [];
      for (let i = 0; i < series.length; i++) {
        const v = values[i];
        const z = (v - mean) / std;
        if (Math.abs(z) >= 2) {
          out.push({
            date:  series[i].date || series[i].day || `day ${i + 1}`,
            metric: label,
            value: v,
            baseline: Math.round(mean),
            direction: z > 0 ? 'spike' : 'drop',
            zscore: Number(z.toFixed(2)),
          });
        }
      }
      return out;
    }

    const found = [
      ...findAnomalies(ga4?.sessions || ga4?.daily || [], 'sessions', 'sessions'),
      ...findAnomalies(sc?.daily     || sc?.overview || [], 'clicks', 'search clicks'),
    ];
    if (!found.length) return res.json({ anomalies: [], message: 'No unusual days detected in the last 30 days.' });

    // Top 5 by absolute z-score.
    const top = found.sort((a, b) => Math.abs(b.zscore) - Math.abs(a.zscore)).slice(0, 5);
    const userPrompt = `These are statistical anomalies in a Shopify store's analytics over the last 30 days. For each, write a 1-sentence likely explanation and a 1-sentence next step.

${top.map(a => `- ${a.date}: ${a.direction} in ${a.metric} (${a.value} vs baseline ${a.baseline})`).join('\n')}

Reply as JSON with key "anomalies" — array (same length, same order) with these keys:
- "date":         the date string
- "metric":       the metric name
- "direction":    "spike" or "drop"
- "value":        the actual value
- "baseline":     the baseline value
- "explanation":  one sentence on the most likely cause
- "next_step":    one short sentence — what to investigate / do.`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are an analytics expert interpreting anomalies for Shopify merchants.',
      maxTokens: 1000,
      temperature: 0.4,
    });
    res.json({ anomalies: Array.isArray(out.anomalies) ? out.anomalies : top });
  } catch (err) {
    console.error('POST /analytics-ai/anomalies:', err.message);
    res.status(500).json({ error: err.message || 'Failed to detect anomalies' });
  }
});

// POST /api/analytics-ai/ads-wasted-spend
// Identify Google Ads campaigns burning budget without converting.
router.post('/ads-wasted-spend', shopifyAuth, requireFeature('aiAdsWaste'), async (req, res) => {
  try {
    const ads = await loadCache(req.shop.id, 'google_ads');
    const campaigns = ads?.campaigns || ads?.by_campaign || [];
    if (!Array.isArray(campaigns) || !campaigns.length) {
      return res.json({ recommendations: [], message: 'No Google Ads campaign data yet.' });
    }
    // Compute per-campaign waste signal: high cost, zero/few conversions, low ROAS.
    const candidates = campaigns
      .filter(c => Number(c.cost) >= 50)
      .map(c => ({
        ...c,
        roas: c.conversions_value && c.cost ? Number(c.conversions_value) / Number(c.cost) : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 15);
    const wasteful = candidates.filter(c => c.roas < 1 || (c.conversions || 0) === 0);
    if (!wasteful.length) return res.json({ recommendations: [], message: 'Every active campaign is converting profitably right now.' });

    const userPrompt = `These Google Ads campaigns are spending money but converting poorly. Recommend specific actions per campaign — pause, lower budget, change targeting, or test new creative.

${wasteful.map(c => `- "${c.name || c.campaign_name}": $${Number(c.cost).toFixed(2)} spent, ${c.clicks || 0} clicks, ${c.conversions || 0} conversions, ROAS ${(c.roas || 0).toFixed(2)}x`).join('\n')}

Reply as JSON with key "recommendations" — array of objects with:
- "campaign":     campaign name
- "spend":        cost number
- "conversions":  conversion count
- "roas":         number
- "verdict":      "pause" | "reduce_budget" | "rework_creative" | "rework_targeting"
- "reasoning":    one short sentence on why
- "expected_savings": short string (e.g. "≈$200/mo")`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are a Google Ads consultant focused on cutting wasted spend.',
      maxTokens: 1500,
      temperature: 0.3,
    });
    res.json({ recommendations: Array.isArray(out.recommendations) ? out.recommendations : [] });
  } catch (err) {
    console.error('POST /analytics-ai/ads-wasted-spend:', err.message);
    res.status(500).json({ error: err.message || 'Failed to detect wasted spend' });
  }
});

module.exports = router;
