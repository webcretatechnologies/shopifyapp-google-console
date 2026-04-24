const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GoogleAccount = sequelize.define('GoogleAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  google_email: { type: DataTypes.STRING(255), allowNull: false },
  access_token_enc: { type: DataTypes.TEXT, allowNull: false },
  refresh_token_enc: { type: DataTypes.TEXT, allowNull: true },
  token_expiry: { type: DataTypes.DATE, allowNull: true },
  search_console_property: { type: DataTypes.STRING(500), allowNull: true },
  ga4_property_id: { type: DataTypes.STRING(100), allowNull: true },
  google_ads_customer_id: { type: DataTypes.STRING(100), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  connected_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'google_accounts',
});

module.exports = GoogleAccount;
