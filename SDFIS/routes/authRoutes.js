const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Valid roles for SDFIS
 */
const VALID_ROLES = [
  'SuperAdmin',
  'FactoryAdmin', 
  'SalesExecutive',
  'ProductionSupervisor',
  'InventoryManager',
  'AccountsManager',
  'FranchiseeOwner'
];

/**
 * Generate JWT Token with roles array
 * @param {string} id - User ID
 * @param {Array} roles - User roles array
 * @returns {string} - JWT token
 * UPDATED: Now uses JWT_EXPIRES_IN from environment variable
 */
const generateToken = (id, roles = []) => {
  return jwt.sign({ id, roles }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'  // UPDATED: Use env variable with fallback
  });
};

/**
 * @route   POST /api/auth/signup
 * @desc    Public signup - creates user with PENDING status and empty roles
 * @access  Public
 * ADDED: New signup route for public registration
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;  // UPDATED: Added phone

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password.'
      });
    }

    // ADDED: Validate phone format if provided
    if (phone) {
      const phoneRegex = /^[+]?[0-9]{10,15}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid phone number (10-15 digits).'
        });
      }
    }

    // ADDED: Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    // ADDED: Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    // Check if user already exists (duplicate email check)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    // UPDATED: Create user with PENDING status and empty roles
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,           // Will be hashed by pre-save middleware
      phone: phone ? phone.replace(/\s/g, '') : null,  // ADDED: Phone number
      role: null,         // UPDATED: No role assigned
      roles: [],          // UPDATED: Empty roles array
      status: 'PENDING',  // UPDATED: PENDING status for admin approval
      isActive: false     // UPDATED: Not active until approved
    });

    // UPDATED: Do NOT generate token - user must wait for approval
    // UPDATED: Do NOT auto-login

    res.status(201).json({
      success: true,
      message: 'Signup successful! Your account is pending approval. Please wait for admin to assign your role.',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          status: user.status,
          createdAt: user.createdAt
        }
        // UPDATED: No token returned
      }
    });

  } catch (error) {
    console.error('Signup Error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join('. ')
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during signup. Please try again.'
    });
  }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Admin use - assigns role)
 * @access  Public (Consider protecting with adminOnly middleware)
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, roles } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email address.'
      });
    }

    // Validate role(s) if provided
    const userRole = role || 'SalesExecutive';
    let userRoles = roles || [userRole];
    
    // Ensure roles is an array
    if (!Array.isArray(userRoles)) {
      userRoles = [userRoles];
    }
    
    // Validate all roles
    const invalidRoles = userRoles.filter(r => !VALID_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid role(s): ${invalidRoles.join(', ')}. Valid roles are: ${VALID_ROLES.join(', ')}`
      });
    }

    // Create user with roles array
    const user = await User.create({
      name,
      email,
      password,
      role: userRoles[0], // Primary role
      roles: userRoles,   // All roles
      isActive: true
    });

    // Generate token with roles
    const token = generateToken(user._id, user.roles);

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          roles: user.roles,
          status: user.status,
          isActive: user.isActive,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Registration Error:', error);
    
    // Handle mongoose validation errors
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
      message: 'Server error during registration.'
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.'
      });
    }

    // Find user by email (include password for comparison)
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Check if user is active
    if (user.status !== 'active' || user.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please contact administrator.'
      });
    }

    // Validate password
    const isPasswordValid = await user.matchPassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Ensure roles array exists
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];

    // Generate token with roles
    const token = generateToken(user._id, userRoles);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          roles: userRoles,
          status: user.status,
          isActive: user.isActive !== false,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login.'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully.',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving user profile.'
    });
  }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', protect, async (req, res) => {
  try {
    const { name } = req.body;
    
    // Fields that can be updated
    const fieldsToUpdate = {};
    if (name) fieldsToUpdate.name = name;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      fieldsToUpdate,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user
      }
    });

  } catch (error) {
    console.error('Update Profile Error:', error);
    
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
      message: 'Server error updating profile.'
    });
  }
});

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (Admin only)
 * @access  Private/Admin
 */
router.get('/users', protect, authorize('SuperAdmin', 'FactoryAdmin'), async (req, res) => {
  try {
    const { role, status, page = 1, limit = 10 } = req.query;
    
    // Build filter object
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get users with pagination
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully.',
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving users.'
    });
  }
});

/**
 * ADDED: Approve pending user and assign roles
 * @route   PUT /api/auth/users/:id/approve
 * @desc    Approve a PENDING user by assigning roles and activating account
 * @access  Private/Admin (SuperAdmin, FactoryAdmin)
 */
