const router = require('express').Router();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const Category = require('../models/Category');

// Middleware kiểm tra admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.level === 'Admin') {
    return next();
  }
  req.flash('error', 'Bạn không có quyền truy cập');
  res.redirect('/auth/login');
}

// Cấu hình multer cho upload ảnh (giữ lại nếu sau này dùng)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ==================== DASHBOARD ====================
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalIncomeAgg = await Order.aggregate([
      { $match: { status: 'Complete' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalIncome = totalIncomeAgg[0]?.total || 0;

    // 5 người dùng mới nhất + tổng tiền đã chi
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5);
    const userSpent = {};
    const completedOrders = await Order.find({ status: 'Complete' }).populate('user');
    completedOrders.forEach(order => {
      if (order.user) {
        const userId = order.user._id.toString();
        userSpent[userId] = (userSpent[userId] || 0) + order.total;
      }
    });
    const recentUsersWithSpent = recentUsers.map(user => ({
      ...user.toObject(),
      totalSpent: userSpent[user._id.toString()] || 0
    }));

    const bestSellers = await Product.find().sort({ sold: -1 }).limit(5);
    const newArrivals = await Product.find().sort({ createdAt: -1 }).limit(5);

    res.render('admin/dashboard', {
      totalUsers,
      totalOrders,
      totalProducts,
      totalIncome,
      recentUsers: recentUsersWithSpent,
      bestSellers,
      newArrivals,
      currentPage: 'dashboard',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

// ==================== USER ====================
router.get('/users', isAdmin, async (req, res) => {
  try {
    const { search, level } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (level && level !== 'all') {
      query.level = level;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const users = await User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    res.render('admin/user', {
      users,
      search: search || '',
      level: level || 'all',
      currentPage: 'users',
      totalPages,
      limit,
      totalUsers,
      query: req.query,
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

router.post('/users', isAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, level } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      req.flash('error', 'Email already exists');
      return res.redirect('/admin/users');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ firstName, lastName, email, phone, password: hashedPassword, level: level || 'Normal' });
    await newUser.save();
    req.flash('success', 'User added successfully');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error adding user');
    res.redirect('/admin/users');
  }
});

router.put('/users/:id', isAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, level } = req.body;
    const updateData = { firstName, lastName, email, phone, level };
    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }
    await User.findByIdAndUpdate(req.params.id, updateData);
    req.flash('success', 'User updated successfully');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error updating user');
    res.redirect('/admin/users');
  }
});

router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    req.flash('success', 'Xóa người dùng thành công');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

// ==================== PRODUCT ====================
router.get('/products', isAdmin, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (status && status !== 'all') query.status = status;

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const products = await Product.find(query)
      .populate('category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    res.render('admin/product', {
      products,
      search: search || '',
      status: status || 'all',
      currentPage: 'products',
      totalPages,
      limit,
      totalProducts,
      query: req.query,
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

router.get('/products/add', isAdmin, async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/add', { product: null, categories, currentPage: 'products', layout: 'layouts/admin' });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/products');
  }
});

router.post('/products', isAdmin, async (req, res) => {
  try {
    const { name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description, imageUrl } = req.body;

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      req.flash('error', 'Category không hợp lệ');
      return res.redirect('/admin/products/add');
    }

    const newProduct = new Product({
      name,
      category,
      stock: parseInt(stock) || 0,
      originalPrice: parseFloat(originalPrice) || 0,
      salePrice: parseFloat(salePrice) || 0,
      discount: parseInt(discount) || 0,
      brand,
      ageRange,
      gender,
      description,
      imageUrl: imageUrl || '/images/placeholder.png',
      status: parseInt(stock) > 0 ? 'Active' : 'Out of Stock'
    });
    await newProduct.save();
    req.flash('success', 'Thêm sản phẩm thành công');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra: ' + err.message);
    res.redirect('/admin/products/add');
  }
});

router.get('/products/edit/:id', isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');
    const categories = await Category.find().sort({ name: 1 });
    if (!product) {
      req.flash('error', 'Không tìm thấy sản phẩm');
      return res.redirect('/admin/products');
    }
    res.render('admin/add', { product, categories, currentPage: 'products', layout: 'layouts/admin' });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/products');
  }
});

