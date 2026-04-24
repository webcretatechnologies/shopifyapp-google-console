const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  plan_id: { type: DataTypes.INTEGER, allowNull: false },
  shopify_charge_id: { type: DataTypes.STRING(255), allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'trial', 'cancelled', 'expired', 'frozen'),
    defaultValue: 'pending',
  },
  trial_ends_at: { type: DataTypes.DATE, allowNull: true },
  current_period_start: { type: DataTypes.DATE, allowNull: true },
  current_period_end: { type: DataTypes.DATE, allowNull: true },
  cancelled_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'subscriptions',
});

module.exports = Subscription;
