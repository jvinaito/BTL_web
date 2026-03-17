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
// Dashboard
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

    // Lấy 5 người dùng mới nhất và tổng tiền đã chi của họ
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5);
    const userSpent = {};
    const completedOrders = await Order.find({ status: 'Complete' }).populate('user');
    completedOrders.forEach(order => {
      if (order.user) {
        const userId = order.user._id.toString();
        userSpent[userId] = (userSpent[userId] || 0) + order.total;
      }
    });

    // Gắn tổng tiền vào mỗi user
    const recentUsersWithSpent = recentUsers.map(user => ({
      ...user.toObject(),
      totalSpent: userSpent[user._id.toString()] || 0
    }));

    // Lấy sản phẩm bán chạy nhất
    const bestSellers = await Product.find().sort({ sold: -1 }).limit(5);

    // Lấy sản phẩm mới nhất (New arrivals)
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

// Quản lý User
router.get('/users', isAdmin, async (req, res) => {
  try {
    const { search, level } = req.query;
    let query = {};

    // Tìm kiếm theo tên, email, phone
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Lọc theo level
    if (level && level !== 'all') {
      query.level = level;
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    res.render('admin/user', {
      users,
      search: search || '',
      level: level || 'all',
      currentPage: 'users',
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
    // Kiểm tra email đã tồn tại chưa
    const existing = await User.findOne({ email });
    if (existing) {
      req.flash('error', 'Email already exists');
      return res.redirect('/admin/users');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      level: level || 'Normal'
    });
    await newUser.save();
    req.flash('success', 'User added successfully');
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error adding user');
    res.redirect('/admin/users');
  }
});

// Sửa user
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

// Quản lý Sản phẩm
router.get('/products', isAdmin, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};

    // Tìm kiếm theo tên sản phẩm
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Lọc theo trạng thái
    if (status && status !== 'all') {
      query.status = status;
    }

    const products = await Product.find(query).sort({ createdAt: -1 });

    res.render('admin/product', {
      products,
      search: search || '',
      status: status || 'all',
      currentPage: 'products',
      layout: 'layouts/admin'
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/admin/dashboard');
  }
});


// Thêm sản phẩm
router.get('/products/add', isAdmin, (req, res) => {
  res.render('admin/add', { product: null, layout: 'layouts/admin' });
});

router.post('/products', isAdmin, async (req, res) => {
  try {
    const { name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description, imageUrl } = req.body;
    // Nếu không có imageUrl, dùng ảnh mặc định
    const finalImageUrl = imageUrl || '/images/placeholder.png';
    const newProduct = new Product({
      name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description,
      imageUrl: finalImageUrl,
      status: stock > 0 ? 'Active' : 'Out of Stock'
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

// Sửa sản phẩm (form)
router.get('/products/edit/:id', isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    res.render('admin/add', { product, layout: 'layouts/admin' });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/products');
  }
});

router.put('/products/:id', isAdmin, async (req, res) => {
  try {
    const { name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description, imageUrl } = req.body;
    const updateData = {
      name, category, stock, originalPrice, salePrice, discount, brand, ageRange, gender, description,
      status: stock > 0 ? 'Active' : 'Out of Stock'
    };
    if (imageUrl) {
      updateData.imageUrl = imageUrl;
    }
    await Product.findByIdAndUpdate(req.params.id, updateData);
    req.flash('success', 'Cập nhật sản phẩm thành công');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
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

// Quản lý Đơn hàng
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
    if (status && status !== 'all') {
      query.status = status;
    }
    const orders = await Order.find(query)
      .populate('user', 'firstName lastName email')
      .populate('products.product')
      .sort({ createdAt: -1 });
    
    res.render('admin/order', {
      orders,
      search: search || '',
      status: status || 'all',
      currentPage: 'orders',
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

    // Logic kiểm tra chuyển trạng thái hợp lệ
    const currentStatus = order.status;
    const allowedTransitions = {
      'Pending': ['Shipping', 'Reject'],
      'Shipping': ['Complete'],
      'Complete': [],
      'Reject': []
    };

    if (!allowedTransitions[currentStatus].includes(status)) {
      req.flash('error', `Không thể chuyển trạng thái từ ${currentStatus} sang ${status}`);
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

module.exports = router;