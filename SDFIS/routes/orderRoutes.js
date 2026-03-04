const express = require('express');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Create a new order (Sales Executive submits order)
 * @access  Private (SalesExecutive, FactoryAdmin, SuperAdmin)
 */
router.post('/', protect, authorize('SalesExecutive', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    console.log('\n=== 📥 POST /api/orders REQUEST ===');
    console.log('Request Body Keys:', Object.keys(req.body));
    console.log('Full Request Body:', JSON.stringify(req.body, null, 2));

    const { customerType, customer, poc, doors, orderMeta } = req.body;

    // Validate required fields
    if (!customer || !customer.name) {
      console.error('❌ Validation failed: Missing customer name');
      return res.status(400).json({
        success: false,
        message: 'Customer name is required.'
      });
    }

    if (!doors || doors.length === 0) {
      console.error('❌ Validation failed: No doors specified');
      return res.status(400).json({
        success: false,
        message: 'At least one door specification is required.'
      });
    }

    console.log('📋 Creating order with:');
    console.log('  Customer:', customer.name);
    console.log('  Doors:', doors.length);
    console.log('  POC:', poc?.name);

    // Create order object
    const orderData = {
      customer: {
        name: customer.name,
        email: customer.primaryEmail,
        phone: customer.primaryPhone,
        address: customer.address?.billing
      },
      customerType: customerType || 'Individual',
      doors: doors,
      poc: poc || {},
      totalAmount: 0, // Will be calculated later
      status: 'CREATED', // Sales Executive creates as CREATED
      notes: customer.address?.delivery ? `Delivery to: ${customer.address.delivery}` : '',
      createdBy: req.user._id
    };

    console.log('📝 Saving order to MongoDB...');
    console.log('Order data:', JSON.stringify(orderData, null, 2));

    // Save to MongoDB
    const order = await Order.create(orderData);

    console.log('✅ Order saved successfully!');
    console.log('Order ID:', order._id);
    console.log('Order Number:', order.orderId);

    res.status(201).json({
      success: true,
      message: 'Order created successfully and saved to MongoDB.',
      data: { 
        order,
        orderId: order.orderId,
        mongoId: order._id
      }
    });

  } catch (error) {
    console.error('❌ Create Order Error:', error);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Server error creating order: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/orders
 * @desc    Get all orders
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find();

    res.status(200).json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    console.error('Get Orders Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching orders.'
    });
  }
});

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    console.error('Get Order By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching order.'
    });
  }
});

/**
 * @route   PUT /api/orders/:id
 * @desc    Update order
 * @access  Private (SalesExecutive, FactoryAdmin, SuperAdmin)
 */
router.put('/:id', protect, authorize('SalesExecutive', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { items, totalAmount, status } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { items, totalAmount, status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order updated successfully.',
      data: { order }
    });
  } catch (error) {
    console.error('Update Order Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating order.'
    });
  }
});

module.exports = router;
