import { useShop } from '../context/ShopContext';

// Maps feature key → substring to look for in the plan's features string array
const FEATURE_STRINGS = {
  ga4:             'ga4 analytics',
  searchConsole:   'google search console',
  googleAds:       'google ads',
  sitemapManager:  'sitemap manager',
  basicDashboard:  'basic dashboard',
  advDashboard:    'advanced dashboard',
  csvExport:       'csv export',
  customReports:   'custom reports',
  stockAlerts:     'stock alerts',
  productSeoReport:'product seo report',
  seoSuggestions:  'seo suggestions',
  adsOrders:       'ads → orders',
  autoSitemap:     'auto sitemap',
  brandSplit:      'brand vs non-brand',
  prioritySupport: 'priority support',
  apiAccess:       'api access',
};

// Fallback hardcoded flags for when subscription hasn't loaded or plan has no features array
const PLAN_FALLBACK = {
  starter: {
    ga4: false, searchConsole: false, googleAds: false, sitemapManager: false,
    basicDashboard: true, advDashboard: false, csvExport: false, customReports: false,
    stockAlerts: false, productSeoReport: false, seoSuggestions: false,
    adsOrders: false, autoSitemap: false, brandSplit: false,
    prioritySupport: false, apiAccess: false,
  },
  growth: {
    ga4: true, searchConsole: true, googleAds: true, sitemapManager: true,
    basicDashboard: true, advDashboard: true, csvExport: true, customReports: false,
    stockAlerts: true, productSeoReport: true, seoSuggestions: true,
    adsOrders: true, autoSitemap: true, brandSplit: true,
    prioritySupport: false, apiAccess: false,
  },
  pro: {
    ga4: true, searchConsole: true, googleAds: true, sitemapManager: true,
    basicDashboard: true, advDashboard: true, csvExport: true, customReports: true,
    stockAlerts: true, productSeoReport: true, seoSuggestions: true,
    adsOrders: true, autoSitemap: true, brandSplit: true,
    prioritySupport: true, apiAccess: true,
  },
};

const PLAN_DISPLAY = { starter: 'Starter', growth: 'Growth', pro: 'Pro' };

function parseFeaturesFromArray(arr = []) {
  const lower = arr.map(s => (s || '').toLowerCase());
  const flags = {};
  for (const [key, substr] of Object.entries(FEATURE_STRINGS)) {
    flags[key] = lower.some(s => s.includes(substr));
  }

  // Extract keyword limit from "Google Search Console (N keywords)"
  const scLine = lower.find(s => s.includes('search console'));
  const kwMatch = scLine?.match(/(\d+)\s*keyword/);
  flags.seoKeywordsLimit = kwMatch ? parseInt(kwMatch[1]) : null;

  // Extract product/order limits
  const prodLine = lower.find(s => /product.*month/.test(s));
  const prodMatch = prodLine?.match(/(\d+)/);
  flags.productsLimit = prodMatch ? parseInt(prodMatch[1]) : null;

  const ordLine = lower.find(s => /order.*month/.test(s));
  const ordMatch = ordLine?.match(/(\d+)/);
  flags.ordersLimit = ordMatch ? parseInt(ordMatch[1]) : null;

  return flags;
}

export function usePlan() {
  const { subscription } = useShop();
  const slug = subscription?.plan?.slug || 'starter';

  let featuresArr = [];
  try {
    const raw = subscription?.plan?.features;
    featuresArr = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch {}

  // If admin set real features on the plan, use those; otherwise fall back to hardcoded slug table
  const features = featuresArr.length > 0
    ? parseFeaturesFromArray(featuresArr)
    : { ...(PLAN_FALLBACK[slug] || PLAN_FALLBACK.starter), seoKeywordsLimit: null, productsLimit: null, ordersLimit: null };

  const can = (feature) => !!features[feature];

  return {
    slug,
    planName: PLAN_DISPLAY[slug] || slug,
    plan: subscription?.plan,
    subscription,
    features,
    can,
    isStarter: slug === 'starter',
    isGrowth:  slug === 'growth',
    isPro:     slug === 'pro',
  };
}

// CSV download helper
export function downloadCSV(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