router.put('/users/:id/approve', protect, authorize('SuperAdmin', 'FactoryAdmin'), async (req, res) => {
  try {
    const { roles } = req.body;
    const userId = req.params.id;
    const adminId = req.user._id;

    // Validate roles array
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one role to assign.'
      });
    }

    // Validate all roles against predefined list
    const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid role(s): ${invalidRoles.join(', ')}. Valid roles are: ${VALID_ROLES.join(', ')}`
      });
    }

    // FactoryAdmin cannot assign SuperAdmin role
    if (req.user.role !== 'SuperAdmin' && roles.includes('SuperAdmin')) {
      return res.status(403).json({
        success: false,
        message: 'Only SuperAdmin can assign SuperAdmin role.'
      });
    }

    // Find the user to approve
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // AUDIT: Store old values for logging
    const oldRoles = user.roles || [];
    const oldStatus = user.status;

    // Update user: assign roles and activate
    user.roles = roles;
    user.role = roles[0]; // Primary role is first in array
    user.status = 'active';
    user.isActive = true;
    user.approvedBy = adminId;  // AUDIT: Track who approved
    user.approvedAt = new Date();  // AUDIT: Track when approved

    await user.save();

    // AUDIT: Log the action
    console.log(`[AUDIT] User Approved:`, {
      timestamp: new Date().toISOString(),
      adminId: adminId,
      adminEmail: req.user.email,
      targetUserId: userId,
      targetEmail: user.email,
      oldRoles: oldRoles,
      newRoles: roles,
      oldStatus: oldStatus,
      newStatus: 'active'
    });

    res.status(200).json({
      success: true,
      message: `User ${user.name} approved successfully with roles: ${roles.join(', ')}`,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          roles: user.roles,
          status: user.status,
          isActive: user.isActive,
          approvedBy: adminId,
          approvedAt: user.approvedAt
        },
        audit: {
          oldRoles,
          newRoles: roles,
          oldStatus,
          newStatus: 'active',
          approvedBy: req.user.email,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Approve User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error approving user.'
    });
  }
});

/**
 * @route   PUT /api/auth/users/:id/role
 * @desc    Update user role (SuperAdmin only)
 * @access  Private/SuperAdmin
 */
router.put('/users/:id/role', protect, authorize('SuperAdmin'), async (req, res) => {
  try {
    const { role } = req.body;
    const userId = req.params.id;

    // Validate role
    const validRoles = [
      'SuperAdmin',
      'FactoryAdmin',
      'SalesExecutive',
      'ProductionSupervisor',
      'InventoryManager',
      'AccountsManager',
      'FranchiseeOwner'
    ];

    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles are: ${validRoles.join(', ')}`
      });
    }

    // Find and update user
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User role updated successfully.',
      data: { user }
    });

  } catch (error) {
    console.error('Update Role Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating user role.'
    });
  }
});

/**
 * @route   PUT /api/auth/users/:id/status
 * @desc    Update user active status (SuperAdmin only)
 * @access  Private/SuperAdmin
 */
router.put('/users/:id/status', protect, authorize('SuperAdmin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    const userId = req.params.id;

    // Prevent SuperAdmin from deactivating themselves
    if (req.user.id === userId && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.'
      });
    }

    // Map isActive to status field
    const status = isActive ? 'active' : 'inactive';

    // Find and update user
    const user = await User.findByIdAndUpdate(
      userId,
      { status, isActive },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully.`,
      data: { user }
    });

  } catch (error) {
    console.error('Update Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating user status.'
    });
  }
});

/**
 * @route   PUT /api/auth/users/:id/roles
 * @desc    Update user roles array (SuperAdmin only) - MULTI-ROLE SUPPORT
 * @access  Private/SuperAdmin
 */
router.put('/users/:id/roles', protect, authorize('SuperAdmin'), async (req, res) => {
  try {
    const { roles } = req.body;
    const userId = req.params.id;

    // Validate roles array
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one role.'
      });
    }

    // Validate all roles
    const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid role(s): ${invalidRoles.join(', ')}. Valid roles are: ${VALID_ROLES.join(', ')}`
      });
    }

    // Get the current user being updated
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Prevent removing SuperAdmin role from self
    const currentUserRoles = targetUser.roles || [targetUser.role];
    if (req.user.id === userId && currentUserRoles.includes('SuperAdmin') && !roles.includes('SuperAdmin')) {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove SuperAdmin role from your own account.'
      });
    }

    // Update user with new roles
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        roles: roles,
        role: roles[0] // Primary role is first in array
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'User roles updated successfully.',
      data: { user }
    });

  } catch (error) {
    console.error('Update Roles Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating user roles.'
    });
  }
});

module.exports = router;