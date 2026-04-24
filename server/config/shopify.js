const { shopifyApi, LATEST_API_VERSION, Session } = require('@shopify/shopify-api');
const { NodeOAuthSessionStorage } = require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: (process.env.SHOPIFY_SCOPES || '').split(','),
  hostName: (process.env.SHOPIFY_HOST || '').replace(/https?:\/\//, ''),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});

module.exports = { shopify };
