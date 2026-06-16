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
const searchState = new Map();
const pendingViewDetail = new Map();

const CONFIRM_VIEW_WORDS = ['ok', 'oke', 'okay', 'xem', 'đồng ý', 'vâng', 'ừ', 'uh', 'đi', 'đi xem', 'mở', 'xem thử', 'xem trực tiếp', 'xem ngay'];
const CANCEL_VIEW_WORDS = ['không', 'thôi', 'hủy', 'bỏ', 'cancel', 'quay lại'];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Hàm chuẩn hóa tên sản phẩm
function normalizeProductName(name) {
  if (!name) return '';
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return normalized.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Hàm so khớp tên sản phẩm trong giỏ
function findCartItem(cart, productName) {
  if (!cart || cart.length === 0) return -1;
  const searchName = normalizeProductName(productName);
  if (!searchName) return -1;

  for (let i = 0; i < cart.length; i++) {
    const itemName = normalizeProductName(cart[i].product.name);
    if (itemName.includes(searchName) || searchName.includes(itemName)) {
      return i;
    }
  }

  const searchWords = searchName.split(' ');
  for (let i = 0; i < cart.length; i++) {
    const itemName = normalizeProductName(cart[i].product.name);
    let matchCount = 0;
    for (const word of searchWords) {
      if (word.length >= 2 && itemName.includes(word)) {
        matchCount++;
      }
    }
    if (searchWords.length > 0 && matchCount >= Math.ceil(searchWords.length / 2)) {
      return i;
    }
  }
  return -1;
}

/* ──────────────────────────────────────────────────────────────
   1. Thêm giỏ hàng
────────────────────────────────────────────────────────────── */
async function handleAddToCart(req, res, action) {
  if (!req.session) return res.json({ reply: 'Lỗi session. Tải lại trang.', products: [] });
  if (!req.session.cart) req.session.cart = [];

  const quantity = action.quantity || 1;
  let product = null;

  if (action.product_id) {
    product = await Product.findById(action.product_id);
  } else if (action.product_name) {
    const safeName = escapeRegex(action.product_name);
    product = await Product.findOne({ searchName: { $regex: safeName, $options: 'i' } });
    if (!product) product = await Product.findOne({ name: { $regex: safeName, $options: 'i' } });
  }

  if (!product) {
    const name = action.product_name || action.product_id || 'không xác định';
    return res.json({ reply: `❌ Không tìm thấy sản phẩm "${name}"`, products: [] });
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
      quantity
    });
  }
  req.session.cart = cart;
  return res.json({ reply: `✅ Đã thêm ${quantity} "${product.name}" vào giỏ!`, products: [] });
}

/* ──────────────────────────────────────────────────────────────
   2. Xem giỏ hàng
────────────────────────────────────────────────────────────── */
function handleViewCart(req, res) {
  const cart = req.session.cart || [];
  if (cart.length === 0) {
    return res.json({ reply: '🛒 Giỏ hàng của bạn đang trống.', products: [] });
  }

  let reply = '🛒 **Giỏ hàng của bạn:**\n';
  let total = 0;
  cart.forEach((item, idx) => {
    const price = item.product.salePrice || 0;
    const subtotal = price * item.quantity;
    total += subtotal;
    reply += `${idx + 1}. ${item.product.name} - ${price.toLocaleString('vi-VN')}đ x ${item.quantity} = ${subtotal.toLocaleString('vi-VN')}đ\n`;
  });
  reply += `\n💰 **Tổng cộng:** ${total.toLocaleString('vi-VN')}đ`;
  reply += `\n\n📌 Lệnh nhanh: "xóa [tên]" hoặc "xóa số [STT]" để xóa | "sửa [tên] thành [SL]" hoặc "sửa số [STT] thành [SL]"`;

  return res.json({ reply, products: [] });
}

