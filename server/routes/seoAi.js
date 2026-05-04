// SEO-focused AI endpoints — quick-win finder, cannibalization detector,
// and meta-tag rewriter. All consume Search Console data already cached
// by the daily fetch job, so no extra Google API calls are made.

const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { askLLMJson } = require('../services/llm');
const { AnalyticsCache } = require('../models');
const { requireFeature } = require('../services/planFeatures');

// Helper — pull the latest cached Search Console data, gracefully degrading
// to whatever shape the cache has.
async function loadSearchConsole(shopId) {
  const row = await AnalyticsCache.findOne({
    where: { shop_id: shopId, data_type: 'search_console' },
    order: [['fetched_at', 'DESC']],
  });
  if (!row || !row.data) return { keywords: [], pages: [] };
  const d = row.data;
  return {
    keywords: Array.isArray(d.keywords) ? d.keywords : Array.isArray(d) ? d : (d.queries || []),
    pages:    Array.isArray(d.pages)    ? d.pages    : [],
  };
}

// POST /api/seo-ai/quick-wins
// AI picks keywords ranking position 5–15 with rising impressions and
// suggests specific content tweaks to push them into top 5.
router.post('/quick-wins', shopifyAuth, requireFeature('aiQuickWins'), async (req, res) => {
  try {
    const sc = await loadSearchConsole(req.shop.id);
    if (!sc.keywords.length) return res.json({ wins: [], message: 'Connect Google Search Console first.' });

    // Filter candidates: position between 5 and 15, with at least some impressions.
    const candidates = sc.keywords
      .filter(k => k.position >= 5 && k.position <= 15 && (k.impressions || 0) >= 50)
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 25);
    if (!candidates.length) return res.json({ wins: [], message: 'No quick-win opportunities yet — keep publishing content.' });

    const userPrompt = `A Shopify store ranks for these keywords on Google but not in the top 5. Each keyword shows position, clicks, impressions, and CTR.

${candidates.map(k => `- "${k.keyword}" — pos ${(k.position || 0).toFixed(1)}, ${k.impressions} impressions, ${k.clicks} clicks, CTR ${((k.ctr || 0) * 100).toFixed(1)}%`).join('\n')}

Pick the 5 best "quick win" opportunities (high impressions, position close to top 5, easy to push) and write specific suggestions for each.

Reply as JSON with key "wins" — an array of objects with these keys:
- "keyword":         the exact keyword
- "current_position":the current position
- "impressions":     impressions
- "potential":       short: "high" | "medium" | "low"
- "suggestions":     array of 2–3 short, concrete content actions to improve ranking (e.g. "Add an H2 with this exact phrase", "Internal-link from your homepage", "Create a dedicated landing page").

Order by potential (high first).`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are an expert SEO consultant identifying quick-win keyword opportunities.',
      maxTokens: 2500,
      temperature: 0.4,
    });
    res.json({ wins: Array.isArray(out.wins) ? out.wins : [] });
  } catch (err) {
    console.error('POST /seo-ai/quick-wins:', err.message);
    res.status(500).json({ error: err.message || 'Failed to find quick wins' });
  }
});

// POST /api/seo-ai/cannibalization
// Find keywords where multiple pages are competing.
router.post('/cannibalization', shopifyAuth, requireFeature('aiCannibalization'), async (req, res) => {
  try {
    const sc = await loadSearchConsole(req.shop.id);
    // Many SC integrations expose per-page-per-keyword data. If we only have
    // top-level keywords + pages without join, AI can still flag suspicious
    // keyword/title overlap. Send AI both lists.
    if (!sc.keywords.length) return res.json({ conflicts: [], message: 'Connect Google Search Console first.' });

    const topKeywords = sc.keywords
      .filter(k => (k.impressions || 0) >= 50)
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 30);
    const topPages = (sc.pages || [])
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 20);

    const userPrompt = `A Shopify store has these top keywords and top pages from Google Search Console. Find KEYWORD CANNIBALIZATION — cases where multiple pages on the store target the same keyword and dilute each other's ranking.

Top keywords (with metrics):
${topKeywords.map(k => `- "${k.keyword}" — pos ${(k.position || 0).toFixed(1)}, ${k.impressions} imp, ${k.clicks} clicks`).join('\n')}

Top pages (URL paths):
${topPages.map(p => `- ${p.page || p.url}`).join('\n')}

Identify up to 5 likely cannibalization cases. For each, reply with:
- "keyword":            the contested keyword
- "competing_pages":    array of suspected URLs (best guess from the page paths)
- "winner_recommendation": which page should "own" this keyword
- "what_to_do":         one short sentence of action (e.g. "301 redirect the secondary page to the winner", "differentiate the secondary page by targeting a long-tail variation")

Reply as JSON with key "conflicts" — array of objects above. Empty array if no clear cannibalization is detectable.`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are an SEO consultant specializing in keyword strategy.',
      maxTokens: 2500,
      temperature: 0.3,
    });
    res.json({ conflicts: Array.isArray(out.conflicts) ? out.conflicts : [] });
  } catch (err) {
    console.error('POST /seo-ai/cannibalization:', err.message);
    res.status(500).json({ error: err.message || 'Failed to detect cannibalization' });
  }
});

// POST /api/seo-ai/meta-suggestions
// Pages with high impressions but low CTR get an AI-rewritten meta title +
// description to lift click-through.
router.post('/meta-suggestions', shopifyAuth, requireFeature('aiMetaRewrite'), async (req, res) => {
  try {
    const sc = await loadSearchConsole(req.shop.id);
    if (!sc.pages?.length) return res.json({ suggestions: [], message: 'No page-level Search Console data yet.' });

    // Candidates: at least 100 impressions and CTR below 2%.
    const candidates = (sc.pages || [])
      .filter(p => (p.impressions || 0) >= 100 && (p.ctr || 0) < 0.02)
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 8);
    if (!candidates.length) return res.json({ suggestions: [], message: 'No low-CTR pages right now — your meta tags are pulling their weight.' });

    const userPrompt = `These Shopify storefront pages have lots of Google impressions but low CTR. Rewrite their meta title (60 chars max) and meta description (155 chars max) to be more click-worthy. Keep meaning faithful to the URL.

${candidates.map(p => `- ${p.page || p.url} — pos ${(p.position || 0).toFixed(1)}, ${p.impressions} imp, ${p.clicks} clicks, CTR ${((p.ctr || 0) * 100).toFixed(2)}%`).join('\n')}

Reply as JSON with key "suggestions" — an array of objects with:
- "url":                the page URL exactly as given
- "current_ctr":        current CTR %
- "impressions":        impressions
- "suggested_title":    new meta title (≤60 chars)
- "suggested_description": new meta description (≤155 chars)
- "why":                one short sentence on why this rewrite should lift CTR.

No quotes around the title/description. No markdown.`;

    const out = await askLLMJson(userPrompt, {
      system: 'You are a copywriter writing click-worthy SEO meta tags for Shopify product/collection pages.',
      maxTokens: 2500,
      temperature: 0.5,
    });
    res.json({ suggestions: Array.isArray(out.suggestions) ? out.suggestions : [] });
  } catch (err) {
    console.error('POST /seo-ai/meta-suggestions:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate meta suggestions' });
  }
});

module.exports = router;
