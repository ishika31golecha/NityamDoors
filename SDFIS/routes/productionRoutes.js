const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const DoorUnit = require('../models/DoorUnit');
const Worker = require('../models/Worker');

const router = express.Router();

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
router.get('/approved-orders', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
router.get('/doors/:orderId', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
router.get('/order-details/:orderId', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
router.get('/order-full-details/:orderId', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
        height: door.dimension?.height || door.height || null,
        width: door.dimension?.width || door.width || null,
        type: door.doorType || door.type || 'Unknown',
        laminate: door.laminate || 'Unknown',
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
 *   stage: String (CUTTING|PROCESSING|POLISHING|PACKING|LOADING|COMPLETED),
 *   workerId: String (Worker ID reference),
 *   quality: String (OK|REJECTED),
 *   reason: String (required if REJECTED)
 * }
 * 
 * Validation:
 * - Stage cannot be skipped
 * - Worker must exist in workers collection
 * - If rejected, door stays in current stage
 * - Stage order: PENDING → CUTTING → PROCESSING → POLISHING → PACKING → LOADING → COMPLETED
 * - When all doors reach COMPLETED, order auto-completes
 */
router.post('/update-stage', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
    const validStages = ['PENDING', 'CUTTING', 'PROCESSING', 'POLISHING', 'PACKING', 'LOADING', 'COMPLETED'];
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

    // Validate worker exists
    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: `Worker not found: ${workerId}`,
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
    const historyEntry = {
      stage: quality === 'REJECTED' ? doorUnit.currentStage : stage,
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

    // CHECK: If quality is OK and stage is LOADING, check if we can complete the order
    if (quality === 'OK' && stage === 'LOADING') {
      // Check if all doors of this order have reached LOADING stage
      const allDoors = await DoorUnit.find({ orderId });
      const allCompleted = allDoors.every(d => d.currentStage === 'LOADING');

      if (allCompleted) {
        // Auto-complete the order
        const updatedOrder = await Order.findOneAndUpdate(
          { orderId },
          { 
            status: 'COMPLETED',
            completedAt: new Date()
          },
          { new: true }
        );
        console.log(`✅ Order ${orderId} auto-completed! All doors reached LOADING.`);

        return res.status(200).json({
          success: true,
          message: 'Stage updated successfully. Order auto-completed (all doors in LOADING)!',
          data: {
            orderId,
            doorNumber,
            currentStage: doorUnit.currentStage,
            orderCompleted: true,
            orderStatus: 'COMPLETED'
          }
        });
      }
    }

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
router.get('/history/:orderId', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
router.get('/worker-history', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
router.get('/worker-history-test', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
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
 * @route   GET /api/production/worker-performance
 * @desc    Get worker performance report (daily, monthly, yearly)
 * @query   type=daily|monthly|yearly, date=YYYY-MM-DD
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Returns worker performance grouped by worker and stage with door counts
 * Supports daily, monthly, and yearly filtering
 */
router.get('/worker-performance', protect, authorize('ProductionSupervisor', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { type = 'daily', date } = req.query;

    console.log('📊 Worker Performance Report Request:');
    console.log('  Type:', type);
    console.log('  Date:', date);

    // Validate type
    if (!['daily', 'monthly', 'yearly'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Must be: daily, monthly, or yearly'
      });
    }

    // Parse date
    let dateObj;
    if (type !== 'yearly' && !date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter required for daily and monthly reports'
      });
    }

    let matchStage = {};

    if (type === 'daily') {
      // Daily: YYYY-MM-DD
      const parts = date.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // MongoDB months are 0-indexed
      const day = parseInt(parts[2]);

      const startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

      console.log('  Daily range:', startDate, 'to', endDate);

      matchStage = {
        'stageHistory.timestamp': {
          $gte: startDate,
          $lte: endDate
        }
      };
    } else if (type === 'monthly') {
      // Monthly: YYYY-MM
      const parts = date.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]); // For monthly, we want 1-based from input

      // First day of month
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));

      // Last day of month
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      console.log('  Monthly range:', startDate, 'to', endDate);

      matchStage = {
        'stageHistory.timestamp': {
          $gte: startDate,
          $lte: endDate
        }
      };
    } else if (type === 'yearly') {
      // Yearly: YYYY
      const year = parseInt(date || new Date().getFullYear());

      const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

      console.log('  Yearly range:', startDate, 'to', endDate);

      matchStage = {
        'stageHistory.timestamp': {
          $gte: startDate,
          $lte: endDate
        }
      };
    }

    // MongoDB Aggregation Pipeline
    const aggregation = [
      // Step 1: Unwind stageHistory array
      {
        $unwind: '$stageHistory'
      },
      // Step 2: Filter by date range
      {
        $match: matchStage
      },
      // Step 3: Lookup worker details
      {
        $lookup: {
          from: 'workers',
          localField: 'stageHistory.worker',
          foreignField: '_id',
          as: 'workerDetails'
        }
      },
      // Step 4: Unwind workerDetails
      {
        $unwind: {
          path: '$workerDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      // Step 5: Group by worker and stage, count doors
      {
        $group: {
          _id: {
            workerId: '$stageHistory.worker',
            stage: '$stageHistory.stage'
          },
          workerName: { $first: '$workerDetails.name' },
          totalDoors: { $sum: 1 }
        }
      },
      // Step 6: Sort by worker name, then stage
      {
        $sort: {
          'workerName': 1,
          '_id.stage': 1
        }
      }
    ];

    console.log('  Running aggregation pipeline...');
    const results = await DoorUnit.aggregate(aggregation);

    console.log('  ✅ Results:', results.length, 'records');

    // Format results for frontend
    const workerSummary = {};

    results.forEach(item => {
      const workerName = item.workerName || 'Unknown Worker';
      const stage = item._id.stage;
      const totalDoors = item.totalDoors;

      if (!workerSummary[workerName]) {
        workerSummary[workerName] = {
          workerId: item._id.workerId,
          workerName: workerName,
          stages: {},
          totalDoorsForWorker: 0
        };
      }

      workerSummary[workerName].stages[stage] = totalDoors;
      workerSummary[workerName].totalDoorsForWorker += totalDoors;
    });

    // Convert to array and sort by worker name
    const formattedSummary = Object.values(workerSummary).sort((a, b) =>
      a.workerName.localeCompare(b.workerName)
    );

    res.status(200).json({
      success: true,
      message: 'Worker performance report generated successfully',
      type: type,
      date: date || new Date().getFullYear(),
      totalRecords: results.length,
      data: results,
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

module.exports = router;
