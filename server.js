// server.js
// Entry point: sets up Express, connects to MongoDB, and defines all routes.

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

// Models
const Zone = require('./models/Zone');
const Item = require('./models/Item');
const Order = require('./models/Order');
const Movement = require('./models/Movement');

// Business logic
const analyzeInefficiencies = require('./utils/analyzeInefficiencies');
const suggestReorganization = require('./utils/suggestReorganization');

const app = express();
const PORT = process.env.PORT || 3000; // dynamic port for deployment

// --- Middleware / view setup ---
app.use(express.urlencoded({ extended: true })); // parse form submissions
app.set('view engine', 'pug');
app.set('views', './views');

app.use(express.static('public'));

// --- Database connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ============================================================
// ZONE ROUTES
// ============================================================

// Home page: grid of all zones with capacity usage
app.get('/', async (req, res, next) => {
  try {
    const zones = await Zone.find().sort({ zoneId: 1 });

    const zonesWithStats = await Promise.all(zones.map(async (zone) => {
      const items = await Item.find({ zone: zone._id });
      const used = items.reduce((sum, item) => sum + item.quantity, 0);
      // Guard against a zero (or missing) capacity producing Infinity/NaN
      const percentFull = zone.capacity > 0 ? Math.round((used / zone.capacity) * 100) : 0;
      return {
        ...zone.toObject(),
        used,
        percentFull,
        itemCount: items.length,
      };
    }));

    res.render('index', { zones: zonesWithStats });
  } catch (err) {
    next(err);
  }
});

// Single zone: table of items stored there
app.get('/zone/:id', async (req, res, next) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) return res.status(404).send('Zone not found');

    const items = await Item.find({ zone: zone._id }).sort({ demandScore: -1 });
    res.render('zone', { zone, items });
  } catch (err) {
    next(err); // e.g. malformed :id -> Mongoose CastError
  }
});

// ============================================================
// INSIGHTS & SUGGESTIONS
// ============================================================

// Flags overstock, understock, dead stock, and poor slotting
app.get('/insights', async (req, res, next) => {
  try {
    const warnings = await analyzeInefficiencies();

    const grouped = {
      overstock: warnings.filter(w => w.type === 'overstock'),
      understock: warnings.filter(w => w.type === 'understock'),
      dead_stock: warnings.filter(w => w.type === 'dead_stock'),
      slotting_mismatch: warnings.filter(w => w.type === 'slotting_mismatch'),
    };

    res.render('insights', { grouped, total: warnings.length });
  } catch (err) {
    next(err);
  }
});

