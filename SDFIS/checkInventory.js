const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('inventories');
    const items = await collection.find({}).toArray();

    console.log('📦 Total Inventory Items:', items.length);
    console.log('\n=== INVENTORY DATABASE ===\n');

    if (items.length > 0) {
      items.forEach((item, idx) => {
        console.log(`${idx + 1}. Category: ${item.category}`);
        console.log(`   Item: ${item.itemName || item.size || 'N/A'}`);
        if (item.size) console.log(`   Size: ${item.size}`);
        if (item.thickness) console.log(`   Thickness: ${item.thickness}`);
        console.log(`   Quantity: ${item.quantity}`);
        console.log(`   Date: ${new Date(item.createdAt).toLocaleDateString('en-IN')}`);
        console.log('');
      });

      // Summary by category
      console.log('=== SUMMARY BY CATEGORY ===\n');
      const categories = {};
      items.forEach(item => {
        if (!categories[item.category]) {
          categories[item.category] = 0;
        }
        categories[item.category]++;
      });

      Object.entries(categories).forEach(([cat, count]) => {
        console.log(`${cat}: ${count} item(s)`);
      });
    } else {
      console.log('❌ No items in inventory database');
      console.log('\n💡 Tip: Click "+ Add Stock" in the Inventory Manager to add items');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

connectDB();
