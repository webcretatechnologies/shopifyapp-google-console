const { google } = require('googleapis');

// Global fallback OAuth client (uses .env credentials)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Build OAuth client for a specific shop using their own credentials
function createShopOAuthClient(clientId, clientSecret) {
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getGoogleAuthUrl(shopDomain, clientId, clientSecret, loginHint) {
  const client = (clientId && clientSecret)
    ? createShopOAuthClient(clientId, clientSecret)
    : oauth2Client;

  const params = {
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent',
    state: Buffer.from(JSON.stringify({ shop: shopDomain })).toString('base64'),
  };
  if (loginHint) params.login_hint = loginHint;

  return client.generateAuthUrl(params);
}

function createClientWithTokens(tokens, clientId, clientSecret, onTokenRefresh) {
  const client = (clientId && clientSecret)
    ? createShopOAuthClient(clientId, clientSecret)
    : new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
  client.setCredentials(tokens);
  if (typeof onTokenRefresh === 'function') {
    client.on('tokens', onTokenRefresh);
  }
  return client;
}

module.exports = { oauth2Client, GOOGLE_SCOPES, getGoogleAuthUrl, createClientWithTokens, createShopOAuthClient };
