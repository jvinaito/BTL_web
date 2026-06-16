const router = require('express').Router();
const Product = require('../models/Product');
const { getPersonalizedRecommendations } = require('../service/recommend');

// Hàm tiện ích: thêm isNew vào mảng sản phẩm
function addIsNew(products) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return products.map(p => {
    // Nếu p là mongoose document, chuyển thành object thuần
    const obj = p.toObject ? p.toObject() : p;
    obj.isNew = new Date(obj.createdAt) > sevenDaysAgo;
    return obj;
  });
}

router.get('/', async (req, res) => {
  try {
    let bestSellers = await Product.find().sort({ sold: -1 }).limit(4);
    let newArrivals = await Product.find().sort({ createdAt: -1 }).limit(4);
    let recommended = await getPersonalizedRecommendations(req, 12);

    // Thêm isNew
    bestSellers = addIsNew(bestSellers);
    newArrivals = addIsNew(newArrivals);
    recommended = addIsNew(recommended);

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