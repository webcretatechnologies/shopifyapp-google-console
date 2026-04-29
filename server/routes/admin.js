const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Admin, Shop, Subscription, BillingPlan, GoogleAccount, EmailTemplate } = require('../models');
const { adminAuth, requireRole } = require('../middleware/adminAuth');
const { getAllConfigs, setManyConfigs } = require('../services/appConfig');
const { EVENT_META, EVENT_KEYS, DEFAULT_TEMPLATES, applyTokens, layout } = require('../services/email');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_ADMIN_SECRET || 'admin-secret';

// Disable HTTP caching across the admin API so the browser never serves a
// stale 304 for /me/stats/etc. — those caches were causing the auth state
// to look "logged in" while underlying API calls were 401-ing.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Auth
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const admin = await Admin.findOne({ where: { email, is_active: true } });
  if (!admin || !(await admin.validatePassword(password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await admin.update({ last_login_at: new Date() });
  // 7-day session — admins don't log in often; 8h was causing "sometimes the
  // panel opens, sometimes it kicks me to login" reports.
  const token = jwt.sign({ id: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
});

router.post('/logout', adminAuth, (req, res) => res.json({ success: true }));

router.get('/me', adminAuth, (req, res) => {
  res.json({ id: req.admin.id, name: req.admin.name, email: req.admin.email, role: req.admin.role });
});

// Dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  const [totalShops, activeShops, activeSubscriptions, trialShops] = await Promise.all([
    Shop.count(),
    Shop.count({ where: { is_active: true } }),
    Subscription.count({ where: { status: 'active' } }),
    Subscription.count({ where: { status: 'trial' } }),
  ]);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newShops = await Shop.count({ where: { installed_at: { [Op.gte]: thirtyDaysAgo } } });

  res.json({ totalShops, activeShops, activeSubscriptions, trialShops, newShops });
});

