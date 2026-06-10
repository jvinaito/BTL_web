// service/adminChat/adminChat.js
const User = require('../../models/User');
const Order = require('../../models/Order');
const Product = require('../../models/Product');

async function getQuickStats() {
  const totalUsers = await User.countDocuments();
  const totalOrders = await Order.countDocuments();
  const totalIncomeAgg = await Order.aggregate([
    { $match: { status: 'Complete' } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);
  const totalIncome = totalIncomeAgg[0]?.total || 0;
  const lowStockProducts = await Product.find({ stock: { $lt: 5 }, status: 'Active' }).limit(5);
  const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'firstName lastName');
  const bestSellers = await Product.find().sort({ sold: -1 }).limit(3);
  return { totalUsers, totalOrders, totalIncome, lowStockProducts, recentOrders, bestSellers };
}

async function getOrdersByDate(startDate, endDate, status = null) {
  let query = { createdAt: { $gte: startDate, $lte: endDate } };
  if (status && status !== 'all') query.status = status;
  const orders = await Order.find(query)
    .populate('user', 'firstName lastName')
    .sort({ createdAt: -1 });
  return orders;
}

async function getTopUsers(limit = 5) {
  const result = await Order.aggregate([
    { $match: { status: 'Complete' } },
    { $group: { _id: '$user', totalSpent: { $sum: '$total' } } },
    { $sort: { totalSpent: -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { name: { $concat: ['$user.firstName', ' ', '$user.lastName'] }, totalSpent: 1 } }
  ]);
  return result;
}

async function processAdminMessage(message) {
  const msg = message.trim().toLowerCase();
  if (!msg) return 'Vui lòng nhập câu hỏi.';

  const stats = await getQuickStats();

  // Doanh thu
  if (msg.includes('doanh thu') || msg.includes('income') || msg.includes('thu nhập')) {
    return `💰 Tổng doanh thu hoàn thành: $${stats.totalIncome.toFixed(2)}`;
  }

  // Đơn hàng gần đây (mặc định 5 đơn)
  if (msg === 'đơn hàng' || msg === 'order' || msg === 'orders') {
    let reply = `📦 Tổng số đơn hàng: ${stats.totalOrders}. 5 đơn gần nhất:\n`;
    stats.recentOrders.forEach((o, i) => {
      reply += `${i+1}. ${o.orderId} - ${o.user?.firstName || 'N/A'} - $${o.total} - ${o.status}\n`;
    });
    return reply;
  }

  // Lọc đơn hàng theo trạng thái
  const statusMatch = msg.match(/đơn hàng (pending|shipping|complete|reject)/i);
  if (statusMatch) {
    const status = statusMatch[1].toLowerCase();
    const statusMap = { pending: 'Pending', shipping: 'Shipping', complete: 'Complete', reject: 'Reject' };
    const orders = await Order.find({ status: statusMap[status] })
      .populate('user', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(10);
    if (orders.length === 0) return `Không có đơn hàng nào ở trạng thái ${status}.`;
    let reply = `📋 Đơn hàng trạng thái ${status} (10 đơn gần nhất):\n`;
    orders.forEach((o, i) => {
      reply += `${i+1}. ${o.orderId} - ${o.user?.firstName || 'N/A'} - $${o.total}\n`;
    });
    return reply;
  }

  // Đơn hàng theo ngày (hôm nay, hôm qua, tuần này, tháng này)
  const now = new Date();
  let startDate, endDate;
  if (msg.includes('hôm nay')) {
    startDate = new Date(now.setHours(0,0,0,0));
    endDate = new Date(now.setHours(23,59,59,999));
    const orders = await getOrdersByDate(startDate, endDate);
    if (orders.length === 0) return 'Không có đơn hàng nào hôm nay.';
    let reply = '📅 Đơn hàng hôm nay:\n';
    orders.forEach((o, i) => reply += `${i+1}. ${o.orderId} - ${o.user?.firstName || 'N/A'} - $${o.total} - ${o.status}\n`);
    return reply;
  }
  if (msg.includes('hôm qua')) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    startDate = new Date(yesterday.setHours(0,0,0,0));
    endDate = new Date(yesterday.setHours(23,59,59,999));
    const orders = await getOrdersByDate(startDate, endDate);
    if (orders.length === 0) return 'Không có đơn hàng nào hôm qua.';
    let reply = '📅 Đơn hàng hôm qua:\n';
    orders.forEach((o, i) => reply += `${i+1}. ${o.orderId} - ${o.user?.firstName || 'N/A'} - $${o.total} - ${o.status}\n`);
    return reply;
  }
  if (msg.includes('tuần này')) {
    const start = new Date(now.setDate(now.getDate() - now.getDay()));
    start.setHours(0,0,0,0);
    const end = new Date(now.setDate(start.getDate() + 6));
    end.setHours(23,59,59,999);
    const orders = await getOrdersByDate(start, end);
    if (orders.length === 0) return 'Không có đơn hàng trong tuần này.';
    let reply = '📅 Đơn hàng tuần này (10 đơn gần nhất):\n';
    orders.slice(0,10).forEach((o, i) => reply += `${i+1}. ${o.orderId} - ${o.user?.firstName || 'N/A'} - $${o.total} - ${o.status}\n`);
    return reply;
  }
  if (msg.includes('tháng này')) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23,59,59,999);
    const orders = await getOrdersByDate(start, end);
    if (orders.length === 0) return 'Không có đơn hàng trong tháng này.';
    let reply = `📅 Đơn hàng tháng ${now.getMonth()+1} (10 đơn gần nhất):\n`;
    orders.slice(0,10).forEach((o, i) => reply += `${i+1}. ${o.orderId} - ${o.user?.firstName || 'N/A'} - $${o.total} - ${o.status}\n`);
    return reply;
  }

  // Top user
  if (msg.includes('top user') || msg.includes('top khách hàng') || msg.includes('khách hàng mua nhiều')) {
    const topUsers = await getTopUsers(5);
    if (topUsers.length === 0) return 'Chưa có dữ liệu.';
    let reply = '🏆 Top 5 khách hàng chi tiêu nhiều nhất:\n';
    topUsers.forEach((u, i) => {
      reply += `${i+1}. ${u.name} - $${u.totalSpent.toFixed(2)}\n`;
    });
    return reply;
  }

  // Tồn kho thấp
  if (msg.includes('tồn kho') || msg.includes('stock') || msg.includes('hết hàng') || msg.includes('sắp hết')) {
    if (stats.lowStockProducts.length === 0) return '✅ Không có sản phẩm nào tồn kho dưới 5.';
    let reply = `⚠️ Sản phẩm tồn kho thấp (<5):\n`;
    stats.lowStockProducts.forEach(p => reply += `• ${p.name} - còn ${p.stock}\n`);
    return reply;
  }

  // Bán chạy
  if (msg.includes('bán chạy') || msg.includes('best seller') || msg.includes('top')) {
    let reply = `🏆 Top sản phẩm bán chạy:\n`;
    stats.bestSellers.forEach((p, i) => reply += `${i+1}. ${p.name} - đã bán ${p.sold}\n`);
    return reply;
  }

  // Tìm đơn theo mã (chỉ xem, không duyệt)
  const findOrderMatch = msg.match(/tìm đơn\s+(.+)/i);
  if (findOrderMatch) {
    const code = findOrderMatch[1].trim();
    const order = await Order.findOne({ orderId: { $regex: code, $options: 'i' } }).populate('user');
    if (!order) return `Không tìm thấy đơn hàng "${code}".`;
    return `📄 Đơn ${order.orderId} - ${order.user?.firstName || 'N/A'} - $${order.total} - ${order.status}`;
  }

  // Tìm sản phẩm theo tên
  const findProductMatch = msg.match(/tìm sp\s+(.+)/i);
  if (findProductMatch) {
    const keyword = findProductMatch[1].trim();
    const products = await Product.find({ 
      name: { $regex: keyword, $options: 'i' },
      status: 'Active'
    }).limit(5).select('name salePrice stock');
    if (products.length === 0) return `Không tìm thấy sản phẩm nào với từ khóa "${keyword}".`;
    let reply = `🔍 Sản phẩm liên quan đến "${keyword}":\n`;
    products.forEach((p, i) => reply += `${i+1}. ${p.name} - $${p.salePrice} (tồn: ${p.stock})\n`);
    return reply;
  }

  // Fallback hướng dẫn
  return `🤖 Trợ lý Admin\nBạn có thể hỏi:\n` +
    `• "doanh thu" – xem tổng doanh thu\n` +
    `• "đơn hàng" – 5 đơn gần nhất\n` +
    `• "đơn hàng pending/shipping/complete/reject" – lọc theo trạng thái\n` +
    `• "hôm nay", "hôm qua", "tuần này", "tháng này" – đơn hàng theo ngày\n` +
    `• "top user" – top khách hàng chi tiêu\n` +
    `• "tồn kho" – sản phẩm sắp hết\n` +
    `• "bán chạy" – top sản phẩm\n` +
    `• "tìm đơn ORDxxx" – tìm đơn theo mã\n` +
    `• "tìm sp [tên]" – tìm sản phẩm`;
}

module.exports = { processAdminMessage };