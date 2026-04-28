const { Shop, Subscription, BillingPlan } = require('../models');
const { syncAllProducts } = require('./productSync');
const { syncAllOrders } = require('./orderSync');

// Read product/order caps from the shop's active subscription plan.
// Returns { products, orders, keywords } where 0 means "unlimited".
// If no active subscription, falls back to the cheapest active plan's limits
// (typically the free Starter plan) so install-time syncs still respect a sane cap.
async function getShopSyncCaps(shopId) {
  const sub = await Subscription.findOne({
    where: { shop_id: shopId },
    include: [{ association: 'plan' }],
    order: [['created_at', 'DESC']],
  });

  let limits = sub?.plan?.limits;
  if (!limits) {
    const fallbackPlan = await BillingPlan.findOne({
      where: { is_active: true },
      order: [['price', 'ASC']],
    });
    limits = fallbackPlan?.limits || {};
  }

  if (typeof limits === 'string') {
    try { limits = JSON.parse(limits); } catch { limits = {}; }
  }

  const num = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return {
    products: num(limits.products),
    orders:   num(limits.orders),
    keywords: num(limits.keywords),
  };
}

// Kick off product + order sync for a shop, capped by the shop's plan limits.
// Non-blocking — runs in background and logs results. Errors are swallowed so
// install / plan-change flows are never blocked by Shopify API hiccups.
async function syncShopWithPlanLimits(shopId, reason = 'unknown') {
  try {
    const shop = await Shop.findByPk(shopId);
    if (!shop || !shop.access_token) {
      console.warn(`[PlanSync] Skipped (${reason}): shop ${shopId} missing or no access token`);
      return;
    }

    const caps = await getShopSyncCaps(shopId);
    console.log(`[PlanSync] Starting (${reason}) for ${shop.shop_domain} caps=${JSON.stringify(caps)}`);

    // Run product + order sync in parallel — each is internally sequential
    const [productCount, orderCount] = await Promise.all([
      syncAllProducts(shop.id, shop.shop_domain, shop.access_token, caps.products)
        .catch(err => {
          console.error('[PlanSync] productSync failed:', err.message);
          return 0;
        }),
      syncAllOrders(shop.id, shop.shop_domain, shop.access_token, 30, caps.orders)
        .catch(err => {
          console.error('[PlanSync] orderSync failed:', err.message);
          return 0;
        }),
    ]);

    console.log(`[PlanSync] Done (${reason}) for ${shop.shop_domain} — ${productCount} products, ${orderCount} orders`);
  } catch (err) {
    console.error(`[PlanSync] Orchestrator error (${reason}):`, err.message);
  }
}

module.exports = { syncShopWithPlanLimits, getShopSyncCaps };
