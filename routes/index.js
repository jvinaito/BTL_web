const router = require('express').Router();
const Product = require('../models/Product');
const { getPersonalizedRecommendations } = require('../service/recommend'); // sửa tên import

router.get('/', async (req, res) => {
  try {
    const bestSellers = await Product.find().sort({ sold: -1 }).limit(4);
    const newArrivals = await Product.find().sort({ createdAt: -1 }).limit(4);
    const recommended = await getPersonalizedRecommendations(req, 12);
    res.render('home', { bestSellers, newArrivals, recommended, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

router.get('/contact', (req, res) => {
  res.render('contact', { layout: 'layouts/main' });
});

router.get('/about', (req, res) => {
  res.render('about', { layout: 'layouts/main' });
});

module.exports = router;