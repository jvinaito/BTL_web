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

// Cấu hình multer
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

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const allUsers = await User.find();
    const completedOrdersThisMonth = await Order.find({
      status: 'Complete',
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('user');

    const userSpent = {};
    completedOrdersThisMonth.forEach(order => {
      if (order.user) {
        const userId = order.user._id.toString();
        userSpent[userId] = (userSpent[userId] || 0) + order.total;
      }
    });

    const usersWithSpent = allUsers.map(user => ({
      ...user.toObject(),
      totalSpent: userSpent[user._id.toString()] || 0
    }));

    const recentUsers = usersWithSpent
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    const bestSellers = await Product.find().sort({ sold: -1 }).limit(3);
    const newArrivals = await Product.find().sort({ createdAt: -1 }).limit(3);

    res.locals.currentPage = 'dashboard';
    res.render('admin/dashboard', {
      totalUsers,
      totalOrders,
      totalProducts,
      totalIncome,
      recentUsers,
      bestSellers,
      newArrivals,
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
    const { search, level, sort = 'date_desc' } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    if (level && level !== 'all') query.level = level;

    let users = await User.find(query).sort({ createdAt: -1 });
    const totalUsers = users.length;

    const userIds = users.map(u => u._id);
    const completedOrders = await Order.find({ user: { $in: userIds }, status: 'Complete' });
    const userSpent = {};
    completedOrders.forEach(order => {
      const userId = order.user.toString();
      userSpent[userId] = (userSpent[userId] || 0) + order.total;
    });

    users = users.map(user => ({
      ...user.toObject(),
      totalSpent: userSpent[user._id.toString()] || 0
    }));

    if (sort === 'amount_desc') {
      users.sort((a, b) => b.totalSpent - a.totalSpent);
    } else if (sort === 'amount_asc') {
      users.sort((a, b) => a.totalSpent - b.totalSpent);
    } else {
      users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const start = (page - 1) * limit;
    const paginatedUsers = users.slice(start, start + limit);
    const totalPages = Math.ceil(users.length / limit);

    res.locals.currentPage = 'users';
    res.render('admin/user', {
      users: paginatedUsers,
      search: search || '',
      level: level || 'all',
      sort: sort,
      currentPageNum: page,   // dùng cho phân trang nếu cần
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

    if (search) {
      const normalizedSearch = removeVietnameseTones(search);
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { searchName: { $regex: normalizedSearch, $options: 'i' } }
      ];
    }
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

    res.locals.currentPage = 'products';
    res.render('admin/product', {
      products,
      search: search || '',
      status: status || 'all',
      currentPageNum: page,
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
    res.locals.currentPage = 'products';
    res.render('admin/add', { product: null, categories, layout: 'layouts/admin' });
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

    const searchName = removeVietnameseTones(name);
    const newProduct = new Product({
      name,
      searchName,
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
    res.locals.currentPage = 'products';
    res.render('admin/add', { product, categories, layout: 'layouts/admin' });
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
    
    if (name) {
      updateData.searchName = removeVietnameseTones(name);
    }
    
    if (imageUrl && imageUrl.trim() !== '') {
      updateData.imageUrl = imageUrl;
    }

    await Product.findByIdAndUpdate(req.params.id, updateData, { runValidators: true });
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
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    let filter = {};
    if (status && status !== 'all') filter.status = status;

    let orders = await Order.find(filter)
      .populate('user', 'firstName lastName email')
      .populate('products.product')
      .sort({ createdAt: -1 });

    if (search) {
      const searchLower = search.toLowerCase();
      orders = orders.filter(order => {
        const matchOrderId = order.orderId.toLowerCase().includes(searchLower);
        const matchFirstName = order.user && order.user.firstName.toLowerCase().includes(searchLower);
        const matchLastName = order.user && order.user.lastName.toLowerCase().includes(searchLower);
        const matchEmail = order.user && order.user.email.toLowerCase().includes(searchLower);
        return matchOrderId || matchFirstName || matchLastName || matchEmail;
      });
    }

    const totalOrders = orders.length;
    const totalPages = Math.ceil(totalOrders / limit);
    const start = (page - 1) * limit;
    const paginatedOrders = orders.slice(start, start + limit);

    res.locals.currentPage = 'orders';
    res.render('admin/order', {
      orders: paginatedOrders,
      search: search || '',
      status: status || 'all',
      currentPageNum: page,
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
    const categories = await Category.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'category',
          as: 'products'
        }
      },
      {
        $project: {
          name: 1,
          createdAt: 1,
          productCount: { $size: '$products' }
        }
      },
      { $sort: { name: 1 } }
    ]);

    res.locals.currentPage = 'categories';
    res.render('admin/category', {
      categories,
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