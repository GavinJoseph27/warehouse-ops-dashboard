// models/Zone.js
const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  zoneId: { type: String, required: true, unique: true }, // e.g. "A1"
  name: { type: String, required: true },                  // e.g. "Zone A - Aisle 1"
  distanceFromDock: { type: Number, required: true },       // in meters, used for slotting logic
  capacity: { type: Number, required: true },               // max units this zone can hold
});

module.exports = mongoose.model('Zone', zoneSchema);

