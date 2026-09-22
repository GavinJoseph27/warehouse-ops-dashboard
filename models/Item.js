// models/Item.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  quantity: { type: Number, required: true, default: 0 },
  zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
  demandScore: { type: Number, default: 0 }, // higher = ordered more often
  lastMovedAt: { type: Date, default: Date.now }, // used for "dead stock" detection
});

module.exports = mongoose.model('Item', itemSchema);