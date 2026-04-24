const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id:             { type: DataTypes.INTEGER, allowNull: false },
  shopify_order_id:    { type: DataTypes.BIGINT, allowNull: false },
  order_number:        { type: DataTypes.INTEGER, allowNull: true },
  email:               { type: DataTypes.STRING(255), allowNull: true },
  total_price:         { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  subtotal_price:      { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  total_tax:           { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  currency:            { type: DataTypes.STRING(10), allowNull: true },
  financial_status:    { type: DataTypes.STRING(50), allowNull: true },
  fulfillment_status:  { type: DataTypes.STRING(50), allowNull: true },
  // Traffic source data — extracted from Shopify's landing_site URL
  source_name:         { type: DataTypes.STRING(100), allowNull: true },  // web, pos, etc
  referring_site:      { type: DataTypes.STRING(500), allowNull: true },
  landing_site:        { type: DataTypes.TEXT, allowNull: true },
  utm_source:          { type: DataTypes.STRING(255), allowNull: true },  // google, facebook
  utm_medium:          { type: DataTypes.STRING(255), allowNull: true },  // cpc, organic
  utm_campaign:        { type: DataTypes.STRING(255), allowNull: true },
  utm_content:         { type: DataTypes.STRING(255), allowNull: true },
  utm_term:            { type: DataTypes.STRING(255), allowNull: true },
  // Line items stored as JSON for product correlation
  line_items:          { type: DataTypes.JSON, allowNull: true },
  processed_at:        { type: DataTypes.DATE, allowNull: true },
  cancelled_at:        { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'orders',
  indexes: [
    { unique: true, fields: ['shop_id', 'shopify_order_id'] },
    { fields: ['shop_id'] },
    { fields: ['utm_source'] },
    { fields: ['processed_at'] },
  ],
});

module.exports = Order;
