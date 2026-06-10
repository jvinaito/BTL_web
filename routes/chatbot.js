const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');

const CHATBOT_URL = process.env.CHATBOT_URL || 'http://localhost:5001/chat';
const SUGGEST_URL = process.env.CHATBOT_URL
  ? process.env.CHATBOT_URL.replace('/chat', '/suggest')
  : 'http://localhost:5001/suggest';
const TIMEOUT_MS = 8000;

const checkoutState = new Map();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ──────────────────────────────────────────────────────────────
// 1. Thêm vào giỏ hàng
// ──────────────────────────────────────────────────────────────
async function handleAddToCart(req, res, action) {
  if (!req.session) return res.json({ reply: 'Lỗi session. Tải lại trang.', products: [] });
  if (!req.session.cart) req.session.cart = [];

  const productName = action.product_name;
  const quantity = action.quantity || 1;
  const safeName = escapeRegex(productName);

  try {
    let product = await Product.findOne({ searchName: { $regex: safeName, $options: 'i' } });
    if (!product) product = await Product.findOne({ name: { $regex: safeName, $options: 'i' } });
    if (!product) return res.json({ reply: `❌ Không tìm thấy sản phẩm "${productName}"`, products: [] });

    const cart = req.session.cart;
    const existing = cart.find(item => item.product._id.toString() === product._id.toString());
    if (existing) existing.quantity += quantity;
    else cart.push({ product: { _id: product._id, name: product.name, salePrice: product.salePrice, imageUrl: product.imageUrl }, quantity });
    req.session.cart = cart;
    return res.json({ reply: `✅ Đã thêm ${quantity} "${product.name}" vào giỏ!`, products: [] });
  } catch (err) {
    console.error('[AddToCart]', err);
    return res.json({ reply: '❌ Lỗi thêm giỏ hàng', products: [] });
  }
}

// ──────────────────────────────────────────────────────────────
// 2. Xử lý checkout (bước 1: hiển thị xác nhận + nút bấm)
// ──────────────────────────────────────────────────────────────
async function handleCheckout(req, res, action) {
  if (!req.session) return res.json({ reply: 'Lỗi hệ thống.', products: [] });
  if (!req.session.user) return res.json({ reply: '🔐 Bạn cần đăng nhập để thanh toán.', products: [] });

  const cart = req.session.cart || [];
  if (cart.length === 0) return res.json({ reply: '🛒 Giỏ hàng trống.', products: [] });

  const subtotal = cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);
  const total = subtotal;

  const user = await User.findById(req.session.user._id);
  let defaultAddress = user?.defaultAddress || '';
  if (!defaultAddress) {
    const lastOrder = await Order.findOne({ user: user._id }).sort({ createdAt: -1 });
    if (lastOrder && lastOrder.shippingAddress && lastOrder.shippingAddress.city) {
      defaultAddress = lastOrder.shippingAddress.city;
    }
  }

  checkoutState.set(req.session.id, { step: 'awaiting_confirm', total, defaultAddress });

  let msg = `📦 Xác nhận đặt hàng với tổng tiền $${total.toFixed(2)}. `;
  if (defaultAddress) {
    msg += `Địa chỉ mặc định: "${defaultAddress}". Bạn có muốn đặt hàng không?`;
  } else {
    msg += `Bạn chưa có địa chỉ. Vui lòng cung cấp địa chỉ (vd: "123 Lê Lợi, P.Bến Nghé, Q.1, TP HCM").`;
  }

  return res.json({
    reply: msg,
    products: [],
    quick_replies: defaultAddress
      ? [{ label: '✅ Có, đặt hàng ngay', value: 'có' }, { label: '❌ Không, huỷ', value: 'không' }]
      : []
  });
}

// ──────────────────────────────────────────────────────────────
// 3. Xác nhận checkout (bước 2) – TẠO ORDER NGAY
// ──────────────────────────────────────────────────────────────
async function handleCheckoutConfirm(req, res, action) {
  const sessionId = req.session.id;
  const state = checkoutState.get(sessionId);
  if (!state) {
    return res.json({ reply: 'Không có yêu cầu đặt hàng nào đang chờ. Gõ "đặt hàng" để bắt đầu.', products: [] });
  }

  if (action.confirm === true) {
    if (!state.defaultAddress) {
      // Nếu chưa có địa chỉ -> chuyển sang bước nhập địa chỉ
      checkoutState.set(sessionId, { step: 'awaiting_address', total: state.total });
      return res.json({ reply: 'Vui lòng cung cấp địa chỉ giao hàng (ví dụ: "123 Đường Lê Lợi, P.Bến Nghé, Q.1, TP HCM").', products: [] });
    }

    // Có địa chỉ -> tạo đơn hàng luôn
    try {
      const cart = req.session.cart || [];
      if (cart.length === 0) {
        checkoutState.delete(sessionId);
        return res.json({ reply: 'Giỏ hàng trống. Không thể đặt hàng.', products: [] });
      }

      // Tính subtotal, discount, shipping
      let subtotal = 0;
      for (let item of cart) subtotal += item.product.salePrice * item.quantity;

      let discount = 0;
      if (req.session.user.level === 'Vip') discount = subtotal * 0.2;
      else if (req.session.user.level === 'Admin') discount = subtotal;

      // Tính phí ship dựa trên tỉnh trong defaultAddress
      let shipping = 50;
      const provinceMatch = state.defaultAddress.match(/Tỉnh\s+(.+)$|Thành phố\s+(.+)$/);
      let province = provinceMatch ? (provinceMatch[1] || provinceMatch[2]) : '';
      if (province) {
        const removeTones = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
        if (removeTones(province).toLowerCase().includes('ha noi')) shipping = 0;
      }
      const total = subtotal + shipping - discount;

      // Kiểm tra tồn kho và lưu orderProducts
      const orderProducts = [];
      for (let item of cart) {
        const product = await Product.findById(item.product._id);
        if (!product || product.stock < item.quantity) {
          checkoutState.delete(sessionId);
          return res.json({ reply: `Sản phẩm ${item.product.name} không đủ hàng.`, products: [] });
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
          street: state.defaultAddress.split(',')[0] || '',
          city: state.defaultAddress,
          phone: req.session.user.phone || ''
        }
      });
      await order.save();

      // Xoá giỏ hàng và trạng thái checkout
      req.session.cart = [];
      checkoutState.delete(sessionId);
      return res.json({ reply: `🎉 Đặt hàng thành công! Mã đơn: ${orderId}. Cảm ơn bạn đã mua sắm.`, products: [] });
    } catch (err) {
      console.error('[Checkout] Order creation error:', err);
      checkoutState.delete(sessionId);
      return res.json({ reply: '❌ Có lỗi xảy ra khi đặt hàng. Vui lòng thử lại.', products: [] });
    }
  } else {
    checkoutState.delete(sessionId);
    return res.json({ reply: '🙅 Đã hủy đặt hàng. Cảm ơn bạn!', products: [] });
  }
}

