const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShopSettings = sequelize.define('ShopSettings', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  google_client_id_enc: { type: DataTypes.TEXT, allowNull: true },
  google_client_secret_enc: { type: DataTypes.TEXT, allowNull: true },
  google_ads_developer_token_enc: { type: DataTypes.TEXT, allowNull: true },
  setup_step: { type: DataTypes.INTEGER, defaultValue: 1 },
  setup_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  auto_sitemap_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  auto_sitemap_url: { type: DataTypes.STRING(500), allowNull: true },
  brand_keywords: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'shop_settings',
});

module.exports = ShopSettings;
