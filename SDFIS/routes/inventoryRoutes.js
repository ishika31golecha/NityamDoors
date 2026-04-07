const express = require('express');
const { protect, authorize, authorizeModule } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * @route   POST /api/inventory/add
 * @desc    Add new inventory item
 * @access  Private - InventoryManager, SuperAdmin
 */
router.post('/add', protect, authorizeModule('inventory'), async (req, res) => {
  try {
    const { category, quantity, ...otherFields } = req.body;

    // Validate required fields
    if (!category || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Category and quantity are required'
      });
    }

    // Validate quantity is a number
    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number'
      });
    }

    // Prepare inventory item
    const inventoryItem = {
      category,
      quantity: parseInt(quantity),
      createdAt: new Date(),
      ...otherFields
    };

    // Insert into MongoDB inventories collection
    const db = mongoose.connection.db;
    const collection = db.collection('inventories');
    const result = await collection.insertOne(inventoryItem);

    res.status(201).json({
      success: true,
      message: 'Inventory item saved',
      data: {
        _id: result.insertedId,
        ...inventoryItem
      }
    });

  } catch (error) {
    console.error('Error adding inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add inventory item',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/inventory
 * @desc    Get all inventory items
 * @access  Private - InventoryManager, SuperAdmin
 */
router.get('/', protect, authorizeModule('inventory'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('inventories');
    
    // Fetch all inventory items sorted by creation date (newest first)
    const items = await collection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      data: items,
      count: items.length
    });

  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory items',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/inventory/snapshot
 * @desc    Get inventory snapshot grouped by category with total stock
 * @access  Private - FactoryAdmin, SuperAdmin
 */
router.get('/snapshot', protect, authorizeModule('inventory'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('inventories');
    
    // Aggregate inventory by category
    const snapshot = await collection.aggregate([
      {
        $group: {
          _id: '$category',
          totalStock: { $sum: '$quantity' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]).toArray();

    // Format response
    const formattedSnapshot = snapshot.map(item => ({
      category: item._id,
      totalStock: item.totalStock
    }));

    res.status(200).json({
      success: true,
      data: formattedSnapshot
    });

  } catch (error) {
    console.error('Error fetching inventory snapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory snapshot',
      error: error.message
    });
  }
});

module.exports = router;