// Suggests concrete inventory moves to fix the issues above
app.get('/suggestions', async (req, res, next) => {
  try {
    const suggestions = await suggestReorganization();
    res.render('suggestions', { suggestions });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// ORDER SIMULATION
// ============================================================

// Show the order form
app.get('/order', async (req, res, next) => {
  try {
    const items = await Item.find().populate('zone').sort({ name: 1 });
    res.render('order', { items, error: null });
  } catch (err) {
    next(err);
  }
});

// Process a submitted order: deducts stock, logs movement, creates order record
app.post('/order', async (req, res) => {
  try {
    let itemIds = req.body.itemId;
    let quantities = req.body.quantity;

    // Express doesn't wrap a single form row in an array
    if (!Array.isArray(itemIds)) itemIds = [itemIds];
    if (!Array.isArray(quantities)) quantities = [quantities];

    // --- Pass 1: validate every line before touching the database ---
    // (Previously, stock was deducted line-by-line inside a single loop, so a
    // failure on line 3 left lines 1-2 already deducted with no Order record
    // to account for them. Validating everything first avoids that partial-commit.)
    const lines = [];
    for (let i = 0; i < itemIds.length; i++) {
      const qty = parseInt(quantities[i], 10);
      if (!itemIds[i] || !qty || qty <= 0) continue; // skip blank rows

      const item = await Item.findById(itemIds[i]);
      if (!item) continue;

      if (item.quantity < qty) {
        const items = await Item.find().populate('zone').sort({ name: 1 });
        return res.render('order', {
          items,
          error: `Not enough stock for ${item.name} (only ${item.quantity} available)`,
        });
      }

      lines.push({ itemId: item._id, qty });
    }

    if (lines.length === 0) {
      const items = await Item.find().populate('zone').sort({ name: 1 });
      return res.render('order', { items, error: 'Please select at least one item and quantity.' });
    }

    // --- Pass 2: commit each line atomically ---
    // findOneAndUpdate with a quantity guard prevents two simultaneous orders
    // from both reading "enough stock" and overselling the same item.
    const orderLines = [];
    for (const { itemId, qty } of lines) {
      const updatedItem = await Item.findOneAndUpdate(
        { _id: itemId, quantity: { $gte: qty } },
        { $inc: { quantity: -qty }, $set: { lastMovedAt: new Date() } },
        { returnDocument: 'after' }
      );

      if (!updatedItem) {
        // Someone else took the stock between validation and commit
        const items = await Item.find().populate('zone').sort({ name: 1 });
        return res.render('order', {
          items,
          error: 'Stock changed while your order was processing - please try again.',
        });
      }

      await Movement.create({
        item: updatedItem._id,
        fromZone: updatedItem.zone,
        toZone: null, // shipped out of the warehouse
        quantity: qty,
        reason: 'order',
      });

      orderLines.push({ item: updatedItem._id, quantity: qty });
    }

    const order = await Order.create({
      orderId: `ORD-${Date.now()}`,
      items: orderLines,
      status: 'fulfilled',
    });

    res.render('order-confirmation', { order });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong processing the order.');
  }
});

// ============================================================
// ANALYTICS
// ============================================================

app.get('/analytics', async (req, res, next) => {
  try {
    const zones = await Zone.find().sort({ zoneId: 1 });
    const items = await Item.find();
    const orders = await Order.find().populate('items.item');
    const movements = await Movement.find().populate('item');

    // Total units currently stored per zone
    const inventoryByZone = zones.map(zone => {
      const zoneItems = items.filter(i => i.zone.toString() === zone._id.toString());
      return { name: zone.name, total: zoneItems.reduce((sum, i) => sum + i.quantity, 0) };
    });

    // Capacity usage percentage per zone
    const capacityByZone = zones.map(zone => {
      const zoneItems = items.filter(i => i.zone.toString() === zone._id.toString());
      const used = zoneItems.reduce((sum, i) => sum + i.quantity, 0);
      const percentFull = zone.capacity > 0 ? Math.round((used / zone.capacity) * 100) : 0;
      return { name: zone.name, percentFull };
    });

    // Order count grouped by date
    const orderCountsByDate = {};
    for (const order of orders) {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      orderCountsByDate[dateKey] = (orderCountsByDate[dateKey] || 0) + 1;
    }
    const sortedDates = Object.keys(orderCountsByDate).sort();

    // Movement count per zone (most/least active)
    const movementCountByZone = {};
    for (const zone of zones) movementCountByZone[zone.name] = 0;
    for (const m of movements) {
      if (m.item && m.item.zone) {
        const zone = zones.find(z => z._id.toString() === m.item.zone.toString());
        if (zone) movementCountByZone[zone.name] += 1;
      }
    }
    const activityData = Object.entries(movementCountByZone)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.render('analytics', {
      inventoryByZone,
      capacityByZone,
      orderDates: sortedDates,
      orderCounts: sortedDates.map(d => orderCountsByDate[d]),
      activityData,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 404 + ERROR HANDLING
// ============================================================
// Must be registered last, after all other app.use()/app.get()/app.post() calls.

// Catch-all for unmatched routes
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Catch-all for errors passed via next(err) from any route above
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong.');
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));