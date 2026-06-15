// cleanOrders.js
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const orders = await Order.find();
  for (let order of orders) {
    const originalLength = order.products.length;
    order.products = order.products.filter(item => item.product != null);
    if (order.products.length !== originalLength) {
      await order.save();
      console.log(`Đã xóa ${originalLength - order.products.length} item khỏi đơn ${order.orderId}`);
    }
  }
  console.log('Hoàn tất dọn dẹp');
  process.exit();
});