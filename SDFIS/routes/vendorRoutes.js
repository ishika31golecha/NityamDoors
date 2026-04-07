const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * @route   POST /api/vendors/add
 * @desc    Add new vendor
 * @access  Private - FactoryAdmin, SuperAdmin
 */
router.post('/add', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { name, phone, email, category } = req.body;

    // Validate required fields
    if (!name || !phone || !email || !category) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Prepare vendor document
    const vendor = {
      name,
      phone,
      email,
      category,
      createdAt: new Date()
    };

    // Insert into MongoDB vendors collection
    const db = mongoose.connection.db;
    const collection = db.collection('vendors');
    const result = await collection.insertOne(vendor);

    res.status(201).json({
      success: true,
      message: 'Vendor added successfully',
      data: {
        _id: result.insertedId,
        ...vendor
      }
    });

  } catch (error) {
    console.error('Error adding vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add vendor',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/vendors
 * @desc    Get all vendors
 * @access  Private - FactoryAdmin, SuperAdmin
 */
router.get('/', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('vendors');

    // Fetch all vendors sorted by creation date (newest first)
    const vendors = await collection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      data: vendors,
      count: vendors.length
    });

  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/vendors/:id
 * @desc    Delete vendor by ID
 * @access  Private - FactoryAdmin, SuperAdmin
 */
router.delete('/:id', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor ID'
      });
    }

    const db = mongoose.connection.db;
    const collection = db.collection('vendors');

    // Delete vendor
    const result = await collection.deleteOne({
      _id: new mongoose.Types.ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete vendor',
      error: error.message
    });
  }
});

module.exports = router;
