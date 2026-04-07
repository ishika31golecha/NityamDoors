const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Valid roles for the SDFIS system
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
 * User Schema for Smart Door ERP System
 * Supports multiple roles for different access levels
 */
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address'
    ]
  },
  
  // ADDED: Phone number field
  phone: {
    type: String,
    trim: true,
    match: [
      /^[+]?[0-9]{10,15}$/,
      'Please provide a valid phone number'
    ]
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  
  // Single role field (kept for backward compatibility)
  role: {
    type: String,
    enum: {
      values: VALID_ROLES,
      message: 'Please select a valid role'
    },
    default: 'SalesExecutive'
  },
  
  // Multiple roles array (new feature)
  roles: {
    type: [String],
    validate: {
      validator: function(roles) {
        // All roles must be valid
        return roles.every(role => VALID_ROLES.includes(role));
      },
      message: 'One or more roles are invalid'
    },
    default: function() {
      // Default to the single role if roles array is empty
      return this.role ? [this.role] : ['SalesExecutive'];
    }
  },
  
  // User active status
  isActive: {
    type: Boolean,
    default: true
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'PENDING'],  // UPDATED: Added 'PENDING' for new signups
    default: 'active'
  },
  
  // ADDED: Franchise ID for FranchiseeOwner role - used for data filtering
  franchiseId: {
    type: String,
    trim: true,
    default: null  // Only set for FranchiseeOwner users
  },
  
  // ADDED: Audit fields for user approval
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

/**
 * Pre-save middleware to hash password and sync roles
 */
userSchema.pre('save', async function(next) {
  // Sync single role with roles array
  if (this.roles && this.roles.length > 0 && !this.role) {
    this.role = this.roles[0]; // Primary role is first in array
  }
  if (this.role && (!this.roles || this.roles.length === 0)) {
    this.roles = [this.role];
  }
  
  // Sync isActive with status
  if (this.isActive !== undefined) {
    this.status = this.isActive ? 'active' : 'inactive';
  }
  
  // Only hash password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generate salt and hash password
    const saltRounds = 12; // Higher salt rounds for better security
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Instance method to check password validity
 * @param {string} enteredPassword - Password entered by user
 * @returns {boolean} - True if password matches, false otherwise
 */
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Instance method to get user info without sensitive data
 * @returns {Object} - User object without password
 */
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  // Ensure roles array exists
  if (!userObject.roles || userObject.roles.length === 0) {
    userObject.roles = userObject.role ? [userObject.role] : ['SalesExecutive'];
  }
  return userObject;
};

/**
 * Instance method to check if user has a specific role
 * @param {string} role - Role to check
 * @returns {boolean} - True if user has the role
 */
userSchema.methods.hasRole = function(role) {
  return this.roles && this.roles.includes(role);
};

/**
 * Static method to get users by role
 * @param {string} role - Role to filter by
 * @returns {Array} - Array of users with specified role
 */
userSchema.statics.getUsersByRole = function(role) {
  return this.find({ 
    $or: [
      { role: role },
      { roles: role }
    ],
    status: 'active' 
  }).select('-password');
};

/**
 * Index for better query performance
 * Note: email index is created automatically by unique: true constraint
 */
userSchema.index({ role: 1 });
userSchema.index({ roles: 1 });
userSchema.index({ status: 1 });
userSchema.index({ franchiseId: 1 });  // ADDED: Index for franchise filtering

const User = mongoose.model('User', userSchema);

module.exports = User;