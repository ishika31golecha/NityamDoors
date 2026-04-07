const express = require('express');
const Customer = require('../models/Customer');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/customers
 * @desc    Create a new customer
 * @access  Private (SalesExecutive, FactoryAdmin, SuperAdmin)
 */
router.post('/', protect, authorize('SalesExecutive', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { name, email, phone, address, city, type } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide customer name and phone number.'
      });
    }

    const customer = await Customer.create({
      name,
      email,
      phone,
      address,
      city,
      type,
      createdBy: req.user._id
    });

    await customer.populate('createdBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully.',
      data: { customer }
    });
  } catch (error) {
    console.error('Create Customer Error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error creating customer.'
    });
  }
});

/**
 * @route   GET /api/customers/my
 * @desc    Get customers created by current user
 * @access  Private (SalesExecutive, FactoryAdmin, SuperAdmin)
 */
router.get('/my', protect, authorize('SalesExecutive', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const customers = await Customer.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: { customers }
    });
  } catch (error) {
    console.error('Get My Customers Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching customers.'
    });
  }
});

module.exports = router;
