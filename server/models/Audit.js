const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Audit = sequelize.define('Audit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM('queued', 'crawling', 'analyzing', 'completed', 'failed'),
    defaultValue: 'queued',
  },
  audit_url: { type: DataTypes.STRING(500), allowNull: false, comment: 'Root URL audited' },
  pages_crawled: { type: DataTypes.INTEGER, defaultValue: 0 },
  pages_with_issues: { type: DataTypes.INTEGER, defaultValue: 0 },
  errors_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  warnings_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  notices_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  score: { type: DataTypes.INTEGER, allowNull: true, comment: '0-100 site health' },
  started_at: { type: DataTypes.DATE, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  duration_ms: { type: DataTypes.INTEGER, allowNull: true },
  error_message: { type: DataTypes.TEXT, allowNull: true },
  config: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'audits',
  indexes: [{ fields: ['shop_id'] }, { fields: ['status'] }],
});

module.exports = Audit;
