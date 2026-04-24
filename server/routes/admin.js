const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Admin, Shop, Subscription, BillingPlan, GoogleAccount } = require('../models');
const { adminAuth, requireRole } = require('../middleware/adminAuth');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_ADMIN_SECRET || 'admin-secret';

// Auth
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const admin = await Admin.findOne({ where: { email, is_active: true } });
  if (!admin || !(await admin.validatePassword(password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await admin.update({ last_login_at: new Date() });
  const token = jwt.sign({ id: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: '8h' });
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
  const { is_active } = req.body;
  const shop = await Shop.findByPk(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  await shop.update({ is_active });
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

module.exports = router;
