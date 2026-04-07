const express = require('express');
const mongoose = require('mongoose');
const { protect, authorize, authorizeModule } = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const DoorUnit = require('../models/DoorUnit');
const Worker = require('../models/Worker');
const Payment = require('../models/Payment');
const StageRate = require('../models/StageRate');
const {
  normalizeFilterType,
  getDateRange,
  getCustomDateRange,
  buildPeriodKey,
  buildCustomPeriodKey,
  getStageRates,
  getPayableStagesFromRates,
  getWorkerStagePerformance,
  buildPayrollRows,
  buildWorkerSummary
} = require('../utils/payrollUtils');

const router = express.Router();

const STAGES = [
  'PENDING',
  'CUTTING',
  'BTC',
  'LAMINATE',
  'PRESS',
  'FINISH',
  'PACKING',
  'DELIVERY_PENDING',
  'DELIVERY_DONE',
  'DELIVERY',
  'COMPLETED'
];

async function updateOrderStatus(orderId) {
  if (!orderId || String(orderId).trim() === '') {
    return { updated: false, orderCompleted: false, reason: 'orderId is required' };
  }

  const normalizedOrderId = String(orderId).trim();
  const allDoors = await DoorUnit.find({ orderId: normalizedOrderId }).select('currentStage').lean();

  if (!Array.isArray(allDoors) || allDoors.length === 0) {
    return { updated: false, orderCompleted: false, reason: 'No production doors found' };
  }

  const orderCompleted = allDoors.every((d) => d.currentStage === 'DELIVERY_DONE');
  if (!orderCompleted) {
    return { updated: false, orderCompleted: false };
  }

  await Order.findOneAndUpdate(
    { orderId: normalizedOrderId },
    { $set: { status: 'COMPLETED' } },
    { new: true }
  );

  return { updated: true, orderCompleted: true };
}

function isSuperAdminUser(user) {
  const roles = user?.roles && user.roles.length > 0 ? user.roles : [user?.role];
  return roles.includes('SuperAdmin');
}

async function isWorkerPeriodLocked(workerId, timestamp = new Date()) {
  if (!workerId) return false;

  const paid = await Payment.findOne({
    worker: workerId,
    status: 'PAID',
    rangeStart: { $lte: timestamp },
    rangeEnd: { $gte: timestamp }
  }).select('_id').lean();

  return !!paid;
}

// ============================================
// PRODUCTION SUPERVISOR ROUTES
// ============================================

/**
 * @route   GET /api/production/approved-orders
 * @desc    Get all orders with status = APPROVED
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Returns only orders ready for production
 */
