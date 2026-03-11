const express = require('express');
const Order = require('../models/Order');
const User = require('../models/User');
const DoorUnit = require('../models/DoorUnit');
const RolePermission = require('../models/RolePermission');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   GET /admin/orders
 * @desc    Fetch ALL orders with full details for Factory Admin
 * @access  Private (FactoryAdmin, SuperAdmin)
 * 
 * Returns:
 *   - orderId
 *   - customer.name
 *   - customerType
 *   - doors.length (total doors)
 *   - status
 *   - createdAt
 *   - totalAmount
 */
router.get('/orders', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    // Fetch all orders sorted by createdAt (latest first)
    const orders = await Order.find()
      .populate('customer._id', 'name email phone')
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Transform response to match frontend requirements
    const formattedOrders = orders.map(order => ({
      orderId: order.orderId,
      customerName: order.customer?.name || 'Unknown',
      customerType: order.customerType || 'Individual',
      totalDoors: order.doors?.length || 0,
      status: order.status,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
      _id: order._id,
      rejectionReason: order.rejectionReason || null,
      approvedBy: order.approvedBy?.name || null
    }));

    res.status(200).json({
      success: true,
      message: 'Orders fetched successfully.',
      count: formattedOrders.length,
      data: formattedOrders
    });

  } catch (error) {
    console.error('Get Admin Orders Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching orders.',
      error: error.message
    });
  }
});

/**
 * @route   GET /admin/production-queue
 * @desc    Fetch APPROVED and IN_PRODUCTION orders sorted by priority and creation date
 * @access  Private (FactoryAdmin, SuperAdmin)
 * 
 * Returns orders for production queue with:
 *   - orderId
 *   - customer.name
 *   - totalDoors (doors.length)
 *   - priority
 *   - status
 *   - createdAt
 *   - totalAmount
 * 
 * Sorting: Priority (High → Normal → Low), then by createdAt (oldest first)
 */
router.get('/production-queue', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    console.log('\n=== 📥 GET /admin/production-queue REQUEST ===');

    // Define priority order for sorting
    const priorityOrder = { 'High': 0, 'Normal': 1, 'Low': 2 };

    // Fetch orders that are APPROVED or IN_PRODUCTION
    const orders = await Order.find({
      status: { $in: ['APPROVED', 'IN_PRODUCTION'] }
    })
      .select('orderId customer doors priority status totalAmount createdAt')
      .lean();

    console.log(`📦 Found ${orders.length} orders in production queue`);

    // Sort by priority (High first) then by createdAt (oldest first)
    const sortedOrders = orders.sort((a, b) => {
      const priorityCompare = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
      if (priorityCompare !== 0) {
        return priorityCompare;
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    // Format response - include full doors array
    const formattedOrders = sortedOrders.map(order => ({
      orderId: order.orderId,
      customerName: order.customer?.name || 'Unknown',
      totalDoors: order.doors?.length || 0,
      priority: order.priority || 'Normal',
      status: order.status,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount || 0,
      doors: order.doors || [],  // Include full doors array with all details
      _id: order._id
    }));

    console.log(`✅ Returning ${formattedOrders.length} formatted orders`);

    res.status(200).json({
      success: true,
      message: 'Production queue fetched successfully.',
      count: formattedOrders.length,
      data: formattedOrders
    });

  } catch (error) {
    console.error('❌ Get Production Queue Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching production queue.',
      error: error.message
    });
  }
});

/**
 * @route   PUT /admin/orders/:orderId/approve
 * @desc    Approve an order for production
 * @access  Private (FactoryAdmin, SuperAdmin)
 * 
 * AUTO-CREATE: When order is approved, DoorUnit documents are created automatically
 * for each door in the order, initialized to CUTTING stage
 */
router.put('/orders/:orderId/approve', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOneAndUpdate(
      { orderId },
      {
        status: 'APPROVED',
        approvedBy: req.user._id,
        approvedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate('customer._id').populate('createdBy', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    // AUTO-CREATE: Generate DoorUnit documents for production tracking
    try {
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

      // Check if door units already exist
      const existingDoors = await DoorUnit.countDocuments({ orderId });
      
      if (existingDoors === 0) {
        await DoorUnit.insertMany(doorsToCreate);
        console.log(`✅ Auto-created ${totalDoors} door units for order ${orderId}`);
      } else {
        console.log(`⚠️ Door units already exist for order ${orderId}, skipping auto-create`);
      }
    } catch (doorError) {
      console.error('⚠️ Error creating door units:', doorError);
      // Don't fail the request, just log the error
    }

    res.status(200).json({
      success: true,
      message: 'Order approved successfully.',
      data: order
    });

  } catch (error) {
    console.error('Approve Order Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error approving order.',
      error: error.message
    });
  }
});

