const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

// Hàm loại bỏ dấu tiếng Việt
function removeVietnameseTones(str) {
  if (!str) return '';
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

function addIsNew(products) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return products.map(p => {
    const obj = p.toObject ? p.toObject() : p;
    obj.isNew = new Date(obj.createdAt) > sevenDaysAgo;
    return obj;
  });
}

// ──────────────────────────────────────────────────────────────
// Lấy danh sách brand
// ──────────────────────────────────────────────────────────────
router.get('/brands', async (req, res) => {
  try {
    const brands = await Product.distinct('brand', { status: 'Active' });
    const filtered = brands.filter(b => b && typeof b === 'string' && b.trim().length > 0);
    res.json(filtered);
  } catch (err) {
    console.error('Error fetching brands:', err);
    res.status(500).json([]);
  }
});

// ──────────────────────────────────────────────────────────────
// SO SÁNH SẢN PHẨM (ĐẶT TRƯỚC /:id)
// ──────────────────────────────────────────────────────────────
router.get('/compare', async (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',') : [];
  if (ids.length < 2) {
    req.flash('error', 'Vui lòng chọn ít nhất 2 sản phẩm để so sánh');
    return res.redirect('back');
  }
  try {
    const products = await Product.find({ _id: { $in: ids } }).populate('category');
    if (products.length < 2) {
      req.flash('error', 'Không tìm thấy đủ sản phẩm để so sánh');
      return res.redirect('back');
    }
    res.render('compare', { 
      products, 
      layout: 'layouts/main',
      title: 'So sánh sản phẩm'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('back');
  }
});

// ──────────────────────────────────────────────────────────────
// Trang danh sách sản phẩm (shop)
// ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      category,
      min,
      max,
      sort,
      search,
      brand,
      gender,
      ageRange,
      page = 1,
      limit = 9
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let query = {};

    if (search) {
      const normalizedSearch = removeVietnameseTones(search);
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { searchName: { $regex: normalizedSearch, $options: 'i' } }
      ];
    }

    if (category) query.category = category;

    if (min || max) {
      query.salePrice = {};
      if (min) query.salePrice.$gte = Number(min);
      if (max) query.salePrice.$lte = Number(max);
    }

    if (brand) {
      query.brand = { $regex: brand, $options: 'i' };
    }

    if (gender && ['Boy', 'Girl', 'Unisex'].includes(gender)) {
      query.gender = gender;
    }

    if (ageRange) {
      query.ageRange = ageRange;
    }

    let sortOption = {};
    if (sort === 'price_asc') sortOption.salePrice = 1;
    else if (sort === 'price_desc') sortOption.salePrice = -1;
    else sortOption.createdAt = -1;

    const totalItems = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    let products = await Product.find(query)
      .populate('category')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    products = addIsNew(products);

    const categories = await Category.find().sort({ name: 1 });

    const queryParams = {
      search: search || '',
      category: category || '',
      min: min || '',
      max: max || '',
      sort: sort || 'default',
      brand: brand || '',
      gender: gender || '',
      ageRange: ageRange || '',
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

// ──────────────────────────────────────────────────────────────
// Trang chi tiết sản phẩm – gợi ý sản phẩm tương tự
// ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    let product = await Product.findById(req.params.id).populate('category');
    if (!product) return res.redirect('/products');

    product = product.toObject();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    product.isNew = new Date(product.createdAt) > sevenDaysAgo;

    let sameCategory = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      status: 'Active',
      stock: { $gt: 0 }
    }).limit(8);

    sameCategory = addIsNew(sameCategory);

    const excludeIds = [product._id, ...sameCategory.map(p => p._id)];
    const neededRandom = 12 - sameCategory.length;
    let randomProducts = [];
    if (neededRandom > 0) {
      randomProducts = await Product.aggregate([
        { $match: { _id: { $nin: excludeIds }, status: 'Active', stock: { $gt: 0 } } },
        { $sample: { size: neededRandom } }
      ]);
      randomProducts = addIsNew(randomProducts);
    }

    const related = [...sameCategory, ...randomProducts];
    res.render('detail', { product, related, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/products');
  }
});

module.exports = router;