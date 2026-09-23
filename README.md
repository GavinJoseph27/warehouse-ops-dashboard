# Warehouse Ops Dashboard

A full-stack warehouse management tool that visualizes inventory across zones, flags operational inefficiencies, and suggests concrete reorganization moves — inspired by real logistics work from my co-op as an Assistant Logistics Engineer at DSV.

**Live demo:** https://warehouse-ops-dashboard.onrender.com
*(hosted on Render's free tier — the app may take 30-60 seconds to wake up if it's been idle)*

## What it does

- **Zone viewer** — a grid of all warehouse zones with real-time capacity usage, color-coded by fill level
- **Insights engine** — automatically flags overstocked zones, underutilized space, dead stock (items with no recent movement), and poor item slotting (high-demand items stored too far from the loading dock)
- **Reorganization suggestions** — a rule-based algorithm that generates specific, actionable moves (e.g. "move 40 units of Item X from Zone A to Zone B") to fix the issues the insights engine flags, rather than just reporting problems
- **Order simulation** — a working order form that deducts stock, logs inventory movements, and updates the dashboard live, with database-level protection against overselling under concurrent requests
- **Analytics dashboard** — charts for inventory by zone, capacity utilization, order volume over time, and zone activity

## Why I built this

During my co-op at DSV, I worked on automating warehouse reporting and built a script that extracted raw location data to generate a visual map of the facility. This project extends that idea into a standalone, portfolio-ready application: a warehouse operations tool that goes beyond visualization into actually reasoning about the data and recommending fixes.

## Tech stack

- **Backend:** Node.js, Express
- **Database:** MongoDB (MongoDB Atlas in production), Mongoose
- **Frontend:** Server-side rendering with Pug, Chart.js for analytics
- **Data generation:** Faker.js
- **Hosting:** Render (app), MongoDB Atlas (database)

## A note on the data

All inventory, order, and zone data in this app is **synthetically generated** using Faker.js — there is no real DSV data here, for obvious confidentiality reasons. The seed script (`seed.js`) creates 12 zones, 300 items, and 100 orders, with zone capacities deliberately calibrated so that fill levels land in a realistic 15-95% range rather than random, implausible numbers.

## Features in detail

### Insights engine
Scans all zones and items and flags four categories of problems:
- **Overstock** — zones at 90%+ capacity
- **Understock** — zones at 20% or less capacity
- **Dead stock** — items that haven't moved in 30+ days
- **Slotting mismatches** — high-demand items stored far from the dock

### Reorganization suggestions
Rather than relying on fixed thresholds (which can fail to produce useful output depending on the exact data), the suggestion engine works **relatively**: it always compares the fullest zones against the emptiest zones, and the farthest high-demand items against the closest available zones — guaranteeing useful suggestions regardless of the specific numbers in play.

### Order simulation
Built with concurrency safety in mind: stock deductions use an atomic MongoDB `findOneAndUpdate` with a quantity guard, preventing two simultaneous orders from both succeeding and overselling the same item.

## Running it locally

```bash
# Clone the repo
git clone https://github.com/GavinJoseph27/warehouse-ops-dashboard.git
cd warehouse-ops-dashboard

# Install dependencies
npm install

# Set up your environment
echo "MONGO_URI=your_mongodb_connection_string" > .env

# Seed the database with synthetic data
node seed.js

# Start the server
npm start
```

Then visit `http://localhost:3000`.

## Project structure

```
├── models/          # Mongoose schemas (Zone, Item, Order, Movement)
├── utils/           # Business logic (insights engine, suggestion engine)
├── views/           # Pug templates
│   └── partials/    # Shared nav bar
├── public/          # Stylesheet
├── seed.js          # Synthetic data generator
└── server.js        # Express app and routes
```

## What I'd add next

- Real historical data patterns (seasonal demand, weekday/weekend order trends)
- A more sophisticated reorganization algorithm (currently rule-based/greedy, not optimization-based)
- User authentication for multi-warehouse support
- Export insights/suggestions as a downloadable report

---

Built by [Gavin Joseph](https://github.com/GavinJoseph27) — [LinkedIn](https://linkedin.com/in/gavin-joseph-062712gj)
