const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Admin-editable layout for each transactional email event.
// One row per event_key — the admin picks an event from the list and edits
// header / body / footer. Subject stays in code; body uses {{tokens}} that
// are substituted at send time (shop_name, plan_name, plan_usage, etc.).
const EmailTemplate = sequelize.define('EmailTemplate', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  event_key:  { type: DataTypes.STRING(60), allowNull: false, unique: true },
  subject:    { type: DataTypes.STRING(255), allowNull: false },
  header_html:{ type: DataTypes.TEXT, allowNull: true },
  body_html:  { type: DataTypes.TEXT('long'), allowNull: false },
  footer_html:{ type: DataTypes.TEXT, allowNull: true },
  updated_by: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'email_templates',
});

module.exports = EmailTemplate;
