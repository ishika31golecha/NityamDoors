const mongoose = require('mongoose');

/**
 * Attendance Schema for Production Workers
 * Tracks daily attendance for each worker
 * Collection: attendances
 */
const attendanceSchema = new mongoose.Schema(
  {
    workerId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    workerName: {
      type: String,
      required: true,
      trim: true
    },

    date: {
      type: String,
      required: true,
      trim: true
      // Format: YYYY-MM-DD
    },

    status: {
      type: String,
      enum: ['Present', 'Absent', 'Half Day'],
      default: 'Present'
    }
  },
  {
    timestamps: true,
    collection: 'attendances'
  }
);

// Unique compound index: one record per worker per day
attendanceSchema.index({ workerId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
