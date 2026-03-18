require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    await Product.deleteMany({});
    console.log('Đã xóa tất cả sản phẩm');
    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });