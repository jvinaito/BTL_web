require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const ttsProxy = require('./tts-proxy');

// Kết nối MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware cơ bản
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// ═══════════════════════════════════════════════════════════════
// SESSION – Phải đặt TRƯỚC các route cần dùng session
// ═══════════════════════════════════════════════════════════════
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // nếu dùng HTTPS thì đặt true
}));

// Flash messages
app.use(flash());

// Global variables cho view (search, user, flash)
app.use((req, res, next) => {
  res.locals.search = req.query.search || '';
  next();
});

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.user = req.session.user || null;
  next();
});

app.use((req, res, next) => {
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

// Helper format date cho view
app.locals.formatDate = function(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// View engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ═══════════════════════════════════════════════════════════════
// ROUTES (đặt SAU session)
// ═══════════════════════════════════════════════════════════════
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/products', require('./routes/products'));
app.use('/orders', require('./routes/orders'));
app.use('/admin', require('./routes/admin'));
app.use('/address', require('./routes/address'));
app.use('/api/chatbot', require('./routes/chatbot')); // ← chatbot cần session
app.use('/api', ttsProxy);   // thêm dòng này TRƯỚC các route khác (hoặc cuối cùng cũng được)
app.use('/api', require('./routes/products'));
// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { layout: 'layouts/main' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));