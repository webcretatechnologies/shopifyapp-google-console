// Transactional email service — wraps nodemailer with admin-editable templates.
//
// SMTP config lives in DB via appConfig (falls back to .env). When SMTP is not
// configured the module no-ops gracefully so install/dev still works.
//
// Templates are stored in the `email_templates` table. Each event has up to
// two variants (A / B); whichever is `is_active=true` is used. If no row
// exists for an event, the baked-in DEFAULT_TEMPLATES below kicks in so the
// app keeps working out of the box.
//
// Tokens like {{shop_name}} are replaced at send time using the per-event
// payload — see EVENT_TOKENS below for what's available where.

const nodemailer = require('nodemailer');
const { ShopSettings, EmailTemplate } = require('../models');
const { Op } = require('sequelize');
const { getConfig } = require('./appConfig');

// Events the merchant CANNOT opt out of (admin always controls). Per the
// spec these are sent on system events; opt-out lives only on /admin/.
const ADMIN_ONLY_EVENTS = new Set(['welcome', 'googleConnected', 'subscription']);

// ── Transport ───────────────────────────────────────────────────────────────
async function getTransport() {
  const host = await getConfig('SMTP_HOST') || 'smtp.gmail.com';
  const port = parseInt((await getConfig('SMTP_PORT')) || '587');
  const user = await getConfig('SMTP_USER');
  const pass = await getConfig('SMTP_PASS');
  if (!user || !pass || pass === 'your_gmail_app_password') return null;
  return nodemailer.createTransport({
    host, port, secure: false,
    auth: { user, pass },
  });
}

async function smtpConfigured() {
  const user = await getConfig('SMTP_USER');
  const pass = await getConfig('SMTP_PASS');
  return !!(user && pass && pass !== 'your_gmail_app_password');
}

async function fromAddress() {
  return (await getConfig('EMAIL_FROM')) || 'Google Console Analytics <noreply@analytics.boxtasks.com>';
}

const APP_URL = process.env.APP_URL || 'https://analytics.boxtasks.com';

