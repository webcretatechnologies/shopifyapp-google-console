const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id:             { type: DataTypes.INTEGER, allowNull: false },
  shopify_product_id:  { type: DataTypes.BIGINT, allowNull: false },
  title:               { type: DataTypes.STRING(500), allowNull: false },
  handle:              { type: DataTypes.STRING(500), allowNull: true },
  vendor:              { type: DataTypes.STRING(255), allowNull: true },
  product_type:        { type: DataTypes.STRING(255), allowNull: true },
  status:              { type: DataTypes.ENUM('active', 'archived', 'draft'), defaultValue: 'active' },
  tags:                { type: DataTypes.TEXT, allowNull: true },
  body_html:           { type: DataTypes.TEXT('long'), allowNull: true },
  images:              { type: DataTypes.JSON, allowNull: true },
  options:             { type: DataTypes.JSON, allowNull: true },
  published_at:        { type: DataTypes.DATE, allowNull: true },
  shopify_created_at:  { type: DataTypes.DATE, allowNull: true },
  shopify_updated_at:  { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'products',
  indexes: [
    { unique: true, fields: ['shop_id', 'shopify_product_id'] },
    { fields: ['shop_id'] },
    { fields: ['handle'] },
    { fields: ['status'] },
  ],
});

module.exports = Product;
