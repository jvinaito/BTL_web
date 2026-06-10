const mongoose = require('mongoose');

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

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  searchName: { type: String, required: true, index: true },
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

productSchema.pre('save', function() {
  if (this.isModified('name')) {
    this.searchName = removeVietnameseTones(this.name);
  }
});

module.exports = mongoose.model('Product', productSchema);