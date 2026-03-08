/**
 * Migration Script: Reset All Production Doors to CUTTING
 *
 * Problem:
 *   Some doors were incorrectly moved to BTC or later stages before the
 *   sequential stage-locking logic was enforced. This leaves Stage 1 (CUTTING)
 *   empty and Stage 2+ populated, which the new lock logic blocks forever.
 *
 * Fix:
 *   Reset every DoorUnit document back to currentStage = "CUTTING" and
 *   clear its stageHistory so the production flow can restart correctly.
 *
 * Usage:
 *   node resetProductionStages.js
 *
 * Safe to run multiple times - it only updates documents that are NOT already
 * in PENDING or CUTTING (i.e., doors that have actually advanced past Stage 1).
 * To reset ALL documents regardless of current stage, change the filter to {}.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DoorUnit = require('./models/DoorUnit');

const RESET_TARGET_STAGE = 'CUTTING';

async function resetProductionStages() {
  console.log('\n🔄 Migration: Reset Production Doors to CUTTING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected: ${mongoose.connection.host} / ${mongoose.connection.name}\n`);

    // ------------------------------------------------------------------
    // 1. Dry-run: count how many documents will be affected
    // ------------------------------------------------------------------
    const stagesToReset = ['BTC', 'LAMINATE', 'PRESS', 'FINISH', 'PACKING', 'DELIVERY', 'COMPLETED'];

    const affected = await DoorUnit.countDocuments({ currentStage: { $in: stagesToReset } });
    const totalDoors = await DoorUnit.countDocuments({});

    console.log(`📊 Total door documents  : ${totalDoors}`);
    console.log(`🚨 Doors past CUTTING    : ${affected}  (will be reset)`);
    console.log(`✅ Doors at PENDING/CUTTING: ${totalDoors - affected}  (no change)\n`);

    if (affected === 0) {
      console.log('✅ Nothing to reset — all doors are already at PENDING or CUTTING.\n');
      return;
    }

    // ------------------------------------------------------------------
    // 2. Show per-stage breakdown before reset
    // ------------------------------------------------------------------
    console.log('📋 Current stage distribution (before reset):');
    const breakdown = await DoorUnit.aggregate([
      { $group: { _id: '$currentStage', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    breakdown.forEach(row => console.log(`   ${row._id.padEnd(12)} : ${row.count}`));
    console.log('');

    // ------------------------------------------------------------------
    // 3. Perform the reset
    // ------------------------------------------------------------------
    console.log(`⚙️  Resetting ${affected} door(s) to currentStage = "${RESET_TARGET_STAGE}" …`);

    const result = await DoorUnit.updateMany(
      { currentStage: { $in: stagesToReset } },
      {
        $set: {
          currentStage: RESET_TARGET_STAGE,
          isRejected: false
        },
        $unset: { stageHistory: '' }   // removes the array field
      }
    );

    // Re-set stageHistory to [] (updateMany $unset leaves field absent;
    // the Mongoose schema default will handle new docs, but existing ones
    // need an explicit empty array so the schema validator is satisfied).
    await DoorUnit.updateMany(
      { stageHistory: { $exists: false } },
      { $set: { stageHistory: [] } }
    );

    console.log(`✅ Modified: ${result.modifiedCount} document(s)\n`);

    // ------------------------------------------------------------------
    // 4. Verification
    // ------------------------------------------------------------------
    console.log('✔️  Verification (stage distribution after reset):');
    const afterBreakdown = await DoorUnit.aggregate([
      { $group: { _id: '$currentStage', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    afterBreakdown.forEach(row => console.log(`   ${row._id.padEnd(12)} : ${row.count}`));
    console.log('');

    const stillWrong = await DoorUnit.countDocuments({ currentStage: { $in: stagesToReset } });
    if (stillWrong === 0) {
      console.log('✅ All doors are now at PENDING or CUTTING.\n');
    } else {
      console.warn(`⚠️  ${stillWrong} document(s) still have unexpected stages. Check manually.\n`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Migration complete!');
    console.log('   Stage flow is now: CUTTING → BTC → LAMINATE → PRESS → FINISH → PACKING → DELIVERY\n');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);

  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed.');
  }
}

resetProductionStages();
