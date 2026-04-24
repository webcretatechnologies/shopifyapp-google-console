const { google } = require('googleapis');
const { createClientWithTokens } = require('../config/google');
const { encrypt, decrypt } = require('./encryption');
const { ShopSettings, GoogleAccount } = require('../models');

async function getShopCreds(shopId) {
  try {
    const s = await ShopSettings.findOne({ where: { shop_id: shopId } });
    if (!s || !s.google_client_id_enc || !s.google_client_secret_enc) return {};
    return { clientId: decrypt(s.google_client_id_enc), clientSecret: decrypt(s.google_client_secret_enc) };
  } catch { return {}; }
}

async function buildGA4Client(googleAccount) {
  const tokens = {
    access_token: decrypt(googleAccount.access_token_enc),
    refresh_token: googleAccount.refresh_token_enc ? decrypt(googleAccount.refresh_token_enc) : null,
  };
  const { clientId, clientSecret } = await getShopCreds(googleAccount.shop_id);

  const onTokenRefresh = async (newTokens) => {
    try {
      const update = {};
      if (newTokens.access_token) update.access_token_enc = encrypt(newTokens.access_token);
      if (newTokens.expiry_date) update.token_expiry = new Date(newTokens.expiry_date);
      if (newTokens.refresh_token) update.refresh_token_enc = encrypt(newTokens.refresh_token);
      if (Object.keys(update).length) {
        await GoogleAccount.update(update, { where: { id: googleAccount.id } });
      }
    } catch (e) {
      console.error('[GA4 token save]', e.message);
    }
  };

  return google.analyticsdata({ version: 'v1beta', auth: createClientWithTokens(tokens, clientId, clientSecret, onTokenRefresh) });
}

async function getSessionsAndUsers(googleAccount, startDate, endDate) {
  const analyticsdata = await buildGA4Client(googleAccount);
  const propertyId = googleAccount.ga4_property_id;
  if (!propertyId) throw new Error('No GA4 property configured');

  const res = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
  });

  return (res.data.rows || []).map(row => ({
    date: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value),
    users: parseInt(row.metricValues[1].value),
    new_users: parseInt(row.metricValues[2].value),
    bounce_rate: parseFloat(parseFloat(row.metricValues[3].value).toFixed(2)),
    avg_session_duration: parseFloat(parseFloat(row.metricValues[4].value).toFixed(0)),
  }));
}

async function getTopCountries(googleAccount, startDate, endDate) {
  const analyticsdata = await buildGA4Client(googleAccount);
  const propertyId = googleAccount.ga4_property_id;
  if (!propertyId) throw new Error('No GA4 property configured');

  const res = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    },
  });

  return (res.data.rows || []).map(row => ({
    country: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value),
    users: parseInt(row.metricValues[1].value),
  }));
}

async function getTopPages(googleAccount, startDate, endDate) {
  const analyticsdata = await buildGA4Client(googleAccount);
  const propertyId = googleAccount.ga4_property_id;
  if (!propertyId) throw new Error('No GA4 property configured');

  const res = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 20,
    },
  });

  return (res.data.rows || []).map(row => ({
    path: row.dimensionValues[0].value,
    title: row.dimensionValues[1].value,
    views: parseInt(row.metricValues[0].value),
    sessions: parseInt(row.metricValues[1].value),
  }));
}

async function getTrafficSources(googleAccount, startDate, endDate) {
  const analyticsdata = await buildGA4Client(googleAccount);
  const propertyId = googleAccount.ga4_property_id;
  if (!propertyId) throw new Error('No GA4 property configured');

  const res = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    },
  });

  return (res.data.rows || []).map(row => ({
    channel: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value),
    users: parseInt(row.metricValues[1].value),
  }));
}

async function getDeviceBreakdown(googleAccount, startDate, endDate) {
  const analyticsdata = await buildGA4Client(googleAccount);
  const propertyId = googleAccount.ga4_property_id;
  if (!propertyId) throw new Error('No GA4 property configured');

  const res = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    },
  });

  return (res.data.rows || []).map(row => ({
    device: row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value),
    users: parseInt(row.metricValues[1].value),
    bounce_rate: parseFloat(parseFloat(row.metricValues[2].value).toFixed(2)),
  }));
}

async function getEcommerceData(googleAccount, startDate, endDate) {
  const analyticsdata = await buildGA4Client(googleAccount);
  const propertyId = googleAccount.ga4_property_id;
  if (!propertyId) throw new Error('No GA4 property configured');

  const res = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'transactions' },
        { name: 'purchaseRevenue' },
        { name: 'addToCarts' },
        { name: 'checkouts' },
        { name: 'ecommercePurchases' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
  });

  return (res.data.rows || []).map(row => ({
    date: row.dimensionValues[0].value,
    transactions: parseInt(row.metricValues[0].value),
    revenue: parseFloat(parseFloat(row.metricValues[1].value).toFixed(2)),
    add_to_carts: parseInt(row.metricValues[2].value),
    checkouts: parseInt(row.metricValues[3].value),
    purchases: parseInt(row.metricValues[4].value),
  }));
}

async function getGA4Properties(googleAccount) {
  const tokens = {
    access_token: decrypt(googleAccount.access_token_enc),
    refresh_token: googleAccount.refresh_token_enc ? decrypt(googleAccount.refresh_token_enc) : null,
  };
  const { clientId, clientSecret } = await getShopCreds(googleAccount.shop_id);
  const auth = createClientWithTokens(tokens, clientId, clientSecret);
  const admin = google.analyticsadmin({ version: 'v1beta', auth });

  // Step 1: list all GA accounts the user has access to
  const accountsRes = await admin.accounts.list();
  const accounts = accountsRes.data.accounts || [];

  // Step 2: list properties per account
  const allProperties = [];
  for (const account of accounts) {
    try {
      const propsRes = await admin.properties.list({ filter: `parent:${account.name}` });
      for (const p of (propsRes.data.properties || [])) {
        allProperties.push({
          id: p.name.replace('properties/', ''),
          name: p.displayName,
          websiteUrl: p.websiteUri || '',
          type: p.propertyType,
        });
      }
    } catch (_) { /* skip accounts with no access */ }
  }
  return allProperties;
}

module.exports = { getSessionsAndUsers, getTopCountries, getTopPages, getTrafficSources, getDeviceBreakdown, getEcommerceData, getGA4Properties };
