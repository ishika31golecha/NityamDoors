const mongoose = require('mongoose');

/**
 * Order Schema for Smart Door ERP
 * Stores orders with customer details, doors, and status tracking
 */
const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => 'ORD-' + Date.now()
    },
    
    customer: {
      _id: mongoose.Schema.Types.ObjectId,
      name: {
        type: String,
        required: true
      },
      email: String,
      phone: String,
      address: String
    },

    customerType: {
      type: String,
      enum: ['Individual', 'Corporate', 'Dealer', 'Franchisee', 'Direct Customer'],
      default: 'Individual'
    },

    doors: [
      {
        flatNo: String,
        doorType: String,
        height: Number,
        width: Number,
        laminate: String,
        priority: String,
        quantity: {
          type: Number,
          default: 1
        }
      }
    ],

    totalAmount: {
      type: Number,
      required: true,
      default: 0
    },

    status: {
      type: String,
      enum: ['CREATED', 'APPROVED', 'REJECTED', 'IN_PRODUCTION', 'COMPLETED'],
      default: 'CREATED',
      index: true
    },

    priority: {
      type: String,
      enum: ['High', 'Normal', 'Low'],
      default: 'Normal',
      index: true
    },

    rejectionReason: String,

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    approvedAt: Date,

    expectedDeliveryDate: Date,

    notes: String,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'orders'
  }
);

// Index for faster queries
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'customer.name': 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
