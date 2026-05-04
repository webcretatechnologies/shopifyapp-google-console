// Floating AI chat assistant. Each request includes the merchant's recent
// state so the model can answer "live data" questions like "which campaigns
// are losing money?" or "what dropped last week?". The base context has
// summary numbers; topic-specific detail sections are added based on what
// the user is actually asking about so the model has enough data to answer.

const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { askLLM } = require('../services/llm');
const { requireFeature } = require('../services/planFeatures');
const { sequelize, Audit, AuditIssue, AnalyticsCache, Product, Subscription, BillingPlan } = require('../models');
const { getLowStockAlerts } = require('../services/insights');

// Always-on base summary — keeps the system prompt small for short questions.
async function buildBaseContext(shop) {
  const lines = [];
  lines.push(`Shop name: ${shop.shop_name || shop.shop_domain}`);

  try {
    const sub = await Subscription.findOne({
      where: { shop_id: shop.id },
      include: [{ model: BillingPlan, as: 'plan' }],
    });
    if (sub?.plan) lines.push(`Plan: ${sub.plan.name} (${sub.status})`);
  } catch {}

  try {
    const productCount = await Product.count({ where: { shop_id: shop.id } });
    lines.push(`Products synced: ${productCount}`);
  } catch {}

  try {
    const lastAudit = await Audit.findOne({
      where: { shop_id: shop.id, status: 'completed' },
      order: [['created_at', 'DESC']],
      attributes: ['score', 'pages_crawled', 'errors_count', 'warnings_count', 'created_at'],
    });
    if (lastAudit) {
      lines.push(`Latest Site Audit: score ${lastAudit.score}/100, ${lastAudit.errors_count} errors, ${lastAudit.warnings_count} warnings, ${lastAudit.pages_crawled} pages (${new Date(lastAudit.created_at).toISOString().split('T')[0]})`);
    }
  } catch {}

  try {
    const ga4 = await AnalyticsCache.findOne({ where: { shop_id: shop.id, data_type: 'ga4' }, order: [['fetched_at', 'DESC']] });
    const series = ga4?.data?.sessions || ga4?.data?.daily || [];
    if (Array.isArray(series) && series.length) {
      const total = series.reduce((s, p) => s + (Number(p.sessions || p.value) || 0), 0);
      lines.push(`GA4 sessions (last ${series.length} days): ${total}`);
    }
  } catch {}

  try {
    const sc = await AnalyticsCache.findOne({ where: { shop_id: shop.id, data_type: 'search_console' }, order: [['fetched_at', 'DESC']] });
    const kws = sc?.data?.keywords || sc?.data?.queries || sc?.data || [];
    if (Array.isArray(kws) && kws.length) {
      const totalClicks = kws.reduce((s, k) => s + (Number(k.clicks) || 0), 0);
      lines.push(`Search Console: ${kws.length} keywords tracked, ${totalClicks} clicks (30d)`);
    }
  } catch {}

  try {
    const ads = await AnalyticsCache.findOne({ where: { shop_id: shop.id, data_type: 'google_ads' }, order: [['fetched_at', 'DESC']] });
    const camps = ads?.data?.campaigns || ads?.data?.by_campaign || [];
    if (Array.isArray(camps) && camps.length) {
      const cost = camps.reduce((s, c) => s + (Number(c.cost) || 0), 0);
      const conv = camps.reduce((s, c) => s + (Number(c.conversions) || 0), 0);
      lines.push(`Google Ads: ${camps.length} campaigns, $${cost.toFixed(2)} spend, ${conv} conversions`);
    }
  } catch {}

  return lines.join('\n');
}

// ── Topic detail loaders ────────────────────────────────────────────────────
// Each loader returns a string section that gets appended to the system prompt
// when the user's question matches the topic. Sections are formatted so the
// LLM can directly cite numbers/items in its reply.

