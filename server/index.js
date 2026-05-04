require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const { sequelize } = require('./models');
const routes = require('./routes');
const { startScheduler } = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.shopify.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.shopify.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      frameAncestors: [
        'https://*.myshopify.com',
        'https://admin.shopify.com',
        'https://*.spin.dev',
      ],
    },
  },
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? true
    : [process.env.APP_URL, /\.myshopify\.com$/],
  credentials: true,
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api', limiter);

// Save raw body buffer before JSON parsing — required for Shopify webhook HMAC verification
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'shopify-analytics-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: 'none' },
}));

// API routes
app.use('/api', routes);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Shopify install-check middleware ──────────────────────────────────────────
// When Shopify loads the app URL (?shop=...&hmac=...) check if the shop is
// saved in the DB. If not, redirect to OAuth install automatically.
function verifyShopifyHmac(query) {
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;
  const secret = process.env.SHOPIFY_API_SECRET;
  const message = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('&');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch { return false; }
}

app.use(async (req, res, next) => {
  // Only intercept non-API, non-health page requests from Shopify
  if (req.path.startsWith('/api') || req.path === '/health') return next();

  const { shop, hmac } = req.query;
  if (!shop || !hmac || !shop.endsWith('.myshopify.com')) return next();

  // Valid Shopify request — check if shop is installed
  if (!verifyShopifyHmac(req.query)) {
    console.log('[Install Check] Invalid HMAC from shop:', shop);
    return next();
  }

  try {
    const { Shop } = require('./models');
    const shopRecord = await Shop.findOne({ where: { shop_domain: shop, is_active: true } });

    if (!shopRecord || !shopRecord.access_token) {
      console.log('[Install Check] Shop not in DB, top-level redirect to OAuth:', shop);
      const installUrl = `${process.env.APP_URL}/api/auth/install?shop=${shop}`;
      // Use JS top-frame redirect — works whether loaded in iframe or directly
      return res.send(`<!DOCTYPE html><html><head></head><body>
        <script>window.top.location.href = '${installUrl}';</script>
        <p>Installing app...</p>
      </body></html>`);
    }

    console.log('[Install Check] Shop found in DB:', shop);
  } catch (err) {
    console.error('[Install Check] DB error:', err.message);
  }

  next();
});
// ─────────────────────────────────────────────────────────────────────────────

// Proxy everything else to Vite dev server
if (process.env.NODE_ENV === 'development') {
  const { createProxyMiddleware } = require('http-proxy-middleware');
  const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://client:5173';
  app.use('/', createProxyMiddleware({
    target: viteUrl,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    on: {
      proxyRes: (proxyRes) => {
        // Remove any X-Frame-Options Vite may send — it blocks Shopify embedding
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['X-Frame-Options'];
        // Inject frame-ancestors so Shopify can embed the app
        proxyRes.headers['content-security-policy'] =
          "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.spin.dev;";
      },
    },
  }));
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
});

async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    // Schema changes go through `node server/database/migrate.js` (lando ssh
    // node -c "node server/database/migrate.js"). Calling sync({ alter: true })
    // on every boot accumulated duplicate UNIQUE indexes until MySQL hit its
    // 64-key per-table limit and refused all further ALTER TABLE.
    // Create-if-missing only (no alter) for the email_templates table.
    await require('./models').EmailTemplate.sync();

    // Reset orphaned AI Visibility runs. A server restart kills any in-flight
    // setImmediate callbacks, leaving DB rows stuck in 'queued'/'running'
    // forever. Mark them failed on boot so the merchant can start a new run.
    try {
      const { Op } = require('sequelize');
      const { AIVisibilityRun } = require('./models');
      const [n] = await AIVisibilityRun.update(
        { status: 'failed', error_message: 'Server restarted — run aborted', completed_at: new Date() },
        { where: { status: { [Op.in]: ['queued', 'running'] } } },
      );
      if (n > 0) console.log(`[Boot] Reset ${n} orphaned AI Visibility run(s) to failed`);
    } catch (e) {
      console.error('[Boot] Could not reset orphaned AI runs:', e.message);
    }

    startScheduler();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Bootstrap error:', err);
    process.exit(1);
  }
}

bootstrap();
