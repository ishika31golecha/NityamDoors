const express = require('express');
const mongoose = require('mongoose');
const { protect, authorizeModule } = require('../middleware/authMiddleware');
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

function isSuperAdmin(user) {
  const roles = user?.roles && user.roles.length > 0 ? user.roles : [user?.role];
  return roles.includes('SuperAdmin');
}

function generatePaymentNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const t = String(Date.now()).slice(-6);
  const r = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PAY-${y}${m}${d}-${t}${r}`;
}

async function computePayroll({ filterType, dateInput, fromDate, toDate }) {
  const normalizedType = normalizeFilterType(filterType);
  const range = normalizedType === 'custom'
    ? getCustomDateRange(fromDate, toDate)
    : getDateRange(normalizedType, dateInput);
  const periodKey = normalizedType === 'custom'
    ? buildCustomPeriodKey(range.startDate, range.endDate)
    : buildPeriodKey(range.filterType, range.startDate);
  const stageRates = await getStageRates(StageRate);
  const payableStages = getPayableStagesFromRates(stageRates);

  const stageRows = await getWorkerStagePerformance(
    DoorUnit,
    range.startDate,
    range.endDate,
    payableStages
  );

  const payrollRows = buildPayrollRows(stageRows, stageRates);
  const summary = buildWorkerSummary(payrollRows);
  const totalPayment = payrollRows.reduce((sum, row) => sum + row.total, 0);

  return {
    range,
    periodKey,
    stageRates,
    payrollRows,
    summary,
    totalPayment
  };
}

async function getPendingWeeksByWorker() {
  const weeklyPerf = await DoorUnit.aggregate([
    { $unwind: '$stageHistory' },
    { $match: { 'stageHistory.quality': 'OK' } },
    {
      $group: {
        _id: {
          workerId: '$stageHistory.worker',
          year: { $isoWeekYear: '$stageHistory.timestamp' },
          week: { $isoWeek: '$stageHistory.timestamp' }
        }
      }
    }
  ]);

  const paidWeekly = await Payment.find({ filterType: 'weekly', status: 'PAID' })
    .select('worker periodKey')
    .lean();

  const paidSet = new Set((paidWeekly || []).map((p) => `${String(p.worker)}|${p.periodKey}`));
  const pendingMap = {};

  (weeklyPerf || []).forEach((item) => {
    const workerId = String(item._id.workerId);
    const periodKey = `${item._id.year}-W${String(item._id.week).padStart(2, '0')}`;
    const key = `${workerId}|${periodKey}`;
    if (!paidSet.has(key)) {
      pendingMap[workerId] = (pendingMap[workerId] || 0) + 1;
    }
  });

  return pendingMap;
}

router.get('/', protect, authorizeModule('production'), async (req, res) => {
  try {
    const filterType = normalizeFilterType(req.query.filterType || (req.query.fromDate && req.query.toDate ? 'custom' : 'weekly'));
    const date = req.query.date;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;

    const payroll = await computePayroll({ filterType, dateInput: date, fromDate, toDate });
    const payments = await Payment.find({
      filterType: payroll.range.filterType,
      periodKey: payroll.periodKey,
      status: 'PAID'
    })
      .sort({ paidAt: -1 })
      .lean();

    const paidWorkerSet = new Set((payments || []).map((p) => String(p.worker)));
    const pendingWorkers = payroll.summary
      .filter((w) => !paidWorkerSet.has(String(w.workerId)))
      .map((w) => ({
        workerId: w.workerId,
        workerName: w.workerName,
        amount: w.totalPaymentForWorker
      }));

    const pendingWeeksMap = await getPendingWeeksByWorker();

    const paidWorkers = payroll.summary
      .filter((w) => paidWorkerSet.has(String(w.workerId)))
      .map((w) => ({
        workerId: w.workerId,
        workerName: w.workerName,
        amount: w.totalPaymentForWorker
      }));

    const statusRows = payroll.summary.map((w) => ({
      workerId: w.workerId,
      workerName: w.workerName,
      week: payroll.range.label,
      amount: w.totalPaymentForWorker,
      status: paidWorkerSet.has(String(w.workerId)) ? 'PAID' : 'PENDING',
      pendingWeeks: pendingWeeksMap[String(w.workerId)] || 0
    }));

    res.status(200).json({
      success: true,
      data: payments,
      dateRange: {
        filterType: payroll.range.filterType,
        from: payroll.range.startDate,
        to: payroll.range.endDate,
        label: payroll.range.label,
        periodKey: payroll.periodKey
      },
      paidWorkers,
      unpaidWorkers: pendingWorkers,
      pendingWorkers,
      pendingWeeksByWorker: pendingWeeksMap,
      statusRows,
      summary: {
        paidWorkersCount: paidWorkers.length,
        unpaidWorkersCount: pendingWorkers.length,
        pendingWorkersCount: pendingWorkers.length,
        totalPaidAmount: (payments || []).reduce((sum, p) => sum + Number(p.totalAmount || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error loading payments:', error);
    res.status(500).json({ success: false, message: 'Failed to load payments', error: error.message });
  }
});

router.post('/pay', protect, authorizeModule('production'), async (req, res) => {
  try {
    const { workerId, filterType = 'custom', date, fromDate, toDate } = req.body || {};

    if (!workerId) {
      return res.status(400).json({ success: false, message: 'workerId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res.status(400).json({ success: false, message: 'Invalid workerId format' });
    }

    const worker = await Worker.findById(workerId).lean();
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    const payroll = await computePayroll({ filterType, dateInput: date, fromDate, toDate });
    const workerSummary = payroll.summary.find((w) => String(w.workerId) === String(workerId));

    if (!workerSummary || workerSummary.totalPaymentForWorker <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No payable production data found for this worker in selected date range'
      });
    }

    const existing = await Payment.findOne({
      worker: workerId,
      filterType: payroll.range.filterType,
      periodKey: payroll.periodKey,
      status: 'PAID'
    }).lean();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Payment already marked as PAID for this worker and period',
        data: existing
      });
    }

    const details = payroll.payrollRows
      .filter((row) => String(row.workerId) === String(workerId))
      .map((row) => ({
        stage: row.stage,
        doors: row.doors,
        rate: row.rate,
        total: row.total
      }));

    const payload = {
      paymentNumber: generatePaymentNumber(),
      worker: workerId,
      workerName: worker.name,
      filterType: payroll.range.filterType,
      periodKey: payroll.periodKey,
      week: payroll.range.label,
      rangeStart: payroll.range.startDate,
      rangeEnd: payroll.range.endDate,
      totalAmount: workerSummary.totalPaymentForWorker,
      status: 'PAID',
      details,
      paidBy: req.user._id,
      paidAt: new Date()
    };

    let payment;
    try {
      payment = await Payment.create(payload);
    } catch (err) {
      if (err?.code === 11000) {
        payload.paymentNumber = generatePaymentNumber();
        payment = await Payment.create(payload);
      } else {
        throw err;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Payment marked as PAID successfully',
      data: payment
    });
  } catch (error) {
    console.error('Error marking payment as paid:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to mark payment as paid', error: error.message });
  }
});

router.put('/:id', protect, authorizeModule('production'), async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Paid records are locked. Only SuperAdmin can edit paid records.'
      });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    if (req.body?.totalAmount !== undefined) {
      const value = Number(req.body.totalAmount);
      if (Number.isNaN(value) || value < 0) {
        return res.status(400).json({ success: false, message: 'totalAmount must be a non-negative number' });
      }
      payment.totalAmount = value;
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Paid record updated successfully',
      data: payment
    });
  } catch (error) {
    console.error('Error editing paid record:', error);
    res.status(500).json({ success: false, message: 'Failed to edit paid record', error: error.message });
  }
});

module.exports = router;