async function detailSiteAudit(shop) {
  const lastAudit = await Audit.findOne({
    where: { shop_id: shop.id, status: 'completed' },
    order: [['created_at', 'DESC']],
  });
  if (!lastAudit) return '';
  const summary = await AuditIssue.findAll({
    where: { audit_id: lastAudit.id },
    attributes: ['type', 'severity', 'category', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['type', 'severity', 'category'],
    order: [[sequelize.literal('count'), 'DESC']],
    raw: true,
    limit: 30,
  });
  const lines = [
    `--- SITE AUDIT DETAIL ---`,
    `Audit run on ${new Date(lastAudit.created_at).toISOString().split('T')[0]}`,
    `Score: ${lastAudit.score}/100 | Pages crawled: ${lastAudit.pages_crawled} | Errors: ${lastAudit.errors_count} | Warnings: ${lastAudit.warnings_count}`,
    ``,
    `Issues by type (top ${summary.length}):`,
    ...summary.map(s => `- [${s.severity}] ${s.type} (${s.category}) — ${s.count} pages`),
  ];
  return lines.join('\n');
}

async function detailKeywords(shop) {
  const sc = await AnalyticsCache.findOne({
    where: { shop_id: shop.id, data_type: 'search_console' },
    order: [['fetched_at', 'DESC']],
  });
  const kws = sc?.data?.keywords || sc?.data?.queries || sc?.data || [];
  if (!Array.isArray(kws) || !kws.length) return '';
  const top = [...kws].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 20);
  const lines = [
    `--- TOP KEYWORDS DETAIL ---`,
    `(top 20 by clicks, last 30 days)`,
    ...top.map(k => `- "${k.keyword}" — pos ${(k.position || 0).toFixed(1)}, ${k.impressions || 0} imp, ${k.clicks || 0} clicks, CTR ${((k.ctr || 0) * 100).toFixed(1)}%`),
  ];
  return lines.join('\n');
}

async function detailPages(shop) {
  const sc = await AnalyticsCache.findOne({
    where: { shop_id: shop.id, data_type: 'search_console' },
    order: [['fetched_at', 'DESC']],
  });
  const pages = sc?.data?.pages || [];
  if (!Array.isArray(pages) || !pages.length) return '';
  const top = [...pages].sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 15);
  const lines = [
    `--- TOP PAGES DETAIL ---`,
    ...top.map(p => `- ${p.page || p.url} — ${p.impressions || 0} imp, ${p.clicks || 0} clicks, CTR ${((p.ctr || 0) * 100).toFixed(2)}%`),
  ];
  return lines.join('\n');
}

async function detailAds(shop) {
  const ads = await AnalyticsCache.findOne({
    where: { shop_id: shop.id, data_type: 'google_ads' },
    order: [['fetched_at', 'DESC']],
  });
  const camps = ads?.data?.campaigns || ads?.data?.by_campaign || [];
  if (!Array.isArray(camps) || !camps.length) return '';
  const lines = [
    `--- GOOGLE ADS DETAIL ---`,
    ...camps.slice(0, 20).map(c => `- "${c.name || c.campaign_name}" — $${Number(c.cost || 0).toFixed(2)} spent, ${c.clicks || 0} clicks, ${c.conversions || 0} conv, ROAS ${c.conversions_value && c.cost ? (c.conversions_value / c.cost).toFixed(2) : '0.00'}x`),
  ];
  return lines.join('\n');
}

