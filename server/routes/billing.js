const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { BillingPlan, Subscription } = require('../models');
const { syncShopWithPlanLimits } = require('../services/syncOnPlan');
const { sendSubscriptionActivated } = require('../services/email');

router.get('/plans', async (req, res) => {
  const plans = await BillingPlan.findAll({ where: { is_active: true }, order: [['price', 'ASC']] });
  res.json(plans);
});

router.get('/subscription', shopifyAuth, async (req, res) => {
  const subscription = await Subscription.findOne({
    where: { shop_id: req.shop.id },
    include: [{ association: 'plan' }],
    order: [['created_at', 'DESC']],
  });
  if (!subscription) return res.json(null);

  // Merge admin-granted extra features into plan.features so the existing
  // usePlan() substring matcher unlocks them automatically.
  const extras = Array.isArray(req.shop.extra_features) ? req.shop.extra_features : [];
  if (extras.length > 0) {
    const sub = subscription.toJSON();
    let baseFeatures = [];
    try {
      const raw = sub.plan?.features;
      baseFeatures = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch {}
    const have = new Set(baseFeatures.map(s => s.toLowerCase()));
    for (const ex of extras) {
      if (ex?.label && !have.has(ex.label.toLowerCase())) baseFeatures.push(ex.label);
    }
    if (sub.plan) sub.plan.features = baseFeatures;
    return res.json(sub);
  }
  res.json(subscription);
});

router.post('/subscribe', shopifyAuth, async (req, res) => {
  const { plan_id } = req.body;
  const plan = await BillingPlan.findByPk(plan_id);
  if (!plan || !plan.is_active) return res.status(404).json({ error: 'Plan not found' });

  // Free plan — activate trial directly without Shopify billing
  if (parseFloat(plan.price) === 0) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + (plan.trial_days || 14));
    await Subscription.upsert({
      shop_id: req.shop.id,
      plan_id: plan.id,
      status: 'trial',
      trial_ends_at: trialEnd,
      current_period_start: new Date(),
    });
    // Re-sync products/orders against the new plan's limits — non-blocking
    syncShopWithPlanLimits(req.shop.id, `plan-change:${plan.slug}`).catch(err =>
      console.error('[Billing] Plan-change sync error:', err.message)
    );
    // Trial-started email
    sendSubscriptionActivated(req.shop, { status: 'trial', trial_ends_at: trialEnd }, plan)
      .catch(e => console.error('[Email] subscription-activated failed:', e.message));
    return res.json({ success: true, status: 'trial' });
  }

  const { shopify } = require('../config/shopify');
  const session = { shop: req.shop.shop_domain, accessToken: req.shop.access_token };

  try {
    const client = new shopify.clients.Graphql({ session });
    const mutation = `
      mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
        appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, trialDays: $trialDays, test: $test) {
          userErrors { field message }
          confirmationUrl
          appSubscription { id status }
        }
      }
    `;

    const result = await client.request(mutation, {
      variables: {
        name: plan.name,
        trialDays: plan.trial_days,
        // Use test charges outside production so dev stores don't get billed real money
        test: process.env.NODE_ENV !== 'production',
        returnUrl: `${process.env.APP_URL}/api/billing/confirm?shop=${req.shop.shop_domain}&plan_id=${plan_id}`,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: parseFloat(plan.price), currencyCode: 'USD' },
              interval: plan.interval === 'annual' ? 'ANNUAL' : 'EVERY_30_DAYS',
            },
          },
        }],
      },
    });

    const subscriptionData = result.data?.appSubscriptionCreate;
    if (!subscriptionData) throw new Error('No response from Shopify billing API');

    const userErrors = subscriptionData.userErrors || [];
    if (userErrors.length > 0) {
      throw new Error(userErrors.map(e => e.message).join(', '));
    }

    const { confirmationUrl, appSubscription } = subscriptionData;
    await Subscription.upsert({
      shop_id: req.shop.id,
      plan_id: plan.id,
      shopify_charge_id: appSubscription.id,
      status: 'pending',
    });

    res.json({ confirmationUrl });
  } catch (err) {
    console.error('Subscribe error:', err);
    // Surface Shopify's real reason (e.g. "Apps without a public distribution
    // cannot use the Billing API") so the merchant sees something actionable.
    const message = err?.message || 'Failed to create subscription';
    res.status(500).json({ error: message });
  }
});

router.get('/confirm', shopifyAuth, async (req, res) => {
  const { plan_id, charge_id } = req.query;
  const sub = await Subscription.findOne({ where: { shop_id: req.shop.id, plan_id } });
  if (sub) {
    const wasNotActive = sub.status !== 'active';
    await sub.update({ status: 'active', current_period_start: new Date() });
    // Activation email — only on the transition into active (not on re-confirmation)
    if (wasNotActive) {
      const plan = await BillingPlan.findByPk(plan_id);
      if (plan) {
        sendSubscriptionActivated(req.shop, sub, plan)
          .catch(e => console.error('[Email] subscription-activated failed:', e.message));
      }
    }
  }
  // Paid plan just activated — re-sync against the new (higher) plan's limits
  syncShopWithPlanLimits(req.shop.id, `plan-confirm:${plan_id}`).catch(err =>
    console.error('[Billing] Confirm sync error:', err.message)
  );
  // Bounce back into the Shopify admin so the app re-mounts in its iframe
  // chrome (host param + session restored). Lands on the dashboard route.
  const apiKey = process.env.SHOPIFY_API_KEY;
  const shopHandle = req.shop.shop_domain.replace('.myshopify.com', '');
  if (apiKey && shopHandle) {
    return res.redirect(`https://admin.shopify.com/store/${shopHandle}/apps/${apiKey}?billing=success`);
  }
  res.redirect(`${process.env.APP_URL}?billing=success&shop=${req.shop.shop_domain}`);
});

module.exports = router;
