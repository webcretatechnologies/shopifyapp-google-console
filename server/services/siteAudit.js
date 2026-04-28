const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const { Audit, AuditIssue, AuditPage, ShopSettings, Shop } = require('../models');
const { decrypt } = require('./encryption');
const { sendAuditComplete } = require('./email');

const SHOPIFY_API_VERSION = '2024-01';

const DEFAULT_MAX_PAGES = 100;
const DEFAULT_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12000;
// Use a real Chrome UA so Shopify/Cloudflare doesn't serve us a bot challenge page
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Issue catalog (severity + category + recommendation) ─────────────────────
const ISSUES = {
  // Errors
  HTTP_4XX:           { sev: 'error',   cat: 'crawlability',     msg: 'Page returns 4xx error' },
  HTTP_5XX:           { sev: 'error',   cat: 'crawlability',     msg: 'Page returns 5xx error' },
  BROKEN_INTERNAL:    { sev: 'error',   cat: 'internal_linking', msg: 'Broken internal link' },
  MISSING_TITLE:      { sev: 'error',   cat: 'on_page',          msg: 'Page is missing a <title> tag' },
  DUPLICATE_TITLE:    { sev: 'error',   cat: 'on_page',          msg: 'Duplicate <title> across pages' },
  MISSING_META_DESC:  { sev: 'error',   cat: 'on_page',          msg: 'Page is missing meta description' },
  DUPLICATE_META_DESC:{ sev: 'error',   cat: 'on_page',          msg: 'Duplicate meta description across pages' },
  NO_H1:              { sev: 'error',   cat: 'on_page',          msg: 'Page has no <h1> heading' },
  HTTP_NOT_HTTPS:     { sev: 'error',   cat: 'https',            msg: 'Page served over HTTP, not HTTPS' },

  // Warnings
  LONG_TITLE:         { sev: 'warning', cat: 'on_page',          msg: 'Title is too long (>60 chars)' },
  SHORT_TITLE:        { sev: 'warning', cat: 'on_page',          msg: 'Title is too short (<30 chars)' },
  LONG_META_DESC:     { sev: 'warning', cat: 'on_page',          msg: 'Meta description too long (>160 chars)' },
  SHORT_META_DESC:    { sev: 'warning', cat: 'on_page',          msg: 'Meta description too short (<70 chars)' },
  MULTIPLE_H1:        { sev: 'warning', cat: 'on_page',          msg: 'Page has multiple <h1> tags' },
  MISSING_ALT_TEXT:   { sev: 'warning', cat: 'on_page',          msg: 'Image is missing alt text' },
  MISSING_VIEWPORT:   { sev: 'warning', cat: 'on_page',          msg: 'Page is missing mobile viewport meta tag' },
  MISSING_CANONICAL:  { sev: 'warning', cat: 'on_page',          msg: 'Page is missing canonical URL' },
  SLOW_RESPONSE:      { sev: 'warning', cat: 'performance',      msg: 'Slow server response (>3s TTFB)' },
  LARGE_PAGE:         { sev: 'warning', cat: 'performance',      msg: 'HTML payload over 500KB' },
  SITEMAP_MISSING:    { sev: 'warning', cat: 'crawlability',     msg: 'Sitemap.xml not found at /sitemap.xml' },
  ROBOTS_MISSING:     { sev: 'warning', cat: 'crawlability',     msg: 'robots.txt not found at /robots.txt' },

  // Notices
  TEMPORARY_REDIRECT: { sev: 'notice',  cat: 'crawlability',     msg: 'Temporary (302) redirect — use 301 for permanent moves' },
  REDIRECT_CHAIN:     { sev: 'notice',  cat: 'crawlability',     msg: 'Redirect chain (>1 hop)' },
  LOW_TEXT_RATIO:     { sev: 'notice',  cat: 'content',          msg: 'Low text-to-HTML ratio (<10%)' },
  TRAILING_SLASH:     { sev: 'notice',  cat: 'crawlability',     msg: 'Inconsistent trailing slash use' },
  MISSING_SCHEMA:     { sev: 'notice',  cat: 'structured_data',  msg: 'No JSON-LD structured data found' },
  EXCESS_OUTBOUND:    { sev: 'notice',  cat: 'internal_linking', msg: 'Page has excessive outbound links (>100)' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function normUrl(u, base) {
  try {
    const url = new URL(u, base);
    url.hash = '';
    // Drop common tracking params
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(p => url.searchParams.delete(p));
    return url.href.replace(/\/$/, '/'); // keep trailing slash consistent
  } catch { return null; }
}

function sameOrigin(u, baseOrigin) {
  try { return new URL(u).origin === baseOrigin; } catch { return false; }
}

// Authenticate against a Shopify storefront password gate by POSTing the
// password to /password and capturing Set-Cookie headers. Returns a Cookie
// header string (or '' if auth failed / not needed).
async function authenticateStorefrontPassword(baseOrigin, password) {
  if (!password) return '';
  try {
    const res = await axios.post(
      `${baseOrigin}/password`,
      new URLSearchParams({
        form_type: 'storefront_password',
        utf8: '✓',
        password,
      }).toString(),
      {
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html,*/*',
          'Origin': baseOrigin,
          'Referer': `${baseOrigin}/password`,
        },
      }
    );
    const setCookies = res.headers['set-cookie'] || [];
    const cookies = setCookies
      .map(c => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
    if (cookies) console.log(`[SiteAudit] Storefront password OK — got ${setCookies.length} cookie(s) for ${baseOrigin}`);
    return cookies;
  } catch (err) {
    console.warn('[SiteAudit] Password auth failed:', err.message);
    return '';
  }
}

async function fetchHead(url) {
  try {
    const res = await axios.head(url, {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { 'User-Agent': USER_AGENT },
    });
    return { status: res.status, headers: res.headers };
  } catch {
    return { status: 0 };
  }
}

async function fetchPage(url, cookieHeader = '') {
  const start = Date.now();
  try {
    const headers = { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*' };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const res = await axios.get(url, {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      headers,
      transformResponse: x => x, // keep raw
    });
    const elapsed = Date.now() - start;
    return {
      status: res.status,
      finalUrl: res.request?.res?.responseUrl || url,
      contentType: res.headers['content-type'] || '',
      body: typeof res.data === 'string' ? res.data : '',
      bytes: typeof res.data === 'string' ? Buffer.byteLength(res.data, 'utf8') : 0,
      ttfbMs: elapsed,
      redirected: !!res.request?._redirectable?._redirectCount,
      redirectCount: res.request?._redirectable?._redirectCount || 0,
    };
  } catch (err) {
    return { status: 0, error: err.message, ttfbMs: Date.now() - start };
  }
}

// Run a small async pool with bounded concurrency
async function pool(items, n, worker) {
  const queue = items.slice();
  const running = [];
  const results = [];
  while (queue.length || running.length) {
    while (running.length < n && queue.length) {
      const item = queue.shift();
      const p = Promise.resolve(worker(item)).then(r => {
        running.splice(running.indexOf(p), 1);
        results.push(r);
      });
      running.push(p);
    }
    if (running.length) await Promise.race(running);
  }
  return results;
}

// ── Per-page checks ──────────────────────────────────────────────────────────
function analyzePage({ url, status, finalUrl, body, bytes, ttfbMs, redirectCount, contentType }) {
  const found = [];
  const add = (type, extra = {}) => found.push({ type, url, ...extra });

  // Performance
  if (status >= 200 && status < 400 && ttfbMs > 3000) add('SLOW_RESPONSE', { details: { ttfbMs } });
  if (bytes > 500 * 1024) add('LARGE_PAGE', { details: { bytes } });

  // HTTP status
  if (status >= 400 && status < 500) { add('HTTP_4XX', { details: { status } }); return found; }
  if (status >= 500)                 { add('HTTP_5XX', { details: { status } }); return found; }
  if (status === 0)                  { add('HTTP_5XX', { details: { reason: 'no response' } }); return found; }

  // Redirects
  if (redirectCount > 1) add('REDIRECT_CHAIN', { details: { hops: redirectCount } });

  // HTTPS
  try {
    if (new URL(finalUrl || url).protocol === 'http:') add('HTTP_NOT_HTTPS');
  } catch {}

  // Only continue parsing if HTML
  if (!contentType.includes('text/html') || !body) return found;

  const $ = cheerio.load(body);

  // Title
  const title = ($('title').first().text() || '').trim();
  if (!title) add('MISSING_TITLE');
  else {
    if (title.length > 60) add('LONG_TITLE',  { details: { length: title.length, value: title.slice(0, 100) } });
    if (title.length < 30) add('SHORT_TITLE', { details: { length: title.length, value: title.slice(0, 100) } });
  }

  // Meta description
  const md = ($('meta[name="description"]').attr('content') || '').trim();
  if (!md) add('MISSING_META_DESC');
  else {
    if (md.length > 160) add('LONG_META_DESC',  { details: { length: md.length } });
    if (md.length < 70)  add('SHORT_META_DESC', { details: { length: md.length } });
  }

  // H1
  const h1s = $('h1').length;
  if (h1s === 0) add('NO_H1');
  if (h1s > 1)   add('MULTIPLE_H1', { details: { count: h1s } });

  // Alt text — count, surface one example
  const imgs = $('img');
  const missingAlt = imgs.filter((_, el) => {
    const a = $(el).attr('alt');
    return a === undefined || a === '';
  });
  if (missingAlt.length > 0) {
    const example = $(missingAlt[0]).attr('src') || '';
    add('MISSING_ALT_TEXT', { details: { count: missingAlt.length, totalImages: imgs.length, example } });
  }

  // Viewport meta
  if (!$('meta[name="viewport"]').attr('content')) add('MISSING_VIEWPORT');

  // Canonical
  if (!$('link[rel="canonical"]').attr('href')) add('MISSING_CANONICAL');

  // JSON-LD structured data
  const jsonld = $('script[type="application/ld+json"]').length;
  if (jsonld === 0) add('MISSING_SCHEMA');

  // Text/HTML ratio
  const textLen = $('body').text().replace(/\s+/g, ' ').trim().length;
  const ratio = bytes > 0 ? (textLen / bytes) : 0;
  if (ratio < 0.10 && bytes > 5000) add('LOW_TEXT_RATIO', { details: { ratio: +(ratio * 100).toFixed(1) + '%' } });

  // Excessive outbound
  const outbound = $('a[href^="http"]').length;
  if (outbound > 100) add('EXCESS_OUTBOUND', { details: { count: outbound } });

  return found;
}

// Parse a sitemap.xml (or sitemap index) and recursively collect all page URLs.
// Shopify generates a sitemap index at /sitemap.xml that links to per-resource
// sitemaps (products, collections, pages, blogs). This pulls them all together.
async function fetchSitemapUrls(rootSitemapUrl, baseOrigin, limit = 500, cookieHeader = '') {
  const seen = new Set();
  const out = [];
  const queue = [rootSitemapUrl];

  while (queue.length && out.length < limit) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);

    let xml;
    try {
      const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/xml,text/xml,*/*' };
      if (cookieHeader) headers.Cookie = cookieHeader;
      const r = await axios.get(sm, {
        timeout: REQUEST_TIMEOUT_MS,
        headers,
        validateStatus: () => true,
        responseType: 'text',
        transformResponse: x => x,
      });
      if (r.status >= 400 || typeof r.data !== 'string') continue;
      xml = r.data;
    } catch { continue; }

    // Cheap regex extractor — handles both <sitemap><loc>...</loc></sitemap> and <url><loc>...</loc></url>
    const isIndex = /<sitemapindex\b/i.test(xml);
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => m[1].trim());

    for (const loc of locs) {
      if (out.length >= limit) break;
      if (!sameOrigin(loc, baseOrigin)) continue;
      if (isIndex) {
        if (!seen.has(loc)) queue.push(loc);
      } else {
        const norm = normUrl(loc, baseOrigin);
        if (norm && !out.includes(norm)) out.push(norm);
      }
    }
  }

  return out;
}

function extractInternalLinks($, pageUrl, baseOrigin) {
  const links = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    const abs = normUrl(href, pageUrl);
    if (!abs) return;
    if (sameOrigin(abs, baseOrigin)) links.add(abs);
  });
  return [...links];
}

