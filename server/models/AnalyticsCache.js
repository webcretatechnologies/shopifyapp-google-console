const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AnalyticsCache = sequelize.define('AnalyticsCache', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  data_type: {
    type: DataTypes.ENUM('search_console', 'ga4', 'google_ads'),
    allowNull: false,
  },
  date_range_start: { type: DataTypes.DATEONLY, allowNull: false },
  date_range_end: { type: DataTypes.DATEONLY, allowNull: false },
  data: { type: DataTypes.JSON, allowNull: false },
  fetched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'analytics_cache',
  indexes: [
    { name: 'ac_unique_lookup', fields: ['shop_id', 'data_type', 'date_range_start', 'date_range_end'], unique: true },
  ],
});

module.exports = AnalyticsCache;
