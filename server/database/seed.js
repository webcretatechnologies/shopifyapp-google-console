require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { sequelize, Admin, BillingPlan } = require('../models');

async function seed() {
  await sequelize.authenticate();

  // Seed billing plans
  const plans = [
    {
      name: 'Starter',
      slug: 'starter',
      price: 0.00,
      interval: 'monthly',
      trial_days: 14,
      features: ['GA4 Analytics', 'Search Console (100 keywords)', 'Basic Dashboard'],
      limits: { ga4_properties: 1, search_console_sites: 1, keywords_limit: 100 },
      is_active: true,
    },
    {
      name: 'Growth',
      slug: 'growth',
      price: 19.99,
      interval: 'monthly',
      trial_days: 14,
      features: ['GA4 Analytics', 'Search Console (unlimited)', 'Google Ads', 'Advanced Dashboard', 'CSV Export'],
      limits: { ga4_properties: 3, search_console_sites: 10, keywords_limit: 1000 },
      is_active: true,
    },
    {
      name: 'Pro',
      slug: 'pro',
      price: 49.99,
      interval: 'monthly',
      trial_days: 14,
      features: ['All Growth features', 'Unlimited properties', 'Priority support', 'Custom reports', 'API access'],
      limits: { ga4_properties: -1, search_console_sites: -1, keywords_limit: -1 },
      is_active: true,
    },
  ];

  for (const plan of plans) {
    await BillingPlan.upsert(plan, { conflictFields: ['slug'] });
  }
  console.log('Billing plans seeded');

  // Seed super admin
  const adminExists = await Admin.findOne({ where: { email: process.env.SUPER_ADMIN_EMAIL || 'admin@yourdomain.com' } });
  if (!adminExists) {
    await Admin.create({
      name: 'Super Admin',
      email: process.env.SUPER_ADMIN_EMAIL || 'admin@yourdomain.com',
      password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@1234',
      role: 'super_admin',
      is_active: true,
    });
    console.log('Super admin created');
  }

  console.log('Seeding complete');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
