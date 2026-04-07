const express = require('express');
const Record = require('../models/Record');
const { protect, authorize, adminOnly, superAdminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/records
 * @desc    Create a new record
 * @access  Private (SuperAdmin, FactoryAdmin)
 */
router.post('/', protect, authorize('SuperAdmin', 'FactoryAdmin'), async (req, res) => {
  try {
    const { title, description, category, priority, status, tags } = req.body;

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and description.'
      });
    }

    // Create record with user as creator
    const record = await Record.create({
      title,
      description,
      category,
      priority,
      status,
      tags,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    // Populate creator information
    await record.populate('createdBy', 'name email role');

    res.status(201).json({
      success: true,
      message: 'Record created successfully.',
      data: {
        record
      }
    });

  } catch (error) {
    console.error('Create Record Error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error creating record.'
    });
  }
});

/**
 * @route   GET /api/records
 * @desc    Get all records with filtering and pagination
 * @access  Private (All logged-in users)
 */
router.get('/', protect, async (req, res) => {
  try {
    const { 
      category, 
      priority, 
      status, 
      search, 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (status) filter.status = status;

    // Add text search if provided
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get records with pagination and population
    const records = await Record.find(filter)
      .populate('createdBy', 'name email role')
      .populate('lastModifiedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Record.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Records retrieved successfully.',
      data: {
        records,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        },
        filters: {
          category,
          priority,
          status,
          search
        }
      }
    });

  } catch (error) {
    console.error('Get Records Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving records.'
    });
  }
});

/**
 * @route   GET /api/records/:id
 * @desc    Get a single record by ID
 * @access  Private (All logged-in users)
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const record = await Record.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('lastModifiedBy', 'name email');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Record retrieved successfully.',
      data: {
        record
      }
    });

  } catch (error) {
    console.error('Get Record Error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error retrieving record.'
    });
  }
});

/**
 * @route   PUT /api/records/:id
 * @desc    Update a record
 * @access  Private (SuperAdmin, FactoryAdmin, or record creator)
 */
router.put('/:id', protect, async (req, res) => {
  try {
    const record = await Record.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found.'
      });
    }

    // Check if user can modify this record
    if (!record.canModify(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only modify your own records unless you are an admin.'
      });
    }

    const { title, description, category, priority, status, tags } = req.body;

    // Fields that can be updated
    const fieldsToUpdate = { lastModifiedBy: req.user._id };
    if (title) fieldsToUpdate.title = title;
    if (description) fieldsToUpdate.description = description;
    if (category) fieldsToUpdate.category = category;
    if (priority) fieldsToUpdate.priority = priority;
    if (status) fieldsToUpdate.status = status;
    if (tags) fieldsToUpdate.tags = tags;

    const updatedRecord = await Record.findByIdAndUpdate(
      req.params.id,
      fieldsToUpdate,
      {
        new: true,
        runValidators: true
      }
    ).populate('createdBy', 'name email role')
     .populate('lastModifiedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Record updated successfully.',
      data: {
        record: updatedRecord
      }
    });

  } catch (error) {
    console.error('Update Record Error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error updating record.'
    });
  }
});

/**
 * @route   DELETE /api/records/:id
 * @desc    Delete a record
 * @access  Private (SuperAdmin only)
 */
router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const record = await Record.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found.'
      });
    }

    await Record.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Record deleted successfully.',
      data: {
        deletedRecord: {
          _id: record._id,
          title: record.title,
          deletedBy: req.user.name
        }
      }
    });

  } catch (error) {
    console.error('Delete Record Error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error deleting record.'
    });
  }
});

/**
 * @route   GET /api/records/category/:category
 * @desc    Get records by category
 * @access  Private (All logged-in users)
 */
router.get('/category/:category', protect, async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Validate category
    const validCategories = ['Production', 'Inventory', 'Quality', 'Maintenance', 'Sales', 'General'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Valid categories are: ${validCategories.join(', ')}`
      });
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    const records = await Record.find({ category })
      .populate('createdBy', 'name email role')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Record.countDocuments({ category });

    res.status(200).json({
      success: true,
      message: `Records in ${category} category retrieved successfully.`,
      data: {
        records,
        category,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Records by Category Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving records by category.'
    });
  }
});

/**
 * @route   GET /api/records/user/my-records
 * @desc    Get current user's records
 * @access  Private (All logged-in users)
 */
router.get('/user/my-records', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const records = await Record.find({ createdBy: req.user._id })
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Record.countDocuments({ createdBy: req.user._id });

    res.status(200).json({
      success: true,
      message: 'Your records retrieved successfully.',
      data: {
        records,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get My Records Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving your records.'
    });
  }
});

/**
 * @route   GET /api/records/stats
 * @desc    Get record statistics
 * @access  Private (Admin only)
 */
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    // Get various statistics
    const totalRecords = await Record.countDocuments();
    
    const recordsByCategory = await Record.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    const recordsByStatus = await Record.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const recordsByPriority = await Record.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent records (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentRecords = await Record.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    res.status(200).json({
      success: true,
      message: 'Record statistics retrieved successfully.',
      data: {
        totalRecords,
        recentRecords,
        recordsByCategory,
        recordsByStatus,
        recordsByPriority
      }
    });

  } catch (error) {
    console.error('Get Record Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving record statistics.'
    });
  }
});

module.exports = router;