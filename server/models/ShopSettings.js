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
  storefront_password_enc: { type: DataTypes.TEXT, allowNull: true, comment: 'encrypted storefront password used to authenticate the crawler against password-protected stores' },

  // AI Visibility settings — provider keys live in .env at the platform level
  ai_brand_name: { type: DataTypes.STRING(200), allowNull: true, comment: 'brand name to look for in AI responses; defaults to shop name' },

  // Notification preferences (per-shop)
  notification_email: { type: DataTypes.STRING(200), allowNull: true, comment: 'override for transactional emails; falls back to Shop.email' },
  email_prefs: { type: DataTypes.JSON, allowNull: true, comment: 'per-event opt-in flags { welcome, googleConnected, subscription, audit, aiVisibility, stockAlerts, weeklyReport }' },

  // Display preferences
  default_date_range: { type: DataTypes.STRING(10), allowNull: true, defaultValue: '28d', comment: 'default period selector for dashboards: 7d | 28d | 90d' },
}, {
  tableName: 'shop_settings',
});

module.exports = ShopSettings;
