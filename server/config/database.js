const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'shopify_analytics',
  process.env.DB_USER || 'shopify',
  process.env.DB_PASSWORD || 'shopify_secret',
  {
    host: process.env.DB_HOST || 'database',
    port: parseInt(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: { timestamps: true, underscored: true },
  }
);

module.exports = sequelize;
