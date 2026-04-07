const mongoose = require('mongoose');

/**
 * DoorUnit Schema for Production Tracking
 * Tracks each door through production stages with worker information
 * Collection: production
 */
const STAGES = [
  'PENDING',
  'CUTTING',
  'BTC',
  'LAMINATE',
  'PRESS',
  'FINISH',
  'PACKING',
  'DELIVERY_PENDING',
  'DELIVERY_DONE',
  'DELIVERY',
  'COMPLETED'
];

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
      enum: STAGES,
      default: 'PENDING',
      index: true
    },

    isRejected: {
      type: Boolean,
      default: false
    },

    delivery: {
      status: {
        type: String,
        enum: ['PENDING', 'COMPLETED'],
        default: 'PENDING'
      },
      driverName: {
        type: String,
        default: ''
      },
      driverMobile: {
        type: String,
        default: ''
      },
      vehicleNumber: {
        type: String,
        default: ''
      },
      deliveryAddress: {
        type: String,
        default: ''
      },
      customerMobile: {
        type: String,
        default: ''
      },
      deliveredAt: {
        type: Date,
        default: null
      }
    },

    stageHistory: [
      {
        stage: {
          type: String,
          enum: STAGES,
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
