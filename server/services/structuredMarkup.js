// JSON-LD schema builders for product pages + Shopify Script Tag injector.
//
// Two delivery modes (per shop, set in shop_settings.markup_injection_mode):
//   - 'paste'      → backend returns the script blocks; merchant pastes into theme
//   - 'script_tag' → we install a Shopify Script Tag pointing at our endpoint
//                    that returns per-page JSON-LD detected from window.location
const axios = require('axios');
const { Shop, Product, ProductFaq, ShopSettings } = require('../models');

const SHOPIFY_API_VERSION = '2024-01';

// ── Builders ────────────────────────────────────────────────────────────────
function shopOrigin(shop) {
  return `https://${shop.shop_domain.replace(/\/$/, '')}`;
}

function productUrl(shop, product) {
  return `${shopOrigin(shop)}/products/${product.handle || product.shopify_product_id}`;
}

function buildProductSchema(product, shop) {
  const images = Array.isArray(product.images) ? product.images : [];
  const imageUrls = images.map(i => i.src || i.url).filter(Boolean);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    url: productUrl(shop, product),
    sku: product.sku || String(product.shopify_product_id),
  };
  if (product.body_html) {
    schema.description = product.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  }
  if (imageUrls.length) schema.image = imageUrls.slice(0, 8);
  if (product.vendor) schema.brand = { '@type': 'Brand', name: product.vendor };
  if (product.product_type) schema.category = product.product_type;
  return schema;
}

function buildFaqSchema(faqs) {
  if (!faqs?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

function buildBreadcrumbSchema(product, shop) {
  const items = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: shopOrigin(shop) },
  ];
  if (product.product_type) {
    items.push({
      '@type': 'ListItem', position: 2,
      name: product.product_type,
      item: `${shopOrigin(shop)}/collections/${product.product_type.toLowerCase().replace(/\s+/g, '-')}`,
    });
  }
  items.push({
    '@type': 'ListItem', position: items.length + 1,
    name: product.title, item: productUrl(shop, product),
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

function buildOrganizationSchema(shop, settings) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: shop.shop_name || shop.shop_domain,
    url: shopOrigin(shop),
  };
  if (settings?.org_logo_url) schema.logo = settings.org_logo_url;
  const sameAs = Array.isArray(settings?.org_social_profiles)
    ? settings.org_social_profiles.filter(Boolean)
    : [];
  if (sameAs.length) schema.sameAs = sameAs;
  return schema;
}

// ── Aggregator ──────────────────────────────────────────────────────────────
// Returns { blocks: [{ key, type, json }], html } for a given product, honoring
// the shop's markup_enabled_types toggles.
async function buildAllForProduct({ productId, shopId }) {
  const product = await Product.findOne({ where: { id: productId, shop_id: shopId } });
  if (!product) throw new Error('Product not found');
  const shop = await Shop.findByPk(shopId);
  const settings = await ShopSettings.findOne({ where: { shop_id: shopId } });

  const enabled = settings?.markup_enabled_types || {
    product: true, faq: true, breadcrumb: true, organization: true,
  };

  const blocks = [];

  if (enabled.product) {
    blocks.push({ key: 'product', type: 'Product', json: buildProductSchema(product, shop) });
  }
  if (enabled.faq) {
    const faqs = await ProductFaq.findAll({
      where: { product_id: productId, shop_id: shopId, status: ['draft', 'approved'] },
      order: [['sort_order', 'ASC']],
    });
    const fs = buildFaqSchema(faqs);
    if (fs) blocks.push({ key: 'faq', type: 'FAQPage', json: fs });
  }
  if (enabled.breadcrumb) {
    blocks.push({ key: 'breadcrumb', type: 'BreadcrumbList', json: buildBreadcrumbSchema(product, shop) });
  }
  if (enabled.organization) {
    blocks.push({ key: 'organization', type: 'Organization', json: buildOrganizationSchema(shop, settings) });
  }

  const html = blocks.map(b =>
    `<script type="application/ld+json">\n${JSON.stringify(b.json, null, 2)}\n</script>`
  ).join('\n\n');

  return { blocks, html, product, shop };
}

// ── Shopify Script Tag injector ─────────────────────────────────────────────
// Installs a single Script Tag that points at our public endpoint. The
// endpoint (frontend route) reads window.location, fetches the right blocks,
// and injects <script type="application/ld+json"> into the head.
async function installScriptTag({ shop, scriptSrcUrl }) {
  // Remove existing tag first if we tracked one
  const settings = await ShopSettings.findOne({ where: { shop_id: shop.id } });
  if (settings?.markup_script_tag_id) {
    await axios.delete(
      `https://${shop.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/script_tags/${settings.markup_script_tag_id}.json`,
      { headers: { 'X-Shopify-Access-Token': shop.access_token } }
    ).catch(() => {});
  }

  const res = await axios.post(
    `https://${shop.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/script_tags.json`,
    {
      script_tag: {
        event: 'onload',
        src: scriptSrcUrl,
        display_scope: 'online_store',
      },
    },
    { headers: { 'X-Shopify-Access-Token': shop.access_token, 'Content-Type': 'application/json' } }
  );
  const tagId = res.data?.script_tag?.id;
  if (!tagId) throw new Error('Shopify did not return a script_tag id');
  await ShopSettings.update(
    { markup_injection_mode: 'script_tag', markup_script_tag_id: String(tagId) },
    { where: { shop_id: shop.id } }
  );
  return { tagId };
}

async function uninstallScriptTag({ shop }) {
  const settings = await ShopSettings.findOne({ where: { shop_id: shop.id } });
  if (!settings?.markup_script_tag_id) return { removed: false, reason: 'not-installed' };

  await axios.delete(
    `https://${shop.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/script_tags/${settings.markup_script_tag_id}.json`,
    { headers: { 'X-Shopify-Access-Token': shop.access_token } }
  ).catch(() => {});

  await ShopSettings.update(
    { markup_injection_mode: 'paste', markup_script_tag_id: null },
    { where: { shop_id: shop.id } }
  );
  return { removed: true };
}

module.exports = {
  buildProductSchema, buildFaqSchema, buildBreadcrumbSchema, buildOrganizationSchema,
  buildAllForProduct, installScriptTag, uninstallScriptTag,
};