/* ──────────────────────────────────────────────────────────────
   3. Sửa số lượng sản phẩm trong giỏ
────────────────────────────────────────────────────────────── */
async function handleUpdateCart(req, res, action) {
  if (!req.session) return res.json({ reply: 'Lỗi session.', products: [] });
  if (!req.session.cart || req.session.cart.length === 0) {
    return res.json({ reply: '🛒 Giỏ hàng trống.', products: [] });
  }

  const cart = req.session.cart;
  let idx = -1;
  const quantity = action.quantity || 1;

  if (action.index) {
    idx = action.index - 1;
  } else if (action.product_name) {
    idx = findCartItem(cart, action.product_name);
  }

  if (idx < 0 || idx >= cart.length) {
    const displayName = action.product_name || `số ${action.index}`;
    return res.json({ reply: `❌ Không tìm thấy sản phẩm "${displayName}" trong giỏ.`, products: [] });
  }

  cart[idx].quantity = quantity;
  req.session.cart = cart;
  return res.json({ reply: `✅ Đã cập nhật số lượng "${cart[idx].product.name}" thành ${quantity}.` });
}

/* ──────────────────────────────────────────────────────────────
   4. Xóa sản phẩm khỏi giỏ
────────────────────────────────────────────────────────────── */
function handleRemoveFromCart(req, res, action) {
  if (!req.session) return res.json({ reply: 'Lỗi session.', products: [] });
  if (!req.session.cart || req.session.cart.length === 0) {
    return res.json({ reply: '🛒 Giỏ hàng trống.', products: [] });
  }

  const cart = req.session.cart;
  let idx = -1;

  if (action.index) {
    idx = action.index - 1;
  } else if (action.product_name) {
    idx = findCartItem(cart, action.product_name);
  }

  if (idx < 0 || idx >= cart.length) {
    const displayName = action.product_name || `số ${action.index}`;
    return res.json({ reply: `❌ Không tìm thấy sản phẩm "${displayName}" trong giỏ.`, products: [] });
  }

  const removed = cart.splice(idx, 1)[0];
  req.session.cart = cart;
  return res.json({ reply: `✅ Đã xóa "${removed.product.name}" khỏi giỏ hàng.`, products: [] });
}

/* ──────────────────────────────────────────────────────────────
   5. Xem chi tiết sản phẩm
────────────────────────────────────────────────────────────── */
async function handleViewDetail(req, res, action) {
  const sessionId = req.session.id;
  let product = null;

  if (action.product_id) {
    product = await Product.findById(action.product_id).lean();
  } else {
    const state = searchState.get(sessionId);
    if (state && state.products && state.products.length > 0) {
      const index = action.index - 1;
      if (index >= 0 && index < state.products.length) {
        product = state.products[index];
      }
    }
  }

  if (!product) {
    return res.json({
      reply: '❌ Không tìm thấy sản phẩm. Hãy tìm kiếm trước (vd: "gấu bông").',
      products: []
    });
  }

  pendingViewDetail.set(sessionId, product._id.toString());

  const price = product.salePrice ? product.salePrice.toLocaleString('vi-VN') : '?';
  const desc = product.description ? product.description.substring(0, 150) + '...' : 'Không có mô tả.';

  let reply = `📦 **${product.name}**\n`;
  reply += `💰 Giá: ${price}đ\n`;
  reply += `📝 Mô tả: ${desc}\n\n`;
  reply += `Bạn có muốn xem trực tiếp trên trang không?\n(Gõ "ok" hoặc "xem" để chuyển)`;

  return res.json({
    reply: reply,
    products: [],
    quick_replies: [
      { label: '👀 Xem trực tiếp', value: 'xem' }
    ]
  });
}

/* ──────────────────────────────────────────────────────────────
   6. Xử lý "Xem trực tiếp"
────────────────────────────────────────────────────────────── */
function handleViewNow(req, res) {
  const sessionId = req.session.id;
  const productId = pendingViewDetail.get(sessionId);
  if (!productId) {
    return res.json({
      reply: 'Không có sản phẩm nào để xem. Hãy gõ "xem [số]" trước.',
      products: []
    });
  }
  pendingViewDetail.delete(sessionId);
  return res.json({ redirect: `/products/${productId}` });
}

