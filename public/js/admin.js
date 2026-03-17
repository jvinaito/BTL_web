const router = require('express').Router();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');

// Middleware kiểm tra admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.level === 'Admin') {
    return next();
  }
  req.flash('error', 'Bạn không có quyền truy cập');
  res.redirect('/auth/login');
}

// Cấu hình multer cho upload ảnh
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Dashboard
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

    const recentOrders = await Order.find()
      .populate('user', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.render('admin/dashboard', {
      totalUsers,
      totalOrders,
      totalProducts,
      totalIncome,
      recentOrders,
      currentPage: 'dashboard',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

// Quản lý User
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.render('admin/user', {
      users,
      currentPage: 'users',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

// Xóa user
router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    req.flash('success', 'Xóa người dùng thành công');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/users');
  }
});

// Quản lý Sản phẩm
router.get('/products', isAdmin, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.render('admin/product', {
      products,
      currentPage: 'products',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

// Thêm sản phẩm (form)
router.get('/products/add', isAdmin, (req, res) => {
  res.render('admin/add', {
    product: null,
    currentPage: 'products',
    layout: 'layouts/admin'
  });
});

// Xử lý thêm sản phẩm
router.post('/products', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description } = req.body;
    const imageUrl = req.file ? '/uploads/' + req.file.filename : '/images/placeholder.png';
    
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
      imageUrl,
      status: stock > 0 ? 'Active' : 'Out of Stock'
    });
    
    await newProduct.save();
    req.flash('success', 'Thêm sản phẩm thành công');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra khi thêm sản phẩm');
    res.redirect('/admin/products/add');
  }
});

// Sửa sản phẩm (form)
router.get('/products/edit/:id', isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      req.flash('error', 'Không tìm thấy sản phẩm');
      return res.redirect('/admin/products');
    }
    res.render('admin/add', {
      product,
      currentPage: 'products',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/products');
  }
});

// Xử lý cập nhật sản phẩm
router.put('/products/:id', isAdmin, async (req, res) => {
  try {
    const { name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description, imageUrl } = req.body;

    // Chuyển đổi kiểu dữ liệu
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

    // Chỉ cập nhật imageUrl nếu có giá trị mới
    if (imageUrl && imageUrl.trim() !== '') {
      updateData.imageUrl = imageUrl;
    }

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    
    if (!updatedProduct) {
      req.flash('error', 'Không tìm thấy sản phẩm');
      return res.redirect('/admin/products');
    }

    req.flash('success', 'Cập nhật sản phẩm thành công');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Lỗi cập nhật sản phẩm:', err);
    req.flash('error', 'Lỗi: ' + err.message);
    res.redirect('/admin/products');
  }
});
// Xóa sản phẩm
router.delete('/products/:id', isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    req.flash('success', 'Xóa sản phẩm thành công');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/products');
  }
});

// Quản lý Đơn hàng
router.get('/orders', isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'firstName lastName email')
      .populate('products.product')
      .sort({ createdAt: -1 });
    
    res.render('admin/order', {
      orders,
      currentPage: 'orders',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});

// Cập nhật trạng thái đơn hàng
router.put('/orders/:id', isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await Order.findByIdAndUpdate(req.params.id, { status });
    req.flash('success', 'Cập nhật trạng thái đơn hàng thành công');
    res.redirect('/admin/orders');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/orders');
  }
});

module.exports = router;