router.get('/approved-orders', protect, authorizeModule('production'), async (req, res) => {
  try {
    const orders = await Order.find({ status: 'APPROVED' })
      .select('orderId customer.name doors totalAmount priority')
      .sort({ createdAt: -1 })
      .lean();

    // Format response
    const formattedOrders = orders.map(order => ({
      orderId: order.orderId,
      customerName: order.customer?.name || 'Unknown Customer',
      totalDoors: order.doors?.length || 0,
      totalAmount: order.totalAmount,
      priority: order.priority || 'Normal',
      doorsArray: order.doors || []
    }));

    res.status(200).json({
      success: true,
      message: 'Approved orders fetched successfully',
      count: formattedOrders.length,
      data: formattedOrders
    });

  } catch (error) {
    console.error('❌ Error fetching approved orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approved orders',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/doors/:orderId
 * @desc    Get all door units for an order with full stage history
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * If no production documents exist, auto-create them from order's door count
 */
router.get('/doors/:orderId', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId } = req.params;

    // Fetch order details
    const order = await Order.findOne({ orderId }).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        data: null
      });
    }

    // Check if production documents exist for this order
    let doorUnits = await DoorUnit.find({ orderId })
      .populate('stageHistory.worker', 'workerId name');
    
    console.log(`\n🔍 DEBUG: Fetching doors for order ${orderId}`);
    console.log(`   Found ${doorUnits.length} door units`);
    
    if (doorUnits.length > 0 && doorUnits[0].stageHistory.length > 0) {
      console.log(`   First door's first stage history:`, JSON.stringify(doorUnits[0].stageHistory[0], null, 2));
    }
    // AUTO-CREATE: If no production documents exist, create one for each door
    if (doorUnits.length === 0) {
      const totalDoors = order.doors?.length || 1;
      const doorsToCreate = [];

      for (let i = 1; i <= totalDoors; i++) {
        doorsToCreate.push({
          orderId,
          doorNumber: i,
          currentStage: 'CUTTING',
          isRejected: false,
          stageHistory: []
        });
      }

      try {
        await DoorUnit.insertMany(doorsToCreate);
        console.log(`✅ Auto-created ${doorsToCreate.length} door documents for order ${orderId}`);
        // Fetch created documents with populated worker details
        doorUnits = await DoorUnit.find({ orderId })
          .populate('stageHistory.worker', 'workerId name');
      } catch (insertError) {
        console.error('⚠️ Error auto-creating door units:', insertError);
        // Still return empty array if creation fails
      }
    }

    // Convert to plain JS for response
    const doorUnitsPlain = doorUnits.map(doc => doc.toObject ? doc.toObject() : doc);

    res.status(200).json({
      success: true,
      message: 'Door units fetched successfully',
      orderId,
      totalDoors: doorUnitsPlain.length,
      data: doorUnitsPlain
    });

  } catch (error) {
    console.error('❌ Error fetching door units:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch door units',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/order-details/:orderId
 * @desc    Get order with door dimensions (height, width) for UI display
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Returns order details with doors array including height and width
 */
router.get('/order-details/:orderId', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId } = req.params;

    // Fetch order with full door specifications
    const order = await Order.findOne({ orderId }).select('orderId customer.name doors priority').lean();
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        data: null
      });
    }

    // Extract door dimensions from order doors array
    const doorsWithDimensions = (order.doors || []).map((door, index) => ({
      doorNumber: index + 1,
      height: door.dimension?.height || door.height || null,
      width: door.dimension?.width || door.width || null,
      type: door.doorType || door.type || 'Unknown',
      laminate: door.laminate || 'Unknown'
    }));

    res.status(200).json({
      success: true,
      message: 'Order details fetched successfully',
      data: {
        orderId: order.orderId,
        customerName: order.customer?.name || 'Unknown',
        priority: order.priority || 'Normal',
        doors: doorsWithDimensions,
        totalDoors: doorsWithDimensions.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/order-full-details/:orderId
 * @desc    Get complete order details WITH production stage tracking
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Returns merged data:
 * - Order: customer name, door details (height, width, type, laminate), priority
 * - Production: current stage for each door
 * 
 * This prevents duplicating data in production collection.
 * Order collection has door specs, Production collection has stage tracking.
 * This endpoint merges them for display.
 */
router.get('/order-full-details/:orderId', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1️⃣ Fetch order with door specifications
    const order = await Order.findOne({ orderId })
      .select('orderId customer.name doors priority')
      .lean();
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        data: null
      });
    }

    // 2️⃣ Fetch production documents with stage tracking
    const doorUnits = await DoorUnit.find({ orderId })
      .select('doorNumber currentStage isRejected')
      .lean();

    // 3️⃣ Merge: Map order doors with production stage data
    const mergedDoors = (order.doors || []).map((door, index) => {
      const doorNumber = index + 1;
      const production = doorUnits.find(d => d.doorNumber === doorNumber);
      
      return {
        doorNumber,
        height: door.dimension?.height || door.height || door.length || null,
        width: door.dimension?.width || door.width || door.breadth || null,
        type: door.doorType || door.type || 'Unknown',
        laminate: door.laminate || 'Unknown',
        priority: door.priority || 'Normal',
        currentStage: production?.currentStage || 'PENDING',
        isRejected: production?.isRejected || false
      };
    });

    // 4️⃣ If production documents don't exist, auto-create them
    if (doorUnits.length === 0) {
      const doorsToCreate = mergedDoors.map(d => ({
        orderId,
        doorNumber: d.doorNumber,
        currentStage: 'PENDING',
        isRejected: false,
        stageHistory: []
      }));

      try {
        await DoorUnit.insertMany(doorsToCreate);
        console.log(`✅ Auto-created ${doorsToCreate.length} production documents for order ${orderId}`);
        // Update merged doors to reflect PENDING stage
        mergedDoors.forEach(d => d.currentStage = 'PENDING');
      } catch (insertError) {
        console.error('⚠️ Error auto-creating production documents:', insertError);
        // Still return data even if creation fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Order details with production stages fetched successfully',
      data: {
        orderId: order.orderId,
        customerName: order.customer?.name || 'Unknown',
        priority: order.priority || 'Normal',
        doors: mergedDoors,
        totalDoors: mergedDoors.length
      }
    });
    
    console.log(`🔍 DEBUG: order-full-details response for ${orderId}:`, JSON.stringify({
      totalDoors: mergedDoors.length,
      firstDoor: mergedDoors[0]
    }, null, 2));

  } catch (error) {
    console.error('❌ Error fetching order-full-details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/production/update-stage
 * @desc    Update door stage with worker information
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Body:
 * {
 *   orderId: String,
 *   doorNumber: Number,
 *   stage: String (CUTTING|BTC|LAMINATE|PRESS|FINISH|PACKING|DELIVERY|COMPLETED),
 *   workerId: String (Worker ID reference),
 *   quality: String (OK|REJECTED),
 *   reason: String (required if REJECTED)
 * }
 * 
 * Validation:
 * - Stage cannot be skipped
 * - Worker must exist in workers collection
 * - If rejected, door stays in current stage
 * - Stage order: PENDING → CUTTING → BTC → LAMINATE → PRESS → fINISH → PACKING → DELIVERY → COMPLETED
 * - When all doors reach COMPLETED, order auto-completes
 */
router.post('/update-stage', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId, doorNumber, stage, workerId, quality, reason } = req.body;

    // Validation
    if (!orderId || !doorNumber || !stage || !workerId || !quality) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderId, doorNumber, stage, workerId, quality',
        data: null
      });
    }

    // Validate stage enum - Updated with PENDING and COMPLETED
    const validStages = STAGES;
    if (!validStages.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: `Invalid stage. Must be one of: ${validStages.join(', ')}`,
        data: null
      });
    }

    // Validate quality
    if (!['OK', 'REJECTED'].includes(quality)) {
      return res.status(400).json({
        success: false,
        message: 'Quality must be either "OK" or "REJECTED"',
        data: null
      });
    }

    // If REJECTED, reason is required
    if (quality === 'REJECTED' && !reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when quality is REJECTED',
        data: null
      });
    }

    // Find the door unit
    const doorUnit = await DoorUnit.findOne({ orderId, doorNumber });
    if (!doorUnit) {
      return res.status(404).json({
        success: false,
        message: `Door unit not found for order ${orderId}, door ${doorNumber}`,
        data: null
      });
    }

    // DELIVERY completion must be handled via submit-delivery with strict delivery validation.
    if (doorUnit.currentStage === 'DELIVERY' && quality === 'OK') {
      return res.status(400).json({
        success: false,
        message: 'Delivery stage requires delivery details. Use /api/production/submit-delivery.',
        data: null
      });
    }

    // Validate worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found: ${workerId}`,
        data: null
      });
    }

    const locked = await isWorkerPeriodLocked(workerId, new Date());
    if (locked && !isSuperAdminUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'This worker has PAID payroll lock for current period. Only SuperAdmin can edit paid data.',
        data: null
      });
    }

    // 🔒 STRICT STAGE VALIDATION: Only allow exact next stage in sequence
    const stageIndex = validStages.indexOf(stage);
    const currentStageIndex = validStages.indexOf(doorUnit.currentStage);

    if (quality === 'OK') {
      // Calculate the EXACT next stage
      const expectedNextStage = validStages[currentStageIndex + 1];
      
      // ONLY allow transition to next stage (not same, not skip ahead)
      if (stage !== expectedNextStage) {
        return res.status(400).json({
          success: false,
          message: `Invalid stage transition. Door #${doorNumber} is in ${doorUnit.currentStage}, next stage must be ${expectedNextStage} (received: ${stage})`,
          data: null
        });
      }
    } else {
      // If REJECTED, stay in the same stage (don't move forward)
      if (stage !== doorUnit.currentStage) {
        return res.status(400).json({
          success: false,
          message: `For REJECTED quality, stage must be current stage (${doorUnit.currentStage}). Received: ${stage}`,
          data: null
        });
      }
    }

    // Create stage history entry
    // Always record doorUnit.currentStage (the stage the worker COMPLETED),
    // NOT the next stage the door moves to. This ensures worker-performance
    // aggregations correctly attribute work to the stage the worker actually performed.
    const historyEntry = {
      stage: doorUnit.currentStage,
      worker: workerId,  // ✅ Store workerId (ObjectId reference)
      quality,
      reason: reason || null,
      timestamp: new Date()
    };

    // Update the door unit
    if (quality === 'OK') {
      doorUnit.currentStage = stage;
      doorUnit.isRejected = false;
    } else {
      doorUnit.isRejected = true;
    }

    doorUnit.stageHistory.push(historyEntry);
    await doorUnit.save();

    console.log(`✅ Stage updated for order ${orderId}, door ${doorNumber}: ${stage} by ${workerId}`);

    res.status(200).json({
      success: true,
      message: 'Stage updated successfully',
      data: {
        orderId,
        doorNumber,
        currentStage: doorUnit.currentStage,
        quality,
        workerId,
        timestamp: historyEntry.timestamp,
        orderCompleted: false
      }
    });

  } catch (error) {
    console.error('❌ Error updating stage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stage',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/history/:orderId
 * @desc    Get complete production history for an order
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/history/:orderId', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId } = req.params;

    const doorUnits = await DoorUnit.find({ orderId }).sort('doorNumber').lean();

    if (doorUnits.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No production history found',
        data: null
      });
    }

    // Format history data
    const history = doorUnits.flatMap(door => 
      door.stageHistory.map(entry => ({
        doorNumber: door.doorNumber,
        stage: entry.stage,
        worker: entry.worker,
        quality: entry.quality,
        reason: entry.reason,
        timestamp: entry.timestamp
      }))
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({
      success: true,
      message: 'Production history fetched successfully',
      orderId,
      totalRecords: history.length,
      data: history
    });

  } catch (error) {
    console.error('❌ Error fetching history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch production history',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/worker-history?date=YYYY-MM-DD
 * @desc    Get daily worker performance summary using aggregation
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Query Parameters:
 * - date: YYYY-MM-DD format (required)
 * 
 * Returns:
 * - Daily summary by worker and stage
 * - Total doors processed per worker per stage
 * 
 * MongoDB Aggregation Pipeline:
 * 1. Unwind stageHistory array to create separate documents per stage entry
 * 2. Filter by date range (start of day to end of day)
 * 3. Group by worker and stage, count doors
 * 4. Sort by worker name and stage
 */
router.get('/worker-history', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { date } = req.query;

    // Validate date parameter
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter required (YYYY-MM-DD format)',
        data: null
      });
    }

    // Parse the date (YYYY-MM-DD format)
    const [year, month, day] = date.split('-');
    const selectedDate = new Date(year, month - 1, day);
    
    if (isNaN(selectedDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD',
        data: null
      });
    }

    // Create date range (start of day to end of day UTC)
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    
    console.log(`📅 Worker History Query - Date: ${date}`);
    console.log(`   Start: ${startOfDay.toISOString()}`);
    console.log(`   End: ${endOfDay.toISOString()}`);

    // MongoDB Aggregation Pipeline
    const results = await DoorUnit.aggregate([
      // Step 1: Unwind stageHistory array
      // Converts one document with multiple history entries into multiple documents
      {
        $unwind: '$stageHistory'
      },
      
      // Step 2: Filter by date range
      // Only include stage history records from the selected date
      // IMPORTANT: Use $lte for end of day to include all records up to 23:59:59.999
      {
        $match: {
          'stageHistory.timestamp': {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      },
      
      // Step 3: Lookup worker details from workers collection
      // Join with Worker collection to get worker name, workerId, etc.
      {
        $lookup: {
          from: 'workers',
          localField: 'stageHistory.worker',
          foreignField: '_id',
          as: 'workerDetails'
        }
      },
      
      // Step 4: Unwind workerDetails (should be 1 record per history entry)
      {
        $unwind: {
          path: '$workerDetails',
          preserveNullAndEmptyArrays: true  // Keep records even if worker not found
        }
      },
      
      // Step 5: Group by worker and stage
      // Count how many doors each worker completed per stage
      {
        $group: {
          _id: {
            workerId: '$stageHistory.worker',
            stage: '$stageHistory.stage'
          },
          workerName: { $first: '$workerDetails.name' },
          totalDoors: { $sum: 1 },
          quality: { $first: '$stageHistory.quality' }
        }
      },
      
      // Step 6: Sort by worker name and then by stage
      {
        $sort: {
          'workerName': 1,
          '_id.stage': 1
        }
      }
    ]);

    // DEBUG: Log aggregation results
    console.log(`✅ Aggregation complete - Found ${results.length} records`);
    if (results.length > 0) {
      console.log(`   First record:`, JSON.stringify(results[0]));
    }

    // Format the response for frontend
    const formattedResults = results.map(item => ({
      workerId: item._id.workerId,
      workerName: item.workerName || 'Unknown Worker',
      stage: item._id.stage,
      totalDoors: item.totalDoors,
      quality: item.quality
    }));

    // Group by worker for summary
    const workerSummary = {};
    formattedResults.forEach(item => {
      const key = item.workerName;
      if (!workerSummary[key]) {
        workerSummary[key] = {
          workerId: item.workerId,
          workerName: item.workerName,
          stages: {},
          totalDoorsForWorker: 0
        };
      }
      workerSummary[key].stages[item.stage] = item.totalDoors;
      workerSummary[key].totalDoorsForWorker += item.totalDoors;
    });

    console.log(`📊 Response Summary: ${Object.keys(workerSummary).length} workers, ${formattedResults.length} total records`);

    res.status(200).json({
      success: true,
      message: `Worker history fetched for ${date}`,
      date,
      totalRecords: results.length,
      data: formattedResults,
      summary: Object.values(workerSummary)
    });

  } catch (error) {
    console.error('❌ Error fetching worker history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker history',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/worker-history-test
 * @desc    Test endpoint - returns sample worker history (for debugging, NO date filter)
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Use this endpoint to verify API is working without date filtering issues
 */
router.get('/worker-history-test', protect, authorizeModule('production'), async (req, res) => {
  try {
    console.log('🧪 Test endpoint called - /worker-history-test');
    
    // Get FIRST 50 records from any date (no filtering)
    const results = await DoorUnit.aggregate([
      { $unwind: '$stageHistory' },
      {
        $group: {
          _id: {
            worker: '$stageHistory.worker',
            stage: '$stageHistory.stage'
          },
          totalDoors: { $sum: 1 },
          quality: { $first: '$stageHistory.quality' }
        }
      },
      { $sort: { '_id.worker': 1, '_id.stage': 1 } },
      { $limit: 50 }
    ]);

    console.log(`✅ Test aggregation returned ${results.length} records`);

    // Format response
    const formattedResults = results.map(item => ({
      worker: item._id.worker,
      stage: item._id.stage,
      totalDoors: item.totalDoors,
      quality: item.quality
    }));

    // Build summary
    const workerSummary = {};
    formattedResults.forEach(item => {
      if (!workerSummary[item.worker]) {
        workerSummary[item.worker] = {
          worker: item.worker,
          stages: {},
          totalDoorsForWorker: 0
        };
      }
      workerSummary[item.worker].stages[item.stage] = item.totalDoors;
      workerSummary[item.worker].totalDoorsForWorker += item.totalDoors;
    });

    res.status(200).json({
      success: true,
      message: 'Test data - Worker history without date filtering',
      totalRecords: results.length,
      data: formattedResults,
      summary: Object.values(workerSummary),
      _note: 'This is test data (no date filter applied)'
    });

  } catch (error) {
    console.error('❌ Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test data',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/worker-performance/drill-down
 * @desc    Get all doors worked by a specific worker in a specific month
 * @query   workerId=<ObjectId>&month=YYYY-MM
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/worker-performance/drill-down', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { workerId, month } = req.query;

    if (!workerId || !month) {
      return res.status(400).json({
        success: false,
        message: 'workerId and month (YYYY-MM) are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res.status(400).json({ success: false, message: 'Invalid workerId' });
    }

    const parts = month.split('-');
    if (parts.length !== 2 || isNaN(parseInt(parts[0])) || isNaN(parseInt(parts[1]))) {
      return res.status(400).json({ success: false, message: 'Invalid month format. Use YYYY-MM' });
    }

    const year = parseInt(parts[0]);
    const mon = parseInt(parts[1]);
    const startDate = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

    const workerObjectId = new mongoose.Types.ObjectId(workerId);

    const results = await DoorUnit.aggregate([
      { $unwind: '$stageHistory' },
      {
        $match: {
          'stageHistory.worker': workerObjectId,
          'stageHistory.timestamp': { $gte: startDate, $lte: endDate }
        }
      },
      {
        $project: {
          _id: 0,
          orderId: 1,
          doorNumber: 1,
          stage: '$stageHistory.stage',
          date: '$stageHistory.timestamp'
        }
      },
      { $sort: { date: 1 } }
    ]);

    console.log(`📋 Drill-down: ${results.length} records for worker ${workerId} in ${month}`);

    res.status(200).json({
      success: true,
      message: 'Drill-down data fetched successfully',
      count: results.length,
      data: results
    });

  } catch (error) {
    console.error('❌ Error in worker drill-down:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drill-down data',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/worker-performance
 * @desc    Get worker performance report (daily, monthly, yearly)
 * @query   type=daily|monthly|yearly, date=YYYY-MM-DD
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Returns worker performance grouped by worker and stage with door counts
 * Supports daily, monthly, and yearly filtering
 */
router.get('/worker-performance', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { type = 'daily', date, fromDate, toDate } = req.query;

    console.log('📊 Worker Performance Report Request:');
    console.log('  Type:', type);
    console.log('  Date:', date);

    if (!['daily', 'weekly', 'monthly', 'yearly', 'custom'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Must be: daily, weekly, monthly, yearly, or custom'
      });
    }

    if ((type === 'daily' || type === 'monthly') && !date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter required for daily and monthly reports'
      });
    }

    if (type === 'custom' && (!fromDate || !toDate)) {
      return res.status(400).json({
        success: false,
        message: 'fromDate and toDate are required for custom reports'
      });
    }

    let startDate;
    let endDate;
    let filterType = type;

    if (type === 'daily') {
      const parts = String(date).split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    } else if (type === 'yearly') {
      const year = parseInt(date || new Date().getFullYear(), 10);
      startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    } else if (type === 'custom') {
      const range = getCustomDateRange(fromDate, toDate);
      filterType = 'custom';
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      filterType = normalizeFilterType(type);
      const range = getDateRange(filterType, date);
      startDate = range.startDate;
      endDate = range.endDate;
    }

    const stageRates = await getStageRates(StageRate);
    const payableStages = getPayableStagesFromRates(stageRates);
    const stageRows = await getWorkerStagePerformance(DoorUnit, startDate, endDate, payableStages);
    const payrollRows = buildPayrollRows(stageRows, stageRates);
    const summary = buildWorkerSummary(payrollRows);
    const totalPayment = payrollRows.reduce((sum, row) => sum + row.total, 0);

    const periodKey =
      type === 'weekly' || type === 'monthly'
        ? buildPeriodKey(filterType, startDate)
        : type === 'custom'
          ? buildCustomPeriodKey(startDate, endDate)
          : null;

    const paidRecords =
      type === 'weekly' || type === 'monthly' || type === 'custom'
        ? await Payment.find({ filterType, periodKey, status: 'PAID' }).select('worker').lean()
        : [];
    const paidWorkerSet = new Set((paidRecords || []).map((p) => String(p.worker)));

    const formattedData = payrollRows.map((row) => ({
      _id: { workerId: row.workerId, stage: row.stage },
      workerName: row.workerName,
      totalDoors: row.doors,
      rate: row.rate,
      totalPay: row.total,
      isPaid: paidWorkerSet.has(String(row.workerId))
    }));

    const formattedSummary = summary.map((item) => ({
      ...item,
      isPaid: paidWorkerSet.has(String(item.workerId))
    }));

    res.status(200).json({
      success: true,
      message: 'Worker performance report generated successfully',
      type,
      date: date || new Date().toISOString().slice(0, 10),
      dateRange: {
        from: startDate,
        to: endDate,
        label: `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
        filterType: type === 'weekly' || type === 'monthly' || type === 'custom' ? type : 'custom',
        periodKey
      },
      stageRates,
      totalRecords: formattedData.length,
      totalPayment,
      data: formattedData,
      payrollRows: formattedData,
      summary: formattedSummary
    });

  } catch (error) {
    console.error('❌ Error generating worker performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate worker performance report',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/production/all-doors
 * @desc    Fetch all production doors from ALL orders, merged with order specs
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/all-doors', protect, authorizeModule('production'), async (req, res) => {
  try {
    const doorUnits = await DoorUnit.find({ isRejected: { $ne: true } }).lean();
    const orderIds = [...new Set(doorUnits.map(d => d.orderId))];
    const orders = await Order.find({ orderId: { $in: orderIds } })
      .select('orderId doors priority')
      .lean();

    const orderMap = {};
    orders.forEach(o => { orderMap[o.orderId] = o; });

    const merged = doorUnits.map(du => {
      const order = orderMap[du.orderId];
      const doorSpec = order?.doors?.[du.doorNumber - 1];
      return {
        _id: du._id,
        orderId: du.orderId,
        doorNumber: du.doorNumber,
        currentStage: du.currentStage,
        isRejected: du.isRejected,
        length: doorSpec?.length || doorSpec?.dimension?.height || doorSpec?.height || null,
        breadth: doorSpec?.breadth || doorSpec?.dimension?.width || doorSpec?.width || null,
        height: doorSpec?.dimension?.height || doorSpec?.height || doorSpec?.length || null,
        width: doorSpec?.dimension?.width || doorSpec?.width || doorSpec?.breadth || null,
        type: doorSpec?.doorType || 'Unknown',
        priority: doorSpec?.priority || order?.priority || 'Normal',
        laminate: doorSpec?.laminate || 'Unknown',
        rate: doorSpec?.rate || order?.ratePerUnit || 0,
        delivery: {
          status: du.delivery?.status || 'PENDING',
          driverName: du.delivery?.driverName || '',
          driverMobile: du.delivery?.driverMobile || '',
          vehicleNumber: du.delivery?.vehicleNumber || '',
          deliveryAddress: du.delivery?.deliveryAddress || '',
          customerMobile: du.delivery?.customerMobile || '',
          deliveredAt: du.delivery?.deliveredAt || null
        }
      };
    });

    res.status(200).json({ success: true, data: merged, total: merged.length });
  } catch (error) {
    console.error('\u274c Error in all-doors:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/production/advance-door
 * @desc    Advance a single door to its next stage (checkbox-driven, no worker required)
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.post('/advance-door', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { doorId } = req.body;
    if (!doorId) {
      return res.status(400).json({ success: false, message: 'doorId is required' });
    }

    const doorUnit = await DoorUnit.findById(doorId);
    if (!doorUnit) {
      return res.status(404).json({ success: false, message: 'Door not found' });
    }

    const nextStageMap = {
      PENDING:  'CUTTING',
      CUTTING:  'BTC',
      BTC:      'LAMINATE',
      LAMINATE: 'PRESS',
      PRESS:    'FINISH',
      FINISH:   'PACKING',
      PACKING:  'DELIVERY_PENDING',
      DELIVERY_PENDING: 'DELIVERY_DONE'
    };

    const previousStage = doorUnit.currentStage;
    const nextStage = nextStageMap[previousStage];

    if (!nextStage) {
      return res.status(400).json({ success: false, message: `Door is already at final stage: ${previousStage}` });
    }

    await DoorUnit.updateOne(
      { _id: doorId },
      { $set: { currentStage: nextStage, isRejected: false } }
    );

    console.log(`\u2705 Door ${doorId} advanced: ${previousStage} \u2192 ${nextStage}`);
    res.status(200).json({
      success: true,
      message: `Door moved to ${nextStage}`,
      data: { doorId, previousStage, currentStage: nextStage }
    });
  } catch (error) {
    console.error('\u274c Error in advance-door:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/production/complete-stage
 * @desc    Batch advance multiple doors to their next stage (requires worker assignment)
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 *
 * Body: { doors: [{ orderId, doorNumber, workerId }] }
 */
router.post('/complete-stage', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { doors } = req.body;

    if (!Array.isArray(doors) || doors.length === 0) {
      return res.status(400).json({ success: false, message: 'doors array is required and must not be empty' });
    }

    const nextStageMap = {
      PENDING:  'CUTTING',
      CUTTING:  'BTC',
      BTC:      'LAMINATE',
      LAMINATE: 'PRESS',
      PRESS:    'FINISH',
      FINISH:   'PACKING',
      PACKING:  'DELIVERY_PENDING'
    };

    const results = [];

    for (const entry of doors) {
      const { orderId, doorNumber, workerId } = entry;

      if (!orderId || !doorNumber || !workerId) {
        return res.status(400).json({ success: false, message: `Missing orderId, doorNumber, or workerId in one of the door entries` });
      }

      // Validate worker
      const worker = await Worker.findById(workerId);
      if (!worker) {
        return res.status(404).json({ success: false, message: `Worker not found: ${workerId}` });
      }

      const locked = await isWorkerPeriodLocked(workerId, new Date());
      if (locked && !isSuperAdminUser(req.user)) {
        return res.status(403).json({
          success: false,
          message: `Worker ${worker.name} has PAID payroll lock for current period. Only SuperAdmin can edit paid data.`
        });
      }

      // Find door unit
      const doorUnit = await DoorUnit.findOne({ orderId, doorNumber });
      if (!doorUnit) {
        return res.status(404).json({ success: false, message: `Door unit not found: order ${orderId}, door ${doorNumber}` });
      }

      const nextStage = nextStageMap[doorUnit.currentStage];
      if (!nextStage) {
        if (doorUnit.currentStage === 'DELIVERY_PENDING') {
          return res.status(400).json({ success: false, message: `Door #${doorNumber} is in DELIVERY_PENDING. Submit delivery details via /api/production/submit-batch-delivery.` });
        }
        return res.status(400).json({ success: false, message: `Door #${doorNumber} is already at final stage: ${doorUnit.currentStage}` });
      }

      // Record the stage the worker COMPLETED (currentStage), not the stage the door moves to (nextStage)
      const completedStage = doorUnit.currentStage;

      // Record history entry and advance stage
      doorUnit.stageHistory.push({
        stage: completedStage,
        worker: workerId,
        quality: 'OK',
        reason: null,
        timestamp: new Date()
      });
      doorUnit.currentStage = nextStage;
      doorUnit.isRejected = false;
      if (nextStage === 'DELIVERY_PENDING') {
        doorUnit.delivery = {
          status: 'PENDING',
          driverName: '',
          driverMobile: '',
          vehicleNumber: '',
          deliveryAddress: '',
          customerMobile: '',
          deliveredAt: null
        };
      }
      await doorUnit.save();

      console.log(`✅ Door #${doorNumber} (${orderId}): ${doorUnit.currentStage === nextStage ? 'already updated' : ''} → ${nextStage}`);
      results.push({ doorNumber, orderId, newStage: nextStage });
    }

    res.status(200).json({
      success: true,
      message: `${results.length} door(s) advanced to next stage`,
      data: results
    });

  } catch (error) {
    console.error('❌ Error in complete-stage:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/production/complete-packing
 * @desc    Move selected doors from PACKING to DELIVERY_PENDING
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.post('/complete-packing', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { doorIds } = req.body;

    if (!Array.isArray(doorIds) || doorIds.length === 0) {
      return res.status(400).json({ success: false, message: 'doorIds must be a non-empty array' });
    }

    const objectIds = doorIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    if (objectIds.length !== doorIds.length) {
      return res.status(400).json({ success: false, message: 'One or more doorIds are invalid.' });
    }

    const doorUnits = await DoorUnit.find({ _id: { $in: objectIds } });
    if (doorUnits.length !== objectIds.length) {
      return res.status(404).json({ success: false, message: 'Some selected doors were not found.' });
    }

    const invalidDoor = doorUnits.find(d => d.currentStage !== 'PACKING');
    if (invalidDoor) {
      return res.status(400).json({ success: false, message: `Door ${invalidDoor._id} is not in PACKING stage.` });
    }

    for (const door of doorUnits) {
      door.currentStage = 'DELIVERY_PENDING';
      if (!door.delivery || door.delivery.status === 'COMPLETED') {
        door.delivery = {
          status: 'PENDING',
          driverName: '',
          driverMobile: '',
          vehicleNumber: '',
          deliveryAddress: '',
          customerMobile: '',
          deliveredAt: null
        };
      }
      await door.save();
    }

    res.status(200).json({
      success: true,
      message: `${doorUnits.length} door(s) moved to DELIVERY_PENDING`,
      data: {
        updatedCount: doorUnits.length,
        doorIds: doorUnits.map(d => String(d._id))
      }
    });
  } catch (error) {
    console.error('❌ Error in complete-packing:', error);
    res.status(500).json({ success: false, message: 'Failed to complete packing', error: error.message });
  }
});

/**
 * @route   GET /api/production/pending-delivery
 * @desc    List doors pending delivery completion
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/pending-delivery', protect, authorizeModule('production'), async (req, res) => {
  try {
    const doors = await DoorUnit.find({
      currentStage: 'DELIVERY_PENDING',
      'delivery.status': { $ne: 'COMPLETED' },
      isRejected: { $ne: true }
    }).lean();

    const orderIds = [...new Set(doors.map(d => d.orderId))];
    const orders = await Order.find({ orderId: { $in: orderIds } })
      .select('orderId customer.name customer.mobileNumber createdAt doors ratePerUnit')
      .lean();

    const orderMap = {};
    orders.forEach(o => { orderMap[o.orderId] = o; });

    const data = doors.map(d => {
      const order = orderMap[d.orderId];
      const doorSpec = order?.doors?.[d.doorNumber - 1] || {};
      return {
        _id: d._id,
        currentStage: d.currentStage,
        orderId: d.orderId,
        doorNumber: d.doorNumber,
        customerName: order?.customer?.name || 'Unknown',
        customerMobile: order?.customer?.mobileNumber || '',
        length: doorSpec.length || doorSpec.dimension?.height || doorSpec.height || 0,
        breadth: doorSpec.breadth || doorSpec.dimension?.width || doorSpec.width || 0,
        rate: doorSpec.rate || order?.ratePerUnit || 0,
        type: doorSpec.doorType || 'Unknown',
        priority: doorSpec.priority || order?.priority || 'Normal',
        delivery: {
          status: d.delivery?.status || 'PENDING',
          driverName: d.delivery?.driverName || '',
          driverMobile: d.delivery?.driverMobile || '',
          vehicleNumber: d.delivery?.vehicleNumber || '',
          deliveryAddress: d.delivery?.deliveryAddress || '',
          customerMobile: d.delivery?.customerMobile || order?.customer?.mobileNumber || '',
          deliveredAt: d.delivery?.deliveredAt || null
        }
      };
    });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('❌ Error in pending-delivery:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending delivery list', error: error.message });
  }
});

/**
 * @route   GET /api/production/doors-by-order/:orderId
 * @desc    List only DELIVERY_PENDING doors for a specific order
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/doors-by-order/:orderId', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId || String(orderId).trim() === '') {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    let selectedOrder = null;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      selectedOrder = await Order.findById(orderId)
        .select('orderId customer.name customer.mobileNumber customer.address doors ratePerUnit priority')
        .lean();
    }

    if (!selectedOrder) {
      selectedOrder = await Order.findOne({ orderId })
        .select('orderId customer.name customer.mobileNumber customer.address doors ratePerUnit priority')
        .lean();
    }

    if (!selectedOrder) {
      return res.status(404).json({ success: false, message: 'Selected order not found.' });
    }

    const selectedOrderCode = selectedOrder.orderId;

    const doors = await DoorUnit.find({
      orderId: selectedOrderCode,
      currentStage: 'DELIVERY_PENDING',
      'delivery.status': { $ne: 'COMPLETED' },
      isRejected: { $ne: true }
    }).lean();

    const data = doors.map((d) => {
      const doorSpec = selectedOrder?.doors?.[d.doorNumber - 1] || {};
      return {
        _id: d._id,
        currentStage: d.currentStage,
        orderId: selectedOrderCode,
        doorNumber: d.doorNumber,
        customerName: selectedOrder?.customer?.name || 'Unknown',
        customerMobile: selectedOrder?.customer?.mobileNumber || '',
        deliveryAddress: selectedOrder?.customer?.address || '',
        length: doorSpec.length || doorSpec.dimension?.height || doorSpec.height || 0,
        breadth: doorSpec.breadth || doorSpec.dimension?.width || doorSpec.width || 0,
        rate: doorSpec.rate || selectedOrder?.ratePerUnit || 0,
        type: doorSpec.doorType || 'Unknown',
        priority: doorSpec.priority || selectedOrder?.priority || 'Normal',
        delivery: {
          status: d.delivery?.status || 'PENDING',
          driverName: d.delivery?.driverName || '',
          driverMobile: d.delivery?.driverMobile || '',
          vehicleNumber: d.delivery?.vehicleNumber || '',
          deliveryAddress: d.delivery?.deliveryAddress || selectedOrder?.customer?.address || '',
          customerMobile: d.delivery?.customerMobile || selectedOrder?.customer?.mobileNumber || '',
          deliveredAt: d.delivery?.deliveredAt || null
        }
      };
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Error in doors-by-order:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch doors by order' });
  }
});

/**
 * @route   POST /api/production/selected-doors-details
 * @desc    Fetch selected DELIVERY_PENDING doors details for invoice generation only
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.post('/selected-doors-details', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId, doorIds } = req.body;

    if (!orderId || String(orderId).trim() === '') {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    if (!Array.isArray(doorIds) || doorIds.length === 0) {
      return res.status(400).json({ success: false, message: 'doorIds must be a non-empty array' });
    }

    const objectIds = doorIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    if (objectIds.length !== doorIds.length) {
      return res.status(400).json({ success: false, message: 'One or more doorIds are invalid.' });
    }

    let selectedOrder = null;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      selectedOrder = await Order.findById(orderId)
        .select('orderId customer.name customer.mobileNumber customer.address doors ratePerUnit priority')
        .lean();
    }
    if (!selectedOrder) {
      selectedOrder = await Order.findOne({ orderId })
        .select('orderId customer.name customer.mobileNumber customer.address doors ratePerUnit priority')
        .lean();
    }
    if (!selectedOrder) {
      return res.status(404).json({ success: false, message: 'Selected order not found.' });
    }

    const selectedOrderCode = selectedOrder.orderId;

    const doorUnits = await DoorUnit.find({ _id: { $in: objectIds } }).lean();
    if (doorUnits.length !== objectIds.length) {
      return res.status(404).json({ success: false, message: 'Some selected doors were not found.' });
    }

    const invalidDoor = doorUnits.find(
      d => d.orderId !== selectedOrderCode || d.currentStage !== 'DELIVERY_PENDING' || d.delivery?.status === 'COMPLETED'
    );
    if (invalidDoor) {
      return res.status(400).json({ success: false, message: `Door ${invalidDoor._id} is not eligible for invoice generation.` });
    }

    const doors = doorUnits.map((door) => {
      const spec = selectedOrder?.doors?.[door.doorNumber - 1] || {};
      return {
        _id: String(door._id),
        doorId: String(door._id),
        orderId: selectedOrderCode,
        doorNumber: door.doorNumber,
        currentStage: door.currentStage,
        length: Number(spec.length || spec.dimension?.height || spec.height || 0),
        breadth: Number(spec.breadth || spec.dimension?.width || spec.width || 0),
        rate: Number(spec.rate || selectedOrder?.ratePerUnit || 0)
      };
    });

    res.status(200).json({
      success: true,
      data: {
        orderId: selectedOrderCode,
        customerName: selectedOrder?.customer?.name || '',
        customerMobile: selectedOrder?.customer?.mobileNumber || '',
        deliveryAddress: selectedOrder?.customer?.address || '',
        doors
      }
    });
  } catch (error) {
    console.error('❌ Error in selected-doors-details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch selected doors details' });
  }
});

/**
 * @route   GET /api/production/pending-delivery-order-ids
 * @desc    Get unique order IDs that have DELIVERY_PENDING doors
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/pending-delivery-order-ids', protect, authorizeModule('production'), async (req, res) => {
  try {
    const orderIds = await DoorUnit.distinct('orderId', {
      currentStage: 'DELIVERY_PENDING',
      isRejected: { $ne: true }
    });

    res.status(200).json({
      success: true,
      data: (orderIds || []).filter(Boolean)
    });
  } catch (error) {
    console.error('❌ Error in pending-delivery-order-ids:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending delivery order IDs' });
  }
});

/**
 * @route   POST /api/production/sync-order-status/:orderId
 * @desc    Sync a single order status based on production stages
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.post('/sync-order-status/:orderId', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await updateOrderStatus(orderId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in sync-order-status:', error);
    res.status(500).json({ success: false, message: 'Failed to sync order status' });
  }
});

/**
 * @route   POST /api/production/submit-batch-delivery
 * @desc    Complete delivery for multiple DELIVERY_PENDING doors using one shared delivery form
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.post('/submit-batch-delivery', protect, authorizeModule('production'), async (req, res) => {
  try {
    const {
      orderId,
      doorIds,
      customerName,
      driverName,
      driverMobile,
      vehicleNumber,
      deliveryAddress,
      customerMobile,
      confirmDelivery
    } = req.body;

    if (!orderId || String(orderId).trim() === '') {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    if (!Array.isArray(doorIds) || doorIds.length === 0) {
      return res.status(400).json({ success: false, message: 'doorIds must be a non-empty array' });
    }

    const requiredFields = { customerName, driverName, driverMobile, vehicleNumber, deliveryAddress, customerMobile };
    const missing = Object.entries(requiredFields)
      .filter(([, value]) => String(value || '').trim() === '')
      .map(([key]) => key);

    if (missing.length > 0) {
      return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
    }

    if (confirmDelivery !== true) {
      return res.status(400).json({ success: false, message: 'Confirm Delivery must be checked before submission.' });
    }

    const objectIds = doorIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    if (objectIds.length !== doorIds.length) {
      return res.status(400).json({ success: false, message: 'One or more doorIds are invalid.' });
    }

    let selectedOrder = null;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      selectedOrder = await Order.findById(orderId).select('orderId customer.name customer.mobileNumber doors ratePerUnit').lean();
    }
    if (!selectedOrder) {
      selectedOrder = await Order.findOne({ orderId }).select('orderId customer.name customer.mobileNumber doors ratePerUnit').lean();
    }
    if (!selectedOrder) {
      return res.status(404).json({ success: false, message: 'Selected order not found.' });
    }

    const selectedOrderCode = selectedOrder.orderId;

    const doorUnits = await DoorUnit.find({ _id: { $in: objectIds } });
    if (doorUnits.length !== objectIds.length) {
      return res.status(404).json({ success: false, message: 'Some selected doors were not found.' });
    }

    const invalidDoor = doorUnits.find(
      d => d.orderId !== selectedOrderCode || d.currentStage !== 'DELIVERY_PENDING' || d.delivery?.status === 'COMPLETED'
    );
    if (invalidDoor) {
      return res.status(400).json({
        success: false,
        message: `Door ${invalidDoor._id} is not eligible for selected order delivery.`
      });
    }

    const deliveredAt = new Date();
    for (const door of doorUnits) {
      door.delivery = {
        status: 'COMPLETED',
        driverName: String(driverName).trim(),
        driverMobile: String(driverMobile).trim(),
        vehicleNumber: String(vehicleNumber).trim(),
        deliveryAddress: String(deliveryAddress).trim(),
        customerMobile: String(customerMobile).trim(),
        deliveredAt
      };
      door.currentStage = 'DELIVERY_DONE';
      await door.save();
    }

    const invoiceDoors = doorUnits.map(door => {
      const spec = selectedOrder?.doors?.[door.doorNumber - 1] || {};
      return {
        doorId: String(door._id),
        orderId: selectedOrderCode,
        doorNumber: door.doorNumber,
        length: Number(spec.length || spec.dimension?.height || spec.height || 0),
        breadth: Number(spec.breadth || spec.dimension?.width || spec.width || 0),
        rate: Number(spec.rate || selectedOrder?.ratePerUnit || 0)
      };
    });

    const invoiceData = {
      companyName: 'Nityam Doors',
      invoiceId: `BATCH-${Date.now()}`,
      orderId: selectedOrderCode,
      customerName: String(customerName).trim() || selectedOrder?.customer?.name || '',
      customerMobile: String(customerMobile).trim() || selectedOrder?.customer?.mobileNumber || '',
      deliveryAddress: String(deliveryAddress).trim(),
      date: new Date().toLocaleDateString('en-IN'),
      delivery: {
        driverName: String(driverName).trim(),
        driverMobile: String(driverMobile).trim(),
        vehicleNumber: String(vehicleNumber).trim(),
        deliveryAddress: String(deliveryAddress).trim(),
        customerMobile: String(customerMobile).trim()
      },
      doors: invoiceDoors
    };

    const orderStatusSync = await updateOrderStatus(selectedOrderCode);

    res.status(200).json({
      success: true,
      message: `${doorUnits.length} door(s) delivered successfully`,
      data: {
        deliveredCount: doorUnits.length,
        deliveredDoorIds: doorUnits.map(d => String(d._id)),
        deliveredAt,
        orderStatusSync,
        invoiceData
      }
    });
  } catch (error) {
    console.error('❌ Error in submit-batch-delivery:', error);
    res.status(500).json({ success: false, message: 'Failed to submit batch delivery', error: error.message });
  }
});

/**
 * @route   POST /api/production/submit-delivery
 * @desc    Complete delivery for a door with strict mandatory delivery validation
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.post('/submit-delivery', protect, authorizeModule('production'), async (req, res) => {
  try {
    const {
      orderId,
      doorNumber,
      driverName,
      driverMobile,
      vehicleNumber,
      deliveryAddress,
      customerMobile,
      confirmDelivery
    } = req.body;

    const requiredFields = {
      orderId,
      doorNumber,
      driverName,
      driverMobile,
      vehicleNumber,
      deliveryAddress,
      customerMobile
    };

    const missing = Object.entries(requiredFields)
      .filter(([, value]) => String(value || '').trim() === '')
      .map(([key]) => key);

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    if (confirmDelivery !== true) {
      return res.status(400).json({
        success: false,
        message: 'Confirm Delivery must be checked before submission.'
      });
    }

    const doorUnit = await DoorUnit.findOne({ orderId, doorNumber });
    if (!doorUnit) {
      return res.status(404).json({ success: false, message: `Door unit not found: ${orderId} / ${doorNumber}` });
    }

    if (doorUnit.currentStage !== 'DELIVERY_PENDING') {
      return res.status(400).json({
        success: false,
        message: `Door #${doorNumber} is in ${doorUnit.currentStage}. Only DELIVERY_PENDING stage can be submitted.`
      });
    }

    if (doorUnit.delivery?.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: `Delivery already completed for door #${doorNumber}` });
    }

    const deliveredAt = new Date();
    doorUnit.delivery = {
      status: 'COMPLETED',
      driverName: String(driverName).trim(),
      driverMobile: String(driverMobile).trim(),
      vehicleNumber: String(vehicleNumber).trim(),
      deliveryAddress: String(deliveryAddress).trim(),
      customerMobile: String(customerMobile).trim(),
      deliveredAt
    };
    doorUnit.currentStage = 'DELIVERY_DONE';
    await doorUnit.save();

    const orderStatusSync = await updateOrderStatus(orderId);
    const orderCompleted = !!orderStatusSync.orderCompleted;

    const order = await Order.findOne({ orderId })
      .select('orderId customer.name createdAt doors ratePerUnit')
      .lean();

    const invoiceData = {
      companyName: 'Nityam Doors',
      orderId: order?.orderId || orderId,
      customerName: order?.customer?.name || 'N/A',
      date: new Date().toLocaleDateString('en-IN'),
      doors: (order?.doors || []).map((door, index) => ({
        doorNumber: index + 1,
        length: Number(door.length || door.dimension?.height || door.height || 0),
        breadth: Number(door.breadth || door.dimension?.width || door.width || 0),
        rate: Number(door.rate || order?.ratePerUnit || 0)
      }))
    };

    res.status(200).json({
      success: true,
      message: `Delivery completed for door #${doorNumber}`,
      data: {
        orderId,
        doorNumber,
        status: 'DELIVERY_DONE',
        deliveredAt,
        orderCompleted,
        orderStatusSync,
        invoiceData
      }
    });
  } catch (error) {
    console.error('❌ Error in submit-delivery:', error);
    res.status(500).json({ success: false, message: 'Failed to submit delivery', error: error.message });
  }
});

/**
 * @route   GET /api/production/door-summary
 * @desc    Get total door count grouped by type across ALL orders
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/door-summary', protect, authorizeModule('production'), async (req, res) => {
  try {
    const grouped = await Order.aggregate([
      { $unwind: '$doors' },
      { $group: { _id: '$doors.doorType', total: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);

    const summary = grouped.map(item => ({ doorType: item._id || 'Unknown', total: item.total }));
    const totalDoors = summary.reduce((sum, item) => sum + item.total, 0);

    res.status(200).json({ success: true, totalDoors, summary });
  } catch (error) {
    console.error('\u274c Error in door-summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/production/door-type-summary
 * @desc    Get count of doors grouped by type, optionally filtered by orderId
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.get('/door-type-summary', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { orderId } = req.query;
    const matchStage = orderId ? { orderId } : {};

    const result = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$doors' },
      { $group: { _id: '$doors.doorType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('\u274c Error in door-type-summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/production/inventory-usage
 * @desc    Log material usage for a production stage and deduct from inventory
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 */
router.post('/inventory-usage', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { stage, material, quantity, orderId } = req.body;

    if (!stage || !material || !quantity) {
      return res.status(400).json({ success: false, message: 'stage, material, and quantity are required' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'quantity must be a positive number' });
    }

    const db = mongoose.connection.db;

    // Check current total stock for this material (ledger model: sum all quantity entries)
    const stockResult = await db.collection('inventories').aggregate([
      { $match: { category: material } },
      { $group: { _id: '$category', totalStock: { $sum: '$quantity' } } }
    ]).toArray();

    const currentStock = stockResult.length > 0 ? stockResult[0].totalStock : 0;

    if (currentStock < qty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for "${material}". Available: ${currentStock}`
      });
    }

    // Deduct via negative-quantity ledger entry
    await db.collection('inventories').insertOne({
      category: material,
      quantity: -qty,
      createdAt: new Date(),
      type: 'USAGE',
      stage,
      orderId: orderId || null
    });

    // Audit log
    await db.collection('production_inventory_logs').insertOne({
      stage,
      material,
      quantity: qty,
      orderId: orderId || null,
      usedAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: `${qty} units of "${material}" deducted from inventory`,
      remainingStock: currentStock - qty
    });
  } catch (error) {
    console.error('\u274c Error in inventory-usage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
