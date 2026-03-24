const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

// Trang shop (danh sách sản phẩm)
// GET /products
router.get('/', async (req, res) => {
  try {
    const { category, min, max, sort, search, page = 1, limit = 9 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
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

    // Đếm tổng số sản phẩm thỏa mãn query
    const totalItems = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    const products = await Product.find(query)
      .populate('category')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    const categories = await Category.find().sort({ name: 1 });

    const queryParams = {
      search: search || '',
      category: category || '',
      min: min || '',
      max: max || '',
      sort: sort || 'default',
      page: parseInt(page),
      limit: parseInt(limit)
    };

    res.render('shop', {
      products,
      categories,
      query: queryParams,
      totalPages,
      totalItems,
      currentPage: parseInt(page),
      layout: 'layouts/main'
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// Chi tiết sản phẩm
// Chi tiết sản phẩm
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');
    if (!product) return res.redirect('/products');

    // Lấy sản phẩm cùng category (tối đa 2)
    const sameCategory = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    }).limit(2);

    // Danh sách ID đã có (sản phẩm hiện tại + các sản phẩm cùng loại đã lấy)
    const excludeIds = [product._id, ...sameCategory.map(p => p._id)];

    // Tính số lượng cần lấy ngẫu nhiên để tổng = 4
    const neededRandom = 4 - sameCategory.length;

    let randomProducts = [];
    if (neededRandom > 0) {
      randomProducts = await Product.aggregate([
        { $match: { _id: { $nin: excludeIds } } },
        { $sample: { size: neededRandom } }
      ]);
    }

    // Gộp kết quả
    const related = [...sameCategory, ...randomProducts];

    res.render('detail', { product, related, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/products');
  }
});

module.exports = router;