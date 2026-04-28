// Runtime-editable config store managed by the super-admin from /admin/settings.
// Reads resolve: DB row → process.env[key] → null. Writes go to DB only.
//
// Secrets are AES-256-GCM encrypted via services/encryption.js (which uses
// ENCRYPTION_KEY from .env — that one MUST stay in .env to bootstrap).
//
// Light in-memory cache (5s TTL) keeps high-frequency callers fast without
// going stale for long after an admin save.

const { AppConfig } = require('../models');
const { encrypt, decrypt } = require('./encryption');

// Inventory of every config the admin can manage. Drives the UI on the
// admin Settings page and tells the service which fields to encrypt.
const CONFIG_SCHEMA = {
  shopify: {
    label: 'Shopify',
    keys: [
      { key: 'SHOPIFY_API_KEY',     label: 'API Key',           secret: false, required: true },
      { key: 'SHOPIFY_API_SECRET',  label: 'API Secret',        secret: true,  required: true },
      { key: 'SHOPIFY_SCOPES',      label: 'OAuth Scopes',      secret: false, required: true },
      { key: 'SHOPIFY_HOST',        label: 'App Public URL',    secret: false, required: true,
        help: 'The HTTPS URL where this app is reachable (e.g. https://analytics.boxtasks.com)' },
    ],
  },
  google: {
    label: 'Google (Fallback OAuth)',
    keys: [
      { key: 'GOOGLE_CLIENT_ID',     label: 'Client ID',     secret: false, required: false,
        help: 'Used only when a shop has not configured its own credentials' },
      { key: 'GOOGLE_CLIENT_SECRET', label: 'Client Secret', secret: true,  required: false },
      { key: 'GOOGLE_REDIRECT_URI',  label: 'Redirect URI',  secret: false, required: false,
        help: 'Must match what is registered in Google Cloud Console' },
    ],
  },
  ai: {
    label: 'AI Visibility — Free LLM Keys',
    keys: [
      { key: 'GEMINI_API_KEY',     label: 'Google Gemini Key',  secret: true, required: false,
        help: 'Free tier at aistudio.google.com/apikey' },
      { key: 'GROQ_API_KEY',       label: 'Groq Key',           secret: true, required: false,
        help: 'Free tier at console.groq.com/keys' },
      { key: 'OPENROUTER_API_KEY', label: 'OpenRouter Key',     secret: true, required: false,
        help: 'For free :free models — openrouter.ai/keys' },
    ],
  },
  email: {
    label: 'Email (SMTP)',
    keys: [
      { key: 'SMTP_HOST',  label: 'SMTP Host',  secret: false, required: false,
        help: 'e.g. smtp.gmail.com' },
      { key: 'SMTP_PORT',  label: 'SMTP Port',  secret: false, required: false, defaultHint: '587' },
      { key: 'SMTP_USER',  label: 'SMTP User',  secret: false, required: false },
      { key: 'SMTP_PASS',  label: 'SMTP Password / App Password', secret: true, required: false },
      { key: 'EMAIL_FROM', label: 'From address', secret: false, required: false,
        help: 'e.g. "Google Console Analytics <noreply@analytics.boxtasks.com>"' },
    ],
  },
};

// Set of every key managed here — used by the admin route to validate input
const MANAGED_KEYS = new Set();
for (const group of Object.values(CONFIG_SCHEMA)) {
  for (const k of group.keys) MANAGED_KEYS.add(k.key);
}

// 5s in-memory cache so request-time getConfig() calls don't hit DB on every
// LLM API call. Saves invalidate the cache.
const _cache = new Map(); // key → { value, expires }
const CACHE_TTL_MS = 5_000;

function _cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) { _cache.delete(key); return undefined; }
  return e.value;
}
function _cacheSet(key, value) {
  _cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}
function _cacheClear(key) {
  if (key) _cache.delete(key); else _cache.clear();
}

// Resolve a config: DB → env → null
async function getConfig(key) {
  const cached = _cacheGet(key);
  if (cached !== undefined) return cached;

  let resolved = null;
  try {
    const row = await AppConfig.findByPk(key);
    if (row) {
      if (row.is_secret) {
        if (row.value_enc) {
          try { resolved = decrypt(row.value_enc); }
          catch (e) { console.error(`[appConfig] decrypt failed for ${key}:`, e.message); }
        }
      } else if (row.value !== null && row.value !== undefined && row.value !== '') {
        resolved = row.value;
      }
    }
  } catch (e) {
    // DB unreachable — fall through to env
    console.error(`[appConfig] DB read failed for ${key}:`, e.message);
  }

  if (!resolved) resolved = process.env[key] || null;

  _cacheSet(key, resolved);
  return resolved;
}

// Sync version for code paths that already cached/loaded — primary use is at
// request handler time after getAllConfigs() has populated the cache.
function getConfigSync(key) {
  const cached = _cacheGet(key);
  if (cached !== undefined) return cached;
  return process.env[key] || null;
}

// Return every managed key with current values (decrypted), source ('db' | 'env' | 'unset'),
// and the schema entry. Used by the admin UI.
async function getAllConfigs() {
  const rows = await AppConfig.findAll();
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));

  const out = {};
  for (const [groupId, group] of Object.entries(CONFIG_SCHEMA)) {
    out[groupId] = { label: group.label, keys: [] };
    for (const k of group.keys) {
      const row = byKey[k.key];
      let value = '';
      let source = 'unset';
      if (row) {
        if (row.is_secret && row.value_enc) {
          try { value = decrypt(row.value_enc); source = 'db'; } catch {}
        } else if (!row.is_secret && row.value) {
          value = row.value; source = 'db';
        }
      }
      if (!value && process.env[k.key]) {
        value = process.env[k.key];
        source = 'env';
      }
      out[groupId].keys.push({ ...k, value, source });
    }
  }
  return out;
}

// Save a single key. `value === null | ""` clears the row (and re-falls-back to env on next read).
async function setConfig(key, value, { adminId } = {}) {
  if (!MANAGED_KEYS.has(key)) {
    throw new Error(`Config key "${key}" is not managed via /admin/settings`);
  }
  // Find schema entry to know if it's a secret
  let entry = null;
  for (const group of Object.values(CONFIG_SCHEMA)) {
    entry = group.keys.find(k => k.key === key);
    if (entry) break;
  }
  if (!entry) throw new Error(`No schema entry for "${key}"`);

  const trimmed = (value ?? '').toString().trim();
  if (!trimmed) {
    // Clear the row so .env fallback kicks back in
    await AppConfig.destroy({ where: { key } });
    _cacheClear(key);
    return { key, cleared: true };
  }

  const data = {
    key,
    is_secret: !!entry.secret,
    description: entry.help || entry.label,
    updated_by: adminId || null,
    value:     entry.secret ? null : trimmed,
    value_enc: entry.secret ? encrypt(trimmed) : null,
  };
  await AppConfig.upsert(data);
  _cacheClear(key);
  return { key, saved: true };
}

// Bulk save from the admin form — only writes keys whose values differ.
async function setManyConfigs(patch, { adminId } = {}) {
  const results = [];
  for (const [key, val] of Object.entries(patch || {})) {
    if (!MANAGED_KEYS.has(key)) continue;
    results.push(await setConfig(key, val, { adminId }));
  }
  return results;
}

module.exports = {
  CONFIG_SCHEMA,
  MANAGED_KEYS,
  getConfig,
  getConfigSync,
  getAllConfigs,
  setConfig,
  setManyConfigs,
};
