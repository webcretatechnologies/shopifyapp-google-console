const { Op } = require('sequelize');
const { Product, ProductVariant, Order, GoogleAccount, AnalyticsCache } = require('../models');
const { getKeywordRankings } = require('./googleSearchConsole');

// ── Low stock + high traffic alerts ──────────────────────────────────────────
async function getLowStockAlerts(shopId, lowStockThreshold = 5) {
  const alerts = [];

  // Get GA4 page view data from cache
  const cache = await AnalyticsCache.findOne({
    where: { shop_id: shopId, data_type: 'search_console' },
    order: [['fetched_at', 'DESC']],
  });

  const searchData = cache?.data || [];

  // Build a map: product handle → total clicks from Search Console
  const clicksByHandle = {};
  for (const row of searchData) {
    const match = row.page?.match(/\/products\/([^/?#]+)/);
    if (match) {
      const handle = match[1];
      clicksByHandle[handle] = (clicksByHandle[handle] || 0) + (row.clicks || 0);
    }
  }

  // Find variants with low stock
  const lowVariants = await ProductVariant.findAll({
    where: { shop_id: shopId },
    include: [{ model: Product, as: 'product', where: { shop_id: shopId, status: 'active' } }],
  });

  for (const variant of lowVariants) {
    const qty = variant.inventory_quantity ?? 0;
    if (variant.inventory_management !== 'shopify') continue; // unmanaged stock
    if (qty > lowStockThreshold) continue;

    const handle = variant.product?.handle;
    const clicks = clicksByHandle[handle] || 0;

    if (clicks > 50 || qty <= 0) {
      alerts.push({
        type: qty <= 0 ? 'out_of_stock' : 'low_stock',
        severity: qty <= 0 ? 'critical' : clicks > 200 ? 'high' : 'medium',
        product_id:   variant.product_id,
        product_title: variant.product?.title,
        variant_title: variant.title,
        sku:           variant.sku,
        inventory:     qty,
        monthly_clicks: clicks,
        message: qty <= 0
          ? `OUT OF STOCK — "${variant.product?.title} (${variant.title})" is getting ${clicks} monthly clicks but has 0 units`
          : `LOW STOCK — "${variant.product?.title} (${variant.title})" has only ${qty} units left but gets ${clicks} monthly clicks`,
      });
    }
  }

  return alerts.sort((a, b) => b.monthly_clicks - a.monthly_clicks);
}

// ── Product-level SEO report ──────────────────────────────────────────────────
async function getProductSeoReport(shopId) {
  const cache = await AnalyticsCache.findOne({
    where: { shop_id: shopId, data_type: 'search_console' },
    order: [['fetched_at', 'DESC']],
  });

  if (!cache?.data?.length) return [];

  // Group Search Console rows by product handle
  const byHandle = {};
  for (const row of cache.data) {
    const match = row.page?.match(/\/products\/([^/?#]+)/);
    if (!match) continue;
    const handle = match[1];
    if (!byHandle[handle]) byHandle[handle] = { handle, keywords: [], totalClicks: 0, totalImpressions: 0 };
    byHandle[handle].keywords.push(row);
    byHandle[handle].totalClicks += row.clicks || 0;
    byHandle[handle].totalImpressions += row.impressions || 0;
  }

  // Match handles to product records
  const handles = Object.keys(byHandle);
  const products = await Product.findAll({
    where: { shop_id: shopId, handle: handles },
    attributes: ['id', 'title', 'handle', 'status', 'vendor'],
  });

  const productMap = {};
  for (const p of products) productMap[p.handle] = p;

  return Object.values(byHandle)
    .filter(h => productMap[h.handle])
    .map(h => ({
      product_id:    productMap[h.handle].id,
      product_title: productMap[h.handle].title,
      handle:        h.handle,
      total_clicks:  h.totalClicks,
      total_impressions: h.totalImpressions,
      avg_position:  parseFloat((h.keywords.reduce((s, k) => s + k.position, 0) / h.keywords.length).toFixed(1)),
      avg_ctr:       parseFloat((h.keywords.reduce((s, k) => s + k.ctr, 0) / h.keywords.length).toFixed(2)),
      top_keywords:  h.keywords.sort((a, b) => b.clicks - a.clicks).slice(0, 5),
    }))
    .sort((a, b) => b.total_clicks - a.total_clicks);
}

// ── Automated SEO suggestions ─────────────────────────────────────────────────
async function getSeoSuggestions(shopId) {
  const suggestions = [];

  const cache = await AnalyticsCache.findOne({
    where: { shop_id: shopId, data_type: 'search_console' },
    order: [['fetched_at', 'DESC']],
  });

  if (!cache?.data?.length) {
    return [{ type: 'info', message: 'Connect Google Search Console and wait for data to sync to see SEO suggestions.' }];
  }

  const byHandle = {};
  for (const row of cache.data) {
    const match = row.page?.match(/\/products\/([^/?#]+)/);
    if (!match) continue;
    const handle = match[1];
    if (!byHandle[handle]) byHandle[handle] = [];
    byHandle[handle].push(row);
  }

  const products = await Product.findAll({
    where: { shop_id: shopId, status: 'active' },
    attributes: ['id', 'title', 'handle', 'body_html', 'tags'],
    limit: 200,
  });

  for (const product of products) {
    const keywords = byHandle[product.handle] || [];
    const titleLower = product.title?.toLowerCase() || '';
    const bodyLower = (product.body_html || '').replace(/<[^>]+>/g, '').toLowerCase();
    const tagsLower = (product.tags || '').toLowerCase();
    const allContent = `${titleLower} ${bodyLower} ${tagsLower}`;

    if (!keywords.length) {
      suggestions.push({
        type: 'no_data',
        priority: 'low',
        product_id: product.id,
        product_title: product.title,
        message: `No Search Console data yet for "${product.title}". Make sure the product page is indexed by Google.`,
      });
      continue;
    }

    for (const kw of keywords) {
      const word = kw.keyword?.toLowerCase();
      if (!word) continue;

      // Ranking on page 2+ — needs optimization
      if (kw.position > 10 && kw.position <= 20) {
        suggestions.push({
          type: 'position_improvement',
          priority: 'high',
          product_id: product.id,
          product_title: product.title,
          keyword: kw.keyword,
          current_position: kw.position,
          clicks: kw.clicks,
          impressions: kw.impressions,
          message: `"${product.title}" ranks at position ${kw.position} for "${kw.keyword}" (${kw.impressions} impressions). Getting to page 1 could bring ${Math.round(kw.impressions * 0.05)} more clicks/month.`,
          action: allContent.includes(word)
            ? `Add "${kw.keyword}" to your product title and first paragraph of description.`
            : `The keyword "${kw.keyword}" is NOT in your product title or description — add it naturally.`,
        });
      }

      // High impressions, very low CTR — title needs work
      if (kw.impressions > 100 && kw.ctr < 2) {
        suggestions.push({
          type: 'low_ctr',
          priority: 'high',
          product_id: product.id,
          product_title: product.title,
          keyword: kw.keyword,
          current_ctr: kw.ctr,
          impressions: kw.impressions,
          message: `"${product.title}" appears ${kw.impressions} times in Google for "${kw.keyword}" but only ${kw.ctr}% of people click it.`,
          action: `Rewrite your product title to be more compelling. Include "${kw.keyword}" near the start.`,
        });
      }

      // Keyword drives traffic but not in title
      if (kw.clicks > 10 && !titleLower.includes(word)) {
        suggestions.push({
          type: 'keyword_not_in_title',
          priority: 'medium',
          product_id: product.id,
          product_title: product.title,
          keyword: kw.keyword,
          clicks: kw.clicks,
          message: `"${kw.keyword}" brings ${kw.clicks} clicks to "${product.title}" but the keyword is NOT in the product title.`,
          action: `Add "${kw.keyword}" to your product title to strengthen its ranking.`,
        });
      }
    }
  }

  // Deduplicate and sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const seen = new Set();
  return suggestions
    .filter(s => { const key = `${s.product_id}-${s.type}-${s.keyword}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))
    .slice(0, 50);
}

// ── Google Ads order correlation ──────────────────────────────────────────────
async function getAdsOrderCorrelation(shopId) {
  // Count total orders in DB for this shop (all time)
  const totalInDb = await Order.count({ where: { shop_id: shopId } });

  if (!totalInDb) {
    return { total_in_db: 0, summary: null, by_campaign: [], top_products_from_ads: [] };
  }

  // Analyse last 30 days, include all financial statuses
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const orders = await Order.findAll({
    where: {
      shop_id: shopId,
      processed_at: { [Op.gte]: thirtyDaysAgo },
      financial_status: { [Op.in]: ['paid', 'partially_paid', 'pending'] },
    },
  });

  const total = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

  // Google Ads orders — utm_source contains google AND utm_medium=cpc
  const adsOrders = orders.filter(o => {
    const src = (o.utm_source || '').toLowerCase();
    const med = (o.utm_medium || '').toLowerCase();
    return src.includes('google') && med === 'cpc';
  });

  // Organic search orders — medium=organic OR referred from google.com with no paid UTM
  const organicOrders = orders.filter(o => {
    const med = (o.utm_medium || '').toLowerCase();
    const ref = (o.referring_site || '').toLowerCase();
    return med === 'organic' || (ref.includes('google.com') && med !== 'cpc');
  });

  // Group by campaign
  const byCampaign = {};
  for (const o of adsOrders) {
    const campaign = o.utm_campaign || 'Unknown Campaign';
    if (!byCampaign[campaign]) byCampaign[campaign] = { orders: 0, revenue: 0 };
    byCampaign[campaign].orders++;
    byCampaign[campaign].revenue += parseFloat(o.total_price || 0);
  }

  // Top products from ads orders
  const productMap = {};
  for (const o of adsOrders) {
    for (const li of (o.line_items || [])) {
      const key = li.product_id || li.title;
      if (!productMap[key]) productMap[key] = { title: li.title, orders: 0, revenue: 0, quantity: 0 };
      productMap[key].orders++;
      productMap[key].revenue += parseFloat(li.price || 0) * (li.quantity || 1);
      productMap[key].quantity += li.quantity || 1;
    }
  }

  return {
    total_in_db: totalInDb,
    summary: {
      total_orders: total,
      total_revenue: parseFloat(totalRevenue.toFixed(2)),
      google_ads_orders: adsOrders.length,
      google_ads_revenue: parseFloat(adsOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0).toFixed(2)),
      organic_orders: organicOrders.length,
      organic_revenue: parseFloat(organicOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0).toFixed(2)),
    },
    by_campaign: Object.entries(byCampaign)
      .map(([campaign, d]) => ({ campaign, ...d, revenue: parseFloat(d.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue),
    top_products_from_ads: Object.values(productMap)
      .map(p => ({ ...p, revenue: parseFloat(p.revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
  };
}

module.exports = { getLowStockAlerts, getProductSeoReport, getSeoSuggestions, getAdsOrderCorrelation };
