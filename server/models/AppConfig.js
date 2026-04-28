const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Single key/value store for runtime-editable config (managed by super-admin
// from /admin/settings). Secrets are stored AES-256-GCM encrypted in
// `value_enc`; non-secret values use `value` directly. Reading code resolves
// `getConfig(key) → DB → .env fallback → null`.
const AppConfig = sequelize.define('AppConfig', {
  key: { type: DataTypes.STRING(100), primaryKey: true },
  value: { type: DataTypes.TEXT, allowNull: true, comment: 'plaintext value (only for non-secrets)' },
  value_enc: { type: DataTypes.TEXT, allowNull: true, comment: 'AES-256-GCM encrypted value (for secrets)' },
  is_secret: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'when true, the value is stored encrypted in value_enc' },
  description: { type: DataTypes.STRING(500), allowNull: true },
  updated_by: { type: DataTypes.INTEGER, allowNull: true, comment: 'admin id who last edited' },
}, {
  tableName: 'app_configs',
});

module.exports = AppConfig;
