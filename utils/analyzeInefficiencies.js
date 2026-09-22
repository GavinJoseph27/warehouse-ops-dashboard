// utils/analyzeInefficiencies.js
// Scans all zones and items and returns a list of flagged problems:
// overstocked/understocked zones, dead stock, and poor item slotting.

const Item = require('../models/Item');
const Zone = require('../models/Zone');

const DEAD_STOCK_DAYS = 30;       // no movement in 30+ days = flagged
const OVERSTOCK_THRESHOLD = 0.9;  // 90%+ full = overstocked
const UNDERSTOCK_THRESHOLD = 0.2; // under 20% full = understocked
const HIGH_DEMAND_SCORE = 70;     // demandScore above this = "high demand"
const FAR_FROM_DOCK = 30;         // distanceFromDock above this = "far"

async function analyzeInefficiencies() {
  const zones = await Zone.find();
  const items = await Item.find().populate('zone');
  const warnings = [];

  checkZoneCapacity(zones, items, warnings);
  checkDeadStock(items, warnings);
  checkSlottingMismatch(items, warnings);

  return warnings;
}

// Flags zones that are over or under their target capacity
function checkZoneCapacity(zones, items, warnings) {
  for (const zone of zones) {
    const zoneItems = items.filter(i => i.zone._id.equals(zone._id));
    const used = zoneItems.reduce((sum, i) => sum + i.quantity, 0);
    const percentFull = used / zone.capacity;

    if (percentFull >= OVERSTOCK_THRESHOLD) {
      warnings.push({
        type: 'overstock',
        severity: 'high',
        zone: zone.name,
        message: `${zone.name} is ${Math.round(percentFull * 100)}% full → approaching capacity`,
      });
    } else if (percentFull <= UNDERSTOCK_THRESHOLD) {
      warnings.push({
        type: 'understock',
        severity: 'low',
        zone: zone.name,
        message: `${zone.name} is only ${Math.round(percentFull * 100)}% full → underutilized space`,
      });
    }
  }
}

// Flags items that haven't moved in a long time
function checkDeadStock(items, warnings) {
  const now = new Date();
  for (const item of items) {
    const daysSinceMoved = Math.floor((now - item.lastMovedAt) / (1000 * 60 * 60 * 24));
    if (daysSinceMoved >= DEAD_STOCK_DAYS) {
      warnings.push({
        type: 'dead_stock',
        severity: 'medium',
        zone: item.zone.name,
        message: `${item.name} (${item.sku}) hasn't moved in ${daysSinceMoved} days`,
      });
    }
  }
}

// Flags high-demand items stored far from the dock (should be closer for faster picking)
function checkSlottingMismatch(items, warnings) {
  for (const item of items) {
    if (item.demandScore >= HIGH_DEMAND_SCORE && item.zone.distanceFromDock >= FAR_FROM_DOCK) {
      warnings.push({
        type: 'slotting_mismatch',
        severity: 'high',
        zone: item.zone.name,
        message: `${item.name} (${item.sku}) has high demand (${item.demandScore}) but is stored ${item.zone.distanceFromDock}m from the dock`,
      });
    }
  }
}

module.exports = analyzeInefficiencies;