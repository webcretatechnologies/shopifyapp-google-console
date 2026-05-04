const express = require('express');
const router = express.Router();
const axios = require('axios');
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { Audit, AuditIssue, AuditPage, ShopSettings } = require('../models');
const { runAudit, ISSUES } = require('../services/siteAudit');
const { runAllPSI, pickPSIUrls } = require('../services/pageSpeed');
const { encrypt } = require('../services/encryption');
const { requireFeature } = require('../services/planFeatures');

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

// Auto-fix supported types — only types where we can safely write back to
// Shopify. Anything else is "guidance only" via the AI fix-it panel.
const AUTOFIX_TYPES = new Set([
  'missing_meta_description', // → product.descriptionTag
  'missing_title_tag',         // → product.titleTag
  'missing_alt_text',          // → image.alt
]);

// Extract a Shopify product handle from a URL like /products/blue-widget.
function extractProductHandle(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/products\/([^\/?#]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

// POST /audit/:id/auto-fix — apply AI-generated fixes to Shopify for one issue type.
// Body: { issue_type, dry_run? }
// Currently supports product-level meta tag and image alt fixes only.
router.post('/:id/auto-fix', shopifyAuth, requireFeature('aiAuditAutoFix'), async (req, res) => {
  try {
    const { askLLM } = require('../services/llm');
    const { issue_type, dry_run } = req.body || {};
    if (!AUTOFIX_TYPES.has(issue_type)) {
      return res.status(400).json({ error: `Auto-fix not supported for "${issue_type}". Supported: ${[...AUTOFIX_TYPES].join(', ')}` });
    }
    const audit = await Audit.findOne({
      where: { id: req.params.id, shop_id: req.shop.id },
      attributes: ['id'],
    });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    const issues = await AuditIssue.findAll({
      where: { audit_id: audit.id, type: issue_type },
      limit: 50,
    });

    // Group affected URLs into product handles. Skip non-product pages.
    const handleToIssues = {};
    for (const i of issues) {
      const h = extractProductHandle(i.url);
      if (!h) continue;
      if (!handleToIssues[h]) handleToIssues[h] = [];
      handleToIssues[h].push(i);
    }
    const handles = Object.keys(handleToIssues);
    if (handles.length === 0) {
      return res.json({ supported: false, message: 'No product pages affected — auto-fix only works on /products/* URLs.' });
    }

    const { shopify } = require('../config/shopify');
    const session = { shop: req.shop.shop_domain, accessToken: req.shop.access_token };
    const client = new shopify.clients.Graphql({ session });

    const results = [];

    for (const handle of handles) {
      try {
        // Fetch the product so we can see existing fields + generate context-aware AI value.
        const lookup = await client.query({
          data: {
            query: `query GetProduct($handle: String!) {
              productByHandle(handle: $handle) {
                id
                title
                handle
                description
                seo { title description }
                images(first: 6) { edges { node { id altText src } } }
              }
            }`,
            variables: { handle },
          },
        });
        const product = lookup.body?.data?.productByHandle;
        if (!product) {
          results.push({ handle, ok: false, error: 'Product not found' });
          continue;
        }

        if (issue_type === 'missing_meta_description') {
          const desc = (product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
          const aiValue = (await askLLM(
            `Write an SEO meta description for this product. 140–160 characters. Compelling, includes the product name and a benefit. No quotes, no emojis, no markdown.

Product: ${product.title}
Description: ${desc}`,
            { system: 'You write concise SEO meta descriptions.', maxTokens: 100, temperature: 0.5 }
          )).trim().replace(/^["']|["']$/g, '').slice(0, 320);

          if (dry_run) { results.push({ handle, ok: true, dry_run: true, field: 'seo.description', value: aiValue }); continue; }

          const upd = await client.query({
            data: {
              query: `mutation Update($input: ProductInput!) {
                productUpdate(input: $input) { product { id seo { description } } userErrors { field message } }
              }`,
              variables: { input: { id: product.id, seo: { description: aiValue } } },
            },
          });
          const errs = upd.body?.data?.productUpdate?.userErrors || [];
          if (errs.length) results.push({ handle, ok: false, error: errs[0].message });
          else results.push({ handle, ok: true, field: 'seo.description', value: aiValue });
        }

        else if (issue_type === 'missing_title_tag') {
          const aiValue = (await askLLM(
            `Write an SEO page title for this Shopify product. 50–60 characters. Include the product name + 1 benefit. No quotes, no markdown.

Product: ${product.title}`,
            { system: 'You write concise SEO page titles.', maxTokens: 40, temperature: 0.5 }
          )).trim().replace(/^["']|["']$/g, '').slice(0, 70);

          if (dry_run) { results.push({ handle, ok: true, dry_run: true, field: 'seo.title', value: aiValue }); continue; }

          const upd = await client.query({
            data: {
              query: `mutation Update($input: ProductInput!) {
                productUpdate(input: $input) { product { id seo { title } } userErrors { field message } }
              }`,
              variables: { input: { id: product.id, seo: { title: aiValue } } },
            },
          });
          const errs = upd.body?.data?.productUpdate?.userErrors || [];
          if (errs.length) results.push({ handle, ok: false, error: errs[0].message });
          else results.push({ handle, ok: true, field: 'seo.title', value: aiValue });
        }

        else if (issue_type === 'missing_alt_text') {
          const imagesNeedingAlt = (product.images?.edges || [])
            .map(e => e.node)
            .filter(img => !img.altText || !img.altText.trim());
          if (!imagesNeedingAlt.length) {
            results.push({ handle, ok: true, skipped: true, message: 'No images need alt' });
            continue;
          }
          const updates = [];
          for (const img of imagesNeedingAlt) {
            const aiValue = (await askLLM(
              `Write a short, factual alt text for this product image. 8–14 words. Describe the product visually. No "image of" or "photo of" prefix.

Product: ${product.title}
Image filename: ${img.src.split('/').pop()}`,
              { system: 'You write accessible image alt text.', maxTokens: 30, temperature: 0.5 }
            )).trim().replace(/^["']|["']$/g, '').slice(0, 125);
            updates.push({ id: img.id, alt: aiValue });
          }

          if (dry_run) { results.push({ handle, ok: true, dry_run: true, field: 'image.alt', updates }); continue; }

          for (const u of updates) {
            await client.query({
              data: {
                query: `mutation UpdateImg($productId: ID!, $image: ImageInput!) {
                  productImageUpdate(productId: $productId, image: $image) { image { id altText } userErrors { field message } }
                }`,
                variables: { productId: product.id, image: { id: u.id, altText: u.alt } },
              },
            }).catch(e => { u.error = e.message; });
          }
          results.push({ handle, ok: true, field: 'image.alt', updates });
        }
      } catch (err) {
        results.push({ handle, ok: false, error: err.message });
      }
    }

    const okCount = results.filter(r => r.ok).length;
    res.json({
      supported: true,
      issue_type,
      total: results.length,
      succeeded: okCount,
      failed: results.length - okCount,
      dry_run: !!dry_run,
      results,
    });
  } catch (err) {
    console.error('POST /audit/:id/auto-fix:', err.message);
    res.status(500).json({ error: err.message || 'Auto-fix failed' });
  }
});

// Score trend across the last N audits with an AI-written 1-paragraph
// commentary. Used in the Overview tab.
router.get('/score-trend', shopifyAuth, requireFeature('aiAuditTrend'), async (req, res) => {
  try {
    const { askLLM } = require('../services/llm');
    const audits = await Audit.findAll({
      where: { shop_id: req.shop.id, status: 'completed' },
      order: [['created_at', 'DESC']],
      limit: 8,
      attributes: ['id', 'score', 'pages_crawled', 'errors_count', 'warnings_count', 'created_at'],
    });
    const ordered = audits.reverse(); // oldest → newest
    const points = ordered.map(a => ({
      id: a.id,
      score: a.score || 0,
      pages: a.pages_crawled || 0,
      errors: a.errors_count || 0,
      warnings: a.warnings_count || 0,
      date: a.created_at,
    }));

    let commentary = '';
    if (points.length >= 2) {
      const first = points[0], last = points[points.length - 1];
      const delta = (last.score || 0) - (first.score || 0);
      const userPrompt = `An SEO audit ran on a Shopify storefront several times. Here are the runs in order (oldest to newest):

${points.map((p, i) => `Run ${i + 1} (${new Date(p.date).toISOString().split('T')[0]}): score ${p.score}/100, ${p.errors} errors, ${p.warnings} warnings, ${p.pages} pages`).join('\n')}

Score change first → latest: ${delta > 0 ? '+' : ''}${delta} points

Write a SHORT one-paragraph (max 50 words) commentary on the trend. Mention:
- Direction (improving / regressing / flat)
- Notable change in errors or warnings
- A short forward-looking note (encouragement or warning)
Don't use bullet points. Plain prose only.`;

      try {
        commentary = (await askLLM(userPrompt, {
          system: 'You are a friendly SEO consultant reviewing a merchant\'s audit history.',
          maxTokens: 150,
          temperature: 0.5,
        })).trim();
      } catch (err) {
        console.warn('[audit/score-trend] commentary failed:', err.message);
      }
    }

    res.json({ points, commentary });
  } catch (err) {
    console.error('GET /audit/score-trend:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load trend' });
  }
});

// Traffic-weighted priority action plan for an audit.
// Returns: [{ priority, type, title, why, expected_impact, effort, affected_count }]
router.get('/:id/action-plan', shopifyAuth, requireFeature('aiAuditPlan'), async (req, res) => {
  try {
    const { askLLMJson } = require('../services/llm');
    const { sequelize } = require('../models');
    const audit = await Audit.findOne({
      where: { id: req.params.id, shop_id: req.shop.id },
    });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    const summary = await AuditIssue.findAll({
      where: { audit_id: audit.id },
      attributes: [
        'type', 'severity', 'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['type', 'severity', 'category'],
      raw: true,
    });
    if (!summary.length) return res.json({ actions: [], message: 'No issues found — your site looks good.' });

    // Try to enrich with Search Console click data for traffic weighting.
    let traffic = '';
    try {
      const { AnalyticsCache } = require('../models');
      const sc = await AnalyticsCache.findOne({
        where: { shop_id: req.shop.id, data_type: 'search_console' },
        order: [['fetched_at', 'DESC']],
      });
      const pages = sc?.data?.pages || sc?.data || [];
      if (Array.isArray(pages) && pages.length > 0) {
        const top = [...pages].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 10);
        traffic = `\n\nFor context, here are the top 10 highest-traffic pages on this store (last 30 days, from Search Console):\n${top.map(p => `- ${p.page || p.url}: ${p.clicks || 0} clicks`).join('\n')}`;
      }
    } catch {}

    const userPrompt = `An SEO audit ran on a Shopify storefront. Here's a summary of every issue found, grouped by type:

${summary.map(s => `- [${s.severity}] ${s.type} (${s.category}) — ${s.count} pages`).join('\n')}

Total pages crawled: ${audit.pages_crawled || 'unknown'}
Overall score: ${audit.score || 'unknown'} / 100${traffic}

Pick the TOP 5–7 issues the merchant should fix FIRST, ranked by impact. Consider:
- Severity (errors > warnings > notices)
- Scope (issues affecting many pages > few pages)
- Whether the affected pages are likely high-traffic (e.g. an issue on the home page or a top-traffic page is more urgent)
- How easy/quick the fix is

Reply as JSON with key "actions" — an array of objects with these keys:
- "priority":         number 1–7
- "type":             the issue type (matches above)
- "title":            short imperative title (e.g. "Add missing meta descriptions to 47 product pages")
- "why":              one or two sentences explaining why this is high-priority
- "expected_impact":  short string — "high" | "medium" | "low"
- "effort":           short string — "quick" (under 1 hour) | "moderate" (a few hours) | "significant" (a day+)
- "affected_count":   number of pages affected

Order the array from priority 1 (most urgent) to last.`;

    const result = await askLLMJson(userPrompt, {
      system: 'You are a senior SEO consultant building a prioritized action plan for a Shopify merchant. Be direct and specific.',
      maxTokens: 1500,
      temperature: 0.3,
    });

    res.json({ actions: result.actions || [], generated_at: new Date().toISOString() });
  } catch (err) {
    console.error('GET /audit/:id/action-plan:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate action plan' });
  }
});

// AI fix-it explanation for a single issue type within an audit.
// Returns: { what, why_it_matters, how_to_fix, code_snippet, affected_count, sample_urls }
router.get('/:id/issues/:type/ai-fix', shopifyAuth, requireFeature('aiAuditFix'), async (req, res) => {
  try {
    const { askLLMJson } = require('../services/llm');
    const audit = await Audit.findOne({
      where: { id: req.params.id, shop_id: req.shop.id },
      attributes: ['id'],
    });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    const issues = await AuditIssue.findAll({
      where: { audit_id: audit.id, type: req.params.type },
      limit: 5,
      order: [['severity', 'ASC']],
    });
    if (!issues.length) return res.status(404).json({ error: 'No issues of that type in this audit' });

    const totalCount = await AuditIssue.count({ where: { audit_id: audit.id, type: req.params.type } });
    const sample = issues[0];

    const userPrompt = `An SEO site audit found a recurring issue on a Shopify storefront.

Issue type: ${sample.type}
Severity: ${sample.severity}
Category: ${sample.category}
Sample message: ${sample.message}
Affected URLs (sample, total ${totalCount}):
${issues.map(i => `- ${i.url || '(site-wide)'}`).join('\n')}

Reply as JSON with these keys:
- "what":             one sentence describing what this issue is, in plain English
- "why_it_matters":   one or two sentences on why it hurts SEO or user experience
- "how_to_fix":       2-4 concrete steps the merchant should take, in plain English (Shopify admin terminology where applicable)
- "code_snippet":     a copy-paste-ready snippet IF the fix involves code/text (HTML, theme.liquid, alt text, meta description, title rewrite). Otherwise null. Keep under 200 chars.
- "shopify_path":     where to make the change in Shopify admin (e.g. "Online Store → Themes → Edit code → product.liquid"). Otherwise null.

Be specific to THIS issue type. Don't give generic SEO advice.`;

    const fix = await askLLMJson(userPrompt, {
      system: 'You are an expert technical SEO consultant explaining audit issues to Shopify merchants. Be concise, accurate, and actionable.',
      maxTokens: 700,
      temperature: 0.3,
    });

    res.json({
      type: sample.type,
      severity: sample.severity,
      category: sample.category,
      affected_count: totalCount,
      sample_urls: issues.map(i => i.url).filter(Boolean),
      ...fix,
    });
  } catch (err) {
    console.error('GET /audit/:id/issues/:type/ai-fix:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate AI fix' });
  }
});

// Refresh ONLY PageSpeed Insights data on an existing audit, without re-crawling.
// Useful when the merchant already has crawl data and just wants fresh Lighthouse
// scores. Reuses the URLs from the previous PSI run if available; otherwise
// picks new ones from crawled pages.
router.post('/:id/refresh-psi', shopifyAuth, async (req, res) => {
  try {
    const audit = await Audit.findOne({
      where: { id: req.params.id, shop_id: req.shop.id },
    });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    if (audit.status !== 'completed') {
      return res.status(400).json({ error: `Cannot refresh PSI on audit with status "${audit.status}"` });
    }

    // Pick URLs: existing PSI urls > crawled pages > root URL
    let urls = audit.psi_data?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      const pages = await AuditPage.findAll({
        where: { audit_id: audit.id },
        attributes: ['url', 'status_code'],
        limit: 200,
      });
      urls = pickPSIUrls(audit.audit_url, pages, { max: 3 });
    }

    const psi_data = await runAllPSI(urls);
    await audit.update({ psi_data });
    res.json({ success: true, psi_data });
  } catch (err) {
    console.error('POST /audit/:id/refresh-psi:', err.message);
    res.status(500).json({ error: err.message || 'PSI refresh failed' });
  }
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

  // Default: crawl every page on the storefront. The crawler dedupes URLs
  // via an in-memory `seen` Set (server/services/siteAudit.js), so it stops
  // naturally when no new URLs are discovered. We only honor a max_pages
  // value if the merchant explicitly passes one (e.g. for a quick audit).
  const requested = parseInt(max_pages, 10);
  const finalMaxPages = requested > 0 ? requested : Number.MAX_SAFE_INTEGER;

  const audit = await Audit.create({
    shop_id: req.shop.id,
    audit_url: url,
    status: 'queued',
    config: { maxPages: finalMaxPages },
  });

  // Fire-and-forget — runAudit is async, don't await
  setImmediate(() => runAudit(audit.id));

  res.json({ success: true, audit });
});

module.exports = router;
