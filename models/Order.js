const mongoose = require('mongoose');

/**
 * Order Schema for Smart Door ERP
 * Stores orders with customer details, doors, and pricing calculations
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
      mobileNumber: {
        type: String,
        required: true,
        validate: {
          validator: function(v) {
            return /^[0-9]{10}$/.test(v) && v !== '0000000000';
          },
          message: 'Mobile number must be 10 digits and not all zeros'
        }
      },
      gstNumber: {
        type: String,
        default: null,
        validate: {
          validator: function(v) {
            if (!v) return true; // Optional
            return /^[A-Z0-9]{15}$/.test(v);
          },
          message: 'GST number must be 15 alphanumeric characters'
        }
      },
      address: String
    },

    customerType: {
      type: String,
      enum: ['Individual', 'Corporate', 'Dealer', 'Franchisee', 'Direct Customer'],
      default: 'Individual'
    },

    doors: [
      {
        length: {
          type: Number,
          required: true
        },
        breadth: {
          type: Number,
          required: true
        },
        thickness: {
          type: Number,
          required: true
        },
        area: {
          type: Number,
          required: true
        },
        doorType: String,
        laminate: String,
        priority: String,
        flatNo: String,
        fileUrl: String
      }
    ],

    ratePerUnit: {
      type: Number,
      required: true,
      default: 0
    },

    totalArea: {
      type: Number,
      required: true,
      default: 0
    },

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
      default: 'Normal'
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
