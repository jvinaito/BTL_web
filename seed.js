// seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Seeding...');

    // Xóa dữ liệu cũ (nếu cần)
    await User.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});

    // Tạo admin
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: await bcrypt.hash('admin123', 10),
      level: 'Admin'
    });

    // Tạo user thường
    const user = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '123456789',
      password: await bcrypt.hash('password', 10)
    });

    // Tạo sản phẩm mẫu
    const product1 = await Product.create({
      name: 'Blocks shape-sorting Toy',
      category: 'Educational Toys',
      stock: 100,
      originalPrice: 39,
      salePrice: 29,
      discount: 10,
      brand: 'ToyBrand',
      ageRange: '2-4',
      gender: 'Unisex',
      description: 'Fun educational toy',
      imageUrl: 'https://i.ibb.co/DHLJgQKR/image.png',
      sold: 50
    });

    const product2 = await Product.create({
      name: 'Wooden Carrot Harvest',
      category: 'Playsets',
      stock: 50,
      originalPrice: 45,
      salePrice: 39,
      discount: 0,
      brand: 'WoodToy',
      ageRange: '3+',
      gender: 'Unisex',
      description: 'Harvest carrot toy',
      imageUrl: 'https://i.ibb.co/DHLJgQKR/image.png',
      sold: 20
    });

    console.log('Seed completed');
    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });