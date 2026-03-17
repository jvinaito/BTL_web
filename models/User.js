const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  level: { type: String, enum: ['Admin', 'Vip', 'Normal'], default: 'Normal' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);