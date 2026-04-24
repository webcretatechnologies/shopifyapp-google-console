const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BillingPlan = sequelize.define('BillingPlan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  interval: { type: DataTypes.ENUM('monthly', 'annual'), defaultValue: 'monthly' },
  trial_days: { type: DataTypes.INTEGER, defaultValue: 14 },
  features: { type: DataTypes.JSON, allowNull: true },
  limits: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'e.g. { ga4_properties: 1, search_console_sites: 5 }',
  },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  shopify_plan_id: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'billing_plans',
});

module.exports = BillingPlan;
