const express = require('express');
const router = express.Router();
const axios = require('axios');
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { Audit, AuditIssue, AuditPage, ShopSettings } = require('../models');
const { runAudit, ISSUES } = require('../services/siteAudit');
const { encrypt } = require('../services/encryption');

// Resolve the shop's customer-facing storefront URL.
// Priority: explicit override → Shopify primary domain (the store URL where the
// app is installed — `domain` field from /admin/api/.../shop.json) → .myshopify.com.
async function resolveStorefrontUrl(shop, override) {
  // 1. Explicit override
  if (override) {
    try { new URL(override); return override; } catch {}
  }

  // 2. Shopify primary store domain — this is the URL the merchant set as their
  // customer-facing domain (e.g. www.plantex.in). It's the same domain where
  // the app got installed. Falls back to *.myshopify.com if no custom domain.
  try {
    const res = await axios.get(
      `https://${shop.shop_domain}/admin/api/2024-01/shop.json`,
      { headers: { 'X-Shopify-Access-Token': shop.access_token }, timeout: 8000 }
    );
    const s = res.data?.shop || {};
    const domain = s.domain || s.myshopify_domain || shop.shop_domain;
    return `https://${domain}/`;
  } catch (err) {
    console.warn('[Audit] shop.json fetch failed, using myshopify:', err.message);
  }

  // 3. Final fallback
  return `https://${shop.shop_domain}/`;
}

// Expose the resolved default audit URL + whether a storefront password is stored
router.get('/storefront', shopifyAuth, async (req, res) => {
  const url = await resolveStorefrontUrl(req.shop);
  const settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  res.json({
    url,
    source: 'shopify_primary_domain',
    has_storefront_password: !!settings?.storefront_password_enc,
  });
});

// Save (or clear) the storefront password — needed for password-protected stores
router.put('/storefront-password', shopifyAuth, async (req, res) => {
  const { password } = req.body || {};
  let settings = await ShopSettings.findOne({ where: { shop_id: req.shop.id } });
  if (!settings) settings = await ShopSettings.create({ shop_id: req.shop.id });

  if (password === null || password === '') {
    await settings.update({ storefront_password_enc: null });
    return res.json({ has_storefront_password: false });
  }
  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'password must be a string' });
  }
  await settings.update({ storefront_password_enc: encrypt(password) });
  res.json({ has_storefront_password: true });
});

// Static catalog of issue types (severity + category + message)
router.get('/issue-types', (req, res) => {
  res.json(ISSUES);
});

// Latest completed audit for the shop, or in-progress one
router.get('/latest', shopifyAuth, async (req, res) => {
  const audit = await Audit.findOne({
    where: { shop_id: req.shop.id },
    order: [['created_at', 'DESC']],
  });
  res.json(audit);
});

// Full history list — id + summary fields only
router.get('/history', shopifyAuth, async (req, res) => {
  const audits = await Audit.findAll({
    where: { shop_id: req.shop.id },
    order: [['created_at', 'DESC']],
    limit: 30,
    attributes: ['id', 'status', 'audit_url', 'score', 'errors_count', 'warnings_count', 'notices_count',
                 'pages_crawled', 'started_at', 'completed_at', 'duration_ms', 'error_message'],
  });
  res.json(audits);
});

// Single audit detail (no issues)
router.get('/:id', shopifyAuth, async (req, res) => {
  const audit = await Audit.findOne({
    where: { id: req.params.id, shop_id: req.shop.id },
  });
  if (!audit) return res.status(404).json({ error: 'Audit not found' });
  res.json(audit);
});

// Issues for one audit, filterable by severity/category/type
router.get('/:id/issues', shopifyAuth, async (req, res) => {
  const audit = await Audit.findOne({
    where: { id: req.params.id, shop_id: req.shop.id },
    attributes: ['id'],
  });
  if (!audit) return res.status(404).json({ error: 'Audit not found' });

  const where = { audit_id: audit.id };
  if (req.query.severity) where.severity = req.query.severity;
  if (req.query.category) where.category = req.query.category;
  if (req.query.type)     where.type = req.query.type;

  const issues = await AuditIssue.findAll({ where, order: [['severity', 'ASC'], ['type', 'ASC']] });
  res.json(issues);
});

