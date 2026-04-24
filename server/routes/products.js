const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { Product, ProductVariant } = require('../models');
const { syncAllProducts, registerProductWebhooks } = require('../services/productSync');

// GET /api/products — list products with variants
router.get('/', shopifyAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { shop_id: req.shop.id };
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { vendor: { [Op.like]: `%${search}%` } },
        { product_type: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: [{ model: ProductVariant, as: 'variants', separate: true }],
      order: [['shopify_updated_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      products: rows,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    console.error('[Products] GET error:', err.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

// GET /api/products/stats — summary counts
router.get('/stats', shopifyAuth, async (req, res) => {
  try {
    const [total, active, draft, archived, variants] = await Promise.all([
      Product.count({ where: { shop_id: req.shop.id } }),
      Product.count({ where: { shop_id: req.shop.id, status: 'active' } }),
      Product.count({ where: { shop_id: req.shop.id, status: 'draft' } }),
      Product.count({ where: { shop_id: req.shop.id, status: 'archived' } }),
      ProductVariant.count({ where: { shop_id: req.shop.id } }),
    ]);
    res.json({ total, active, draft, archived, variants });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/products/:id — single product with variants
router.get('/:id', shopifyAuth, async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, shop_id: req.shop.id },
      include: [{ model: ProductVariant, as: 'variants' }],
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load product' });
  }
});

// POST /api/products/sync — trigger full sync from Shopify
router.post('/sync', shopifyAuth, async (req, res) => {
  try {
    const { shop_domain, access_token, id: shopId } = req.shop;

    // Register product webhooks so future changes are captured automatically
    await registerProductWebhooks(shop_domain, access_token, process.env.APP_URL);

    // Kick off full sync (can take a while for large stores — respond immediately)
    res.json({ success: true, message: 'Sync started' });

    // Run sync in background after responding
    syncAllProducts(shopId, shop_domain, access_token).catch(err =>
      console.error('[Products] Sync error:', err.message)
    );
  } catch (err) {
    console.error('[Products] Sync trigger error:', err.message);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

module.exports = router;
