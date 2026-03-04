const mongoose = require('mongoose');

/**
 * Record Schema for demonstrating CRUD operations with Role-Based Access Control
 * This serves as a generic model for various manufacturing records
 */
const recordSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  
  // Additional fields that could be useful for manufacturing records
  category: {
    type: String,
    enum: ['Production', 'Inventory', 'Quality', 'Maintenance', 'Sales', 'General'],
    default: 'General'
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'archived'],
    default: 'draft'
  },
  
  tags: [{
    type: String,
    trim: true
  }],
  
  // Metadata for tracking
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

/**
 * Pre-save middleware to update lastModifiedBy field
 */
recordSchema.pre('save', function(next) {
  // Set lastModifiedBy to createdBy if it's a new record
  if (this.isNew && !this.lastModifiedBy) {
    this.lastModifiedBy = this.createdBy;
  }
  next();
});

/**
 * Static method to get records by category
 * @param {string} category - Category to filter by
 * @returns {Promise} - Promise resolving to records array
 */
recordSchema.statics.getRecordsByCategory = function(category) {
  return this.find({ category })
    .populate('createdBy', 'name email role')
    .populate('lastModifiedBy', 'name email')
    .sort({ updatedAt: -1 });
};

/**
 * Static method to get records created by a specific user
 * @param {ObjectId} userId - User ID to filter by
 * @returns {Promise} - Promise resolving to records array
 */
recordSchema.statics.getRecordsByUser = function(userId) {
  return this.find({ createdBy: userId })
    .populate('createdBy', 'name email role')
    .sort({ createdAt: -1 });
};

/**
 * Instance method to check if user can modify this record
 * @param {Object} user - User object with role
 * @returns {boolean} - True if user can modify, false otherwise
 */
recordSchema.methods.canModify = function(user) {
  // SuperAdmin can modify any record
  if (user.role === 'SuperAdmin') {
    return true;
  }
  
  // FactoryAdmin can modify any record
  if (user.role === 'FactoryAdmin') {
    return true;
  }
  
  // Other users can only modify their own records
  return this.createdBy.toString() === user._id.toString();
};

/**
 * Instance method to check if user can delete this record
 * @param {Object} user - User object with role
 * @returns {boolean} - True if user can delete, false otherwise
 */
recordSchema.methods.canDelete = function(user) {
  // Only SuperAdmin can delete records
  return user.role === 'SuperAdmin';
};

/**
 * Index for better query performance
 */
recordSchema.index({ createdBy: 1 });
recordSchema.index({ category: 1 });
recordSchema.index({ status: 1 });
recordSchema.index({ createdAt: -1 });
recordSchema.index({ title: 'text', description: 'text' }); // Text search index

const Record = mongoose.model('Record', recordSchema);

module.exports = Record;