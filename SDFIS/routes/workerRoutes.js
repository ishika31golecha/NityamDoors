const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const Worker = require('../models/Worker');

const router = express.Router();

// ============================================
// WORKER ROUTES
// ============================================

/**
 * @route   GET /api/workers
 * @desc    Get all workers
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 * 
 * Query params:
 * - status (optional): ACTIVE or INACTIVE
 */
router.get('/', protect, authorize('FactoryAdmin', 'ProductionSupervisor', 'SuperAdmin'), async (req, res) => {
  try {
    const { status } = req.query;

    // Build filter
    let filter = {};
    if (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
      filter.status = status.toUpperCase();
    }

    console.log('📋 Fetching workers:', filter);

    const workers = await Worker.find(filter)
      .select('workerId name phone status createdAt')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      message: 'Workers fetched successfully',
      count: workers.length,
      data: workers
    });

  } catch (error) {
    console.error('❌ Error fetching workers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workers',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/workers/:id
 * @desc    Get worker by ID
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 */
router.get('/:id', protect, authorize('FactoryAdmin', 'ProductionSupervisor', 'SuperAdmin'), async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id)
      .select('workerId name phone aadhaarNumber status createdAt')
      .lean();

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found',
        data: null
      });
    }

    res.status(200).json({
      success: true,
      message: 'Worker fetched successfully',
      data: worker
    });

  } catch (error) {
    console.error('❌ Error fetching worker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/workers
 * @desc    Create new worker
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 * 
 * Body:
 * {
 *   workerId: String (unique, required),
 *   name: String (required),
 *   phone: String (optional),
 *   aadhaarNumber: String (optional, masked format),
 *   status: String (ACTIVE/INACTIVE, default: ACTIVE)
 * }
 */
router.post('/', protect, authorize('FactoryAdmin', 'ProductionSupervisor', 'SuperAdmin'), async (req, res) => {
  try {
    const { workerId, name, phone, aadhaarNumber, status } = req.body;

    // Validation
    if (!workerId || !name) {
      return res.status(400).json({
        success: false,
        message: 'workerId and name are required',
        data: null
      });
    }

    // Check if worker already exists
    const existingWorker = await Worker.findOne({ workerId: workerId.toUpperCase() });
    if (existingWorker) {
      return res.status(409).json({
        success: false,
        message: `Worker with ID ${workerId} already exists`,
        data: null
      });
    }

    // Create new worker
    const newWorker = new Worker({
      workerId: workerId.toUpperCase(),
      name: name.trim(),
      phone: phone ? phone.trim() : null,
      aadhaarNumber: aadhaarNumber ? aadhaarNumber.trim() : null,
      status: (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) ? status.toUpperCase() : 'ACTIVE'
    });

    await newWorker.save();

    console.log(`✅ Worker created: ${workerId}`);

    res.status(201).json({
      success: true,
      message: 'Worker created successfully',
      data: newWorker
    });

  } catch (error) {
    console.error('❌ Error creating worker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create worker',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/workers/:id
 * @desc    Update worker
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 * 
 * Body: Any of the worker fields can be updated
 */
router.put('/:id', protect, authorize('FactoryAdmin', 'ProductionSupervisor', 'SuperAdmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, aadhaarNumber, status } = req.body;

    // Find worker
    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found',
        data: null
      });
    }

    // Update fields
    if (name) worker.name = name.trim();
    if (phone !== undefined) worker.phone = phone ? phone.trim() : null;
    if (aadhaarNumber !== undefined) worker.aadhaarNumber = aadhaarNumber ? aadhaarNumber.trim() : null;
    if (status && ['ACTIVE', 'INACTIVE'].includes(status.toUpperCase())) {
      worker.status = status.toUpperCase();
    }

    await worker.save();

    console.log(`✅ Worker updated: ${worker.workerId}`);

    res.status(200).json({
      success: true,
      message: 'Worker updated successfully',
      data: worker
    });

  } catch (error) {
    console.error('❌ Error updating worker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update worker',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/workers/:id
 * @desc    Delete worker (soft delete - set status to INACTIVE)
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 */
router.delete('/:id', protect, authorize('FactoryAdmin', 'ProductionSupervisor', 'SuperAdmin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Find worker
    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found',
        data: null
      });
    }

    // Soft delete: set status to INACTIVE
    worker.status = 'INACTIVE';
    await worker.save();

    console.log(`🗑️ Worker deactivated: ${worker.workerId}`);

    res.status(200).json({
      success: true,
      message: 'Worker deactivated successfully',
      data: worker
    });

  } catch (error) {
    console.error('❌ Error deleting worker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete worker',
      error: error.message
    });
  }
});

module.exports = router;
