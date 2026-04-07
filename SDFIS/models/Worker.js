const mongoose = require('mongoose');

/**
 * Worker Schema for Production Team
 * Stores worker master data
 * Collection: workers
 */
const workerSchema = new mongoose.Schema(
  {
    workerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    phone: {
      type: String,
      trim: true,
      default: null
    },

    aadhaarNumber: {
      type: String,
      default: null,
      // Store only masked format (e.g., "XXXX-XXXX-1234")
      trim: true
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'workers'
  }
);

// Compound index for active workers
workerSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Worker', workerSchema);
