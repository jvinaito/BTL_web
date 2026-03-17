const router = require('express').Router();
const Product = require('../models/Product');

// Trang shop (danh sách sản phẩm)
router.get('/', async (req, res) => {
  try {
    const { category, min, max, sort } = req.query;
    let query = {};
    if (category) query.category = category;
    if (min || max) {
      query.salePrice = {};
      if (min) query.salePrice.$gte = Number(min);
      if (max) query.salePrice.$lte = Number(max);
    }
    let sortOption = {};
    if (sort === 'price_asc') sortOption.salePrice = 1;
    else if (sort === 'price_desc') sortOption.salePrice = -1;
    else sortOption.createdAt = -1;

    const products = await Product.find(query).sort(sortOption);
    const categories = await Product.distinct('category');
    res.render('shop', { products, categories, query, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// Chi tiết sản phẩm
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.redirect('/products');
    const related = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    }).limit(4);
    res.render('detail', { product, related, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/products');
  }
});

module.exports = router;