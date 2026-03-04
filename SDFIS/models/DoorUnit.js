const mongoose = require('mongoose');

/**
 * DoorUnit Schema for Production Tracking
 * Tracks each door through production stages with worker information
 * Collection: production
 */
const doorUnitSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      index: true
    },

    doorNumber: {
      type: Number,
      required: true
    },

    currentStage: {
      type: String,
      enum: ['PENDING', 'CUTTING', 'PROCESSING', 'POLISHING', 'PACKING', 'LOADING', 'COMPLETED'],
      default: 'PENDING',
      index: true
    },

    isRejected: {
      type: Boolean,
      default: false
    },

    stageHistory: [
      {
        stage: {
          type: String,
          enum: ['PENDING', 'CUTTING', 'PROCESSING', 'POLISHING', 'PACKING', 'LOADING', 'COMPLETED'],
          required: true
        },
        worker: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Worker',
          required: true
        },
        quality: {
          type: String,
          enum: ['OK', 'REJECTED'],
          required: true
        },
        reason: String,
        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  {
    timestamps: true,
    collection: 'production'
  }
);

// Index for faster queries
doorUnitSchema.index({ orderId: 1, doorNumber: 1 });
doorUnitSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DoorUnit', doorUnitSchema);
