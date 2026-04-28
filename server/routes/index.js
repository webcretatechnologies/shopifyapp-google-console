const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/google', require('./google'));
router.use('/analytics', require('./analytics'));
router.use('/admin', require('./admin'));
router.use('/billing', require('./billing'));
router.use('/webhooks', require('./webhooks'));
router.use('/settings', require('./settings'));
router.use('/products', require('./products'));
router.use('/insights', require('./insights'));
router.use('/audit', require('./audit'));
router.use('/ai-visibility', require('./aiVisibility'));
router.use('/content', require('./content'));
router.use('/faqs', require('./faqs'));
router.use('/structured-markup', require('./structuredMarkup'));

module.exports = router;
