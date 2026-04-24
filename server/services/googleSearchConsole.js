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

async function buildSearchConsoleClient(googleAccount) {
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
      console.error('[SC token save]', e.message);
    }
  };

  const auth = createClientWithTokens(tokens, clientId, clientSecret, onTokenRefresh);
  return { webmasters: google.webmasters({ version: 'v3', auth }) };
}

async function getKeywordRankings(googleAccount, startDate, endDate) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');

  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: 100,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    },
  });

  return (res.data.rows || []).map(row => ({
    keyword: row.keys[0],
    page: row.keys[1],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: parseFloat((row.ctr * 100).toFixed(2)),
    position: parseFloat(row.position.toFixed(1)),
  }));
}

async function getTrafficOverview(googleAccount, startDate, endDate) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');

  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['date'],
      rowLimit: 90,
    },
  });

  return (res.data.rows || []).map(row => ({
    date: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: parseFloat((row.ctr * 100).toFixed(2)),
    position: parseFloat(row.position.toFixed(1)),
  }));
}

async function getSCCountries(googleAccount, startDate, endDate) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ['country'], rowLimit: 50, orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }] },
  });
  return (res.data.rows || []).map(row => ({
    country: row.keys[0],
    clicks: row.clicks, impressions: row.impressions,
    ctr: parseFloat((row.ctr * 100).toFixed(2)),
    position: parseFloat(row.position.toFixed(1)),
  }));
}

async function getSCDevices(googleAccount, startDate, endDate) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ['device'], rowLimit: 10 },
  });
  return (res.data.rows || []).map(row => ({
    device: row.keys[0],
    clicks: row.clicks, impressions: row.impressions,
    ctr: parseFloat((row.ctr * 100).toFixed(2)),
    position: parseFloat(row.position.toFixed(1)),
  }));
}

async function getPageRankings(googleAccount, startDate, endDate) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');

  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 50,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    },
  });

  return (res.data.rows || []).map(row => ({
    page: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: parseFloat((row.ctr * 100).toFixed(2)),
    position: parseFloat(row.position.toFixed(1)),
  }));
}

async function getSites(googleAccount) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const res = await webmasters.sites.list();
  return (res.data.siteEntry || []).map(s => ({ url: s.siteUrl, permission: s.permissionLevel }));
}

async function getSitemaps(googleAccount) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');
  const res = await webmasters.sitemaps.list({ siteUrl });
  return (res.data.sitemap || []).map(s => ({
    path: s.path,
    lastSubmitted: s.lastSubmitted,
    lastDownloaded: s.lastDownloaded,
    isPending: s.isPending || false,
    isSitemapsIndex: s.isSitemapsIndex || false,
    type: s.type || 'sitemap',
    warnings: s.warnings || 0,
    errors: s.errors || 0,
    submitted: s.contents?.[0]?.submitted || 0,
    indexed: s.contents?.[0]?.indexed || 0,
  }));
}

async function submitSitemap(googleAccount, sitemapUrl) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');
  await webmasters.sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
  return { success: true };
}

async function deleteSitemap(googleAccount, sitemapUrl) {
  const { webmasters } = await buildSearchConsoleClient(googleAccount);
  const siteUrl = googleAccount.search_console_property;
  if (!siteUrl) throw new Error('No Search Console property configured');
  await webmasters.sitemaps.delete({ siteUrl, feedpath: sitemapUrl });
  return { success: true };
}

module.exports = { getKeywordRankings, getTrafficOverview, getPageRankings, getSCCountries, getSCDevices, getSites, getSitemaps, submitSitemap, deleteSitemap };
