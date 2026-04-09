const router = require('express').Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const bcrypt = require('bcrypt');

// Middleware kiểm tra đăng nhập
function isLoggedIn(req, res, next) {
  if (req.session.user) return next();
  req.flash('error', 'Vui lòng đăng nhập để tiếp tục');
  res.redirect('/auth/login');
}

// Lấy số lượng sản phẩm trong giỏ (dùng để cập nhật badge)
router.get('/cart/count', (req, res) => {
  const cart = req.session.cart || [];
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  res.json({ count });
});

// Xem giỏ hàng
router.get('/cart', (req, res) => {
  const cart = req.session.cart || [];
  res.render('cart', { cart, layout: 'layouts/main' });
});

// Thêm vào giỏ (AJAX)
router.post('/cart/add/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });
    }
    if (!req.session.cart) req.session.cart = [];
    const existing = req.session.cart.find(item => item.product._id == product._id);
    if (existing) {
      existing.quantity += 1;
    } else {
      req.session.cart.push({
        product: {
          _id: product._id,
          name: product.name,
          salePrice: product.salePrice,
          imageUrl: product.imageUrl
        },
        quantity: 1
      });
    }
    res.json({ success: true, message: 'Đã thêm vào giỏ hàng' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Có lỗi xảy ra' });
  }
});

// Cập nhật số lượng (AJAX, trả về JSON)
router.post('/cart/update/:id', (req, res) => {
  const { quantity } = req.body;
  const cart = req.session.cart || [];
  const item = cart.find(i => i.product._id == req.params.id);
  if (item) {
    item.quantity = parseInt(quantity);
    req.session.cart = cart;
    const cartTotal = cart.reduce((sum, i) => sum + i.product.salePrice * i.quantity, 0);
    return res.json({ success: true, cartTotal });
  }
  res.json({ success: false });
});

// Xóa khỏi giỏ
router.post('/cart/remove/:id', (req, res) => {
  req.session.cart = (req.session.cart || []).filter(i => i.product._id != req.params.id);
  res.redirect('/orders/cart');
});

// Trang thanh toán
router.get('/checkout', isLoggedIn, (req, res) => {
  const cart = req.session.cart || [];
  if (cart.length === 0) {
    req.flash('error', 'Giỏ hàng trống');
    return res.redirect('/products');
  }

  let subtotal = 0;
  cart.forEach(item => {
    subtotal += item.product.salePrice * item.quantity;
  });

  let discount = 0;
  if (req.session.user.level === 'Vip') {
    discount = subtotal * 0.2;
  } else if (req.session.user.level === 'Admin') {
    discount = subtotal;
  }

  res.render('checkout', {
    cart,
    subtotal,
    discount,
    user: req.session.user,
    layout: 'layouts/main'
  });
});

// Xử lý thanh toán
// Xử lý thanh toán
router.post('/checkout', isLoggedIn, async (req, res) => {
  const { street, province, district, ward, phone, fullAddress } = req.body;
  const cart = req.session.cart || [];
  if (cart.length === 0) {
    req.flash('error', 'Giỏ hàng trống');
    return res.redirect('/products');
  }

  try {
    // Lấy địa chỉ đầy đủ: ưu tiên fullAddress từ client, nếu không thì tự ghép
    let finalAddress = fullAddress;
    if (!finalAddress) {
      finalAddress = `${street ? street + ', ' : ''}${ward ? ward + ', ' : ''}${district ? district + ', ' : ''}${province || ''}`;
    }

    // Tính phí ship dựa trên province (Hà Nội = 0)
    let shipping = 50;
    const provinceLower = (province || '').toLowerCase();
    const removeTones = (str) => {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    };
    if (removeTones(provinceLower).includes('ha noi')) {
      shipping = 0;
    }

    // Tính subtotal, discount, total
    let subtotal = 0;
    for (let item of cart) subtotal += item.product.salePrice * item.quantity;

    let discount = 0;
    if (req.session.user.level === 'Vip') discount = subtotal * 0.2;
    else if (req.session.user.level === 'Admin') discount = subtotal;

    const total = subtotal + shipping - discount;

    // Kiểm tra tồn kho và cập nhật stock, sold
    const orderProducts = [];
    for (let item of cart) {
      const product = await Product.findById(item.product._id);
      if (!product || product.stock < item.quantity) {
        req.flash('error', `Sản phẩm ${item.product.name} không đủ hàng`);
        return res.redirect('/orders/cart');
      }
      product.stock -= item.quantity;
      product.sold += item.quantity;
      await product.save();
      orderProducts.push({
        product: product._id,
        quantity: item.quantity,
        price: product.salePrice
      });
    }

    const orderId = 'ORD' + Date.now();
    const order = new Order({
      orderId,
      user: req.session.user._id,
      products: orderProducts,
      total,
      status: 'Pending',
      shippingAddress: {
        street: street || '',
        city: finalAddress,         // lưu địa chỉ đầy đủ vào city
        phone: phone || ''
      }
    });
    await order.save();

    req.session.cart = [];
    req.flash('success', 'Đặt hàng thành công!');
    res.redirect('/orders/history');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra khi đặt hàng');
    res.redirect('/orders/cart');
  }
});

// Lịch sử đơn hàng
router.get('/history', isLoggedIn, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.session.user._id })
      .populate('products.product')
      .sort({ createdAt: -1 });
    res.render('history', { orders, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// Hồ sơ người dùng
router.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    res.render('profile', { user, layout: 'layouts/main' });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

router.put('/profile', isLoggedIn, async (req, res) => {
  const { firstName, lastName, phone, currentPassword, newPassword } = req.body;
  try {
    const user = await User.findById(req.session.user._id);
    if (currentPassword && newPassword) {
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        req.flash('error', 'Mật khẩu hiện tại không đúng');
        return res.redirect('/orders/profile');
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    await user.save();
    req.session.user = user;
    req.flash('success', 'Cập nhật thành công');
    res.redirect('/orders/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/orders/profile');
  }
});

module.exports = router;