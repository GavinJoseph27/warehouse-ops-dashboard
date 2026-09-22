// seed.js
// Populates the database with synthetic zones, items, orders, and realistic
// capacity levels. Safe to re-run â€” it wipes existing data first.

require('dotenv').config();
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');

const Zone = require('./models/Zone');
const Item = require('./models/Item');
const Order = require('./models/Order');
const Movement = require('./models/Movement');

const ZONE_ROWS = ['A', 'B', 'C'];
const AISLES_PER_ROW = 4;
const ITEM_COUNT = 300;
const ORDER_COUNT = 100;
const CATEGORIES = ['Electronics', 'Apparel', 'Home Goods', 'Toys', 'Groceries'];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Wipe existing data so this script can be re-run safely
  await Promise.all([Zone.deleteMany({}), Item.deleteMany({}), Order.deleteMany({}), Movement.deleteMany({})]);

  const zones = await createZones();
  const items = await createItems(zones);
  await assignRealisticCapacities(zones, items);
  await createOrders(items);

  console.log('Seeding complete!');
  await mongoose.disconnect();
}

// Step 1: create zones with a placeholder capacity (fixed later once we know usage)
async function createZones() {
  const zones = [];
  for (const row of ZONE_ROWS) {
    for (let aisle = 1; aisle <= AISLES_PER_ROW; aisle++) {
      const zone = await Zone.create({
        zoneId: `${row}${aisle}`,
        name: `Zone ${row} - Aisle ${aisle}`,
        distanceFromDock: aisle * 10 + (row.charCodeAt(0) - 65) * 5,
        capacity: 1, // placeholder, fixed in assignRealisticCapacities()
      });
      zones.push(zone);
    }
  }
  console.log(`Created ${zones.length} zones`);
  return zones;
}

// Step 2: create items, randomly distributed across zones
async function createItems(zones) {
  const items = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const randomZone = faker.helpers.arrayElement(zones);
    const item = await Item.create({
      sku: faker.string.alphanumeric(8).toUpperCase(),
      name: faker.commerce.productName(),
      category: faker.helpers.arrayElement(CATEGORIES),
      quantity: faker.number.int({ min: 0, max: 150 }),
      zone: randomZone._id,
      demandScore: faker.number.int({ min: 0, max: 100 }),
      // Skew some items to look "dead" (not moved in a long time)
      lastMovedAt: faker.date.recent({ days: faker.helpers.arrayElement([2, 5, 10, 45, 90]) }),
    });
    items.push(item);
  }
  console.log(`Created ${items.length} items`);
  return items;
}

// Step 3: set each zone's capacity relative to what actually got assigned to it,
// so fill levels land in a realistic, varied 15-95% range instead of arbitrary
// mismatched numbers (capacity = used / randomFillRatio).
async function assignRealisticCapacities(zones, items) {
  for (const zone of zones) {
    const zoneItems = items.filter(i => i.zone.toString() === zone._id.toString());
    const used = zoneItems.reduce((sum, i) => sum + i.quantity, 0);

    const fillRatio = faker.number.float({ min: 0.15, max: 0.95, fractionDigits: 2 });
    const capacity = Math.max(Math.round(used / fillRatio), used + 10); // capacity always exceeds used

    await Zone.updateOne({ _id: zone._id }, { capacity });
  }
  console.log('Adjusted zone capacities to realistic fill levels');
}

// Step 4: create order history
async function createOrders(items) {
  for (let i = 0; i < ORDER_COUNT; i++) {
    const orderItems = faker.helpers.arrayElements(items, faker.number.int({ min: 1, max: 4 }))
      .map(item => ({ item: item._id, quantity: faker.number.int({ min: 1, max: 5 }) }));

    await Order.create({
      orderId: `ORD-${faker.string.numeric(6)}`,
      items: orderItems,
      status: faker.helpers.arrayElement(['pending', 'fulfilled']),
      createdAt: faker.date.recent({ days: 60 }),
    });
  }
  console.log(`Created ${ORDER_COUNT} orders`);
}

seed().catch(console.error);