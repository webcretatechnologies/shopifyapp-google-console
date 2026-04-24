const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Shop = sequelize.define('Shop', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shop_domain: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  access_token: { type: DataTypes.TEXT, allowNull: true },
  scope: { type: DataTypes.TEXT, allowNull: true },
  email: { type: DataTypes.STRING(255), allowNull: true },
  shop_name: { type: DataTypes.STRING(255), allowNull: true },
  shop_owner: { type: DataTypes.STRING(255), allowNull: true },
  country: { type: DataTypes.STRING(10), allowNull: true },
  currency: { type: DataTypes.STRING(10), allowNull: true },
  timezone: { type: DataTypes.STRING(100), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  installed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  uninstalled_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'shops',
});

module.exports = Shop;
