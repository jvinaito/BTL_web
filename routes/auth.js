const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');

// Đăng nhập
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { layout: 'layouts/main' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error', 'Email không tồn tại');
      return res.redirect('/auth/login');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.flash('error', 'Mật khẩu không đúng');
      return res.redirect('/auth/login');
    }
    req.session.user = user;
    req.flash('success', 'Đăng nhập thành công');
    if (user.level === 'Admin') {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/');
    }
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/auth/login');
  }
});

// Đăng ký
router.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('signup', { layout: 'layouts/main' });
});

router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, phone, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    req.flash('error', 'Mật khẩu xác nhận không khớp');
    return res.redirect('/auth/signup');
  }
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      req.flash('error', 'Email đã được sử dụng');
      return res.redirect('/auth/signup');
    }
    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({
      firstName,
      lastName,
      email,
      phone,
      password: hashed,
      level: 'Normal'
    });
    await newUser.save();
    req.flash('success', 'Đăng ký thành công, vui lòng đăng nhập');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Có lỗi xảy ra');
    res.redirect('/auth/signup');
  }
});

// Quên mật khẩu (giả lập – chỉ hiển thị form)
router.get('/forgot', (req, res) => {
  res.render('forgotpass', { layout: 'layouts/main' });
});

router.post('/forgot', async (req, res) => {
  // Giả lập gửi email, ở đây chỉ redirect sang verify
  req.flash('success', 'Mã xác thực đã gửi đến email (demo)');
  res.redirect('/auth/verify');
});

// Xác thực mã (demo)
router.get('/verify', (req, res) => {
  res.render('verify', { layout: 'layouts/main' });
});

router.post('/verify', (req, res) => {
  res.redirect('/auth/setpass');
});

// Đặt lại mật khẩu (demo)
router.get('/setpass', (req, res) => {
  res.render('setpass', { layout: 'layouts/main' });
});

router.post('/setpass', async (req, res) => {
  // Ở demo này ta chỉ redirect về login
  req.flash('success', 'Mật khẩu đã được đặt lại (demo)');
  res.redirect('/auth/login');
});

// Đăng xuất
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

module.exports = router;