router.put('/products/:id', isAdmin, async (req, res) => {
  try {
    const { name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description, imageUrl } = req.body;

    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        req.flash('error', 'Category không hợp lệ');
        return res.redirect('/admin/products');
      }
    }

    const updateData = {
      name,
      category,
      stock: parseInt(stock) || 0,
      originalPrice: parseFloat(originalPrice) || 0,
      salePrice: parseFloat(salePrice) || 0,
      discount: parseInt(discount) || 0,
      brand,
      ageRange,
      gender,
      description,
      status: parseInt(stock) > 0 ? 'Active' : 'Out of Stock'
    };
    if (imageUrl) updateData.imageUrl = imageUrl;

    await Product.findByIdAndUpdate(req.params.id, updateData);
    req.flash('success', 'Cập nhật sản phẩm thành công');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra: ' + err.message);
    res.redirect('/admin/products');
  }
});

router.delete('/products/:id', isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    req.flash('success', 'Xóa sản phẩm thành công');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/products');
  }
});

// ==================== ORDER ====================
router.get('/orders', isAdmin, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'user.firstName': { $regex: search, $options: 'i' } },
        { 'user.lastName': { $regex: search, $options: 'i' } },
        { 'user.email': { $regex: search, $options: 'i' } }
      ];
    }
    if (status && status !== 'all') query.status = status;

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find(query)
      .populate('user', 'firstName lastName email')
      .populate('products.product')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('admin/order', {
      orders,
      search: search || '',
      status: status || 'all',
      currentPage: 'orders',
      totalPages,
      limit,
      totalOrders,
      query: req.query,
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

router.put('/orders/:id', isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      req.flash('error', 'Không tìm thấy đơn hàng');
      return res.redirect('/admin/orders');
    }

    const allowedTransitions = {
      'Pending': ['Shipping', 'Reject'],
      'Shipping': ['Complete'],
      'Complete': [],
      'Reject': []
    };
    if (!allowedTransitions[order.status].includes(status)) {
      req.flash('error', `Không thể chuyển trạng thái từ ${order.status} sang ${status}`);
      return res.redirect('/admin/orders');
    }

    order.status = status;
    await order.save();
    req.flash('success', 'Cập nhật trạng thái đơn hàng thành công');
    res.redirect('/admin/orders');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/orders');
  }
});

// ==================== CATEGORY ====================
router.get('/categories', isAdmin, async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/category', {
      categories,
      currentPage: 'categories',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

router.post('/categories', isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      req.flash('error', 'Category name is required');
      return res.redirect('/admin/categories');
    }
    const existing = await Category.findOne({ name: { $regex: new RegExp('^' + name + '$', 'i') } });
    if (existing) {
      req.flash('error', 'Category already exists');
      return res.redirect('/admin/categories');
    }
    await Category.create({ name });
    req.flash('success', 'Category added successfully');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error adding category');
    res.redirect('/admin/categories');
  }
});

router.put('/categories/:id', isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      req.flash('error', 'Category name is required');
      return res.redirect('/admin/categories');
    }
    const existing = await Category.findOne({
      name: { $regex: new RegExp('^' + name + '$', 'i') },
      _id: { $ne: req.params.id }
    });
    if (existing) {
      req.flash('error', 'Another category with this name already exists');
      return res.redirect('/admin/categories');
    }
    await Category.findByIdAndUpdate(req.params.id, { name });
    req.flash('success', 'Category updated successfully');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error updating category');
    res.redirect('/admin/categories');
  }
});

router.delete('/categories/:id', isAdmin, async (req, res) => {
  try {
    const productsUsing = await Product.findOne({ category: req.params.id });
    if (productsUsing) {
      req.flash('error', 'Cannot delete category because it has products');
      return res.redirect('/admin/categories');
    }
    await Category.findByIdAndDelete(req.params.id);
    req.flash('success', 'Category deleted successfully');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error deleting category');
    res.redirect('/admin/categories');
  }
});

module.exports = router;