// ── Layout (always-on chrome around the editable body + footer) ─────────────
const COLORS = {
  brand: '#1a1a1a', text: '#202223', subdued: '#6d7175', border: '#e1e3e5',
  bg: '#f9fafb', surface: '#ffffff',
  success: '#16a34a', warning: '#f59e0b', danger: '#dc2626', info: '#2563eb',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Replace {{token}} (escaped) and {{{token}}} (raw HTML) placeholders.
// Triple-stache is for tokens that are themselves rendered HTML (e.g. a <ul>);
// the double-stache form is escaped to prevent injection.
function applyTokens(template, tokens) {
  if (!template) return '';
  return String(template)
    .replace(/{{{\s*([\w.]+)\s*}}}/g, (_m, key) => {
      if (key in tokens) return String(tokens[key] ?? '');
      return '';
    })
    .replace(/{{\s*([\w.]+)\s*}}/g, (_m, key) => {
      if (key in tokens) return escapeHtml(tokens[key]);
      return '';
    });
}

const DEFAULT_HEADER_HTML = `
  <div style="text-align:center;padding-bottom:24px;">
    <div style="display:inline-block;width:48px;height:48px;border-radius:10px;background:${COLORS.brand};color:#fff;line-height:48px;font-weight:700;font-size:18px;">GC</div>
    <div style="margin-top:8px;font-size:13px;color:${COLORS.subdued};">Google Console Analytics</div>
  </div>`;

function layout({ subject, headerHtml, bodyHtml, footerHtml, preheader = '' }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${COLORS.bg};margin:0;padding:0;color:${COLORS.text};">
  ${preheader ? `<span style="display:none;font-size:1px;color:${COLORS.bg};opacity:0;">${escapeHtml(preheader)}</span>` : ''}
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    ${headerHtml && headerHtml.trim() ? headerHtml : DEFAULT_HEADER_HTML}
    <div style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;padding:32px;font-size:14px;line-height:1.6;">
      ${bodyHtml || ''}
    </div>
    ${footerHtml && footerHtml.trim() ? `<div style="text-align:center;padding:24px 12px;color:#9ca3af;font-size:12px;line-height:1.6;">${footerHtml}</div>` : ''}
  </div>
</body></html>`;
}

// ── Default templates (fallback if no admin row exists for an event) ─────────
// Subjects and bodies use {{tokens}} that get filled per-send.
const DEFAULT_TEMPLATES = {
  welcome: {
    subject: 'Welcome to Google Console Analytics, {{shop_name}}!',
    body_html: `
      <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;">Welcome aboard! 🎉</h1>
      <p>Thanks for installing <strong>Google Console Analytics</strong> on <strong>{{shop_name}}</strong>. You're 2 minutes away from seeing real Search Console + GA4 + Google Ads data inside your Shopify admin.</p>
      <h2 style="margin:24px 0 8px;font-size:16px;">Get started in 3 steps:</h2>
      <ol style="padding-left:20px;line-height:1.9;">
        <li><strong>Connect Google</strong> — link the account that owns your Search Console and GA4</li>
        <li><strong>Pick your properties</strong> — we auto-list everything verified on that account</li>
        <li><strong>Run analysis</strong> on Site Audit and AI Visibility for your first reports</li>
      </ol>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="{{app_url}}/connect-google" style="display:inline-block;background:${COLORS.brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open the app →</a>
      </div>`,
    footer_html: `Need help? Reply to this email — a real human reads it.`,
  },

  googleConnected: {
    subject: 'Google connected to {{shop_name}}',
    body_html: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${COLORS.success};">✓ Google account connected</h1>
      <p>We've linked <strong>{{google_email}}</strong> to <strong>{{shop_name}}</strong>.</p>
      <p style="color:${COLORS.subdued};">Next: pick which Search Console property and GA4 property to track.</p>
      <div style="text-align:center;margin:8px 0;">
        <a href="{{app_url}}/connect-google" style="display:inline-block;background:${COLORS.brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Configure properties →</a>
      </div>`,
    footer_html: `You're receiving this because you connected Google to your Shopify store.`,
  },

  subscription: {
    subject: '{{plan_name}} plan activated for {{shop_name}}',
    body_html: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">✓ {{plan_name}} plan is active</h1>
      <p>You're now on the <strong>{{plan_name}}</strong> plan ({{plan_price}}/month).</p>
      <p style="color:${COLORS.subdued};">Trial ends: {{trial_ends_at}}</p>
      <div style="text-align:center;margin:8px 0;">
        <a href="{{app_url}}/" style="display:inline-block;background:${COLORS.brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open dashboard →</a>
      </div>`,
    footer_html: `You can change or cancel your plan anytime from the Plan & Billing page.`,
  },

  audit: {
    subject: 'Site Audit complete — score {{score}}/100',
    body_html: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">Site Audit complete for {{shop_name}}</h1>
      <p>The crawl finished. Score: <strong>{{score}}/100</strong> across <strong>{{pages_crawled}}</strong> pages.</p>
      <p>Errors: <strong>{{errors_count}}</strong> &nbsp;·&nbsp; Warnings: <strong>{{warnings_count}}</strong></p>
      <div style="text-align:center;margin:16px 0 8px;">
        <a href="{{app_url}}/site-audit" style="display:inline-block;background:${COLORS.brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">See full report →</a>
      </div>`,
    footer_html: `Manage email preferences in <a href="{{app_url}}/settings" style="color:#6d7175;">Settings</a>.`,
  },

  aiVisibility: {
    subject: 'AI Visibility run complete — score {{score}}/100',
    body_html: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">AI Visibility report for {{shop_name}}</h1>
      <p>Score: <strong>{{score}}/100</strong></p>
      <p>Mentions: <strong>{{mentions}}</strong> &nbsp;·&nbsp; Citations: <strong>{{citations}}</strong> &nbsp;·&nbsp; Cited Pages: <strong>{{cited_pages}}</strong></p>
      <div style="text-align:center;margin:16px 0 8px;">
        <a href="{{app_url}}/ai-visibility" style="display:inline-block;background:${COLORS.brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View full breakdown →</a>
      </div>`,
    footer_html: `Manage email preferences in <a href="{{app_url}}/settings" style="color:#6d7175;">Settings</a>.`,
  },

  stockAlerts: {
    subject: '⚠️ {{product_title}} is out of stock — {{monthly_clicks}} clicks/month',
    body_html: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${COLORS.danger};">⚠️ Critical stock alert</h1>
      <p>A high-traffic product on <strong>{{shop_name}}</strong> just went out of stock.</p>
      <div style="background:#fff5f5;border-left:4px solid ${COLORS.danger};padding:16px;border-radius:6px;margin:20px 0;">
        <div style="font-weight:600;font-size:15px;">{{product_title}}</div>
        <div style="font-size:13px;color:${COLORS.subdued};margin:4px 0 10px;">{{variant_title}} · SKU {{sku}}</div>
        <div style="font-size:13px;"><strong>{{monthly_clicks}}</strong> clicks/month from Google · <strong>{{inventory}}</strong> units left</div>
      </div>
      <div style="text-align:center;margin:8px 0;">
        <a href="{{app_url}}/insights" style="display:inline-block;background:${COLORS.danger};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Restock now →</a>
      </div>`,
    footer_html: `Manage email preferences in <a href="{{app_url}}/settings" style="color:#6d7175;">Settings</a>.`,
  },

  weeklyReport: {
    subject: 'Weekly report — {{shop_name}}',
    body_html: `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">This week on {{shop_name}}</h1>
      <p>Your weekly performance digest is ready inside the app.</p>
      <div style="text-align:center;margin:16px 0 8px;">
        <a href="{{app_url}}/" style="display:inline-block;background:${COLORS.brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open dashboard →</a>
      </div>`,
    footer_html: `Change which day this lands in your inbox in <a href="{{app_url}}/settings" style="color:#6d7175;">Settings → Notifications</a>.`,
  },
};

