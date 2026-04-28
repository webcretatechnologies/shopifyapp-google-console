const express = require('express');
const router = express.Router();
const { shopifyAuth } = require('../middleware/shopifyAuth');
const { ProductFaq } = require('../models');
const { generateForProduct } = require('../services/faqGeneration');

// GET /api/faqs/product/:productId — FAQs for one product
router.get('/product/:productId', shopifyAuth, async (req, res) => {
  const faqs = await ProductFaq.findAll({
    where: { shop_id: req.shop.id, product_id: req.params.productId },
    order: [['sort_order', 'ASC']],
  });
  res.json(faqs);
});

// POST /api/faqs/generate — body: { product_id, replace? }
router.post('/generate', shopifyAuth, async (req, res) => {
  try {
    const { product_id, replace } = req.body || {};
    if (!product_id) return res.status(400).json({ error: 'product_id required' });
    const faqs = await generateForProduct({
      productId: product_id, shopId: req.shop.id, replace: !!replace,
    });
    res.json({ success: true, faqs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/faqs — body: { product_id, question, answer } — manual entry
router.post('/', shopifyAuth, async (req, res) => {
  const { product_id, question, answer } = req.body || {};
  if (!product_id || !question || !answer) {
    return res.status(400).json({ error: 'product_id, question, answer all required' });
  }
  const lastSort = await ProductFaq.max('sort_order', { where: { product_id } }) || 0;
  const faq = await ProductFaq.create({
    shop_id: req.shop.id, product_id,
    question, answer,
    sort_order: lastSort + 1,
    source: 'manual', status: 'approved',
  });
  res.json(faq);
});

// PUT /api/faqs/:id
router.put('/:id', shopifyAuth, async (req, res) => {
  const faq = await ProductFaq.findOne({ where: { id: req.params.id, shop_id: req.shop.id } });
  if (!faq) return res.status(404).json({ error: 'FAQ not found' });
  const { question, answer, status, sort_order } = req.body || {};
  const updates = {};
  if (question !== undefined) updates.question = question;
  if (answer   !== undefined) updates.answer = answer;
  if (status && ['draft', 'approved', 'discarded'].includes(status)) updates.status = status;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  await faq.update(updates);
  res.json(faq);
});

// POST /api/faqs/reorder — body: { ordering: [id1, id2, ...] }
router.post('/reorder', shopifyAuth, async (req, res) => {
  const { ordering } = req.body || {};
  if (!Array.isArray(ordering)) return res.status(400).json({ error: 'ordering[] required' });
  for (let i = 0; i < ordering.length; i++) {
    await ProductFaq.update(
      { sort_order: i + 1 },
      { where: { id: ordering[i], shop_id: req.shop.id } }
    );
  }
  res.json({ success: true });
});

// DELETE /api/faqs/:id
router.delete('/:id', shopifyAuth, async (req, res) => {
  await ProductFaq.destroy({ where: { id: req.params.id, shop_id: req.shop.id } });
  res.json({ success: true });
});

module.exports = router;
