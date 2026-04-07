const mongoose = require('mongoose');

const stageRateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'DEFAULT'
    },
    rates: {
      type: Map,
      of: Number,
      default: {}
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'stage_rates'
  }
);

module.exports = mongoose.model('StageRate', stageRateSchema);