/* ──────────────────────────────────────────────────────────────
   7. Checkout
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
   8. Xác nhận checkout
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

      let shipping = 50000;
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
   9. Xem thêm (load more)
────────────────────────────────────────────────────────────── */
function handleLoadMore(req, res) {
  const sessionId = req.session.id;
  const state = searchState.get(sessionId);
  if (!state || !state.products || state.products.length === 0) {
    return res.json({ reply: '📭 Không có kết quả tìm kiếm nào trước đó.', products: [], has_more: false });
  }
  if (state.offset >= state.displayLimit) {
    return res.json({ reply: '📭 Đã hiển thị hết danh sách.', products: [], has_more: false });
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
    reply += '\n💡 Gõ "xem thêm" hoặc nhấn nút để xem tiếp.';
  } else {
    reply += '\n✅ Đã hiển thị hết danh sách.';
  }
  reply += '\n\n📌 Lệnh nhanh: "thêm 1" (thêm sp #1) | "thêm 2 cái 3" (2 cái sp #3) | "1" (xem chi tiết sp #1)';
  return res.json({ reply, products: moreProducts, has_more: hasMore });
}

/* ──────────────────────────────────────────────────────────────
   10. Hàm nhận diện yes/no
────────────────────────────────────────────────────────────── */
function resolveCheckoutReply(message) {
  const yes = /^(có|co|yes|y|xác nhận|xac nhan|đồng ý|dong y|ok|oke|okay|đặt|dat)$/i.test(message.trim());
  const no  = /^(không|khong|no|n|hủy|huy|cancel|thôi|thoi|bỏ|bo)$/i.test(message.trim());
  if (yes) return true;
  if (no)  return false;
  return null;
}

