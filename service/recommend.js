// service/recommend.js (hoặc service/recommend/recommend.js)
const Product = require('../models/Product');
const Order = require('../models/Order');

async function getPersonalizedRecommendations(req, limit = 12) {
  const clickedIds = req.session.clickedProducts || [];
  const cartIds = (req.session.cart || []).map(item => item.product._id.toString());
  let purchasedIds = [];

  if (req.session.user) {
    const orders = await Order.find({ user: req.session.user._id, status: 'Complete' }).populate('products.product');
    purchasedIds = orders.flatMap(order => order.products.map(p => p.product._id.toString()));
  }

  const allInteractedIds = [...new Set([...clickedIds, ...cartIds, ...purchasedIds])];
  
  // Fallback khi chưa có tương tác: lấy bestseller + random
  if (allInteractedIds.length === 0) {
    let products = await Product.find({ status: 'Active', stock: { $gt: 0 } })
      .sort({ sold: -1 })
      .limit(limit * 2)
      .select('name salePrice imageUrl');
    // Shuffle toàn bộ để hiển thị ngẫu nhiên
    for (let i = products.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [products[i], products[j]] = [products[j], products[i]];
    }
    return products.slice(0, limit);
  }

  // Lấy sản phẩm đã tương tác để phân tích
  const interactedProducts = await Product.find({ _id: { $in: allInteractedIds } });
  const categoryCount = {};
  const brandCount = {};
  const keywordSet = new Set();
  interactedProducts.forEach(p => {
    if (p.category) categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
    if (p.brand) brandCount[p.brand] = (brandCount[p.brand] || 0) + 1;
    const words = p.name.toLowerCase().split(/\s+/);
    words.forEach(w => { if (w.length > 2 && !['cho','bé','trẻ','em','của','và','với','có','mà','cái','chiếc'].includes(w)) keywordSet.add(w); });
  });

  const topCategory = Object.keys(categoryCount).sort((a,b) => categoryCount[b] - categoryCount[a])[0];
  const topBrand = Object.keys(brandCount).sort((a,b) => brandCount[b] - brandCount[a])[0];
  const keywords = Array.from(keywordSet).slice(0, 5);

  // Xây dựng query gợi ý
  const query = {
    _id: { $nin: allInteractedIds },
    status: 'Active',
    stock: { $gt: 0 }
  };
  const conditions = [];
  if (topCategory) conditions.push({ category: topCategory });
  if (topBrand) conditions.push({ brand: topBrand });
  if (keywords.length) {
    const regex = keywords.map(k => `(?=.*${k})`).join('');
    conditions.push({ searchName: { $regex: regex, $options: 'i' } });
  }
  if (conditions.length) query.$or = conditions;

  let recommendations = await Product.find(query)
    .sort({ sold: -1 })
    .limit(limit * 2)
    .select('name salePrice imageUrl');

  // Bổ sung bestseller nếu chưa đủ
  if (recommendations.length < limit) {
    const bestsellers = await Product.find({
      status: 'Active',
      stock: { $gt: 0 },
      _id: { $nin: [...allInteractedIds, ...recommendations.map(p => p._id)] }
    }).sort({ sold: -1 }).limit(limit * 2 - recommendations.length).select('name salePrice imageUrl');
    recommendations = [...recommendations, ...bestsellers];
  }

  // Shuffle nhẹ: với xác suất 30%, đảo vị trí 2 phần tử bất kỳ
  // Giữ nguyên các sản phẩm đầu (liên quan cao) vẫn có cơ hội xuất hiện sớm
  const shuffled = [...recommendations];
  for (let i = shuffled.length - 1; i > 0; i--) {
    if (Math.random() < 0.3) {  // 30% cơ hội đảo
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  return shuffled.slice(0, limit);
}

// Hàm getSimilarProducts giữ nguyên (không thay đổi)
async function getSimilarProducts(product, limit = 12) {
  const query = {
    _id: { $ne: product._id },
    status: 'Active',
    stock: { $gt: 0 }
  };
  const conditions = [];
  if (product.category) conditions.push({ category: product.category });
  if (product.brand) conditions.push({ brand: product.brand });
  const keywords = product.name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['cho','bé','trẻ','em'].includes(w));
  if (keywords.length) {
    const regex = keywords.slice(0, 3).map(k => `(?=.*${k})`).join('');
    conditions.push({ searchName: { $regex: regex, $options: 'i' } });
  }
  if (conditions.length) query.$or = conditions;

  let similar = await Product.find(query)
    .sort({ sold: -1 })
    .limit(limit)
    .select('name salePrice imageUrl');

  if (similar.length < limit) {
    const more = await Product.find({
      status: 'Active',
      stock: { $gt: 0 },
      _id: { $ne: product._id, $nin: similar.map(p => p._id) }
    }).sort({ sold: -1 }).limit(limit - similar.length).select('name salePrice imageUrl');
    similar = [...similar, ...more];
  }
  return similar.slice(0, limit);
}

module.exports = { getPersonalizedRecommendations, getSimilarProducts };