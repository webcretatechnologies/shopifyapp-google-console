const nodemailer = require('nodemailer');
const { getLowStockAlerts, getProductSeoReport, getAdsOrderCorrelation } = require('./insights');
const { Shop, GoogleAccount, Subscription } = require('../models');

function getTransporter() {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildWeeklyEmailHtml({ shop, alerts, seoReport, adsData }) {
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const highAlerts     = alerts.filter(a => a.severity === 'high');
  const topProducts    = seoReport.slice(0, 5);
  const adsOrders      = adsData?.summary?.google_ads_orders || 0;
  const adsRevenue     = adsData?.summary?.google_ads_revenue || 0;

  const alertRows = alerts.slice(0, 5).map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
        <span style="background:${a.severity === 'critical' ? '#dc2626' : '#f59e0b'};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">
          ${a.severity === 'critical' ? 'OUT OF STOCK' : 'LOW STOCK'}
        </span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${a.product_title} — ${a.variant_title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${a.inventory} units</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${a.monthly_clicks} clicks</td>
    </tr>
  `).join('');

  const seoRows = topProducts.map(p => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${p.product_title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${p.total_clicks}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${p.total_impressions}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${p.avg_position}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${p.avg_ctr}%</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Weekly Report</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:#5c6bc0;border-radius:12px 12px 0 0;padding:32px;text-align:center;color:#fff;">
      <h1 style="margin:0;font-size:24px;">Weekly Analytics Report</h1>
      <p style="margin:8px 0 0;opacity:0.85;">${shop.shop_name} · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    </div>

    <!-- Summary cards -->
    <div style="background:#fff;padding:24px;display:flex;gap:16px;">
      <div style="flex:1;background:#eff6ff;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#1d4ed8;">${adsOrders}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">Orders from Google Ads</div>
      </div>
      <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#16a34a;">$${adsRevenue.toFixed(2)}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">Revenue from Google Ads</div>
      </div>
      <div style="flex:1;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#dc2626;">${criticalAlerts.length + highAlerts.length}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">Stock Alerts</div>
      </div>
    </div>

    ${alerts.length ? `
    <!-- Stock alerts -->
    <div style="background:#fff;margin-top:16px;border-radius:8px;overflow:hidden;">
      <div style="padding:16px 24px;border-bottom:1px solid #f0f0f0;">
        <h2 style="margin:0;font-size:16px;">⚠️ Stock Alerts — Action Required</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Status</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Product / Variant</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;">Stock</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;">Monthly Clicks</th>
          </tr>
        </thead>
        <tbody>${alertRows}</tbody>
      </table>
    </div>` : ''}

    ${topProducts.length ? `
    <!-- Top SEO products -->
    <div style="background:#fff;margin-top:16px;border-radius:8px;overflow:hidden;">
      <div style="padding:16px 24px;border-bottom:1px solid #f0f0f0;">
        <h2 style="margin:0;font-size:16px;">🔍 Top Products by Organic Traffic</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Product</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;">Clicks</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;">Impressions</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;">Avg Position</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;">CTR</th>
          </tr>
        </thead>
        <tbody>${seoRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;">
      <p>This report was generated by your Google Analytics App.</p>
      <p>To unsubscribe from weekly reports, go to Settings in your app.</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendWeeklyReport(shop) {
  const transporter = getTransporter();
  if (!process.env.SMTP_PASS || process.env.SMTP_PASS === 'your_gmail_app_password') {
    console.log(`[Email] SMTP not configured — skipping report for ${shop.shop_domain}`);
    return;
  }

  try {
    const [alerts, seoReport, adsData] = await Promise.all([
      getLowStockAlerts(shop.id).catch(() => []),
      getProductSeoReport(shop.id).catch(() => []),
      getAdsOrderCorrelation(shop.id).catch(() => null),
    ]);

    const html = buildWeeklyEmailHtml({ shop, alerts, seoReport, adsData });

    await transporter.sendMail({
      from:    process.env.EMAIL_FROM || 'Google Analytics App <noreply@example.com>',
      to:      shop.email,
      subject: `📊 Weekly Report — ${shop.shop_name} (${new Date().toLocaleDateString()})`,
      html,
    });

    console.log(`[Email] Weekly report sent to ${shop.email} for ${shop.shop_domain}`);
  } catch (err) {
    console.error(`[Email] Failed for ${shop.shop_domain}:`, err.message);
  }
}

async function sendWeeklyReportsToAll() {
  const shops = await Shop.findAll({
    where: { is_active: true },
    include: [{ model: Subscription, as: 'subscription', where: { status: ['active', 'trial'] }, required: true }],
  });

  console.log(`[Email] Sending weekly reports to ${shops.length} shops`);
  for (const shop of shops) {
    await sendWeeklyReport(shop);
    await new Promise(r => setTimeout(r, 1000)); // 1s between emails
  }
}

module.exports = { sendWeeklyReport, sendWeeklyReportsToAll };
