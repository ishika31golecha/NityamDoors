/**
 * Migration Script: Fix Production Documents
 * 
 * Fixes documents where:
 * - currentStage = "CUTTING" but stageHistory is empty
 * - Changes these to status "PENDING"
 * 
 * Usage:
 * node migrateProductionData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DoorUnit = require('./models/DoorUnit');

/**
 * Migrate production documents to correct stage
 */
async function migrateProductionData() {
  try {
    console.log('\n🔄 Migration: Fix Production Documents');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Connect to database
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected successfully\n');

    // Find documents that need migration
    console.log('🔍 Finding documents to migrate...');
    const documentsToMigrate = await DoorUnit.find({
      currentStage: 'CUTTING',
      stageHistory: { $size: 0 }
    });

    console.log(`   Found: ${documentsToMigrate.length} documents\n`);

    if (documentsToMigrate.length === 0) {
      console.log('✅ No documents need migration!\n');
    } else {
      // Migrate each document
      console.log('📝 Migrating documents...');
      let migratedCount = 0;

      for (const doc of documentsToMigrate) {
        await DoorUnit.updateOne(
          { _id: doc._id },
          {
            $set: {
              currentStage: 'PENDING',
              stageHistory: []
            }
          }
        );
        migratedCount++;
      }

      console.log(`✅ Migrated: ${migratedCount} documents\n`);

      // Verify migration
      console.log('✔️  Verification:');
      const stillPending = await DoorUnit.find({
        currentStage: 'CUTTING',
        stageHistory: { $size: 0 }
      });
      const nowPending = await DoorUnit.find({
        currentStage: 'PENDING'
      });

      console.log(`   - Documents still in CUTTING (empty history): ${stillPending.length}`);
      console.log(`   - Documents now in PENDING: ${nowPending.length}\n`);

      // Show sample
      const sample = nowPending[0];
      if (sample) {
        console.log('📋 Sample Migrated Document:');
        console.log(`   {`);
        console.log(`     orderId: "${sample.orderId}",`);
        console.log(`     doorNumber: ${sample.doorNumber},`);
        console.log(`     currentStage: "${sample.currentStage}",`);
        console.log(`     stageHistory: []`);
        console.log(`   }\n`);
      }
    }

    // Schema information
    console.log('📚 Updated Schema Information:');
    console.log('   Stage Order: PENDING → CUTTING → PROCESSING → POLISHING → PACKING → LOADING → COMPLETED');
    console.log('   - New documents start with: currentStage = "PENDING"');
    console.log('   - Workers update stages sequentially (no skipping)');
    console.log('   - Rejected items stay in same stage\n');

    console.log('✅ Migration complete!\n');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);

  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connection closed\n');
  }
}

// Run migration
migrateProductionData();
