const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

// Hàm loại bỏ dấu tiếng Việt
function removeVietnameseTones(str) {
  str = str.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a');
  str = str.replace(/[èéẹẻẽêềếệểễ]/g, 'e');
  str = str.replace(/[ìíịỉĩ]/g, 'i');
  str = str.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o');
  str = str.replace(/[ùúụủũưừứựửữ]/g, 'u');
  str = str.replace(/[ỳýỵỷỹ]/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/Đ/g, 'D');
  return str.toLowerCase();
}

// Trang danh sách sản phẩm (shop)
router.get('/', async (req, res) => {
  try {
    const { category, min, max, sort, search, page = 1, limit = 9 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let query = {};

    // Tìm kiếm gần đúng tiếng Việt
    if (search) {
      const normalizedSearch = removeVietnameseTones(search);
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { searchName: { $regex: normalizedSearch, $options: 'i' } }
      ];
    }

    // Lọc theo danh mục (ObjectId)
    if (category) query.category = category;

    // Lọc theo giá
    if (min || max) {
      query.salePrice = {};
      if (min) query.salePrice.$gte = Number(min);
      if (max) query.salePrice.$lte = Number(max);
    }

    // Sắp xếp
    let sortOption = {};
    if (sort === 'price_asc') sortOption.salePrice = 1;
    else if (sort === 'price_desc') sortOption.salePrice = -1;
    else sortOption.createdAt = -1;

    // Đếm tổng số sản phẩm
    const totalItems = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Lấy sản phẩm
    const products = await Product.find(query)
      .populate('category')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    // Lấy danh sách category
    const categories = await Category.find().sort({ name: 1 });

    // Chuẩn bị query params để truyền sang view
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
      currentPage: parseInt(page)
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// Trang chi tiết sản phẩm
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');
    if (!product) return res.redirect('/products');

    // Lấy 2 sản phẩm cùng danh mục
    const sameCategory = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    }).limit(2);

    // Loại trừ các ID đã lấy
    const excludeIds = [product._id, ...sameCategory.map(p => p._id)];

    // Số lượng cần lấy ngẫu nhiên để đủ 4 sản phẩm
    const neededRandom = 4 - sameCategory.length;
    let randomProducts = [];
    if (neededRandom > 0) {
      randomProducts = await Product.aggregate([
        { $match: { _id: { $nin: excludeIds } } },
        { $sample: { size: neededRandom } }
      ]);
    }

    const related = [...sameCategory, ...randomProducts];
    res.render('detail', { product, related, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/products');
  }
});

module.exports = router;