// Users (Shops) management
router.get('/shops', adminAuth, async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const where = {};
  if (search) where[Op.or] = [
    { shop_domain: { [Op.like]: `%${search}%` } },
    { email: { [Op.like]: `%${search}%` } },
    { shop_name: { [Op.like]: `%${search}%` } },
  ];
  if (status === 'active') where.is_active = true;
  if (status === 'inactive') where.is_active = false;

  const { count, rows } = await Shop.findAndCountAll({
    where,
    include: [
      { association: 'subscription', include: ['plan'] },
      { association: 'googleAccount', attributes: ['google_email', 'is_active'] },
    ],
    order: [['installed_at', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
  });

  res.json({ total: count, page: parseInt(page), shops: rows });
});

router.get('/shops/:id', adminAuth, async (req, res) => {
  const shop = await Shop.findByPk(req.params.id, {
    include: [{ association: 'subscription', include: ['plan'] }, { association: 'googleAccount' }],
  });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json(shop);
});

router.patch('/shops/:id', adminAuth, requireRole('super_admin', 'admin'), async (req, res) => {
  const { is_active, extra_features } = req.body;
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  const update = {};
  if (typeof is_active === 'boolean') update.is_active = is_active;
  if (Array.isArray(extra_features)) {
    // Sanitize: only accept { label, amount, note } and stamp granted_at.
    update.extra_features = extra_features
      .filter(e => e && typeof e.label === 'string' && e.label.trim())
      .map(e => ({
        label: e.label.trim(),
        amount: typeof e.amount === 'number' ? e.amount : (parseFloat(e.amount) || 0),
        note: typeof e.note === 'string' ? e.note : '',
        granted_at: e.granted_at || new Date().toISOString(),
        granted_by: req.admin?.id || null,
      }));
  }
  await shop.update(update);
  // Some JSON columns need explicit dirty marking after assignment.
  if (update.extra_features) { shop.changed('extra_features', true); await shop.save(); }
  res.json({ success: true });
});

// Billing Plans management
router.get('/plans', adminAuth, async (req, res) => {
  res.json(await BillingPlan.findAll({ order: [['price', 'ASC']] }));
});

router.post('/plans', adminAuth, requireRole('super_admin'), async (req, res) => {
  const plan = await BillingPlan.create(req.body);
  res.status(201).json(plan);
});

router.put('/plans/:id', adminAuth, requireRole('super_admin'), async (req, res) => {
  const plan = await BillingPlan.findByPk(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  await plan.update(req.body);
  res.json(plan);
});

router.delete('/plans/:id', adminAuth, requireRole('super_admin'), async (req, res) => {
  const plan = await BillingPlan.findByPk(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  await plan.update({ is_active: false });
  res.json({ success: true });
});

// Subscriptions
router.get('/subscriptions', adminAuth, async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const where = status ? { status } : {};
  const { count, rows } = await Subscription.findAndCountAll({
    where,
    include: [{ association: 'plan' }, { model: Shop }],
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
  });
  res.json({ total: count, page: parseInt(page), subscriptions: rows });
});

router.patch('/subscriptions/:id', adminAuth, requireRole('super_admin', 'admin'), async (req, res) => {
  const sub = await Subscription.findByPk(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });
  await sub.update(req.body);
  res.json(sub);
});

// Admin user management
router.get('/admins', adminAuth, requireRole('super_admin'), async (req, res) => {
  const admins = await Admin.findAll({ attributes: { exclude: ['password'] }, order: [['created_at', 'DESC']] });
  res.json(admins);
});

router.post('/admins', adminAuth, requireRole('super_admin'), async (req, res) => {
  const admin = await Admin.create(req.body);
  res.status(201).json({ id: admin.id, name: admin.name, email: admin.email, role: admin.role });
});

router.patch('/admins/:id', adminAuth, requireRole('super_admin'), async (req, res) => {
  const admin = await Admin.findByPk(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  await admin.update(req.body);
  res.json({ success: true });
});

// ── App config (Live Setup tab) ─────────────────────────────────────────────
// GET — return every managed key + current value + source ('db' | 'env' | 'unset')
router.get('/config', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const groups = await getAllConfigs();
    res.json({ groups });
  } catch (err) {
    console.error('GET /admin/config:', err);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// PUT — accept { patch: { KEY: 'value', ... } }. Empty value clears the row.
router.put('/config', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const patch = req.body?.patch;
    if (!patch || typeof patch !== 'object') {
      return res.status(400).json({ error: '`patch` object required' });
    }
    const results = await setManyConfigs(patch, { adminId: req.admin?.id });
    res.json({ success: true, results });
  } catch (err) {
    console.error('PUT /admin/config:', err);
    res.status(500).json({ error: err.message || 'Failed to save config' });
  }
});

// ── Email template layouts ──────────────────────────────────────────────────
// Admin sees a flat list of all transactional emails. For each event the
// admin can override the header / body / footer; whatever is empty falls back
// to the baked-in default at send time.

// GET /admin/email-templates — list of all events with current saved layout (or defaults)
router.get('/email-templates', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const rows = await EmailTemplate.findAll();
    const byKey = Object.fromEntries(rows.map(r => [r.event_key, r]));
    const events = EVENT_KEYS.map(key => {
      const def = DEFAULT_TEMPLATES[key];
      const row = byKey[key];
      return {
        key,
        label: EVENT_META[key].label,
        description: EVENT_META[key].description,
        availableTokens: EVENT_META[key].availableTokens,
        saved: !!row,
        subject:     row?.subject     ?? def.subject,
        header_html: row?.header_html ?? '',
        body_html:   row?.body_html   ?? def.body_html,
        footer_html: row?.footer_html ?? def.footer_html ?? '',
      };
    });
    res.json({ events });
  } catch (err) {
    console.error('GET /admin/email-templates:', err);
    res.status(500).json({ error: err.message || 'Failed to load templates' });
  }
});

// PUT /admin/email-templates — save layout for one event
router.put('/email-templates', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { event_key, subject, header_html, body_html, footer_html } = req.body || {};
    if (!EVENT_KEYS.includes(event_key)) return res.status(400).json({ error: 'invalid event_key' });
    if (!subject?.trim() || !body_html?.trim()) return res.status(400).json({ error: 'subject and content are required' });

    const data = {
      event_key,
      subject: subject.trim(),
      header_html: header_html || null,
      body_html,
      footer_html: footer_html || null,
      updated_by: req.admin?.id || null,
    };
    const existing = await EmailTemplate.findOne({ where: { event_key } });
    let row;
    if (existing) { await existing.update(data); row = existing; }
    else { row = await EmailTemplate.create(data); }
    res.json({ success: true, id: row.id });
  } catch (err) {
    console.error('PUT /admin/email-templates:', err);
    res.status(500).json({ error: err.message || 'Failed to save template' });
  }
});

// POST /admin/email-templates/preview — render unsaved edits with sample tokens
router.post('/email-templates/preview', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { event_key, subject, header_html, body_html, footer_html } = req.body || {};
    if (!EVENT_KEYS.includes(event_key)) return res.status(400).json({ error: 'invalid event_key' });
    const tokens = EVENT_META[event_key].sampleTokens || {};
    const subj = applyTokens(subject || '', tokens);
    const html = layout({
      subject: subj,
      headerHtml: applyTokens(header_html || '', tokens),
      bodyHtml: applyTokens(body_html || '', tokens),
      footerHtml: applyTokens(footer_html || '', tokens),
    });
    res.json({ subject: subj, html });
  } catch (err) {
    console.error('POST /admin/email-templates/preview:', err);
    res.status(500).json({ error: err.message || 'Preview failed' });
  }
});

module.exports = router;
