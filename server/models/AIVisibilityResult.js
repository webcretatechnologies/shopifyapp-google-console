const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AIVisibilityResult = sequelize.define('AIVisibilityResult', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  run_id: { type: DataTypes.INTEGER, allowNull: false },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  prompt: { type: DataTypes.TEXT, allowNull: false },
  topic: { type: DataTypes.STRING(120), allowNull: true },
  intent: { type: DataTypes.STRING(40), allowNull: true, comment: 'navigational, commercial, informational' },
  provider: { type: DataTypes.STRING(40), allowNull: false, comment: 'openai | gemini | anthropic | serpapi' },
  response_text: { type: DataTypes.TEXT('long'), allowNull: true },
  brand_mentioned: { type: DataTypes.BOOLEAN, defaultValue: false },
  brand_mention_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  citations: { type: DataTypes.JSON, allowNull: true, comment: 'array of { url } found in response' },
  citation_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  brand_cited: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'true when at least one citation URL is on the brand domain' },
  prompt_tokens: { type: DataTypes.INTEGER, allowNull: true },
  completion_tokens: { type: DataTypes.INTEGER, allowNull: true },
  duration_ms: { type: DataTypes.INTEGER, allowNull: true },
  error: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'ai_visibility_results',
  indexes: [
    { fields: ['run_id'] },
    { fields: ['run_id', 'provider'] },
    { fields: ['shop_id'] },
  ],
});

module.exports = AIVisibilityResult;
