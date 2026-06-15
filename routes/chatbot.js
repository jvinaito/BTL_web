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
const searchState = new Map(); // key: sessionId, value: { products, total, offset }

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ──────────────────────────────────────────────────────────────
   1. Thêm vào giỏ hàng
────────────────────────────────────────────────────────────── */
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

/* ──────────────────────────────────────────────────────────────
   2. Xử lý checkout (bước 1: hiển thị xác nhận + nút bấm)
────────────────────────────────────────────────────────────── */
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

  let msg = `📦 Xác nhận đặt hàng với tổng tiền ${total.toLocaleString('vi-VN')}đ. `;
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

/* ──────────────────────────────────────────────────────────────
   3. Xác nhận checkout (bước 2) – TẠO ORDER NGAY
────────────────────────────────────────────────────────────── */
async function handleCheckoutConfirm(req, res, action) {
  const sessionId = req.session.id;
  const state = checkoutState.get(sessionId);
  if (!state) {
    return res.json({ reply: 'Không có yêu cầu đặt hàng nào đang chờ. Gõ "đặt hàng" để bắt đầu.', products: [] });
  }

  if (action.confirm === true) {
    if (!state.defaultAddress) {
      checkoutState.set(sessionId, { step: 'awaiting_address', total: state.total });
      return res.json({ reply: 'Vui lòng cung cấp địa chỉ giao hàng (ví dụ: "123 Đường Lê Lợi, P.Bến Nghé, Q.1, TP HCM").', products: [] });
    }

    try {
      const cart = req.session.cart || [];
      if (cart.length === 0) {
        checkoutState.delete(sessionId);
        return res.json({ reply: 'Giỏ hàng trống. Không thể đặt hàng.', products: [] });
      }

      let subtotal = 0;
      for (let item of cart) subtotal += item.product.salePrice * item.quantity;

      let discount = 0;
      if (req.session.user.level === 'Vip') discount = subtotal * 0.2;
      else if (req.session.user.level === 'Admin') discount = subtotal;

      let shipping = 50;
      const provinceMatch = state.defaultAddress.match(/Tỉnh\s+(.+)$|Thành phố\s+(.+)$/);
      let province = provinceMatch ? (provinceMatch[1] || provinceMatch[2]) : '';
      if (province) {
        const removeTones = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
        if (removeTones(province).toLowerCase().includes('ha noi')) shipping = 0;
      }
      const total = subtotal + shipping - discount;

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

/* ──────────────────────────────────────────────────────────────
   4. Xem thêm sản phẩm từ kết quả tìm kiếm trước đó
────────────────────────────────────────────────────────────── */
function handleLoadMore(req, res) {
  const sessionId = req.session.id;
  const state = searchState.get(sessionId);
  if (!state || !state.products || state.products.length === 0) {
    return res.json({ reply: '📭 Không có kết quả tìm kiếm nào trước đó. Hãy tìm kiếm trước khi dùng "xem thêm".', products: [], has_more: false });
  }
  if (state.offset >= state.displayLimit) {
    return res.json({ reply: `📭 Đã hiển thị hết danh sách. Không còn sản phẩm nào để xem thêm.`, products: [], has_more: false });
  }
  const from = state.offset;
  const nextOffset = Math.min(state.offset + 5, state.displayLimit);
  const moreProducts = state.products.slice(from, nextOffset);
  state.offset = nextOffset;
  searchState.set(sessionId, state);

  const hasMore = state.offset < state.displayLimit;
  let reply = `📦 Sản phẩm (${state.offset}/${state.displayLimit}):\n`;
  moreProducts.forEach((p, idx) => {
    reply += `${from + idx + 1}. ${p.name} – ${Number(p.salePrice).toLocaleString('vi-VN')}đ\n`;
  });
  if (hasMore) {
    reply += `\n💡 Gõ "xem thêm" hoặc nhấn nút để xem tiếp.`;
  } else {
    reply += `\n✅ Đã hiển thị hết danh sách.`;
  }
  // Hướng dẫn lệnh nhanh
  reply += `\n\n📌 Lệnh nhanh: "thêm 1" (thêm sp #1) | "thêm 2 cái 3" (thêm 2 cái sp #3)`;
  return res.json({ reply, products: moreProducts, has_more: hasMore });
}

/* ──────────────────────────────────────────────────────────────
   5. Hàm phụ trợ: nhận diện yes/no
────────────────────────────────────────────────────────────── */
function resolveCheckoutReply(message) {
  const yes = /^(có|co|yes|y|xác nhận|xac nhan|đồng ý|dong y|ok|oke|okay|đặt|dat)$/i.test(message.trim());
  const no  = /^(không|khong|no|n|hủy|huy|cancel|thôi|thoi|bỏ|bo)$/i.test(message.trim());
  if (yes) return true;
  if (no)  return false;
  return null;
}

/* ──────────────────────────────────────────────────────────────
   6. Route chính
────────────────────────────────────────────────────────────── */
router.post('/message', async (req, res) => {
  const userMessage = (req.body.message || '').trim();
  if (!userMessage) return res.status(400).json({ error: 'Tin nhắn trống' });
  if (userMessage.length > 500) return res.status(400).json({ error: 'Tin nhắn quá dài' });

  const sessionId = req.session.id;
  const state = checkoutState.get(sessionId);
  const lowerMsg = userMessage.toLowerCase();

  // Ưu tiên xem thêm (trước checkout)
  if (lowerMsg === 'xem thêm' || lowerMsg === 'xem tiếp') {
    return handleLoadMore(req, res);
  }

  // Xử lý trạng thái checkout
  if (state) {
    if (state.step === 'awaiting_confirm') {
      const answer = resolveCheckoutReply(userMessage);
      if (answer !== null) return handleCheckoutConfirm(req, res, { confirm: answer });
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

  // Gọi Python chatbot
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

    // Lưu kết quả tìm kiếm vào searchState (nếu có sản phẩm)
    const allProducts = response.data?.all_products || [];
    if (allProducts.length > 0) {
      const isBestSeller = /best.?seller|bán chạy|phổ biến|hot/i.test(userMessage);
      // Best seller giới hạn tối đa 10, còn lại hiển thị hết
      const displayLimit = isBestSeller ? Math.min(allProducts.length, 10) : allProducts.length;
      searchState.set(sessionId, {
        products: allProducts,
        total: allProducts.length,
        displayLimit,
        offset: Math.min(5, allProducts.length), // đã hiển thị 5 cái đầu
        isBestSeller,
      });
    }

    // Thêm hướng dẫn lệnh nhanh + "xem thêm" vào reply nếu có sản phẩm
    let finalReply = reply;
    const savedState = allProducts.length > 0 ? searchState.get(sessionId) : null;
    const hasMore = !!(savedState && savedState.offset < savedState.displayLimit);
    if (products && products.length > 0) {
      finalReply += `\n\n📌 Lệnh nhanh: "thêm 1" (thêm sp #1) | "thêm 2 cái 3" (2 cái sp #3)`;
      if (hasMore) finalReply += ` | "xem thêm" (còn ${savedState.displayLimit - savedState.offset} sp nữa)`;
    }
    return res.json({ reply: finalReply, products, has_more: hasMore });
  } catch (err) {
    console.error('[Chatbot]', err);
    if (err.code === 'ECONNABORTED') return res.status(504).json({ error: 'Quá thời gian chờ' });
    if (err.response) return res.status(502).json({ error: 'Lỗi từ chatbot service' });
    return res.status(503).json({ error: 'Không kết nối được chatbot' });
  }
});

/* ──────────────────────────────────────────────────────────────
   7. Gợi ý tìm kiếm
────────────────────────────────────────────────────────────── */
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