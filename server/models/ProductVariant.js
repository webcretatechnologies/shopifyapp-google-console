const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductVariant = sequelize.define('ProductVariant', {
  id:                    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id:               { type: DataTypes.INTEGER, allowNull: false },
  product_id:            { type: DataTypes.INTEGER, allowNull: false },
  shopify_variant_id:    { type: DataTypes.BIGINT, allowNull: false },
  shopify_product_id:    { type: DataTypes.BIGINT, allowNull: false },
  title:                 { type: DataTypes.STRING(500), allowNull: true },
  sku:                   { type: DataTypes.STRING(255), allowNull: true },
  price:                 { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  compare_at_price:      { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  inventory_quantity:    { type: DataTypes.INTEGER, defaultValue: 0 },
  inventory_management:  { type: DataTypes.STRING(100), allowNull: true },
  inventory_policy:      { type: DataTypes.STRING(100), allowNull: true },
  fulfillment_service:   { type: DataTypes.STRING(100), allowNull: true },
  weight:                { type: DataTypes.DECIMAL(10, 3), allowNull: true },
  weight_unit:           { type: DataTypes.STRING(20), allowNull: true },
  option1:               { type: DataTypes.STRING(255), allowNull: true },
  option2:               { type: DataTypes.STRING(255), allowNull: true },
  option3:               { type: DataTypes.STRING(255), allowNull: true },
  barcode:               { type: DataTypes.STRING(255), allowNull: true },
  image_src:             { type: DataTypes.TEXT, allowNull: true },
  position:              { type: DataTypes.INTEGER, defaultValue: 1 },
  taxable:               { type: DataTypes.BOOLEAN, defaultValue: true },
  requires_shipping:     { type: DataTypes.BOOLEAN, defaultValue: true },
  shopify_created_at:    { type: DataTypes.DATE, allowNull: true },
  shopify_updated_at:    { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'product_variants',
  indexes: [
    { unique: true, fields: ['shop_id', 'shopify_variant_id'] },
    { fields: ['shop_id'] },
    { fields: ['product_id'] },
    { fields: ['sku'] },
  ],
});

module.exports = ProductVariant;