// ── Admin-API audit mode (for password-gated own-store) ─────────────────────
// When the storefront is gated behind a password we can't crawl its HTML.
// But we have the Shopify Admin API token, so we can enumerate every product,
// collection, page, and blog post — and run reduced-set SEO checks against
// the data Shopify stores for each. Works without any user input.

const SHOPIFY_LIST_LIMIT = 250;

async function shopifyList(shop, path) {
  const items = [];
  let url = `https://${shop.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/${path}?limit=${SHOPIFY_LIST_LIMIT}`;
  while (url) {
    const r = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': shop.access_token },
      timeout: REQUEST_TIMEOUT_MS,
    });
    const key = Object.keys(r.data)[0];
    items.push(...(r.data[key] || []));
    const link = r.headers['link'] || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return items;
}

// SEO checks we can do from Admin API data only (no HTML)
function checksForApiResource({ url, title, body_html, image_alts = [], image_count = 0, type }) {
  const found = [];
  const add = (t, extra = {}) => found.push({ type: t, url, ...extra });

  // Title
  const t = (title || '').trim();
  if (!t) add('MISSING_TITLE');
  else {
    if (t.length > 60) add('LONG_TITLE',  { details: { length: t.length, value: t.slice(0, 100) } });
    if (t.length < 30) add('SHORT_TITLE', { details: { length: t.length, value: t.slice(0, 100) } });
  }

  // Meta description — proxy via body_html plain-text length
  const plain = (body_html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) add('MISSING_META_DESC');
  else if (plain.length < 70) add('SHORT_META_DESC', { details: { length: plain.length, source: 'body_html' } });

  // Alt text — count blanks across product images
  const missingAlt = image_alts.filter(a => !a || !a.trim()).length;
  if (missingAlt > 0) {
    add('MISSING_ALT_TEXT', { details: { count: missingAlt, totalImages: image_count } });
  }

  return found;
}

