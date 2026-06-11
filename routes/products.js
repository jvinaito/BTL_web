const router = require('express').Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

// Hàm loại bỏ dấu tiếng Việt (đã có trong Product model nhưng dùng lại cho nhất quán)
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

// ──────────────────────────────────────────────────────────────
// Lấy danh sách brand duy nhất (cho dropdown lọc)
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
// Trang danh sách sản phẩm (shop) – có lọc nâng cao
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

    // Tìm kiếm gần đúng tiếng Việt (có dấu / không dấu)
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

    // Lọc theo hãng (brand)
    if (brand) {
      query.brand = { $regex: brand, $options: 'i' };
    }

    // Lọc theo giới tính
    if (gender && ['Boy', 'Girl', 'Unisex'].includes(gender)) {
      query.gender = gender;
    }

    // Lọc theo độ tuổi (ví dụ "0-2", "3-5", "6-8", "9-12", "12+")
    if (ageRange) {
      query.ageRange = ageRange;
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

    // Lấy danh sách category (cho sidebar)
    const categories = await Category.find().sort({ name: 1 });

    // Chuẩn bị query params để truyền sang view
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
// Trang chi tiết sản phẩm – gợi ý sản phẩm tương tự (hàng ngang, kéo chuột)
// Lấy tối đa 12 sản phẩm: ưu tiên cùng danh mục, sau đó random
// ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');
    if (!product) return res.redirect('/products');

    // Lấy tối đa 8 sản phẩm cùng danh mục (loại trừ chính nó)
    const sameCategory = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      status: 'Active',
      stock: { $gt: 0 }
    }).limit(8);

    const excludeIds = [product._id, ...sameCategory.map(p => p._id)];
    // Số lượng cần random để đủ 12 sản phẩm
    const neededRandom = 12 - sameCategory.length;
    let randomProducts = [];
    if (neededRandom > 0) {
      randomProducts = await Product.aggregate([
        { $match: { _id: { $nin: excludeIds }, status: 'Active', stock: { $gt: 0 } } },
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