// Sample plan-context tokens used for previews (so the admin sees something
// rendered instead of empty bullets when previewing).
const SAMPLE_PLAN = {
  plan_name: 'Growth',
  plan_price: '$19.99',
  trial_ends_at: 'May 12, 2026',
  plan_features: '<ul style="margin:8px 0;padding-left:20px;line-height:1.7;"><li>Site Audit</li><li>AI Visibility</li><li>Stock alerts</li><li>Weekly reports</li></ul>',
  plan_usage: '<ul style="margin:8px 0;padding-left:20px;line-height:1.7;"><li>Site Audits this month: <strong>3 / 10</strong></li><li>AI Visibility runs this month: <strong>2 / 5</strong></li><li>Products tracked: <strong>45 / 100</strong></li></ul>',
};

// All events the system can send, plus metadata for the admin UI.
// `availableTokens` lists every variable the admin may reference in their
// header/body/footer for that event — shown as chips in the editor UI.
const COMMON_TOKENS = ['shop_name', 'plan_name', 'plan_price', 'plan_features', 'plan_usage', 'app_url'];
const EVENT_META = {
  welcome:         { label: 'Welcome Email',                  description: 'Sent when a shop installs the app.',                       adminOnly: true,  availableTokens: [...COMMON_TOKENS], sampleTokens: { ...SAMPLE_PLAN, shop_name: 'Acme Co', app_url: APP_URL } },
  googleConnected: { label: 'Google Connected Email',         description: 'Sent after a shop connects their Google account.',          adminOnly: true,  availableTokens: [...COMMON_TOKENS, 'google_email'], sampleTokens: { ...SAMPLE_PLAN, shop_name: 'Acme Co', google_email: 'owner@example.com', app_url: APP_URL } },
  subscription:    { label: 'Subscription Update Email',      description: 'Sent on trial start / paid plan activation.',               adminOnly: true,  availableTokens: [...COMMON_TOKENS, 'trial_ends_at'], sampleTokens: { ...SAMPLE_PLAN, shop_name: 'Acme Co', app_url: APP_URL } },
  audit:           { label: 'Site Audit Complete Email',      description: 'Sent when a Site Audit run finishes.',                      adminOnly: false, availableTokens: [...COMMON_TOKENS, 'score', 'pages_crawled', 'errors_count', 'warnings_count'], sampleTokens: { ...SAMPLE_PLAN, shop_name: 'Acme Co', score: 72, pages_crawled: 45, errors_count: 3, warnings_count: 8, app_url: APP_URL } },
  aiVisibility:    { label: 'AI Visibility Complete Email',   description: 'Sent when an AI Visibility analysis finishes.',             adminOnly: false, availableTokens: [...COMMON_TOKENS, 'score', 'mentions', 'citations', 'cited_pages'], sampleTokens: { ...SAMPLE_PLAN, shop_name: 'Acme Co', score: 55, mentions: 18, citations: 4, cited_pages: 2, app_url: APP_URL } },
  stockAlerts:     { label: 'Stock Alert Email',              description: 'Sent when a high-traffic product goes out of stock.',       adminOnly: false, availableTokens: [...COMMON_TOKENS, 'product_title', 'variant_title', 'sku', 'inventory', 'monthly_clicks'], sampleTokens: { ...SAMPLE_PLAN, shop_name: 'Acme Co', product_title: 'Blue Widget', variant_title: 'Large', sku: 'BW-L', inventory: 0, monthly_clicks: 240, app_url: APP_URL } },
  weeklyReport:    { label: 'Weekly Report Email',            description: 'Weekly summary sent on the merchant\'s chosen day.',        adminOnly: false, availableTokens: [...COMMON_TOKENS], sampleTokens: { ...SAMPLE_PLAN, shop_name: 'Acme Co', app_url: APP_URL } },
};
const EVENT_KEYS = Object.keys(EVENT_META);