async function runAuditViaAdminAPI(audit, shop, baseOrigin) {
  console.log(`[SiteAudit] Admin-API mode for ${shop.shop_domain}`);
  await audit.update({ status: 'analyzing' });

  // 1. Pull all content from Admin API in parallel
  const [products, customColls, smartColls, pages, blogs] = await Promise.all([
    shopifyList(shop, 'products.json').catch(e => { console.warn('[SiteAudit] products list err:', e.message); return []; }),
    shopifyList(shop, 'custom_collections.json').catch(() => []),
    shopifyList(shop, 'smart_collections.json').catch(() => []),
    shopifyList(shop, 'pages.json').catch(() => []),
    shopifyList(shop, 'blogs.json').catch(() => []),
  ]);

  // Articles need a per-blog query
  const articles = [];
  for (const b of blogs.slice(0, 5)) {
    try {
      const list = await shopifyList(shop, `blogs/${b.id}/articles.json`);
      articles.push(...list.map(a => ({ ...a, _blog_handle: b.handle })));
    } catch {}
  }

  console.log(`[SiteAudit] Admin-API enumerated: ${products.length} products, ${customColls.length + smartColls.length} collections, ${pages.length} pages, ${articles.length} articles`);

  // 2. Build synthetic page records and run checks
  const pageRecords = [];
  const issues = [];

  const addRecord = (rec, foundIssues) => {
    pageRecords.push(rec);
    for (const f of foundIssues) {
      const meta = ISSUES[f.type];
      if (!meta) continue;
      issues.push({
        audit_id: audit.id, shop_id: audit.shop_id,
        severity: meta.sev, category: meta.cat, type: f.type,
        url: f.url, message: meta.msg, details: f.details || null,
      });
    }
  };

  // Homepage
  {
    const url = `${baseOrigin}/`;
    const found = checksForApiResource({ url, title: shop.shop_name || '(homepage)', body_html: null, type: 'home' });
    // Drop title check on homepage — Shopify homepage title comes from theme, not API
    addRecord({
      audit_id: audit.id, shop_id: audit.shop_id, url, status_code: 200, content_type: 'shopify/admin-api',
      title: shop.shop_name || null, meta_description: null, h1_count: 0, image_count: 0, images_missing_alt: 0,
      internal_links: 0, external_links: 0, has_canonical: false, has_viewport: false, has_jsonld: false,
      jsonld_types: null, text_ratio: null, issues_count: 0, crawl_depth: 0, bytes: 0, ttfb_ms: null, redirect_count: 0,
    }, []);
  }

  for (const p of products) {
    const url = `${baseOrigin}/products/${p.handle}`;
    const altCounts = (p.images || []).map(i => i.alt);
    const found = checksForApiResource({
      url,
      title: p.title,
      body_html: p.body_html,
      image_alts: altCounts,
      image_count: altCounts.length,
      type: 'product',
    });
    const missingAlt = altCounts.filter(a => !a || !a.trim()).length;
    addRecord({
      audit_id: audit.id, shop_id: audit.shop_id, url, status_code: 200,
      content_type: 'shopify/admin-api', title: p.title?.slice(0, 500) || null,
      meta_description: (p.body_html || '').replace(/<[^>]+>/g, '').slice(0, 500) || null,
      h1_count: 0, image_count: altCounts.length, images_missing_alt: missingAlt,
      internal_links: 0, external_links: 0, has_canonical: false, has_viewport: false,
      has_jsonld: false, jsonld_types: null, text_ratio: null,
      issues_count: found.length, crawl_depth: 1, bytes: 0, ttfb_ms: null, redirect_count: 0,
    }, found);
  }

  for (const c of [...customColls, ...smartColls]) {
    const url = `${baseOrigin}/collections/${c.handle}`;
    const found = checksForApiResource({ url, title: c.title, body_html: c.body_html, type: 'collection' });
    addRecord({
      audit_id: audit.id, shop_id: audit.shop_id, url, status_code: 200,
      content_type: 'shopify/admin-api', title: c.title?.slice(0, 500) || null,
      meta_description: (c.body_html || '').replace(/<[^>]+>/g, '').slice(0, 500) || null,
      h1_count: 0, image_count: c.image ? 1 : 0, images_missing_alt: c.image && !c.image.alt ? 1 : 0,
      internal_links: 0, external_links: 0, has_canonical: false, has_viewport: false,
      has_jsonld: false, jsonld_types: null, text_ratio: null,
      issues_count: found.length, crawl_depth: 1, bytes: 0, ttfb_ms: null, redirect_count: 0,
    }, found);
  }

  for (const pg of pages) {
    const url = `${baseOrigin}/pages/${pg.handle}`;
    const found = checksForApiResource({ url, title: pg.title, body_html: pg.body_html, type: 'page' });
    addRecord({
      audit_id: audit.id, shop_id: audit.shop_id, url, status_code: 200,
      content_type: 'shopify/admin-api', title: pg.title?.slice(0, 500) || null,
      meta_description: (pg.body_html || '').replace(/<[^>]+>/g, '').slice(0, 500) || null,
      h1_count: 0, image_count: 0, images_missing_alt: 0,
      internal_links: 0, external_links: 0, has_canonical: false, has_viewport: false,
      has_jsonld: false, jsonld_types: null, text_ratio: null,
      issues_count: found.length, crawl_depth: 1, bytes: 0, ttfb_ms: null, redirect_count: 0,
    }, found);
  }

  for (const a of articles) {
    const url = `${baseOrigin}/blogs/${a._blog_handle}/${a.handle}`;
    const found = checksForApiResource({ url, title: a.title, body_html: a.body_html, type: 'article' });
    addRecord({
      audit_id: audit.id, shop_id: audit.shop_id, url, status_code: 200,
      content_type: 'shopify/admin-api', title: a.title?.slice(0, 500) || null,
      meta_description: (a.body_html || '').replace(/<[^>]+>/g, '').slice(0, 500) || null,
      h1_count: 0, image_count: 0, images_missing_alt: 0,
      internal_links: 0, external_links: 0, has_canonical: false, has_viewport: false,
      has_jsonld: false, jsonld_types: null, text_ratio: null,
      issues_count: found.length, crawl_depth: 1, bytes: 0, ttfb_ms: null, redirect_count: 0,
    }, found);
  }

  if (pageRecords.length) await AuditPage.bulkCreate(pageRecords);
  if (issues.length) await AuditIssue.bulkCreate(issues);

  // Aggregate
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const notices = issues.filter(i => i.severity === 'notice').length;
  const pagesWithIssues = new Set(issues.map(i => i.url)).size;

  const totalPages = Math.max(pageRecords.length, 1);
  const penalty = (errors * 5 + warnings * 2 + notices * 0.5) / totalPages;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty * 5)));

  await audit.update({
    status: 'completed',
    pages_crawled: pageRecords.length,
    pages_with_issues: pagesWithIssues,
    errors_count: errors,
    warnings_count: warnings,
    notices_count: notices,
    score,
    completed_at: new Date(),
  });

  console.log(`[SiteAudit] Admin-API mode done: ${pageRecords.length} pages, score=${score}, E=${errors} W=${warnings} N=${notices}`);

  // Completion email — non-blocking
  try {
    const shop = await Shop.findByPk(audit.shop_id);
    if (shop?.email) {
      await audit.reload();
      sendAuditComplete(shop, audit).catch(e => console.error('[Email] audit-complete failed:', e.message));
    }
  } catch (e) { console.error('[Email] audit-complete lookup failed:', e.message); }
}

