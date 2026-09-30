const mongoose = require('mongoose');

const upcomingDueSchema = new mongoose.Schema(
  {
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      default: null,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true // e.g. "Service Charge", "Estate Maintenance", "Security Levy"
    },
    unitsCount: {
      type: Number,
      required: true,
      default: 20
    },
    dueDaysText: {
      type: String,
      required: true,
      default: 'Due in 3 days'
    },
    dueDate: {
      type: Date,
      default: Date.now
    },
    amount: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('UpcomingDue', upcomingDueSchema);