// ──────────────────────────────────────────────────────────────
// 4. Hàm phụ trợ: nhận diện yes/no
// ──────────────────────────────────────────────────────────────
function resolveCheckoutReply(message) {
  const yes = /^(có|co|yes|y|xác nhận|xac nhan|đồng ý|dong y|ok|oke|okay|đặt|dat)$/i.test(message.trim());
  const no  = /^(không|khong|no|n|hủy|huy|cancel|thôi|thoi|bỏ|bo)$/i.test(message.trim());
  if (yes) return true;
  if (no)  return false;
  return null;
}

// ──────────────────────────────────────────────────────────────
// 5. Route chính
// ──────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  const userMessage = (req.body.message || '').trim();
  if (!userMessage) return res.status(400).json({ error: 'Tin nhắn trống' });
  if (userMessage.length > 500) return res.status(400).json({ error: 'Tin nhắn quá dài' });

  const sessionId = req.session.id;
  const state = checkoutState.get(sessionId);

  // Ưu tiên xử lý trạng thái checkout (đang chờ xác nhận hoặc nhập địa chỉ)
  if (state) {
    if (state.step === 'awaiting_confirm') {
      const answer = resolveCheckoutReply(userMessage);
      if (answer !== null) {
        return handleCheckoutConfirm(req, res, { confirm: answer });
      }
      return res.json({
        reply: '❓ Vui lòng trả lời "có" hoặc "không".',
        products: [],
        quick_replies: [{ label: '✅ Có', value: 'có' }, { label: '❌ Không', value: 'không' }]
      });
    }

    if (state.step === 'awaiting_address') {
      const address = userMessage.trim();
      if (address.length > 10) {
        await User.findByIdAndUpdate(req.session.user._id, { defaultAddress: address });
        checkoutState.set(sessionId, { step: 'awaiting_confirm', total: state.total, defaultAddress: address });
        return res.json({
          reply: `✅ Đã lưu địa chỉ: "${address}". Bạn có muốn đặt hàng không?`,
          products: [],
          quick_replies: [{ label: '✅ Có', value: 'có' }, { label: '❌ Không', value: 'không' }]
        });
      } else {
        return res.json({ reply: 'Địa chỉ quá ngắn. Vui lòng nhập đầy đủ.', products: [] });
      }
    }
  }

  // Không có trạng thái checkout → gọi Python chatbot
  try {
    const response = await axios.post(CHATBOT_URL, { message: userMessage }, { timeout: TIMEOUT_MS });
    let reply = response.data?.reply;
    const products = response.data?.products || [];

    let action = null;
    try {
      const parsed = JSON.parse(reply);
      if (parsed.__action__) action = parsed.__action__;
    } catch (e) {}

    if (action) {
      if (action.action === 'add_to_cart') return await handleAddToCart(req, res, action);
      if (action.action === 'checkout') return handleCheckout(req, res, action);
      if (action.action === 'checkout_confirm') return handleCheckoutConfirm(req, res, action);
      return res.json({ reply: '⚠️ Không hiểu yêu cầu.', products: [] });
    }

    if (!reply) return res.status(502).json({ error: 'Chatbot lỗi' });
    return res.json({ reply, products });
  } catch (err) {
    console.error('[Chatbot]', err);
    if (err.code === 'ECONNABORTED') return res.status(504).json({ error: 'Quá thời gian chờ' });
    if (err.response) return res.status(502).json({ error: 'Lỗi từ chatbot service' });
    return res.status(503).json({ error: 'Không kết nối được chatbot' });
  }
});

// ──────────────────────────────────────────────────────────────
// 6. Gợi ý tìm kiếm
// ──────────────────────────────────────────────────────────────
router.get('/suggest', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ suggestions: [] });
  try {
    const response = await axios.get(SUGGEST_URL, { params: { q }, timeout: 3000 });
    return res.json({ suggestions: response.data?.suggestions || [] });
  } catch (err) {
    return res.json({ suggestions: [] });
  }
});

module.exports = router;