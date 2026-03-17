const router = require('express').Router();
const Product = require('../models/Product');

// Trang chủ
router.get('/', async (req, res) => {
  try {
    const bestSellers = await Product.find().sort({ sold: -1 }).limit(4);
    const newArrivals = await Product.find().sort({ createdAt: -1 }).limit(4);
    res.render('home', { bestSellers, newArrivals, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// Trang liên hệ
router.get('/contact', (req, res) => {
  res.render('contact', { layout: 'layouts/main' });
});

// Trang giới thiệu (nếu cần)
router.get('/about', (req, res) => {
  res.render('about', { layout: 'layouts/main' });
});

module.exports = router;