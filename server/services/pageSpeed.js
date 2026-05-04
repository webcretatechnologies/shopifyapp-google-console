// Google PageSpeed Insights v5 API wrapper.
// Free, no key required for low volume (25,000 requests/day).
// Set PSI_API_KEY in .env for higher quotas / more reliable bursts.

const axios = require('axios');

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
// PSI runs Lighthouse on Google's servers — typical 20–40s per call.
const TIMEOUT_MS = 90 * 1000;
const CATEGORIES = ['performance', 'seo', 'accessibility', 'best-practices'];

function extractAudit(audits, key) {
  const a = audits?.[key];
  if (!a) return null;
  return {
    score: a.score,
    value: a.numericValue ?? null,
    display: a.displayValue ?? null,
  };
}

function extractOpportunities(audits = {}) {
  return Object.values(audits)
    .filter(a => a.details?.type === 'opportunity' && (a.numericValue ?? 0) > 0)
    .sort((a, b) => (b.numericValue || 0) - (a.numericValue || 0))
    .slice(0, 10)
    .map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      potential_ms: Math.round(a.numericValue || 0),
      score: a.score,
    }));
}

function summarizeReport(json) {
  const lh = json?.lighthouseResult;
  if (!lh) return null;
  const cat = lh.categories || {};
  const audits = lh.audits || {};
  return {
    fetched_at: new Date().toISOString(),
    final_url: lh.finalUrl || lh.requestedUrl || null,
    scores: {
      performance:    Math.round((cat.performance?.score || 0) * 100),
      seo:            Math.round((cat.seo?.score || 0) * 100),
      accessibility:  Math.round((cat.accessibility?.score || 0) * 100),
      best_practices: Math.round((cat['best-practices']?.score || 0) * 100),
    },
    cwv: {
      lcp:         extractAudit(audits, 'largest-contentful-paint'),
      // INP replaced FID in 2024; prefer INP audit if present.
      inp:         extractAudit(audits, 'interaction-to-next-paint')
                || extractAudit(audits, 'experimental-interaction-to-next-paint')
                || extractAudit(audits, 'max-potential-fid'),
      cls:         extractAudit(audits, 'cumulative-layout-shift'),
      fcp:         extractAudit(audits, 'first-contentful-paint'),
      ttfb:        extractAudit(audits, 'server-response-time'),
      speed_index: extractAudit(audits, 'speed-index'),
      tbt:         extractAudit(audits, 'total-blocking-time'),
    },
    opportunities: extractOpportunities(audits),
  };
}

async function runPSI(url, strategy = 'mobile') {
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('strategy', strategy);
  CATEGORIES.forEach(c => params.append('category', c));
  if (process.env.PSI_API_KEY) params.set('key', process.env.PSI_API_KEY);

  try {
    const res = await axios.get(`${PSI_BASE}?${params.toString()}`, { timeout: TIMEOUT_MS });
    return summarizeReport(res.data);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.warn(`[PSI] ${strategy} failed for ${url}: ${msg}`);
    return { error: msg };
  }
}

// Pick which crawled URLs to run PSI against. Default: homepage + one product page + one collection page.
// Falls back to just the homepage if those types aren't present.
function pickPSIUrls(homepageUrl, pageRecords = [], { max = 3 } = {}) {
  const urls = new Set([homepageUrl]);
  const successful = pageRecords.filter(p => p.status_code >= 200 && p.status_code < 300);

  const product = successful.find(p => /\/products\//.test(p.url));
  if (product) urls.add(product.url);

  const collection = successful.find(p => /\/collections\//.test(p.url));
  if (collection) urls.add(collection.url);

  // If still under max and we have other pages, fill in
  for (const p of successful) {
    if (urls.size >= max) break;
    urls.add(p.url);
  }
  return [...urls].slice(0, max);
}

// Run mobile + desktop for a list of URLs. Mobile + desktop for the same URL
// run in parallel; URLs themselves run sequentially to stay within free-tier
// rate limits.
async function runAllPSI(urls) {
  const results = {};
  for (const url of urls) {
    const [mobile, desktop] = await Promise.all([
      runPSI(url, 'mobile'),
      runPSI(url, 'desktop'),
    ]);
    results[url] = { mobile, desktop };
  }
  return {
    fetched_at: new Date().toISOString(),
    urls,
    results,
  };
}

module.exports = { runPSI, runAllPSI, pickPSIUrls };