async function detailGa4(shop) {
  const ga4 = await AnalyticsCache.findOne({
    where: { shop_id: shop.id, data_type: 'ga4' },
    order: [['fetched_at', 'DESC']],
  });
  if (!ga4?.data) return '';
  const series = ga4.data.sessions || ga4.data.daily || [];
  const sources = ga4.data.sources || [];
  const countries = ga4.data.countries || [];
  const lines = [`--- GOOGLE ANALYTICS 4 DETAIL ---`];
  if (Array.isArray(series) && series.length) {
    const last7 = series.slice(-7).reduce((s, p) => s + (Number(p.sessions || p.value) || 0), 0);
    const prev7 = series.slice(-14, -7).reduce((s, p) => s + (Number(p.sessions || p.value) || 0), 0);
    lines.push(`Sessions: this week ${last7}, previous week ${prev7} (${prev7 > 0 ? (((last7 - prev7) / prev7) * 100).toFixed(1) + '%' : 'n/a'})`);
  }
  if (sources.length) {
    const top = sources.slice(0, 10);
    lines.push(`Top traffic sources: ${top.map(s => `${s.source} (${s.sessions})`).join(', ')}`);
  }
  if (countries.length) {
    const top = countries.slice(0, 5);
    lines.push(`Top countries: ${top.map(c => `${c.country} (${c.sessions})`).join(', ')}`);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

async function detailStockAlerts(shop) {
  const alerts = await getLowStockAlerts(shop.id, 5).catch(() => []);
  if (!alerts.length) return '';
  const top = alerts.slice().sort((a, b) => (b.monthly_clicks || 0) - (a.monthly_clicks || 0)).slice(0, 10);
  const lines = [
    `--- STOCK ALERTS DETAIL ---`,
    ...top.map(a => `- ${a.product_title} — ${a.inventory ?? 0} units left, ${a.monthly_clicks || 0} clicks/month from Google`),
  ];
  return lines.join('\n');
}

async function detailProducts(shop) {
  const total = await Product.count({ where: { shop_id: shop.id } });
  const active = await Product.count({ where: { shop_id: shop.id, status: 'active' } });
  const draft = await Product.count({ where: { shop_id: shop.id, status: 'draft' } });
  const recent = await Product.findAll({
    where: { shop_id: shop.id },
    order: [['updated_at', 'DESC']],
    limit: 10,
    attributes: ['title', 'status', 'product_type'],
  });
  const lines = [
    `--- PRODUCTS DETAIL ---`,
    `Total: ${total} (active ${active}, draft ${draft})`,
    `Recently updated:`,
    ...recent.map(p => `- "${p.title}" (${p.status}${p.product_type ? `, ${p.product_type}` : ''})`),
  ];
  return lines.join('\n');
}

async function detailPlan(shop) {
  const sub = await Subscription.findOne({
    where: { shop_id: shop.id },
    include: [{ model: BillingPlan, as: 'plan' }],
  });
  if (!sub?.plan) return '';
  let features = [];
  try {
    const raw = sub.plan.features;
    features = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch {}
  const lines = [
    `--- PLAN DETAIL ---`,
    `Plan: ${sub.plan.name} ($${parseFloat(sub.plan.price).toFixed(2)}/${sub.plan.interval})`,
    `Status: ${sub.status}${sub.trial_ends_at ? ` | Trial ends ${new Date(sub.trial_ends_at).toISOString().split('T')[0]}` : ''}`,
    `Included: ${features.join(', ') || '(none)'}`,
  ];
  return lines.join('\n');
}

// Map of trigger keywords → loader function. Order matters for overlap
// (specific terms first). Loaders are awaited in parallel for any match.
const TOPIC_TRIGGERS = [
  { keys: ['audit', 'site audit', 'errors', 'warnings', 'broken', 'crawl'], loader: detailSiteAudit },
  { keys: ['keyword', 'queries', 'search console', 'rank', 'impression', 'ctr'], loader: detailKeywords },
  { keys: ['top page', 'pages report', 'landing page', 'page traffic'], loader: detailPages },
  { keys: ['ad', 'ads', 'campaign', 'ppc', 'roas', 'cpc', 'spend'], loader: detailAds },
  { keys: ['session', 'visitor', 'traffic', 'analytics', 'ga4', 'source', 'referrer'], loader: detailGa4 },
  { keys: ['stock', 'inventory', 'restock', 'out of stock', 'low stock'], loader: detailStockAlerts },
  { keys: ['product', 'catalog', 'sku'], loader: detailProducts },
  { keys: ['plan', 'billing', 'subscription', 'feature', 'upgrade'], loader: detailPlan },
];

async function buildTopicSections(shop, lastUserMessage) {
  const q = (lastUserMessage || '').toLowerCase();
  const matched = TOPIC_TRIGGERS.filter(t => t.keys.some(k => q.includes(k)));
  if (!matched.length) return '';
  const sections = await Promise.all(
    matched.map(t => t.loader(shop).catch(err => {
      console.warn(`[ai-chat] loader failed for ${t.keys[0]}:`, err.message);
      return '';
    }))
  );
  return sections.filter(Boolean).join('\n\n');
}

// POST /api/ai-chat — body: { messages: [{ role, content }, ...] }
router.post('/', shopifyAuth, requireFeature('aiChat'), async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length) return res.status(400).json({ error: 'messages required' });
    const safe = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-10);
    if (!safe.length) return res.status(400).json({ error: 'no usable messages' });

    // Latest user message drives topic detection.
    const lastUser = [...safe].reverse().find(m => m.role === 'user')?.content || '';

    const [base, topic] = await Promise.all([
      buildBaseContext(req.shop),
      buildTopicSections(req.shop, lastUser),
    ]);

    const system = `You are an expert in-app analytics, SEO, and ecommerce consultant for a Shopify merchant. You have direct access to their store's live data below. Use the DETAIL sections to give specific, numbered, actionable answers — quote real numbers from the data, do not say "I can't access that" if the section is present.

Format guidelines:
- Lead with the headline answer in the first line.
- Then provide a short structured breakdown using bullets or numbered lists.
- End with 1–2 concrete next steps the merchant should take, referencing the in-app feature when relevant (Site Audit, AI Visibility, Insights, etc.).
- Cite real numbers from the data sections.
- If the merchant asks something not covered by the data, say so plainly and point them to the in-app feature that would answer it.

CURRENT SHOP DATA (always-on summary):
${base}

${topic ? `\nADDITIONAL DETAIL SECTIONS (loaded for this question):\n${topic}` : ''}`;

    const transcript = safe.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const reply = await askLLM(transcript, {
      system,
      // More tokens so detailed answers (audit reports, campaign breakdowns) aren't truncated.
      maxTokens: 1200,
      temperature: 0.3,
    });
    res.json({ reply });
  } catch (err) {
    console.error('POST /ai-chat:', err.message);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

module.exports = router;
