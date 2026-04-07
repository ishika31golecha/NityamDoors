const express = require('express');
const { protect, authorizeModule } = require('../middleware/authMiddleware');
const StageRate = require('../models/StageRate');
const Setting = require('../models/Setting');
const { DEFAULT_STAGE_RATES, mergeRates } = require('../utils/payrollUtils');

const router = express.Router();

function isSuperAdmin(user) {
  const roles = user?.roles && user.roles.length > 0 ? user.roles : [user?.role];
  return roles.includes('SuperAdmin');
}

function normalizeGstPercent(rawValue) {
  const value = Number(rawValue);
  if (Number.isNaN(value) || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return Number(value.toFixed(2));
}

router.get('/gst', protect, async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'GST_PERCENT' }).lean();
    const gstPercent = normalizeGstPercent(setting?.value);

    res.status(200).json({
      success: true,
      data: {
        key: 'GST_PERCENT',
        value: gstPercent === null ? 0 : gstPercent,
        updatedAt: setting?.updatedAt || null,
        updatedBy: setting?.updatedBy || null
      }
    });
  } catch (error) {
    console.error('Error fetching GST setting:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch GST setting', error: error.message });
  }
});

router.put('/gst', protect, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only SuperAdmin can update GST'
      });
    }

    const gstPercent = normalizeGstPercent(req.body?.value);
    if (gstPercent === null) {
      return res.status(400).json({
        success: false,
        message: 'Invalid GST value. GST must be a number between 0 and 100.'
      });
    }

    const updated = await Setting.findOneAndUpdate(
      { key: 'GST_PERCENT' },
      {
        $set: {
          value: gstPercent,
          updatedBy: req.user._id
        }
      },
      { new: true, upsert: true }
    ).lean();

    res.status(200).json({
      success: true,
      message: 'GST updated successfully',
      data: {
        key: 'GST_PERCENT',
        value: Number(updated.value || 0),
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy
      }
    });
  } catch (error) {
    console.error('Error updating GST setting:', error);
    res.status(500).json({ success: false, message: 'Failed to update GST setting', error: error.message });
  }
});

router.get('/stage-rates', protect, authorizeModule('production'), async (req, res) => {
  try {
    let settings = await StageRate.findOne({ key: 'DEFAULT' }).lean();

    if (!settings) {
      const created = await StageRate.create({
        key: 'DEFAULT',
        rates: DEFAULT_STAGE_RATES,
        updatedBy: req.user._id
      });
      settings = created.toObject();
    }

    res.status(200).json({
      success: true,
      data: {
        rates: mergeRates(settings.rates || {}),
        updatedAt: settings.updatedAt || null,
        updatedBy: settings.updatedBy || null
      }
    });
  } catch (error) {
    console.error('Error fetching stage rates:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stage rates', error: error.message });
  }
});

router.put('/stage-rates', protect, authorizeModule('production'), async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only SuperAdmin can edit stage rates'
      });
    }

    const payloadRates = req.body?.rates;
    if (!payloadRates || typeof payloadRates !== 'object' || Array.isArray(payloadRates)) {
      return res.status(400).json({ success: false, message: 'rates object is required' });
    }

    const merged = mergeRates(payloadRates);
    const invalidEntry = Object.entries(merged).find(([, value]) => Number(value) < 0 || Number.isNaN(Number(value)));

    if (invalidEntry) {
      return res.status(400).json({
        success: false,
        message: `Invalid rate for stage ${invalidEntry[0]}. Rate must be a non-negative number.`
      });
    }

    const normalizedRates = Object.fromEntries(
      Object.entries(merged).map(([stage, value]) => [stage, Number(value)])
    );

    const updated = await StageRate.findOneAndUpdate(
      { key: 'DEFAULT' },
      {
        $set: {
          rates: normalizedRates,
          updatedBy: req.user._id
        }
      },
      { new: true, upsert: true }
    ).lean();

    res.status(200).json({
      success: true,
      message: 'Stage rates updated successfully',
      data: {
        rates: mergeRates(updated.rates || {}),
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy
      }
    });
  } catch (error) {
    console.error('Error updating stage rates:', error);
    res.status(500).json({ success: false, message: 'Failed to update stage rates', error: error.message });
  }
});

module.exports = router;
