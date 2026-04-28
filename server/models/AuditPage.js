const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditPage = sequelize.define('AuditPage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  audit_id: { type: DataTypes.INTEGER, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  url: { type: DataTypes.STRING(2048), allowNull: false },
  status_code: { type: DataTypes.INTEGER, allowNull: true },
  content_type: { type: DataTypes.STRING(100), allowNull: true },
  bytes: { type: DataTypes.INTEGER, defaultValue: 0 },
  ttfb_ms: { type: DataTypes.INTEGER, allowNull: true },
  redirect_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  title: { type: DataTypes.STRING(500), allowNull: true },
  meta_description: { type: DataTypes.STRING(500), allowNull: true },
  h1_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  image_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  images_missing_alt: { type: DataTypes.INTEGER, defaultValue: 0 },
  internal_links: { type: DataTypes.INTEGER, defaultValue: 0 },
  external_links: { type: DataTypes.INTEGER, defaultValue: 0 },
  has_canonical: { type: DataTypes.BOOLEAN, defaultValue: false },
  has_viewport: { type: DataTypes.BOOLEAN, defaultValue: false },
  has_jsonld: { type: DataTypes.BOOLEAN, defaultValue: false },
  jsonld_types: { type: DataTypes.JSON, allowNull: true, comment: 'array of @type values found' },
  text_ratio: { type: DataTypes.DECIMAL(5, 4), allowNull: true },
  issues_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  crawl_depth: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  tableName: 'audit_pages',
  updatedAt: false,
  indexes: [
    { fields: ['audit_id'] },
    { fields: ['audit_id', 'status_code'] },
  ],
});

module.exports = AuditPage;
