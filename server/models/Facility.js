const mongoose = require('mongoose');

const facilitySchema = new mongoose.Schema(
  {
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    capacity: {
      type: Number,
      default: 50
    },
    feePerHour: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Facility', facilitySchema);
