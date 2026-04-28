const axios = require('axios');
const { Order } = require('../models');

const API_VERSION = '2024-01';

function extractUtm(landingSite) {
  if (!landingSite) return {};
  try {
    const url = new URL(landingSite.startsWith('http') ? landingSite : `https://x.com${landingSite}`);
    return {
      utm_source:   url.searchParams.get('utm_source'),
      utm_medium:   url.searchParams.get('utm_medium'),
      utm_campaign: url.searchParams.get('utm_campaign'),
      utm_content:  url.searchParams.get('utm_content'),
      utm_term:     url.searchParams.get('utm_term'),
    };
  } catch { return {}; }
}

async function upsertOrder(shopId, shopifyOrder) {
  const o = shopifyOrder;
  const utm = extractUtm(o.landing_site);

  await Order.upsert({
    shop_id:           shopId,
    shopify_order_id:  o.id,
    order_number:      o.order_number,
    email:             o.email,
    total_price:       parseFloat(o.total_price) || 0,
    subtotal_price:    parseFloat(o.subtotal_price) || 0,
    total_tax:         parseFloat(o.total_tax) || 0,
    currency:          o.currency,
    financial_status:  o.financial_status,
    fulfillment_status: o.fulfillment_status,
    source_name:       o.source_name,
    referring_site:    o.referring_site,
    landing_site:      o.landing_site,
    ...utm,
    line_items: (o.line_items || []).map(li => ({
      product_id:  li.product_id,
      variant_id:  li.variant_id,
      title:       li.title,
      quantity:    li.quantity,
      price:       li.price,
      sku:         li.sku,
    })),
    processed_at:  o.processed_at ? new Date(o.processed_at) : null,
    cancelled_at:  o.cancelled_at ? new Date(o.cancelled_at) : null,
  });
}

// `maxOrders` (default 0 = unlimited) caps total upserts; once reached we stop early.
async function syncAllOrders(shopId, shopDomain, accessToken, daysBack = 30, maxOrders = 0) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString();
  const cap = Number.isFinite(maxOrders) && maxOrders > 0 ? maxOrders : 0;

  let url = `https://${shopDomain}/admin/api/${API_VERSION}/orders.json?limit=250&status=any&created_at_min=${sinceStr}`;
  let synced = 0;

  outer: while (url) {
    let res;
    try {
      res = await axios.get(url, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      });
    } catch (e) {
      console.error('[OrderSync] Shopify API error:', e.response?.status, JSON.stringify(e.response?.data));
      throw e;
    }
    const orders = res.data.orders || [];
    if (!orders.length) break;

    for (const o of orders) {
      if (cap && synced >= cap) break outer;
      await upsertOrder(shopId, o);
      synced++;
    }

    const link = res.headers['link'] || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  console.log(`[OrderSync] Done — ${synced} orders synced for ${shopDomain}${cap ? ` (cap ${cap})` : ''}`);
  return synced;
}

module.exports = { syncAllOrders, upsertOrder };