/**
 * @route   PUT /admin/orders/:orderId/reject
 * @desc    Reject an order with reason
 * @access  Private (FactoryAdmin, SuperAdmin)
 */
router.put('/orders/:orderId/reject', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required.'
      });
    }

    const order = await Order.findOneAndUpdate(
      { orderId },
      {
        status: 'REJECTED',
        rejectionReason: reason,
        approvedBy: req.user._id,
        approvedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate('customer._id').populate('createdBy', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order rejected successfully.',
      data: order
    });

  } catch (error) {
    console.error('Reject Order Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error rejecting order.',
      error: error.message
    });
  }
});

/**
 * @route   GET /admin/priority-orders
 * @desc    Fetch APPROVED and IN_PRODUCTION orders, optionally filtered by door priority
 * @access  Private (FactoryAdmin, SuperAdmin)
 * 
 * Query Parameters:
 *   priority (optional): 'High', 'Normal', or 'Low' - filters doors by priority
 * 
 * Returns:
 *   - orderId
 *   - customerName
 *   - doors (filtered by priority if specified)
 *   - status
 *   - createdAt
 */
router.get('/priority-orders', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    console.log('\n=== 📥 GET /admin/priority-orders REQUEST ===');
    console.log('Query Parameters:', req.query);

    const { priority } = req.query;

    // Validate priority parameter if provided
    if (priority && !['High', 'Normal', 'Low'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority value. Must be: High, Normal, or Low.'
      });
    }

    // Fetch orders that are APPROVED or IN_PRODUCTION
    const orders = await Order.find({
      status: { $in: ['APPROVED', 'IN_PRODUCTION'] }
    })
      .select('orderId customer doors status totalAmount createdAt')
      .lean();

    console.log(`📦 Found ${orders.length} orders with APPROVED or IN_PRODUCTION status`);

    // Format response
    const formattedOrders = orders.map(order => {
      let filteredDoors = order.doors || [];

      // If priority parameter is provided, filter doors by that priority
      if (priority) {
        filteredDoors = filteredDoors.filter(door => door.priority === priority);
        console.log(`🔍 Filtering for priority "${priority}": ${filteredDoors.length} doors found in order ${order.orderId}`);
      }

      return {
        orderId: order.orderId,
        customerName: order.customer?.name || 'Unknown',
        status: order.status,
        createdAt: order.createdAt,
        totalAmount: order.totalAmount || 0,
        doors: filteredDoors,
        totalDoors: filteredDoors.length
      };
    });

    // Filter out orders with no doors (only if priority filter is applied and no matching doors)
    const nonEmptyOrders = formattedOrders.filter(order => order.doors.length > 0);

    console.log(`✅ Returning ${nonEmptyOrders.length} orders with matching criteria`);

    res.status(200).json({
      success: true,
      message: 'Priority orders fetched successfully.',
      count: nonEmptyOrders.length,
      filter: priority || 'All',
      data: nonEmptyOrders
    });

  } catch (error) {
    console.error('❌ Get Priority Orders Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching priority orders.',
      error: error.message
    });
  }
});

/**
 * @route   PUT /admin/orders/:orderId/priority
 * @desc    Update the top-level priority of an order
 * @access  Private (FactoryAdmin, SuperAdmin)
 *
 * Params:  orderId  — the human-readable order ID (e.g. ORD-123)
 * Body:    { priority: "High" | "Normal" | "Low" }
 */
