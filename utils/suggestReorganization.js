// utils/suggestReorganization.js
// Generates concrete "move item X from zone Y to zone Z" recommendations
// based on relative zone utilization and item slotting, rather than fixed
// thresholds â€” so it always produces useful output regardless of exact data.

const Item = require('../models/Item');
const Zone = require('../models/Zone');

const REBALANCE_TARGETS = 3;      // compare top N fullest zones vs bottom N emptiest
const MIN_GAP_TO_SUGGEST = 0.1;   // zones must differ by 10%+ fill to bother suggesting
const MAX_SLOTTING_SUGGESTIONS = 5;

async function suggestReorganization() {
  const zones = await Zone.find();
  const items = await Item.find().populate('zone');

  const zoneUsage = buildZoneUsageMap(zones, items);
  const suggestions = [
    ...suggestRebalancing(zoneUsage),
    ...suggestSlotting(zones, items, zoneUsage),
  ];

  return suggestions;
}

// Precomputes each zone's current usage and fill percentage
function buildZoneUsageMap(zones, items) {
  const zoneUsage = {};
  for (const zone of zones) {
    const zoneItems = items.filter(i => i.zone._id.equals(zone._id));
    const used = zoneItems.reduce((sum, i) => sum + i.quantity, 0);
    zoneUsage[zone._id.toString()] = {
      zone,
      used,
      items: zoneItems,
      percentFull: used / zone.capacity,
    };
  }
  return zoneUsage;
}

// Suggests moving stock from the fullest zones into the emptiest zones
function suggestRebalancing(zoneUsage) {
  const suggestions = [];
  const allZones = Object.values(zoneUsage).sort((a, b) => b.percentFull - a.percentFull);
  const fullest = allZones.slice(0, REBALANCE_TARGETS);
  const emptiest = [...allZones].reverse().slice(0, REBALANCE_TARGETS);

  for (const over of fullest) {
    const target = emptiest.find(z => z.zone._id.toString() !== over.zone._id.toString());
    if (!target) continue;
    if (over.percentFull - target.percentFull < MIN_GAP_TO_SUGGEST) continue;

    // Move the lowest-demand item out first â€” least disruptive to picking
    const moveCandidate = [...over.items].sort((a, b) => a.demandScore - b.demandScore)[0];
    if (!moveCandidate) continue;

    const spaceAvailable = target.zone.capacity - target.used;
    const moveQty = Math.min(moveCandidate.quantity, Math.max(1, Math.floor(spaceAvailable * 0.5)));
    if (moveQty <= 0) continue;

    suggestions.push({
      type: 'rebalance',
      message: `Move ${moveQty} units of ${moveCandidate.name} (${moveCandidate.sku}) from ${over.zone.name} (${Math.round(over.percentFull * 100)}% full) to ${target.zone.name} (${Math.round(target.percentFull * 100)}% full)`,
    });
    target.used += moveQty; // update running total so we don't over-suggest into the same target
  }

  return suggestions;
}

// Suggests moving high-demand items closer to the dock for faster picking.
// "Far" is relative to the median zone distance, not a fixed cutoff.
function suggestSlotting(zones, items, zoneUsage) {
  const suggestions = [];

  const distances = zones.map(z => z.distanceFromDock).sort((a, b) => a - b);
  const medianDistance = distances[Math.floor(distances.length / 2)];

  const dockZones = zones
    .filter(z => z.distanceFromDock <= medianDistance)
    .sort((a, b) => a.distanceFromDock - b.distanceFromDock);

  const highDemandFar = items
    .filter(i => i.zone.distanceFromDock > medianDistance)
    .sort((a, b) => b.demandScore - a.demandScore)
    .slice(0, MAX_SLOTTING_SUGGESTIONS);

  for (const item of highDemandFar) {
    const bestDockZone = dockZones.find(z => {
      const usage = zoneUsage[z._id.toString()];
      return usage.used / z.capacity < 0.95; // has at least some room
    });
    if (!bestDockZone) continue;

    suggestions.push({
      type: 'slotting',
      message: `Move ${item.name} (${item.sku}, demand score ${item.demandScore}) from ${item.zone.name} (${item.zone.distanceFromDock}m from dock) to ${bestDockZone.name} (${bestDockZone.distanceFromDock}m from dock) for faster picking`,
    });
  }

  return suggestions;
}

module.exports = suggestReorganization;