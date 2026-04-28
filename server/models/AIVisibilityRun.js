const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AIVisibilityRun = sequelize.define('AIVisibilityRun', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM('queued', 'running', 'completed', 'failed'),
    defaultValue: 'queued',
  },
  brand_name: { type: DataTypes.STRING(200), allowNull: false },
  providers: { type: DataTypes.JSON, allowNull: true, comment: 'array of provider ids used in this run' },
  prompts_total: { type: DataTypes.INTEGER, defaultValue: 0, comment: 'prompt × provider expected results' },
  prompts_completed: { type: DataTypes.INTEGER, defaultValue: 0 },
  mentions_total: { type: DataTypes.INTEGER, defaultValue: 0 },
  citations_total: { type: DataTypes.INTEGER, defaultValue: 0 },
  cited_pages_total: { type: DataTypes.INTEGER, defaultValue: 0, comment: 'count of results where the brand domain was cited' },
  visibility_score: { type: DataTypes.INTEGER, defaultValue: 0, comment: '0-100 weighted score' },
  cost_usd: { type: DataTypes.DECIMAL(10, 4), defaultValue: 0, comment: 'estimated USD cost of all API calls' },
  started_at: { type: DataTypes.DATE, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  error_message: { type: DataTypes.TEXT, allowNull: true },
  config: { type: DataTypes.JSON, allowNull: true, comment: 'snapshot of run config (prompts, brand_domain)' },
}, {
  tableName: 'ai_visibility_runs',
  indexes: [
    { fields: ['shop_id'] },
    { fields: ['shop_id', 'status'] },
    { fields: ['created_at'] },
  ],
});

module.exports = AIVisibilityRun;
