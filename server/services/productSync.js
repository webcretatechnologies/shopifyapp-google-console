const axios = require('axios');
const { Product, ProductVariant } = require('../models');

const SHOPIFY_API_VERSION = '2024-01';

// Build a flat variant image src from the product images array
function getVariantImageSrc(variant, productImages) {
  if (!variant.image_id || !productImages?.length) return null;
  const img = productImages.find(i => i.id === variant.image_id);
  return img?.src || null;
}

// Upsert one product + all its variants
async function upsertProduct(shopId, shopDomain, shopifyProduct) {
  const p = shopifyProduct;

  const [product] = await Product.upsert({
    shop_id:            shopId,
    shopify_product_id: p.id,
    title:              p.title,
    handle:             p.handle,
    vendor:             p.vendor,
    product_type:       p.product_type,
    status:             p.status || 'active',
    tags:               p.tags,
    body_html:          p.body_html,
    images:             p.images?.map(i => ({ id: i.id, src: i.src, alt: i.alt, position: i.position })) || [],
    options:            p.options?.map(o => ({ name: o.name, values: o.values })) || [],
    published_at:       p.published_at ? new Date(p.published_at) : null,
    shopify_created_at: p.created_at ? new Date(p.created_at) : null,
    shopify_updated_at: p.updated_at ? new Date(p.updated_at) : null,
  }, { returning: true });

  const productRecord = Array.isArray(product) ? product[0] : product;

  // Upsert all variants
  if (p.variants?.length) {
    await Promise.all(p.variants.map(v =>
      ProductVariant.upsert({
        shop_id:              shopId,
        product_id:           productRecord.id,
        shopify_variant_id:   v.id,
        shopify_product_id:   p.id,
        title:                v.title,
        sku:                  v.sku || null,
        price:                parseFloat(v.price) || 0,
        compare_at_price:     v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        inventory_quantity:   v.inventory_quantity ?? 0,
        inventory_management: v.inventory_management,
        inventory_policy:     v.inventory_policy,
        fulfillment_service:  v.fulfillment_service,
        weight:               v.grams ? v.grams / 1000 : null,
        weight_unit:          'kg',
        option1:              v.option1,
        option2:              v.option2,
        option3:              v.option3,
        barcode:              v.barcode || null,
        image_src:            getVariantImageSrc(v, p.images),
        position:             v.position,
        taxable:              v.taxable,
        requires_shipping:    v.requires_shipping,
        shopify_created_at:   v.created_at ? new Date(v.created_at) : null,
        shopify_updated_at:   v.updated_at ? new Date(v.updated_at) : null,
      })
    ));
  }

  return productRecord;
}

// Full sync — fetch all products via paginated REST API
// Shopify status param accepts: active, archived, draft (NOT 'any')
// We loop all three to get everything
async function syncAllProducts(shopId, shopDomain, accessToken) {
  const statuses = ['active', 'draft', 'archived'];
  let totalSynced = 0;

  for (const status of statuses) {
    let url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250&status=${status}`;
    let page = 0;

    while (url) {
      page++;
      console.log(`[ProductSync] ${status} page ${page} for ${shopDomain}`);

      const res = await axios.get(url, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      });

      const products = res.data.products || [];
      if (products.length === 0) break;

      // Upsert sequentially to avoid DB connection flooding on large stores
      for (const p of products) {
        await upsertProduct(shopId, shopDomain, p);
      }
      totalSynced += products.length;

      // Shopify cursor-based pagination via Link header
      const linkHeader = res.headers['link'] || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
    }
  }

  console.log(`[ProductSync] Done — ${totalSynced} products synced for shop ${shopDomain}`);
  return totalSynced;
}

// Register product webhooks with Shopify
async function registerProductWebhooks(shopDomain, accessToken, appUrl) {
  const topics = [
    'products/create',
    'products/update',
    'products/delete',
  ];

  for (const topic of topics) {
    const address = `${appUrl}/api/webhooks/${topic.replace('/', '/')}`;
    try {
      await axios.post(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
        { webhook: { topic, address, format: 'json' } },
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      console.log(`[ProductSync] Webhook registered: ${topic}`);
    } catch (err) {
      if (err.response?.status !== 422) {
        console.warn(`[ProductSync] Webhook warning (${topic}):`, err.response?.data || err.message);
      }
    }
  }
}

module.exports = { syncAllProducts, upsertProduct, registerProductWebhooks };
