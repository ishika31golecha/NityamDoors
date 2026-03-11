const express = require('express');
const { protect, authorize, authorizeModule } = require('../middleware/authMiddleware');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');

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
router.get('/', protect, authorizeModule('production'), async (req, res) => {
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
router.get('/:id', protect, authorizeModule('production'), async (req, res) => {
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
router.post('/', protect, authorizeModule('production'), async (req, res) => {
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
router.put('/:id', protect, authorizeModule('production'), async (req, res) => {
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
router.delete('/:id', protect, authorizeModule('production'), async (req, res) => {
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

// ============================================
// ATTENDANCE ROUTES
// ============================================

/**
 * @route   POST /api/workers/attendance/mark
 * @desc    Bulk upsert attendance for a date
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 *
 * Body: { date: "YYYY-MM-DD", attendance: [{ workerId, workerName, status }] }
 */
router.post('/attendance/mark', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { date, attendance } = req.body;

    if (!date || !Array.isArray(attendance) || attendance.length === 0) {
      return res.status(400).json({ success: false, message: 'date and attendance array are required' });
    }

    const ops = attendance.map(entry => ({
      updateOne: {
        filter: { workerId: entry.workerId.toUpperCase(), date },
        update: { $set: { workerName: entry.workerName, status: entry.status || 'Present' } },
        upsert: true
      }
    }));

    const result = await Attendance.bulkWrite(ops);

    console.log(`✅ Attendance saved for ${date}: upserted=${result.upsertedCount}, modified=${result.modifiedCount}`);

    res.status(200).json({
      success: true,
      message: `Attendance saved for ${date}`,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to save attendance', error: error.message });
  }
});

/**
 * @route   GET /api/workers/attendance/date?date=YYYY-MM-DD
 * @desc    Get attendance records for a specific date
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 */
router.get('/attendance/date', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date query param is required' });
    }

    const records = await Attendance.find({ date }).sort({ workerName: 1 }).lean();

    res.status(200).json({ success: true, date, count: records.length, data: records });
  } catch (error) {
    console.error('❌ Error fetching attendance by date:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance', error: error.message });
  }
});

/**
 * @route   GET /api/workers/attendance/month?month=MM&year=YYYY
 * @desc    Get per-worker attendance summary for a given month
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 */
router.get('/attendance/month', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'month and year query params are required' });
    }

    const mm = String(month).padStart(2, '0');
    const prefix = `${year}-${mm}`;

    const records = await Attendance.find({ date: { $regex: `^${prefix}` } }).lean();

    // Group by workerId
    const summary = {};
    records.forEach(r => {
      if (!summary[r.workerId]) {
        summary[r.workerId] = { workerId: r.workerId, workerName: r.workerName, present: 0, absent: 0, halfDay: 0, total: 0 };
      }
      summary[r.workerId].total++;
      if (r.status === 'Present') summary[r.workerId].present++;
      else if (r.status === 'Absent') summary[r.workerId].absent++;
      else if (r.status === 'Half Day') summary[r.workerId].halfDay++;
    });

    const data = Object.values(summary).sort((a, b) => a.workerName.localeCompare(b.workerName));

    res.status(200).json({ success: true, month: prefix, count: data.length, data });
  } catch (error) {
    console.error('❌ Error fetching monthly attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch monthly attendance', error: error.message });
  }
});

/**
 * @route   GET /api/workers/attendance/year?year=YYYY
 * @desc    Get per-worker attendance summary for each month of a year
 * @access  Private (FactoryAdmin, ProductionSupervisor, SuperAdmin)
 */
router.get('/attendance/year', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) {
      return res.status(400).json({ success: false, message: 'year query param is required' });
    }

    const records = await Attendance.find({ date: { $regex: `^${year}-` } }).lean();

    // Group by workerId -> month
    const summary = {};
    records.forEach(r => {
      const monthKey = r.date.substring(0, 7); // YYYY-MM
      if (!summary[r.workerId]) {
        summary[r.workerId] = { workerId: r.workerId, workerName: r.workerName, months: {} };
      }
      if (!summary[r.workerId].months[monthKey]) {
        summary[r.workerId].months[monthKey] = { present: 0, absent: 0, halfDay: 0, total: 0 };
      }
      summary[r.workerId].months[monthKey].total++;
      if (r.status === 'Present') summary[r.workerId].months[monthKey].present++;
      else if (r.status === 'Absent') summary[r.workerId].months[monthKey].absent++;
      else if (r.status === 'Half Day') summary[r.workerId].months[monthKey].halfDay++;
    });

    const data = Object.values(summary).sort((a, b) => a.workerName.localeCompare(b.workerName));

    res.status(200).json({ success: true, year, count: data.length, data });
  } catch (error) {
    console.error('❌ Error fetching yearly attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch yearly attendance', error: error.message });
  }
});

module.exports = router;
