const mongoose = require('mongoose');

function generatePaymentNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const t = String(Date.now()).slice(-6);
  const r = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PAY-${y}${m}${d}-${t}${r}`;
}

const paymentDetailSchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      required: true
    },
    doors: {
      type: Number,
      required: true,
      min: 0
    },
    rate: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      unique: true,
      required: true,
      default: generatePaymentNumber,
      trim: true,
      index: true
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true
    },
    workerName: {
      type: String,
      required: true,
      trim: true
    },
    filterType: {
      type: String,
      enum: ['weekly', 'monthly', 'custom'],
      required: true
    },
    periodKey: {
      type: String,
      required: true,
      index: true
    },
    week: {
      type: String,
      required: true
    },
    rangeStart: {
      type: Date,
      required: true,
      index: true
    },
    rangeEnd: {
      type: Date,
      required: true,
      index: true
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['PAID'],
      default: 'PAID',
      index: true
    },
    details: {
      type: [paymentDetailSchema],
      default: []
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    paidAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'payments'
  }
);

paymentSchema.index({ worker: 1, filterType: 1, periodKey: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
