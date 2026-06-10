const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');

const CHATBOT_URL = process.env.CHATBOT_URL || 'http://localhost:5001/chat';
const SUGGEST_URL = process.env.CHATBOT_URL
  ? process.env.CHATBOT_URL.replace('/chat', '/suggest')
  : 'http://localhost:5001/suggest';
const TIMEOUT_MS = 8000;

// Helper escape regex
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── Xử lý action "add_to_cart" ── */
async function handleAddToCart(req, res, action) {
  // Kiểm tra session
  if (!req.session) {
    console.error('[AddToCart] Session undefined');
    return res.json({ reply: 'Lỗi hệ thống (session). Vui lòng tải lại trang.', products: [] });
  }
  if (!req.session.cart) req.session.cart = [];

  const productName = action.product_name;
  const quantity = action.quantity || 1;
  const safeName = escapeRegex(productName);

  try {
    // Ưu tiên tìm theo searchName (không dấu)
    let product = await Product.findOne({ searchName: { $regex: safeName, $options: 'i' } });
    if (!product) {
      product = await Product.findOne({ name: { $regex: safeName, $options: 'i' } });
    }
    if (!product) {
      console.warn(`[AddToCart] Not found: "${productName}"`);
      return res.json({ reply: `❌ Không tìm thấy sản phẩm "${productName}". Vui lòng thử tên chính xác hơn.`, products: [] });
    }

    const cart = req.session.cart;
    const existing = cart.find(item => item.product._id.toString() === product._id.toString());
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        product: {
          _id: product._id,
          name: product.name,
          salePrice: product.salePrice,
          imageUrl: product.imageUrl
        },
        quantity: quantity
      });
    }
    req.session.cart = cart;
    return res.json({ reply: `✅ Đã thêm ${quantity} "${product.name}" vào giỏ hàng!`, products: [] });
  } catch (err) {
    console.error('[AddToCart] Error:', err);
    return res.json({ reply: '❌ Có lỗi xảy ra khi thêm vào giỏ. Vui lòng thử lại.', products: [] });
  }
}

/* ── Xử lý action "checkout" ── */
function handleCheckout(req, res) {
  if (!req.session) {
    return res.json({ reply: 'Lỗi hệ thống (session). Vui lòng tải lại trang.', products: [] });
  }
  if (!req.session.user) {
    return res.json({ reply: '🔐 Bạn cần đăng nhập để thanh toán. Vui lòng đăng nhập và thử lại.', products: [] });
  }
  const cart = req.session.cart || [];
  if (cart.length === 0) {
    return res.json({ reply: '🛒 Giỏ hàng của bạn đang trống. Hãy thêm sản phẩm trước khi thanh toán.', products: [] });
  }
  return res.json({ redirect: '/orders/checkout' });
}

/* ── Route chính ── */
router.post('/message', async (req, res) => {
  const userMessage = (req.body.message || '').trim();
  if (!userMessage) {
    return res.status(400).json({ error: 'Tin nhắn không được để trống.' });
  }
  if (userMessage.length > 500) {
    return res.status(400).json({ error: 'Tin nhắn quá dài (tối đa 500 ký tự).' });
  }

  try {
    const response = await axios.post(
      CHATBOT_URL,
      { message: userMessage },
      { timeout: TIMEOUT_MS }
    );
    let reply = response.data?.reply;
    const products = response.data?.products || [];

    // Kiểm tra xem reply có phải là action JSON không
    let action = null;
    try {
      const parsed = JSON.parse(reply);
      if (parsed.__action__) action = parsed.__action__;
    } catch (e) {
      // Không phải JSON, giữ nguyên reply
    }

    if (action) {
      if (action.action === 'add_to_cart') {
        return await handleAddToCart(req, res, action);
      } else if (action.action === 'checkout') {
        return handleCheckout(req, res);
      } else {
        return res.json({ reply: '⚠️ Tôi chưa hiểu yêu cầu này. Vui lòng thử lại.', products: [] });
      }
    } else {
      if (!reply) {
        return res.status(502).json({ error: 'Chatbot trả về phản hồi không hợp lệ.' });
      }
      return res.json({ reply, products });
    }
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[Chatbot] Timeout:', err.message);
      return res.status(504).json({ error: 'Chatbot phản hồi quá chậm. Vui lòng thử lại.' });
    }
    if (err.response) {
      console.error('[Chatbot] Service error:', err.response.status, err.response.data);
      return res.status(502).json({ error: 'Lỗi từ chatbot service.' });
    }
    console.error('[Chatbot] Connection error:', err.message);
    return res.status(503).json({ error: 'Không thể kết nối đến chatbot. Vui lòng thử lại sau.' });
  }
});

/* ── Autocomplete suggestions ── */
router.get('/suggest', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ suggestions: [] });

  try {
    const response = await axios.get(SUGGEST_URL, {
      params: { q },
      timeout: 3000,
    });
    return res.json({ suggestions: response.data?.suggestions || [] });
  } catch (err) {
    // Lỗi không critical, trả về rỗng
    return res.json({ suggestions: [] });
  }
});

module.exports = router;