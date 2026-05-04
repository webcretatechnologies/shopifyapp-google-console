// Shared plan-feature checker. Both the gating middleware and any service
// code that needs to enforce plan limits should import from here so the
// label/key mapping stays in one place. Mirrors client/src/hooks/usePlan.js.

const { Subscription, BillingPlan } = require('../models');

// feature key → substring to match (case-insensitive) against a plan's
// features array OR a shop's extra_features grants.
const FEATURE_STRINGS = {
  // Base
  ga4: 'ga4 analytics',
  searchConsole: 'google search console',
  googleAds: 'google ads',
  sitemapManager: 'sitemap manager',
  basicDashboard: 'basic dashboard',
  advDashboard: 'advanced dashboard',
  csvExport: 'csv export',
  customReports: 'custom reports',
  stockAlerts: 'stock alerts',
  productSeoReport: 'product seo report',
  seoSuggestions: 'seo suggestions',
  adsOrders: 'ads → orders',
  siteAudit: 'site audit',
  aiVisibility: 'ai visibility',
  contentCreation: 'content creation',
  productFaqs: 'product faqs',
  structuredMarkup: 'structured markup',
  autoSitemap: 'auto sitemap',
  brandSplit: 'brand vs non-brand',
  prioritySupport: 'priority support',
  // AI Advanced
  aiAuditFix:         'ai audit fix-it',
  aiAuditPlan:        'ai priority action plan',
  aiAuditTrend:       'ai score trend',
  aiAuditAutoFix:     'one-click auto-fix',
  aiWhyNotMentioned:  'why-not-mentioned',
  aiPromptSuggest:    'ai prompt auto-suggestions',
  aiCompetitor:       'competitor ai tracking',
  aiQuickWins:        'ai quick-win',
  aiCannibalization:  'ai cannibalization',
  aiMetaRewrite:      'ai meta tag rewriter',
  aiWeeklyDigest:     'ai weekly digest',
  aiAnomalies:        'ai anomaly',
  aiAdsWaste:         'ai ads wasted-spend',
  aiRestockReasoning: 'ai restock',
  aiBulkContent:      'bulk ai content',
  aiBrandVoice:       'brand-voice consistency',
  aiChat:             'ai chat assistant',
  aiDailyBriefing:    'daily ai briefing',
};

// Hard-coded fallbacks by plan slug. Used only if the plan row has no
// features array yet (newly seeded plans). Matches client/src/hooks/usePlan.js.
const PLAN_FALLBACK = {
  starter: new Set(['basicDashboard']),
  growth: new Set([
    'ga4', 'searchConsole', 'googleAds', 'sitemapManager', 'advDashboard',
    'csvExport', 'stockAlerts', 'productSeoReport', 'seoSuggestions',
    'adsOrders', 'autoSitemap', 'brandSplit',
    'siteAudit', 'contentCreation', 'productFaqs',
    'aiAuditFix', 'aiAuditPlan', 'aiAuditTrend', 'aiQuickWins',
    'aiMetaRewrite', 'aiWeeklyDigest', 'aiRestockReasoning',
  ]),
  pro: new Set([
    'ga4', 'searchConsole', 'googleAds', 'sitemapManager', 'advDashboard',
    'csvExport', 'customReports', 'stockAlerts', 'productSeoReport',
    'seoSuggestions', 'adsOrders', 'autoSitemap', 'brandSplit',
    'siteAudit', 'aiVisibility', 'contentCreation', 'productFaqs', 'structuredMarkup',
    'prioritySupport',
    'aiAuditFix', 'aiAuditPlan', 'aiAuditTrend', 'aiAuditAutoFix',
    'aiWhyNotMentioned', 'aiPromptSuggest', 'aiCompetitor',
    'aiQuickWins', 'aiCannibalization', 'aiMetaRewrite',
    'aiWeeklyDigest', 'aiAnomalies', 'aiAdsWaste',
    'aiRestockReasoning', 'aiBulkContent', 'aiBrandVoice',
    'aiChat', 'aiDailyBriefing',
  ]),
};

// Memoize a flag-set per (shop_id, request) to avoid re-querying within a single
// route handler. Caller passes a per-request cache object via req.
async function loadFlags(shop) {
  const sub = await Subscription.findOne({
    where: { shop_id: shop.id },
    include: [{ model: BillingPlan, as: 'plan' }],
    order: [['created_at', 'DESC']],
  });

  // Read plan's features list + the shop's per-shop extra_features grants.
  let labels = [];
  if (sub?.plan?.features) {
    try {
      const raw = sub.plan.features;
      labels = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch {}
  }
  if (Array.isArray(shop.extra_features)) {
    for (const ex of shop.extra_features) if (ex?.label) labels.push(ex.label);
  }

  const flags = {};
  if (labels.length > 0) {
    const lower = labels.map(s => String(s).toLowerCase());
    for (const [key, substr] of Object.entries(FEATURE_STRINGS)) {
      flags[key] = lower.some(s => s.includes(substr));
    }
  } else {
    // Fall back to slug defaults
    const slug = sub?.plan?.slug || 'starter';
    const set = PLAN_FALLBACK[slug] || PLAN_FALLBACK.starter;
    for (const key of Object.keys(FEATURE_STRINGS)) flags[key] = set.has(key);
  }
  return flags;
}

async function shopHasFeature(shop, featureKey) {
  if (!shop) return false;
  const flags = await loadFlags(shop);
  return !!flags[featureKey];
}

// Express middleware factory — returns a 403 with structured payload that the
// client can recognize and turn into an upgrade prompt.
function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      if (!req.shop) return res.status(401).json({ error: 'Not authenticated' });
      const ok = await shopHasFeature(req.shop, featureKey);
      if (!ok) {
        return res.status(403).json({
          error: 'plan_feature_required',
          feature: featureKey,
          message: `This action requires the "${featureKey}" feature. Upgrade your plan to unlock it.`,
        });
      }
      next();
    } catch (err) {
      console.error(`[requireFeature:${featureKey}]`, err.message);
      res.status(500).json({ error: err.message || 'Plan check failed' });
    }
  };
}

module.exports = { FEATURE_STRINGS, shopHasFeature, requireFeature };