// ── Template loader ─────────────────────────────────────────────────────────
// Read the admin-edited row if present; otherwise fall back to the baked-in
// default. The DB row only stores fields the admin actually saved — anything
// blank merges with the default (so removing the footer in the editor falls
// back to the default footer rather than dropping the section entirely).
async function getTemplate(eventKey) {
  const fallback = DEFAULT_TEMPLATES[eventKey];
  if (!fallback) throw new Error(`Unknown email event: ${eventKey}`);
  const row = await EmailTemplate.findOne({ where: { event_key: eventKey } }).catch(() => null);
  if (!row) return { ...fallback, header_html: '', source: 'default' };
  return {
    subject:     row.subject     || fallback.subject,
    header_html: row.header_html || '',
    body_html:   row.body_html   || fallback.body_html,
    footer_html: row.footer_html || fallback.footer_html || '',
    source: 'db',
  };
}

// Render an event into final { subject, html } using DB template + tokens
async function renderEvent(eventKey, tokens) {
  const tpl = await getTemplate(eventKey);
  const fullTokens = { app_url: APP_URL, ...tokens };
  const subj = applyTokens(tpl.subject, fullTokens);
  return {
    subject: subj,
    html: layout({
      subject: subj,
      headerHtml: applyTokens(tpl.header_html, fullTokens),
      bodyHtml: applyTokens(tpl.body_html, fullTokens),
      footerHtml: applyTokens(tpl.footer_html, fullTokens),
    }),
    source: tpl.source,
  };
}

