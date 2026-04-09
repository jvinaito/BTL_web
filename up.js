// updateSearchName.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

function removeVietnameseTones(str) {
  str = str.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a');
  str = str.replace(/[èéẹẻẽêềếệểễ]/g, 'e');
  str = str.replace(/[ìíịỉĩ]/g, 'i');
  str = str.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o');
  str = str.replace(/[ùúụủũưừứựửữ]/g, 'u');
  str = str.replace(/[ỳýỵỷỹ]/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/Đ/g, 'D');
  return str.toLowerCase();
}

async function update() {
  await mongoose.connect(process.env.MONGO_URI);
  const products = await Product.find();
  for (let p of products) {
    p.searchName = removeVietnameseTones(p.name);
    await p.save();
  }
  console.log(`✅ Updated ${products.length} products.`);
  process.exit();
}
update();