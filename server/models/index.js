const sequelize = require('../config/database');
const Shop = require('./Shop');
const GoogleAccount = require('./GoogleAccount');
const AnalyticsCache = require('./AnalyticsCache');
const Admin = require('./Admin');
const BillingPlan = require('./BillingPlan');
const Subscription = require('./Subscription');
const ShopSettings = require('./ShopSettings');
const Product = require('./Product');
const ProductVariant = require('./ProductVariant');
const Order = require('./Order');

Shop.hasOne(GoogleAccount, { foreignKey: 'shop_id', as: 'googleAccount' });
GoogleAccount.belongsTo(Shop, { foreignKey: 'shop_id' });

Shop.hasOne(Subscription, { foreignKey: 'shop_id', as: 'subscription' });
Subscription.belongsTo(Shop, { foreignKey: 'shop_id' });

Shop.hasOne(ShopSettings, { foreignKey: 'shop_id', as: 'settings' });
ShopSettings.belongsTo(Shop, { foreignKey: 'shop_id' });

BillingPlan.hasMany(Subscription, { foreignKey: 'plan_id' });
Subscription.belongsTo(BillingPlan, { foreignKey: 'plan_id', as: 'plan' });

Shop.hasMany(AnalyticsCache, { foreignKey: 'shop_id' });
AnalyticsCache.belongsTo(Shop, { foreignKey: 'shop_id' });

Shop.hasMany(Product, { foreignKey: 'shop_id', as: 'products' });
Product.belongsTo(Shop, { foreignKey: 'shop_id' });

Product.hasMany(ProductVariant, { foreignKey: 'product_id', as: 'variants' });
ProductVariant.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

Shop.hasMany(ProductVariant, { foreignKey: 'shop_id' });
ProductVariant.belongsTo(Shop, { foreignKey: 'shop_id' });

Shop.hasMany(Order, { foreignKey: 'shop_id', as: 'orders' });
Order.belongsTo(Shop, { foreignKey: 'shop_id' });

module.exports = { sequelize, Shop, GoogleAccount, AnalyticsCache, Admin, BillingPlan, Subscription, ShopSettings, Product, ProductVariant, Order };