// ── Main runner ──────────────────────────────────────────────────────────────
async function runAudit(auditId) {
  const audit = await Audit.findByPk(auditId);
  if (!audit) return;

  const startTs = Date.now();
  await audit.update({ status: 'crawling', started_at: new Date() });

  try {
    const root = audit.audit_url;
    const baseOrigin = new URL(root).origin;
    const config = audit.config || {};
    const maxPages = config.maxPages || DEFAULT_MAX_PAGES;
    const concurrency = config.concurrency || DEFAULT_CONCURRENCY;

    // If the shop has a stored storefront password (used for password-gated
    // Shopify dev/staging stores), authenticate first and reuse the cookie
    // for every subsequent fetch.
    let cookieHeader = '';
    try {
      const settings = await ShopSettings.findOne({ where: { shop_id: audit.shop_id } });
      if (settings?.storefront_password_enc) {
        const pwd = decrypt(settings.storefront_password_enc);
        cookieHeader = await authenticateStorefrontPassword(baseOrigin, pwd);
      }
    } catch (err) {
      console.warn('[SiteAudit] Could not load storefront password:', err.message);
    }

    // BFS crawl — seed queue with sitemap URLs (Shopify always exposes one
    // for public stores) so we don't depend on JS-rendered nav links.
    const seen = new Set();
    const rootNorm = normUrl(root, root);
    const queue = [rootNorm];
    let sitemapCount = 0;

    try {
      const sitemapUrls = await fetchSitemapUrls(`${baseOrigin}/sitemap.xml`, baseOrigin, maxPages * 2, cookieHeader);
      sitemapCount = sitemapUrls.length;
      console.log(`[SiteAudit] Sitemap seeded ${sitemapCount} URLs for ${baseOrigin}`);
      for (const u of sitemapUrls) {
        if (queue.length >= maxPages) break;
        if (u !== rootNorm && !queue.includes(u)) queue.push(u);
      }
    } catch (err) {
      console.warn('[SiteAudit] Sitemap seed failed:', err.message);
    }

    // Probe homepage early — if it still redirects to /password even with our
    // cookie, the password we have is wrong (or none was provided).
    let passwordProtected = false;
    try {
      const probeHeaders = { 'User-Agent': USER_AGENT };
      if (cookieHeader) probeHeaders.Cookie = cookieHeader;
      const probe = await axios.get(rootNorm, {
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: probeHeaders,
      });
      const finalUrl = probe.request?.res?.responseUrl || rootNorm;
      if (/\/password(\b|\/|$)/i.test(finalUrl) || /shopify.*password|enter.*password/i.test(probe.data || '')) {
        passwordProtected = true;
      }
    } catch {}

    if (passwordProtected && sitemapCount === 0) {
      // Auto-fallback: if the gated URL is the merchant's own store (we have
      // an Admin API access token), use the Admin API to enumerate content.
      // No password input or URL change needed.
      try {
        const ownShop = await Shop.findByPk(audit.shop_id);
        const auditHost = new URL(rootNorm).host;
        const isOwnShop = ownShop?.access_token && (
          auditHost === ownShop.shop_domain ||
          auditHost === `www.${ownShop.shop_domain}` ||
          // Also fall back if user pointed audit at the store's primary custom domain
          // we previously cached — for now, only match the myshopify domain.
          false
        );
        if (isOwnShop) {
          console.log(`[SiteAudit] Password-gated own store — switching to Admin API mode`);
          await runAuditViaAdminAPI(audit, ownShop, baseOrigin);
          return;
        }
      } catch (e) {
        console.warn('[SiteAudit] Admin API fallback failed:', e.message);
      }

      throw new Error(
        cookieHeader
          ? 'Storefront password authentication failed (incorrect password). Update it in the Site Audit settings, or disable password protection on the store.'
          : 'This store is password-protected. Add your storefront password in the Site Audit settings (Change URL → Storefront Password), disable the password gate (Online Store → Preferences → Password protection), or audit your public custom domain instead.'
      );
    }

    const pages = []; // { url, ...response }

    while (queue.length && pages.length < maxPages) {
      const batch = [];
      while (batch.length < concurrency && queue.length && (pages.length + batch.length) < maxPages) {
        const next = queue.shift();
        if (!next || seen.has(next)) continue;
        seen.add(next);
        batch.push(next);
      }
      if (!batch.length) break;

      const results = await Promise.all(batch.map(async (u) => {
        const r = await fetchPage(u, cookieHeader);
        return { url: u, ...r };
      }));

      for (const r of results) {
        pages.push(r);
        if (r.body && r.contentType?.includes('text/html')) {
          const $ = cheerio.load(r.body);
          for (const link of extractInternalLinks($, r.url, baseOrigin)) {
            if (!seen.has(link) && pages.length + queue.length < maxPages) queue.push(link);
          }
        }
      }
    }

    await audit.update({ status: 'analyzing', pages_crawled: pages.length });

    // Per-page issues
    const issues = [];
    for (const p of pages) {
      const found = analyzePage(p);
      for (const f of found) {
        const meta = ISSUES[f.type];
        if (!meta) continue;
        issues.push({
          audit_id: audit.id,
          shop_id: audit.shop_id,
          severity: meta.sev,
          category: meta.cat,
          type: f.type,
          url: f.url,
          message: meta.msg,
          details: f.details || null,
        });
      }
    }

    // Site-level: sitemap.xml + robots.txt
    const [sitemap, robots] = await Promise.all([
      fetchHead(`${baseOrigin}/sitemap.xml`),
      fetchHead(`${baseOrigin}/robots.txt`),
    ]);
    if (sitemap.status < 200 || sitemap.status >= 400) {
      issues.push({ audit_id: audit.id, shop_id: audit.shop_id, severity: ISSUES.SITEMAP_MISSING.sev,
        category: ISSUES.SITEMAP_MISSING.cat, type: 'SITEMAP_MISSING', url: `${baseOrigin}/sitemap.xml`,
        message: ISSUES.SITEMAP_MISSING.msg, details: { status: sitemap.status } });
    }
    if (robots.status < 200 || robots.status >= 400) {
      issues.push({ audit_id: audit.id, shop_id: audit.shop_id, severity: ISSUES.ROBOTS_MISSING.sev,
        category: ISSUES.ROBOTS_MISSING.cat, type: 'ROBOTS_MISSING', url: `${baseOrigin}/robots.txt`,
        message: ISSUES.ROBOTS_MISSING.msg, details: { status: robots.status } });
    }

    // Site-level: duplicate titles & meta descriptions
    const titleMap = {}; const mdMap = {};
    for (const p of pages) {
      if (!p.body || !p.contentType?.includes('text/html')) continue;
      const $ = cheerio.load(p.body);
      const t = ($('title').first().text() || '').trim();
      const m = ($('meta[name="description"]').attr('content') || '').trim();
      if (t) (titleMap[t] = titleMap[t] || []).push(p.url);
      if (m) (mdMap[m] = mdMap[m] || []).push(p.url);
    }
    for (const [t, urls] of Object.entries(titleMap)) {
      if (urls.length > 1) {
        for (const u of urls) {
          issues.push({ audit_id: audit.id, shop_id: audit.shop_id, severity: ISSUES.DUPLICATE_TITLE.sev,
            category: ISSUES.DUPLICATE_TITLE.cat, type: 'DUPLICATE_TITLE', url: u,
            message: ISSUES.DUPLICATE_TITLE.msg, details: { title: t.slice(0, 100), sharedWith: urls.length } });
        }
      }
    }
    for (const [m, urls] of Object.entries(mdMap)) {
      if (urls.length > 1) {
        for (const u of urls) {
          issues.push({ audit_id: audit.id, shop_id: audit.shop_id, severity: ISSUES.DUPLICATE_META_DESC.sev,
            category: ISSUES.DUPLICATE_META_DESC.cat, type: 'DUPLICATE_META_DESC', url: u,
            message: ISSUES.DUPLICATE_META_DESC.msg, details: { sharedWith: urls.length } });
        }
      }
    }

    if (issues.length) await AuditIssue.bulkCreate(issues);

    // Per-page records for the Crawled Pages tab
    const pageRecords = pages.map(p => {
      const pageIssues = issues.filter(i => i.url === p.url).length;
      let title = null, meta = null, h1Count = 0, imageCount = 0, missingAlt = 0;
      let internal = 0, external = 0, hasCanonical = false, hasViewport = false;
      let hasJsonld = false, jsonldTypes = null, textRatio = null;
      if (p.body && p.contentType?.includes('text/html')) {
        try {
          const $ = cheerio.load(p.body);
          title = ($('title').first().text() || '').trim().slice(0, 500) || null;
          meta = ($('meta[name="description"]').attr('content') || '').trim().slice(0, 500) || null;
          h1Count = $('h1').length;
          imageCount = $('img').length;
          missingAlt = $('img').filter((_, el) => {
            const a = $(el).attr('alt'); return a === undefined || a === '';
          }).length;
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            try {
              const abs = new URL(href, p.url);
              if (abs.origin === baseOrigin) internal++;
              else if (abs.protocol.startsWith('http')) external++;
            } catch {}
          });
          hasCanonical = !!$('link[rel="canonical"]').attr('href');
          hasViewport = !!$('meta[name="viewport"]').attr('content');
          const ldNodes = $('script[type="application/ld+json"]');
          hasJsonld = ldNodes.length > 0;
          if (hasJsonld) {
            const types = new Set();
            ldNodes.each((_, el) => {
              try {
                const data = JSON.parse($(el).html());
                const collect = (d) => {
                  if (!d) return;
                  if (Array.isArray(d)) d.forEach(collect);
                  else if (d['@type']) types.add(Array.isArray(d['@type']) ? d['@type'][0] : d['@type']);
                  else if (d['@graph']) collect(d['@graph']);
                };
                collect(data);
              } catch {}
            });
            jsonldTypes = [...types];
          }
          const textLen = $('body').text().replace(/\s+/g, ' ').trim().length;
          textRatio = p.bytes > 0 ? Math.min(1, textLen / p.bytes) : null;
        } catch {}
      }
      return {
        audit_id: audit.id, shop_id: audit.shop_id,
        url: p.url.slice(0, 2048),
        status_code: p.status || null,
        content_type: (p.contentType || '').slice(0, 100) || null,
        bytes: p.bytes || 0,
        ttfb_ms: p.ttfbMs || null,
        redirect_count: p.redirectCount || 0,
        title, meta_description: meta,
        h1_count: h1Count, image_count: imageCount, images_missing_alt: missingAlt,
        internal_links: internal, external_links: external,
        has_canonical: hasCanonical, has_viewport: hasViewport,
        has_jsonld: hasJsonld, jsonld_types: jsonldTypes,
        text_ratio: textRatio,
        issues_count: pageIssues,
        crawl_depth: 0, // filled below
      };
    });
    if (pageRecords.length) await AuditPage.bulkCreate(pageRecords);

    // Aggregate counts + score
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const notices = issues.filter(i => i.severity === 'notice').length;
    const pagesWithIssues = new Set(issues.map(i => i.url)).size;

    // Score: 100 - weighted issues per page; clamp 0-100
    const totalPages = Math.max(pages.length, 1);
    const penalty = (errors * 5 + warnings * 2 + notices * 0.5) / totalPages;
    const score = Math.max(0, Math.min(100, Math.round(100 - penalty * 5)));

    await audit.update({
      status: 'completed',
      pages_crawled: pages.length,
      pages_with_issues: pagesWithIssues,
      errors_count: errors,
      warnings_count: warnings,
      notices_count: notices,
      score,
      completed_at: new Date(),
      duration_ms: Date.now() - startTs,
    });

    console.log(`[SiteAudit] Done audit #${audit.id} for shop ${audit.shop_id}: ${pages.length} pages, score=${score}, E=${errors} W=${warnings} N=${notices}`);

    // Completion email — non-blocking
    try {
      const shop = await Shop.findByPk(audit.shop_id);
      if (shop?.email) {
        await audit.reload();
        sendAuditComplete(shop, audit).catch(e => console.error('[Email] audit-complete failed:', e.message));
      }
    } catch (e) { console.error('[Email] audit-complete lookup failed:', e.message); }
  } catch (err) {
    console.error(`[SiteAudit] Failed audit #${audit.id}:`, err.message);
    await audit.update({
      status: 'failed',
      error_message: err.message,
      completed_at: new Date(),
      duration_ms: Date.now() - startTs,
    });
  }
}

module.exports = { runAudit, ISSUES };
