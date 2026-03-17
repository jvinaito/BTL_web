const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  stock: { type: Number, default: 0 },
  originalPrice: { type: Number, required: true },
  salePrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  brand: { type: String },
  ageRange: { type: String },
  gender: { type: String, enum: ['Unisex', 'Boy', 'Girl'], default: 'Unisex' },
  description: { type: String },
  imageUrl: { type: String, default: '/images/placeholder.png' },
  status: { type: String, enum: ['Active', 'Out of Stock'], default: 'Active' },
  sold: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);