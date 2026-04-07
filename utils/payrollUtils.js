const DEFAULT_STAGE_RATES = {
  CUTTING: 0,
  BTC: 0,
  LAMINATE: 0,
  PRESS: 0,
  FINISH: 0,
  PACKING: 0,
  DELIVERY_PENDING: 0,
  DELIVERY_DONE: 0,
  DELIVERY: 0,
  COMPLETED: 0
};

const PAYROLL_FILTER_TYPES = ['weekly', 'monthly', 'custom'];

function toUtcStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function toUtcEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function normalizeFilterType(type) {
  if (!type) return 'weekly';
  const normalized = String(type).toLowerCase();
  return PAYROLL_FILTER_TYPES.includes(normalized) ? normalized : 'weekly';
}

function getCustomDateRange(fromDateInput, toDateInput) {
  const from = fromDateInput ? new Date(fromDateInput) : null;
  const to = toDateInput ? new Date(toDateInput) : null;

  if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) {
    throw new Error('fromDate and toDate are required in YYYY-MM-DD format');
  }

  const startDate = toUtcStart(from);
  const endDate = toUtcEnd(to);

  if (startDate > endDate) {
    throw new Error('fromDate cannot be greater than toDate');
  }

  return {
    filterType: 'custom',
    startDate,
    endDate,
    label: `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`
  };
}

function getDateRange(filterType = 'weekly', dateInput) {
  const type = normalizeFilterType(filterType);
  const referenceDate = dateInput ? new Date(dateInput) : new Date();
  const safeRefDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;

  if (type === 'monthly') {
    const year = safeRefDate.getUTCFullYear();
    const month = safeRefDate.getUTCMonth();

    const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    return {
      filterType: type,
      startDate,
      endDate,
      label: `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`
    };
  }

  const endDate = toUtcEnd(safeRefDate);
  const startDateRaw = new Date(endDate);
  startDateRaw.setUTCDate(startDateRaw.getUTCDate() - 6);
  const startDate = toUtcStart(startDateRaw);

  return {
    filterType: type,
    startDate,
    endDate,
    label: `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`
  };
}

function buildPeriodKey(filterType, startDate) {
  const type = normalizeFilterType(filterType);
  if (type === 'custom') {
    return `RANGE-${startDate.toISOString().slice(0, 10)}`;
  }
  if (type === 'monthly') {
    return `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return `${startDate.toISOString().slice(0, 10)}`;
}

function buildCustomPeriodKey(startDate, endDate) {
  return `RANGE-${startDate.toISOString().slice(0, 10)}_${endDate.toISOString().slice(0, 10)}`;
}

function mergeRates(storedRates = {}) {
  return {
    ...DEFAULT_STAGE_RATES,
    ...(storedRates || {})
  };
}

async function getStageRates(StageRateModel) {
  const settings = await StageRateModel.findOne({ key: 'DEFAULT' }).lean();
  return mergeRates(settings?.rates || {});
}

function getPayableStagesFromRates(stageRates = {}) {
  return Object.keys(mergeRates(stageRates));
}

async function getWorkerStagePerformance(DoorUnitModel, startDate, endDate, payableStages) {
  const results = await DoorUnitModel.aggregate([
    { $unwind: '$stageHistory' },
    {
      $match: {
        'stageHistory.timestamp': {
          $gte: startDate,
          $lte: endDate
        },
        'stageHistory.quality': 'OK',
        'stageHistory.stage': { $in: payableStages }
      }
    },
    {
      $lookup: {
        from: 'workers',
        localField: 'stageHistory.worker',
        foreignField: '_id',
        as: 'workerDetails'
      }
    },
    {
      $unwind: {
        path: '$workerDetails',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $group: {
        _id: {
          workerId: '$stageHistory.worker',
          stage: '$stageHistory.stage'
        },
        workerName: { $first: '$workerDetails.name' },
        doors: { $sum: 1 }
      }
    },
    {
      $sort: {
        workerName: 1,
        '_id.stage': 1
      }
    }
  ]);

  return (results || []).map((item) => ({
    workerId: item._id.workerId ? String(item._id.workerId) : null,
    workerName: item.workerName || 'Unknown Worker',
    stage: item._id.stage,
    doors: item.doors
  }));
}

function buildPayrollRows(stageRows, stageRates) {
  return (stageRows || []).map((row) => {
    const rate = Number(stageRates[row.stage] || 0);
    const doors = Number(row.doors || 0);
    return {
      workerId: row.workerId,
      workerName: row.workerName,
      stage: row.stage,
      doors,
      rate,
      total: doors * rate
    };
  });
}

function buildWorkerSummary(payrollRows) {
  const byWorker = {};

  (payrollRows || []).forEach((row) => {
    const workerId = String(row.workerId || 'UNKNOWN');
    if (!byWorker[workerId]) {
      byWorker[workerId] = {
        workerId: row.workerId,
        workerName: row.workerName,
        stages: {},
        totalDoorsForWorker: 0,
        totalPaymentForWorker: 0
      };
    }

    byWorker[workerId].stages[row.stage] = (byWorker[workerId].stages[row.stage] || 0) + row.doors;
    byWorker[workerId].totalDoorsForWorker += row.doors;
    byWorker[workerId].totalPaymentForWorker += row.total;
  });

  return Object.values(byWorker).sort((a, b) => a.workerName.localeCompare(b.workerName));
}

module.exports = {
  DEFAULT_STAGE_RATES,
  PAYROLL_FILTER_TYPES,
  normalizeFilterType,
  getDateRange,
  getCustomDateRange,
  buildPeriodKey,
  buildCustomPeriodKey,
  getStageRates,
  getPayableStagesFromRates,
  getWorkerStagePerformance,
  buildPayrollRows,
  buildWorkerSummary,
  mergeRates
};