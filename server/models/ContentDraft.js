const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// AI-generated copy drafts for a product. One row per (product × kind × version).
// Lifecycle: draft → (edited) → approved → published (PUT to Shopify Admin API).
const ContentDraft = sequelize.define('ContentDraft', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false, comment: 'FK -> products.id (our internal id)' },
  kind: {
    type: DataTypes.ENUM('description', 'title', 'meta_title', 'meta_description'),
    allowNull: false,
  },
  generated_text: { type: DataTypes.TEXT('long'), allowNull: false, comment: 'raw LLM output' },
  edited_text: { type: DataTypes.TEXT('long'), allowNull: true, comment: 'merchant-edited version (overrides generated_text on publish)' },
  status: {
    type: DataTypes.ENUM('draft', 'approved', 'published', 'discarded'),
    defaultValue: 'draft',
  },
  provider: { type: DataTypes.STRING(40), allowNull: true, comment: 'gemini | groq | openrouter' },
  prompt_tokens: { type: DataTypes.INTEGER, allowNull: true },
  completion_tokens: { type: DataTypes.INTEGER, allowNull: true },
  published_at: { type: DataTypes.DATE, allowNull: true },
  publish_error: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'content_drafts',
  indexes: [
    { fields: ['shop_id'] },
    { fields: ['product_id', 'kind'] },
    { fields: ['shop_id', 'status'] },
  ],
});

module.exports = ContentDraft;
