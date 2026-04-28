// Transactional email service — wraps nodemailer with templates for every
// app event (welcome, OAuth-connected, subscription, audit-done, etc.)
//
// SMTP config lives in .env (SMTP_HOST/PORT/USER/PASS, EMAIL_FROM). When SMTP
// is not configured the module no-ops gracefully so install/dev still works.
//
// All public send* functions are fire-and-forget — they never throw, they log
// failures and return a result object so callers don't need try/catch.

const nodemailer = require('nodemailer');
const { ShopSettings } = require('../models');
const { getConfig } = require('./appConfig');

// ── Transport — rebuilt per-call (cheap) so admin config changes apply
//     immediately. Returns null when SMTP isn't configured.
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

// ── Shared HTML helpers ─────────────────────────────────────────────────────
const COLORS = {
  brand:   '#1a1a1a',
  text:    '#202223',
  subdued: '#6d7175',
  border:  '#e1e3e5',
  bg:      '#f9fafb',
  surface: '#ffffff',
  success: '#16a34a',
  warning: '#f59e0b',
  danger:  '#dc2626',
  info:    '#2563eb',
};

function btn(label, href, color = COLORS.brand) {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;font-family:inherit;">${label}</a>`;
}

function layout({ preheader = '', title, body }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${COLORS.bg};margin:0;padding:0;color:${COLORS.text};">
  <span style="display:none;font-size:1px;color:${COLORS.bg};opacity:0;">${preheader}</span>
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;padding-bottom:24px;">
      <div style="display:inline-block;width:48px;height:48px;border-radius:10px;background:${COLORS.brand};color:#fff;line-height:48px;font-weight:700;font-size:18px;">GC</div>
      <div style="margin-top:8px;font-size:13px;color:${COLORS.subdued};">Google Console Analytics</div>
    </div>
    <div style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;padding:32px;">
      ${body}
    </div>
    <div style="text-align:center;padding:24px 12px;color:#9ca3af;font-size:12px;line-height:1.6;">
      <div>You're receiving this because you installed Google Console Analytics on your Shopify store.</div>
      <div style="margin-top:6px;">Manage email preferences in <a href="${APP_URL}/settings" style="color:${COLORS.subdued};">Settings</a></div>
    </div>
  </div>
</body></html>`;
}

// Each template returns { subject, html }
function tplWelcome(shop) {
  const name = shop.shop_name || shop.shop_domain;
  return {
    subject: `Welcome to Google Console Analytics, ${name}!`,
    html: layout({
      preheader: `Connect Google to start tracking SEO and Analytics for ${name}.`,
      title: 'Welcome',
      body: `
        <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;">Welcome aboard! 🎉</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.text};">
          Thanks for installing <strong>Google Console Analytics</strong> on <strong>${name}</strong>.
          You're 2 minutes away from seeing real Search Console + GA4 + Google Ads data inside your Shopify admin.
        </p>
        <h2 style="margin:24px 0 8px;font-size:16px;color:${COLORS.text};">Get started in 3 steps:</h2>
        <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.9;color:${COLORS.text};">
          <li><strong>Connect Google</strong> — link the Google account that owns your Search Console and GA4 properties</li>
          <li><strong>Pick your properties</strong> — we auto-list everything verified on that account</li>
          <li><strong>Hit "Run analysis"</strong> on the Site Audit and AI Visibility pages to see your first reports</li>
        </ol>
        <div style="text-align:center;margin:24px 0 8px;">
          ${btn('Open the app →', `${APP_URL}/connect-google`)}
        </div>
        <p style="margin:24px 0 0;font-size:13px;color:${COLORS.subdued};">
          Need help? Reply to this email — a real human reads it.
        </p>`,
    }),
  };
}

function tplGoogleConnected(shop, googleAccount) {
  const name = shop.shop_name || shop.shop_domain;
  return {
    subject: `Google connected to ${name}`,
    html: layout({
      preheader: `${googleAccount.google_email} is now linked. Pick your Search Console + GA4 properties.`,
      title: 'Google connected',
      body: `
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${COLORS.success};">✓ Google account connected</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
          We've successfully linked <strong>${googleAccount.google_email}</strong> to <strong>${name}</strong>.
        </p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${COLORS.subdued};">
          Next step: pick which Search Console property and GA4 property to track.
        </p>
        <div style="text-align:center;margin:8px 0;">
          ${btn('Configure properties →', `${APP_URL}/connect-google`)}
        </div>`,
    }),
  };
}

function tplSubscriptionActivated(shop, subscription, plan) {
  const name = shop.shop_name || shop.shop_domain;
  const isTrial = subscription.status === 'trial';
  const trialEnd = subscription.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  return {
    subject: isTrial
      ? `Your ${plan.name} trial has started — ${plan.trial_days} days free`
      : `${plan.name} plan activated for ${name}`,
    html: layout({
      preheader: isTrial
        ? `Free trial ends ${trialEnd}. Cancel anytime.`
        : `You're now on the ${plan.name} plan.`,
      title: isTrial ? 'Trial started' : 'Subscription active',
      body: `
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">
          ${isTrial ? `🎉 Your ${plan.trial_days}-day free trial has started` : `✓ ${plan.name} plan is active`}
        </h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
          ${isTrial
            ? `You're on the <strong>${plan.name}</strong> plan with full access to every feature until <strong>${trialEnd}</strong>. After that you'll be charged $${parseFloat(plan.price).toFixed(2)}/month — cancel anytime before then to avoid the charge.`
            : `You're now on the <strong>${plan.name}</strong> plan ($${parseFloat(plan.price).toFixed(2)}/month).`}
        </p>
        <div style="background:${COLORS.bg};border-radius:8px;padding:16px;margin:20px 0;">
          <div style="font-size:13px;color:${COLORS.subdued};margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">What's included</div>
          ${(() => { try {
            const feats = Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features || '[]');
            return feats.map(f => `<div style="font-size:14px;padding:4px 0;color:${COLORS.text};">✓ ${f}</div>`).join('');
          } catch { return ''; } })()}
        </div>
        <div style="text-align:center;margin:8px 0;">
          ${btn('Open dashboard →', `${APP_URL}/`)}
        </div>`,
    }),
  };
}

function tplAuditComplete(shop, audit) {
  const name = shop.shop_name || shop.shop_domain;
  const score = audit.score || 0;
  const tone =
    score >= 80 ? { color: COLORS.success, label: 'Healthy' } :
    score >= 60 ? { color: COLORS.warning, label: 'Needs work' } :
                  { color: COLORS.danger,  label: 'Critical' };
  return {
    subject: `Site Audit complete — score ${score}/100`,
    html: layout({
      preheader: `${audit.errors_count} errors, ${audit.warnings_count} warnings across ${audit.pages_crawled} pages.`,
      title: 'Site Audit complete',
      body: `
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">Site Audit complete for ${name}</h1>
        <div style="display:flex;align-items:center;gap:16px;margin:20px 0;padding:20px;background:${COLORS.bg};border-radius:10px;">
          <div style="width:80px;height:80px;border-radius:50%;background:${tone.color};color:#fff;text-align:center;line-height:80px;font-size:24px;font-weight:700;">${score}</div>
          <div>
            <div style="font-size:18px;font-weight:600;color:${tone.color};">${tone.label}</div>
            <div style="font-size:13px;color:${COLORS.subdued};margin-top:4px;">${audit.pages_crawled} pages crawled</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
          <tr>
            <td style="padding:10px;background:#fff5f5;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:700;color:${COLORS.danger};">${audit.errors_count}</div>
              <div style="font-size:12px;color:${COLORS.subdued};">Errors</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:10px;background:#fffbeb;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:700;color:${COLORS.warning};">${audit.warnings_count}</div>
              <div style="font-size:12px;color:${COLORS.subdued};">Warnings</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:10px;background:${COLORS.bg};border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:700;color:${COLORS.subdued};">${audit.notices_count}</div>
              <div style="font-size:12px;color:${COLORS.subdued};">Notices</div>
            </td>
          </tr>
        </table>
        <div style="text-align:center;margin:8px 0;">
          ${btn('See full report →', `${APP_URL}/site-audit`)}
        </div>`,
    }),
  };
}

function tplAIVisibilityComplete(shop, run) {
  const name = shop.shop_name || shop.shop_domain;
  const score = run.visibility_score || 0;
  const tone =
    score >= 70 ? { color: COLORS.success, label: 'Strong' } :
    score >= 40 ? { color: COLORS.info,    label: 'Medium' } :
    score >= 20 ? { color: COLORS.warning, label: 'Low'    } :
                  { color: COLORS.danger,  label: 'Very Low' };
  return {
    subject: `AI Visibility run complete — score ${score}/100`,
    html: layout({
      preheader: `${run.mentions_total} mentions, ${run.citations_total} citations across configured AI models.`,
      title: 'AI Visibility complete',
      body: `
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">AI Visibility report for ${name}</h1>
        <div style="display:flex;align-items:center;gap:16px;margin:20px 0;padding:20px;background:${COLORS.bg};border-radius:10px;">
          <div style="width:80px;height:80px;border-radius:50%;background:${tone.color};color:#fff;text-align:center;line-height:80px;font-size:24px;font-weight:700;">${score}</div>
          <div>
            <div style="font-size:18px;font-weight:600;color:${tone.color};">${tone.label}</div>
            <div style="font-size:13px;color:${COLORS.subdued};margin-top:4px;">across ${(run.providers || []).length} AI ${(run.providers || []).length === 1 ? 'model' : 'models'}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
          <tr>
            <td style="padding:10px;background:#eff6ff;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:700;color:${COLORS.info};">${run.mentions_total || 0}</div>
              <div style="font-size:12px;color:${COLORS.subdued};">Mentions</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:10px;background:#f0fdf4;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:700;color:${COLORS.success};">${run.citations_total || 0}</div>
              <div style="font-size:12px;color:${COLORS.subdued};">Citations</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:10px;background:#fff7ed;border-radius:6px;text-align:center;width:33%;">
              <div style="font-size:22px;font-weight:700;color:${COLORS.warning};">${run.cited_pages_total || 0}</div>
              <div style="font-size:12px;color:${COLORS.subdued};">Cited Pages</div>
            </td>
          </tr>
        </table>
        <div style="text-align:center;margin:8px 0;">
          ${btn('View full breakdown →', `${APP_URL}/ai-visibility`)}
        </div>`,
    }),
  };
}

function tplCriticalStockAlert(shop, alert) {
  const name = shop.shop_name || shop.shop_domain;
  return {
    subject: `⚠️ ${alert.product_title} is out of stock — ${alert.monthly_clicks} clicks/month`,
    html: layout({
      preheader: `Critical: a high-traffic product just went out of stock.`,
      title: 'Stock alert',
      body: `
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${COLORS.danger};">⚠️ Critical stock alert</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
          A product on <strong>${name}</strong> just went out of stock — and it's getting significant Google traffic.
        </p>
        <div style="background:#fff5f5;border-left:4px solid ${COLORS.danger};padding:16px;border-radius:6px;margin:20px 0;">
          <div style="font-weight:600;font-size:15px;margin-bottom:4px;">${alert.product_title}</div>
          <div style="font-size:13px;color:${COLORS.subdued};margin-bottom:10px;">${alert.variant_title}${alert.sku ? ` · SKU ${alert.sku}` : ''}</div>
          <div style="font-size:13px;"><strong>${alert.monthly_clicks}</strong> clicks/month from Google · <strong>${Math.max(0, alert.inventory)}</strong> units left</div>
        </div>
        <div style="text-align:center;margin:8px 0;">
          ${btn('Restock now →', `${APP_URL}/insights`, COLORS.danger)}
        </div>
        <p style="margin:24px 0 0;font-size:13px;color:${COLORS.subdued};">
          You're losing potential sales every day this stays out of stock.
        </p>`,
    }),
  };
}

// Resolve recipient + per-event opt-in by reading shop_settings.
// Returns { to: string|null, optedIn: boolean }. When the shop has no settings
// row yet we default to opted-in so install/onboarding emails still go out.
async function resolveRecipient(shop, eventKey) {
  const settings = await ShopSettings.findOne({
    where: { shop_id: shop.id },
    attributes: ['notification_email', 'email_prefs'],
  }).catch(() => null);

  const to = settings?.notification_email || shop.email || null;
  const prefs = settings?.email_prefs || {};
  // Opt-in by default — toggling OFF must be explicit
  const optedIn = prefs[eventKey] !== false;
  return { to, optedIn };
}

async function maybeSend(shop, eventKey, tpl) {
  const { to, optedIn } = await resolveRecipient(shop, eventKey);
  if (!optedIn) {
    console.log(`[Email] "${eventKey}" disabled by shop ${shop.id} — skipping`);
    return { skipped: true, reason: 'opted-out' };
  }
  return sendEmail({ to, ...tpl });
}

// ── Public facade ────────────────────────────────────────────────────────────
// Each function uses the per-shop notification_email + email_prefs override.
async function sendWelcome(shop) {
  return maybeSend(shop, 'welcome', tplWelcome(shop));
}
async function sendGoogleConnected(shop, googleAccount) {
  return maybeSend(shop, 'googleConnected', tplGoogleConnected(shop, googleAccount));
}
async function sendSubscriptionActivated(shop, subscription, plan) {
  return maybeSend(shop, 'subscription', tplSubscriptionActivated(shop, subscription, plan));
}
async function sendAuditComplete(shop, audit) {
  return maybeSend(shop, 'audit', tplAuditComplete(shop, audit));
}
async function sendAIVisibilityComplete(shop, run) {
  return maybeSend(shop, 'aiVisibility', tplAIVisibilityComplete(shop, run));
}
async function sendCriticalStockAlert(shop, alert) {
  return maybeSend(shop, 'stockAlerts', tplCriticalStockAlert(shop, alert));
}

module.exports = {
  // facade
  sendWelcome,
  sendGoogleConnected,
  sendSubscriptionActivated,
  sendAuditComplete,
  sendAIVisibilityComplete,
  sendCriticalStockAlert,
  // primitives (rare use)
  sendEmail,
  smtpConfigured,
};