router.put('/orders/:orderId/priority', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    console.log('\n=== 📥 PUT /admin/orders/:orderId/priority REQUEST ===');

    const { orderId } = req.params;
    const { priority } = req.body;

    // Validate priority value
    if (!priority || !['High', 'Normal', 'Low'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Priority must be one of: High, Normal, Low.'
      });
    }

    // Find the order
    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order ${orderId} not found.`
      });
    }

    const oldPriority = order.priority || 'Normal';
    order.priority = priority;
    await order.save();

    console.log(`✅ Order ${orderId} priority updated: ${oldPriority} → ${priority}`);

    res.status(200).json({
      success: true,
      message: `Order priority updated from ${oldPriority} to ${priority}.`,
      data: { orderId: order.orderId, priority: order.priority }
    });

  } catch (err) {
    console.error('❌ Update Order Priority Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update priority.',
      error: err.message
    });
  }
});

/**
 * @route   PUT /admin/update-door-priority
 * @desc    Update priority of a specific door in an order
 * @access  Private (FactoryAdmin, SuperAdmin)
 * 
 * Body:
 *   {
 *     orderId: "ORD-123",
 *     doorIndex: 0,
 *     newPriority: "High" | "Normal" | "Low"
 *   }
 */
router.put('/update-door-priority', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    console.log('\n=== 📥 PUT /admin/update-door-priority REQUEST ===');
    console.log('Body:', JSON.stringify(req.body));

    const { orderId, doorIndex, newPriority } = req.body;

    // Validate required fields
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required.' });
    }

    if (doorIndex === undefined || doorIndex === null) {
      return res.status(400).json({ success: false, message: 'Door index is required.' });
    }

    if (!newPriority || !['High', 'Normal', 'Low'].includes(newPriority)) {
      return res.status(400).json({ success: false, message: 'Priority must be: High, Normal, or Low.' });
    }

    // Parse to integer (parseInt handles both numbers and numeric strings)
    const idx = parseInt(doorIndex, 10);
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json({ success: false, message: 'Door index must be a non-negative integer.' });
    }

    console.log(`🔄 Updating door priority: Order=${orderId}, Door Index=${idx}, New Priority=${newPriority}`);

    // Find the order to validate door index bounds
    const order = await Order.findOne({ orderId }).lean();

    if (!order) {
      return res.status(404).json({ success: false, message: `Order ${orderId} not found.` });
    }

    const totalDoors = (order.doors || []).length;
    if (idx >= totalDoors) {
      return res.status(400).json({
        success: false,
        message: `Invalid door index ${idx}. Order has ${totalDoors} door(s).`
      });
    }

    const oldPriority = (order.doors[idx] && order.doors[idx].priority) || 'Normal';

    // Use MongoDB $set with array dot-notation to update ONLY this one field.
    // This bypasses Mongoose full-document validators entirely — no ValidationError
    // on unrelated required fields (e.g. mobileNumber, area, etc.).
    const updateResult = await Order.collection.updateOne(
      { orderId: orderId },
      { $set: { [`doors.${idx}.priority`]: newPriority } }
    );

    console.log(`✅ Door priority updated: ${oldPriority} → ${newPriority}`, updateResult);

    res.status(200).json({
      success: true,
      message: `Door priority updated from ${oldPriority} to ${newPriority}.`,
      data: { orderId, doorIndex: idx, oldPriority, newPriority }
    });

  } catch (error) {
    console.error('❌ Update Door Priority Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message,   // Return the real error so the frontend toast shows it
      error: error.stack
    });
  }
});

// ============================================================
// ROLE PERMISSION MANAGEMENT ROUTES
// ============================================================

/**
 * @route   GET /api/admin/permissions
 * @desc    Get module permissions for all roles
 * @access  Private (SuperAdmin)
 */
router.get('/permissions', protect, authorize('SuperAdmin'), async (req, res) => {
  try {
    const rows = await RolePermission.find({}).lean();

    // Build a role → permissions map
    const matrix = {};
    rows.forEach(r => {
      matrix[r.role] = {
        orders:     !!r.permissions.orders,
        production: !!r.permissions.production,
        inventory:  !!r.permissions.inventory,
        accounts:   !!r.permissions.accounts,
        reports:    !!r.permissions.reports
      };
    });

    res.status(200).json({ success: true, data: matrix });
  } catch (error) {
    console.error('GET /permissions Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load permissions.' });
  }
});

/**
 * @route   PUT /api/admin/permissions
 * @desc    Save module permissions for all roles
 * @body    { FactoryAdmin: { orders: true, ... }, SalesExecutive: { ... }, ... }
 * @access  Private (SuperAdmin)
 */
router.put('/permissions', protect, authorize('SuperAdmin'), async (req, res) => {
  try {
    const matrix = req.body;

    if (!matrix || typeof matrix !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid permissions body.' });
    }

    const VALID_MODULES = ['orders', 'production', 'inventory', 'accounts', 'reports'];
    const ops = [];

    for (const [role, perms] of Object.entries(matrix)) {
      // SuperAdmin permissions are immutable — always full access
      if (role === 'SuperAdmin') continue;

      if (typeof perms !== 'object') continue;

      const sanitised = {};
      VALID_MODULES.forEach(m => {
        sanitised[m] = perms[m] === true;
      });

      ops.push({
        updateOne: {
          filter: { role },
          update: { $set: { permissions: sanitised } },
          upsert: true
        }
      });
    }

    if (ops.length > 0) {
      await RolePermission.bulkWrite(ops);
    }

    res.status(200).json({ success: true, message: 'Permissions saved successfully.' });
  } catch (error) {
    console.error('PUT /permissions Error:', error);
    res.status(500).json({ success: false, message: 'Failed to save permissions.' });
  }
});

/**
 * @route   POST /api/admin/permissions/reset
 * @desc    Reset all role permissions to system defaults
 * @access  Private (SuperAdmin)
 */
router.post('/permissions/reset', protect, authorize('SuperAdmin'), async (req, res) => {
  try {
    const matrix = RolePermission.DEFAULT_MATRIX;
    const ops = Object.entries(matrix)
      .filter(([role]) => role !== 'SuperAdmin')
      .map(([role, permissions]) => ({
        updateOne: {
          filter: { role },
          update: { $set: { permissions } },
          upsert: true
        }
      }));

    await RolePermission.bulkWrite(ops);
    res.status(200).json({ success: true, message: 'Permissions reset to defaults.' });
  } catch (error) {
    console.error('POST /permissions/reset Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset permissions.' });
  }
});

/**
 * @route   GET /api/admin/order-overview
 * @desc    Fetch all approved/in-production/completed orders with door-level progress summary
 * @access  Private (FactoryAdmin, SuperAdmin)
 */
router.get('/order-overview', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $in: ['APPROVED', 'IN_PRODUCTION', 'COMPLETED'] }
    })
      .select('orderId customer doors status priority createdAt')
      .lean();

    const overviewPromises = orders.map(async (order) => {
      const totalDoors = order.doors ? order.doors.length : 0;
      const doorUnits = await DoorUnit.find({ orderId: order.orderId })
        .select('currentStage')
        .lean();
      const DONE_STAGES = ['PACKING', 'DELIVERY', 'COMPLETED'];
      const completedDoors = doorUnits.filter(d => DONE_STAGES.includes(d.currentStage)).length;
      return {
        orderId: order.orderId,
        customerName: order.customer?.name || 'N/A',
        totalDoors,
        completedDoors,
        remainingDoors: totalDoors - completedDoors,
        progressPct: totalDoors > 0 ? Math.round((completedDoors / totalDoors) * 100) : 0,
        status: order.status,
        priority: order.priority || 'Normal',
        createdAt: order.createdAt
      };
    });

    const overview = await Promise.all(overviewPromises);
    res.status(200).json({ success: true, count: overview.length, data: overview });
  } catch (error) {
    console.error('GET /order-overview Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching order overview.', error: error.message });
  }
});

/**
 * @route   GET /api/admin/order-overview/:orderId/doors
 * @desc    Fetch door-level progress detail for a single order
 * @access  Private (FactoryAdmin, SuperAdmin)
 */
router.get('/order-overview/:orderId/doors', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const doorUnits = await DoorUnit.find({ orderId })
      .select('doorNumber currentStage stageHistory isRejected')
      .lean();

    const doors = doorUnits.map(du => {
      const lastEntry = du.stageHistory && du.stageHistory.length > 0
        ? du.stageHistory[du.stageHistory.length - 1]
        : null;
      return {
        doorNumber: du.doorNumber,
        currentStage: du.currentStage,
        isRejected: du.isRejected || false,
        lastWorker: lastEntry?.worker || 'Unassigned',
        lastStageCompleted: lastEntry?.stage || '—'
      };
    });

    doors.sort((a, b) => a.doorNumber - b.doorNumber);
    res.status(200).json({ success: true, count: doors.length, data: doors });
  } catch (error) {
    console.error('GET /order-overview/:orderId/doors Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching door details.', error: error.message });
  }
});

module.exports = router;
