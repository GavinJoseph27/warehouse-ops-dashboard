// models/Movement.js
const mongoose = require('mongoose');

const movementSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  fromZone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
  toZone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
  quantity: { type: Number, required: true },
  reason: { type: String, enum: ['order', 'restock', 'reorganization'], required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Movement', movementSchema);