require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const app = express();
const addressRoutes = require('./routes/address');
app.use('/address', addressRoutes);
// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // nếu dùng HTTPS thì đặt true
}));

// Flash messages
app.use(flash());
app.use((req, res, next) => {
  res.locals.search = req.query.search || '';
  next();
});
// Global variables cho flash và user
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.user = req.session.user || null;
  next();
});
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  const cart = req.session.cart || [];
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  res.locals.cartCount = cartCount;
  if (res.locals.user) {
    const crypto = require('crypto');
    const emailHash = crypto.createHash('md5').update(res.locals.user.email.trim().toLowerCase()).digest('hex');
    res.locals.avatarUrl = `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=32`;
  } else {
    res.locals.avatarUrl = null;
  }
  next();
});
app.locals.formatDate = function(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear(); // lấy 4 số
  return `${day}/${month}/${year}`;
};
// Thiết lập view engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(expressLayouts);
app.set('layout', 'layouts/main'); // layout mặc định

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/products', require('./routes/products'));
app.use('/orders', require('./routes/orders'));
app.use('/admin', require('./routes/admin'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { layout: 'layouts/main' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

