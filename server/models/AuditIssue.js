const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditIssue = sequelize.define('AuditIssue', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  audit_id: { type: DataTypes.INTEGER, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  severity: {
    type: DataTypes.ENUM('error', 'warning', 'notice'),
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'crawlability, https, performance, internal_linking, on_page, structured_data, content',
  },
  type: { type: DataTypes.STRING(100), allowNull: false, comment: 'e.g. missing_title, broken_link' },
  url: { type: DataTypes.STRING(2048), allowNull: true },
  message: { type: DataTypes.TEXT, allowNull: false },
  details: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'audit_issues',
  updatedAt: false,
  indexes: [
    { fields: ['audit_id'] },
    { fields: ['audit_id', 'severity'] },
    { fields: ['audit_id', 'category'] },
  ],
});

module.exports = AuditIssue;