// Build the auto-substituted shop/plan/usage tokens that every send shares.
// {{shop_name}}, {{plan_name}}, {{plan_price}}, {{trial_ends_at}} are escaped;
// {{{plan_features}}} and {{{plan_usage}}} are raw HTML (rendered as <ul>).
async function getShopContext(shop) {
  const ctx = {
    shop_name: shop.shop_name || shop.shop_domain || '',
    shop_domain: shop.shop_domain || '',
    plan_name: 'Free',
    plan_price: '$0.00',
    trial_ends_at: '',
    plan_features: '',
    plan_usage: '',
  };
  try {
    const { Subscription, BillingPlan, Audit, AIVisibilityRun, Product } = require('../models');
    const sub = await Subscription.findOne({
      where: { shop_id: shop.id },
      include: [{ model: BillingPlan, as: 'plan' }],
    });
    if (sub?.plan) {
      ctx.plan_name = sub.plan.name;
      ctx.plan_price = `$${parseFloat(sub.plan.price).toFixed(2)}`;
      if (sub.trial_ends_at) {
        ctx.trial_ends_at = new Date(sub.trial_ends_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
      }
      const features = Array.isArray(sub.plan.features) ? sub.plan.features : [];
      if (features.length) {
        ctx.plan_features = `<ul style="margin:8px 0;padding-left:20px;line-height:1.7;">${features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`;
      }

      const limits = sub.plan.limits || {};
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const [audits, aiRuns, products] = await Promise.all([
        Audit.count({ where: { shop_id: shop.id, created_at: { [Op.gte]: startOfMonth } } }).catch(() => 0),
        AIVisibilityRun.count({ where: { shop_id: shop.id, created_at: { [Op.gte]: startOfMonth } } }).catch(() => 0),
        Product.count({ where: { shop_id: shop.id } }).catch(() => 0),
      ]);
      const rows = [];
      rows.push(`Site Audits this month: <strong>${audits}${limits.audits != null ? ` / ${limits.audits}` : ''}</strong>`);
      rows.push(`AI Visibility runs this month: <strong>${aiRuns}${limits.ai_visibility_runs != null ? ` / ${limits.ai_visibility_runs}` : ''}</strong>`);
      rows.push(`Products tracked: <strong>${products}${limits.products != null ? ` / ${limits.products}` : ''}</strong>`);
      ctx.plan_usage = `<ul style="margin:8px 0;padding-left:20px;line-height:1.7;">${rows.map(r => `<li>${r}</li>`).join('')}</ul>`;
    }
  } catch (err) {
    console.warn('[Email] getShopContext failed:', err.message);
  }
  return ctx;
}

// ── Core sender ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[Email] no recipient — skipping send');
    return { skipped: true, reason: 'no-recipient' };
  }
  const transport = await getTransport();
  if (!transport) {
    console.log(`[Email] SMTP not configured — would have sent "${subject}" to ${to}`);
    return { skipped: true, reason: 'smtp-not-configured' };
  }
  try {
    const info = await transport.sendMail({
      from: await fromAddress(),
      to, subject, html,
      text: text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
    });
    console.log(`[Email] ✓ "${subject}" → ${to} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] ✗ "${subject}" → ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

// Resolve recipient + per-event opt-in. Admin-only events bypass opt-out.
async function resolveRecipient(shop, eventKey) {
  const settings = await ShopSettings.findOne({
    where: { shop_id: shop.id },
    attributes: ['notification_email', 'email_prefs'],
  }).catch(() => null);

  const to = settings?.notification_email || shop.email || null;
  if (ADMIN_ONLY_EVENTS.has(eventKey)) return { to, optedIn: true };

  const prefs = settings?.email_prefs || {};
  const optedIn = prefs[eventKey] !== false; // opt-in by default
  return { to, optedIn };
}

// Public entry: render template + opt-in check + send
async function dispatch(shop, eventKey, tokens) {
  const { to, optedIn } = await resolveRecipient(shop, eventKey);
  if (!optedIn) {
    console.log(`[Email] "${eventKey}" disabled by shop ${shop.id} — skipping`);
    return { skipped: true, reason: 'opted-out' };
  }
  const shopCtx = await getShopContext(shop);
  const { subject, html, source } = await renderEvent(eventKey, { ...shopCtx, ...tokens });
  console.log(`[Email] dispatch ${eventKey} (${source}) → ${to}`);
  return sendEmail({ to, subject, html });
}

// ── Public facade ────────────────────────────────────────────────────────────
async function sendWelcome(shop) {
  return dispatch(shop, 'welcome', {});
}
async function sendGoogleConnected(shop, googleAccount) {
  return dispatch(shop, 'googleConnected', { google_email: googleAccount.google_email });
}
async function sendSubscriptionActivated(shop, subscription, plan) {
  const trialEnd = subscription.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  return dispatch(shop, 'subscription', {
    plan_name: plan.name,
    plan_price: `$${parseFloat(plan.price).toFixed(2)}`,
    trial_ends_at: trialEnd,
  });
}
async function sendAuditComplete(shop, audit) {
  return dispatch(shop, 'audit', {
    score: audit.score || 0,
    pages_crawled: audit.pages_crawled || 0,
    errors_count: audit.errors_count || 0,
    warnings_count: audit.warnings_count || 0,
  });
}
async function sendAIVisibilityComplete(shop, run) {
  return dispatch(shop, 'aiVisibility', {
    score: run.visibility_score || 0,
    mentions: run.mentions_total || 0,
    citations: run.citations_total || 0,
    cited_pages: run.cited_pages_total || 0,
  });
}
async function sendCriticalStockAlert(shop, alert) {
  return dispatch(shop, 'stockAlerts', {
    product_title: alert.product_title,
    variant_title: alert.variant_title,
    sku: alert.sku || '—',
    inventory: Math.max(0, alert.inventory || 0),
    monthly_clicks: alert.monthly_clicks || 0,
  });
}

module.exports = {
  // facade
  sendWelcome,
  sendGoogleConnected,
  sendSubscriptionActivated,
  sendAuditComplete,
  sendAIVisibilityComplete,
  sendCriticalStockAlert,
  // primitives + admin helpers
  sendEmail,
  smtpConfigured,
  renderEvent,
  applyTokens,
  layout,
  DEFAULT_TEMPLATES,
  EVENT_META,
  EVENT_KEYS,
  ADMIN_ONLY_EVENTS,
};