/* ──────────────────────────────────────────────────────────────
   11. Lịch sử đơn hàng
────────────────────────────────────────────────────────────── */
async function handleOrderHistory(req, res) {
  if (!req.session.user) {
    return res.json({ reply: '🔐 Vui lòng đăng nhập để xem lịch sử đơn hàng.', products: [] });
  }
  try {
    const orders = await Order.find({ user: req.session.user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    if (orders.length === 0) {
      return res.json({ reply: '📭 Bạn chưa có đơn hàng nào.', products: [] });
    }
    let reply = '📋 **Lịch sử đơn hàng (10 đơn gần nhất):**\n';
    orders.forEach((order, idx) => {
      const statusEmoji = order.status === 'Complete' ? '✅' : 
                         order.status === 'Shipping' ? '🚚' : 
                         order.status === 'Reject' ? '❌' : '⏳';
      reply += `${idx+1}. ${statusEmoji} ${order.orderId} - ${order.total.toLocaleString('vi-VN')}đ - ${order.status} (${new Date(order.createdAt).toLocaleDateString('vi-VN')})\n`;
    });
    reply += '\n💡 Gõ "xem đơn [số]" để xem chi tiết (vd: "xem đơn 2")';
    return res.json({ reply, products: [] });
  } catch (err) {
    console.error('[OrderHistory]', err);
    return res.json({ reply: '❌ Lỗi khi lấy lịch sử đơn hàng.', products: [] });
  }
}

/* ──────────────────────────────────────────────────────────────
   12. Đơn hàng gần nhất
────────────────────────────────────────────────────────────── */
async function handleLatestOrder(req, res) {
  if (!req.session.user) {
    return res.json({ reply: '🔐 Vui lòng đăng nhập để xem đơn hàng gần nhất.', products: [] });
  }
  try {
    const order = await Order.findOne({ user: req.session.user._id })
      .sort({ createdAt: -1 });
    if (!order) {
      return res.json({ reply: '📭 Bạn chưa có đơn hàng nào.', products: [] });
    }
    const statusEmoji = order.status === 'Complete' ? '✅' : 
                       order.status === 'Shipping' ? '🚚' : 
                       order.status === 'Reject' ? '❌' : '⏳';
    let reply = `📦 **Đơn hàng gần nhất:**\n`;
    reply += `${statusEmoji} Mã: ${order.orderId}\n`;
    reply += `💰 Tổng: ${order.total.toLocaleString('vi-VN')}đ\n`;
    reply += `📌 Trạng thái: ${order.status}\n`;
    reply += `📅 Ngày: ${new Date(order.createdAt).toLocaleString('vi-VN')}\n`;
    if (order.shippingAddress && order.shippingAddress.city) {
      reply += `📍 Địa chỉ: ${order.shippingAddress.city}\n`;
    }
    reply += `\n📌 Gõ "xem đơn 1" (hoặc số tương ứng trong danh sách) để xem chi tiết.`;
    return res.json({ reply, products: [] });
  } catch (err) {
    console.error('[LatestOrder]', err);
    return res.json({ reply: '❌ Lỗi khi lấy đơn hàng gần nhất.', products: [] });
  }
}

/* ──────────────────────────────────────────────────────────────
   13. Kiểm tra trạng thái đơn hàng theo mã
────────────────────────────────────────────────────────────── */
async function handleOrderStatus(req, res, action) {
  if (!req.session.user) {
    return res.json({ reply: '🔐 Vui lòng đăng nhập để kiểm tra đơn hàng.', products: [] });
  }
  const orderId = action.orderId;
  if (!orderId) {
    return res.json({ reply: '⚠️ Vui lòng cung cấp mã đơn hàng (vd: "đơn ORD123456").', products: [] });
  }
  try {
    const order = await Order.findOne({ orderId: orderId, user: req.session.user._id });
    if (!order) {
      return res.json({ reply: `❌ Không tìm thấy đơn hàng "${orderId}".`, products: [] });
    }
    const statusEmoji = order.status === 'Complete' ? '✅' : 
                       order.status === 'Shipping' ? '🚚' : 
                       order.status === 'Reject' ? '❌' : '⏳';
    let reply = `📄 **Chi tiết đơn hàng:**\n`;
    reply += `${statusEmoji} Mã: ${order.orderId}\n`;
    reply += `💰 Tổng: ${order.total.toLocaleString('vi-VN')}đ\n`;
    reply += `📌 Trạng thái: ${order.status}\n`;
    reply += `📅 Ngày: ${new Date(order.createdAt).toLocaleString('vi-VN')}\n`;
    if (order.shippingAddress && order.shippingAddress.city) {
      reply += `📍 Địa chỉ: ${order.shippingAddress.city}\n`;
    }
    reply += '\n📦 **Sản phẩm:**\n';
    if (order.products && order.products.length > 0) {
      for (const item of order.products) {
        if (item.product) {
          const product = await Product.findById(item.product);
          if (product) {
            reply += `- ${product.name} x ${item.quantity} = ${(item.price * item.quantity).toLocaleString('vi-VN')}đ\n`;
          }
        }
      }
    } else {
      reply += 'Không có sản phẩm chi tiết.\n';
    }
    return res.json({ reply, products: [] });
  } catch (err) {
    console.error('[OrderStatus]', err);
    return res.json({ reply: '❌ Lỗi khi kiểm tra đơn hàng.', products: [] });
  }
}

/* ──────────────────────────────────────────────────────────────
   14. Chi tiết đơn hàng theo số thứ tự (từ lịch sử)
────────────────────────────────────────────────────────────── */
async function handleOrderDetailByIndex(req, res, action) {
  if (!req.session.user) {
    return res.json({ reply: '🔐 Vui lòng đăng nhập để xem chi tiết đơn hàng.', products: [] });
  }
  try {
    const orders = await Order.find({ user: req.session.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    const idx = action.index - 1;
    if (idx < 0 || idx >= orders.length) {
      return res.json({ reply: `❌ Không có đơn hàng số ${action.index} trong danh sách.`, products: [] });
    }
    const order = orders[idx];
    const statusEmoji = order.status === 'Complete' ? '✅' : 
                       order.status === 'Shipping' ? '🚚' : 
                       order.status === 'Reject' ? '❌' : '⏳';
    let reply = `📄 **Chi tiết đơn hàng:**\n`;
    reply += `${statusEmoji} Mã: ${order.orderId}\n`;
    reply += `📅 Ngày: ${new Date(order.createdAt).toLocaleString('vi-VN')}\n`;
    reply += `💰 Tổng: ${order.total.toLocaleString('vi-VN')}đ\n`;
    reply += `📌 Trạng thái: ${order.status}\n`;
    if (order.shippingAddress && order.shippingAddress.city) {
      reply += `📍 Địa chỉ: ${order.shippingAddress.city}\n`;
    }
    reply += '\n📦 **Sản phẩm:**\n';
    if (order.products && order.products.length > 0) {
      for (const item of order.products) {
        if (item.product) {
          const product = await Product.findById(item.product);
          if (product) {
            reply += `- ${product.name} x ${item.quantity} = ${(item.price * item.quantity).toLocaleString('vi-VN')}đ\n`;
          }
        }
      }
    } else {
      reply += 'Không có sản phẩm chi tiết.\n';
    }
    return res.json({ reply, products: [] });
  } catch (err) {
    console.error('[OrderDetailByIndex]', err);
    return res.json({ reply: '❌ Lỗi khi lấy chi tiết đơn hàng.', products: [] });
  }
}

/* ──────────────────────────────────────────────────────────────
   15. Tìm đơn hàng theo tên sản phẩm
────────────────────────────────────────────────────────────── */
async function handleOrderDetailByProduct(req, res, action) {
  if (!req.session.user) {
    return res.json({ reply: '🔐 Vui lòng đăng nhập để xem đơn hàng.', products: [] });
  }
  const productName = action.product_name;
  if (!productName || productName.length < 2) {
    return res.json({ reply: '⚠️ Vui lòng nhập tên sản phẩm (vd: "đơn gấu bông").', products: [] });
  }
  try {
    const orders = await Order.find({ user: req.session.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    const matchedOrders = [];
    for (const order of orders) {
      for (const item of order.products) {
        if (item.product) {
          const product = await Product.findById(item.product);
          if (product && product.name.toLowerCase().includes(productName.toLowerCase())) {
            matchedOrders.push(order);
            break;
          }
        }
      }
    }
    if (matchedOrders.length === 0) {
      return res.json({ reply: `❌ Không tìm thấy đơn hàng nào có sản phẩm "${productName}".`, products: [] });
    }
    let reply = `📋 **Đơn hàng có sản phẩm "${productName}":**\n`;
    matchedOrders.forEach((order, idx) => {
      reply += `${idx+1}. ${order.orderId} - ${order.total.toLocaleString('vi-VN')}đ - ${order.status} (${new Date(order.createdAt).toLocaleDateString('vi-VN')})\n`;
    });
    reply += '\n💡 Gõ "xem đơn [số]" để xem chi tiết.';
    return res.json({ reply, products: [] });
  } catch (err) {
    console.error('[OrderDetailByProduct]', err);
    return res.json({ reply: '❌ Lỗi khi tìm đơn hàng.', products: [] });
  }
}

/* ──────────────────────────────────────────────────────────────
   16. Route chính
────────────────────────────────────────────────────────────── */
router.post('/message', async (req, res) => {
  const userMessage = (req.body.message || '').trim();
  if (!userMessage) return res.status(400).json({ error: 'Tin nhắn trống' });
  if (userMessage.length > 500) return res.status(400).json({ error: 'Tin nhắn quá dài' });

  const sessionId = req.session.id;
  const lowerMsg = userMessage.toLowerCase();

  if (lowerMsg === 'xem thêm' || lowerMsg === 'xem tiếp') {
    return handleLoadMore(req, res);
  }

  // Xử lý pending view detail
  if (pendingViewDetail.has(sessionId)) {
    if (CONFIRM_VIEW_WORDS.includes(lowerMsg)) {
      return handleViewNow(req, res);
    }
    if (CANCEL_VIEW_WORDS.includes(lowerMsg)) {
      pendingViewDetail.delete(sessionId);
      return res.json({ reply: '🚫 Đã hủy xem chi tiết.', products: [] });
    }
    pendingViewDetail.delete(sessionId);
  }

  // Checkout state
  const state = checkoutState.get(sessionId);
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

    // Parse JSON action từ reply
    let action = null;
    try {
      const parsed = JSON.parse(reply);
      if (parsed.__action__) {
        action = parsed.__action__;
        console.log('[Node] Parsed action:', action);
      }
    } catch (e) {
      console.log('[Node] Reply is not JSON action, treat as normal text.');
    }

    // Xử lý action
    if (action) {
      console.log('[Node] Handling action:', action);

      // Xử lý các action giỏ hàng
      if (action.action === 'cart_view') {
        return handleViewCart(req, res);
      }
      if (action.action === 'cart_update' || action.action === 'cart_update_by_index') {
        return await handleUpdateCart(req, res, action);
      }
      if (action.action === 'cart_remove' || action.action === 'cart_remove_by_index') {
        return handleRemoveFromCart(req, res, action);
      }

      // Xử lý đơn hàng
      if (action.action === 'order_history') {
        return await handleOrderHistory(req, res);
      }
      if (action.action === 'latest_order') {
        return await handleLatestOrder(req, res);
      }
      if (action.action === 'order_status') {
        return await handleOrderStatus(req, res, action);
      }
      if (action.action === 'order_detail_by_index') {
        return await handleOrderDetailByIndex(req, res, action);
      }
      if (action.action === 'order_detail_by_product') {
        return await handleOrderDetailByProduct(req, res, action);
      }

      // Các action khác
      if (action.action === 'add_to_cart' || action.action === 'add_by_index') {
        return await handleAddToCart(req, res, action);
      }
      if (action.action === 'view_detail') {
        return await handleViewDetail(req, res, action);
      }
      if (action.action === 'checkout') {
        return handleCheckout(req, res, action);
      }
      if (action.action === 'checkout_confirm') {
        return handleCheckoutConfirm(req, res, action);
      }
      return res.json({ reply: '⚠️ Không hiểu yêu cầu.', products: [] });
    }

    // Xử lý các tag đặc biệt (fallback khi Python không trả về JSON action)
    if (reply === '__view_cart__') {
      return handleViewCart(req, res);
    }
    if (reply === '__order_history__') {
      return await handleOrderHistory(req, res);
    }
    if (reply === '__latest_order__') {
      return await handleLatestOrder(req, res);
    }
    if (reply && reply.startsWith('__order_status__')) {
      // Nếu có mã đơn trong reply thì parse, nếu không thì hỏi
      const match = userMessage.match(/(ORD\d+)/i);
      if (match) {
        return await handleOrderStatus(req, res, { orderId: match[1] });
      }
      return res.json({ reply: '⚠️ Vui lòng cung cấp mã đơn hàng (vd: "đơn ORD123456").', products: [] });
    }

    if (!reply) return res.status(502).json({ error: 'Chatbot lỗi' });

    // Lưu kết quả tìm kiếm
    const allProducts = response.data?.all_products || [];
    console.log(`[Node] allProducts count: ${allProducts.length}`);
    if (allProducts.length > 0) {
      const isBestSeller = /best.?seller|bán chạy|phổ biến|hot/i.test(userMessage);
      const displayLimit = isBestSeller ? Math.min(allProducts.length, 10) : allProducts.length;
      searchState.set(sessionId, {
        products: allProducts,
        total: allProducts.length,
        displayLimit,
        offset: Math.min(5, allProducts.length),
        isBestSeller,
      });
    }

    let finalReply = reply;
    const savedState = allProducts.length > 0 ? searchState.get(sessionId) : null;
    const hasMore = !!(savedState && savedState.offset < savedState.displayLimit);
    if (products && products.length > 0) {
      finalReply += `\n\n📌 Lệnh nhanh: "thêm 1" (thêm sp #1) | "thêm 2 cái 3" (2 cái sp #3) | "1" (xem chi tiết sp #1)`;
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
   17. Gợi ý tìm kiếm
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