// Issue type summary — counts per type for one audit (for the SEMrush-style table)
router.get('/:id/summary', shopifyAuth, async (req, res) => {
  const audit = await Audit.findOne({
    where: { id: req.params.id, shop_id: req.shop.id },
    attributes: ['id'],
  });
  if (!audit) return res.status(404).json({ error: 'Audit not found' });

  const { sequelize } = require('../models');
  const rows = await AuditIssue.findAll({
    where: { audit_id: audit.id },
    attributes: [
      'type', 'severity', 'category',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['type', 'severity', 'category'],
    raw: true,
  });
  res.json(rows.map(r => ({ ...r, count: parseInt(r.count, 10) })));
});

// Crawled pages list — table data for the Crawled Pages tab
router.get('/:id/pages', shopifyAuth, async (req, res) => {
  const audit = await Audit.findOne({
    where: { id: req.params.id, shop_id: req.shop.id },
    attributes: ['id'],
  });
  if (!audit) return res.status(404).json({ error: 'Audit not found' });

  const where = { audit_id: audit.id };
  if (req.query.status_class) {
    // Filter by HTTP status class: 2xx, 3xx, 4xx, 5xx
    const cls = req.query.status_class;
    if (cls === '2xx') { where.status_code = { [require('sequelize').Op.between]: [200, 299] }; }
    else if (cls === '3xx') { where.status_code = { [require('sequelize').Op.between]: [300, 399] }; }
    else if (cls === '4xx') { where.status_code = { [require('sequelize').Op.between]: [400, 499] }; }
    else if (cls === '5xx') { where.status_code = { [require('sequelize').Op.gte]: 500 }; }
  }
  const pages = await AuditPage.findAll({
    where,
    order: [['issues_count', 'DESC'], ['url', 'ASC']],
    limit: 500,
  });
  res.json(pages);
});

// Statistics aggregates for the Statistics tab
router.get('/:id/stats', shopifyAuth, async (req, res) => {
  const audit = await Audit.findOne({
    where: { id: req.params.id, shop_id: req.shop.id },
    attributes: ['id'],
  });
  if (!audit) return res.status(404).json({ error: 'Audit not found' });

  const pages = await AuditPage.findAll({ where: { audit_id: audit.id } });

  const statusCounts = { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, none: 0 };
  let withCanonical = 0, withoutCanonical = 0, withViewport = 0, withJsonld = 0;
  const jsonldTypes = {};
  let totalImages = 0, missingAltImages = 0, totalH1 = 0, multipleH1 = 0;
  let totalInternal = 0, totalExternal = 0;

  for (const p of pages) {
    const sc = p.status_code || 0;
    if (!sc) statusCounts.none++;
    else if (sc < 200) statusCounts['1xx']++;
    else if (sc < 300) statusCounts['2xx']++;
    else if (sc < 400) statusCounts['3xx']++;
    else if (sc < 500) statusCounts['4xx']++;
    else statusCounts['5xx']++;

    if (p.has_canonical) withCanonical++; else withoutCanonical++;
    if (p.has_viewport) withViewport++;
    if (p.has_jsonld) withJsonld++;
    (p.jsonld_types || []).forEach(t => { jsonldTypes[t] = (jsonldTypes[t] || 0) + 1; });

    totalImages += p.image_count || 0;
    missingAltImages += p.images_missing_alt || 0;
    totalH1 += p.h1_count || 0;
    if ((p.h1_count || 0) > 1) multipleH1++;
    totalInternal += p.internal_links || 0;
    totalExternal += p.external_links || 0;
  }

  res.json({
    pages: pages.length,
    status_codes: statusCounts,
    canonicalization: { with: withCanonical, without: withoutCanonical },
    viewport: { with: withViewport, without: pages.length - withViewport },
    structured_data: { with: withJsonld, without: pages.length - withJsonld, types: jsonldTypes },
    images: { total: totalImages, missing_alt: missingAltImages },
    headings: { total_h1: totalH1, pages_multiple_h1: multipleH1 },
    links: { internal: totalInternal, external: totalExternal },
  });
});

// Kick off a new audit (non-blocking)
router.post('/run', shopifyAuth, async (req, res) => {
  const { audit_url, max_pages } = req.body || {};

  // Resolve URL — explicit override, or stored sitemap URL, or Shopify primary
  let url;
  try {
    url = await resolveStorefrontUrl(req.shop, audit_url);
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid audit_url' });
  }

  // Reject a new run while one is already crawling/analyzing
  const inFlight = await Audit.findOne({
    where: { shop_id: req.shop.id },
    order: [['created_at', 'DESC']],
  });
  if (inFlight && ['queued', 'crawling', 'analyzing'].includes(inFlight.status)) {
    return res.status(409).json({ error: 'Audit already running', audit: inFlight });
  }

  const audit = await Audit.create({
    shop_id: req.shop.id,
    audit_url: url,
    status: 'queued',
    config: { maxPages: Math.min(parseInt(max_pages, 10) || 100, 500) },
  });

  // Fire-and-forget — runAudit is async, don't await
  setImmediate(() => runAudit(audit.id));

  res.json({ success: true, audit });
});

module.exports = router;
