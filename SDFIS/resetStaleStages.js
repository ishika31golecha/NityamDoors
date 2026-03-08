/**
 * One-time fix: reset door documents whose currentStage does not match
 * the current valid enum (catches old names like LOADING, POLISHING, PROCESSING).
 * Run once then delete this file.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const DoorUnit = require('./models/DoorUnit');

const VALID_STAGES = ['PENDING','CUTTING','BTC','LAMINATE','PRESS','FINISH','PACKING','DELIVERY','COMPLETED'];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected:', mongoose.connection.host, '/', mongoose.connection.name);

  const stale = await DoorUnit.find({ currentStage: { $nin: VALID_STAGES } });
  console.log(`\nStale-stage documents found: ${stale.length}`);
  stale.forEach(d => console.log(`  orderId=${d.orderId}  door#${d.doorNumber}  stage="${d.currentStage}"`));

  if (stale.length > 0) {
    const r = await DoorUnit.updateMany(
      { currentStage: { $nin: VALID_STAGES } },
      { $set: { currentStage: 'CUTTING', isRejected: false, stageHistory: [] } }
    );
    console.log(`\nReset ${r.modifiedCount} document(s) → currentStage = "CUTTING"`);
  } else {
    console.log('\nNothing to reset.');
  }

  const dist = await DoorUnit.aggregate([
    { $group: { _id: '$currentStage', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  console.log('\nFinal stage distribution:');
  dist.forEach(r => console.log(`  ${r._id.padEnd(12)}: ${r.count}`));

  await mongoose.connection.close();
  console.log('\nDone. Connection closed.');
}

run().catch(e => { console.error(e); process.exit(1); });
