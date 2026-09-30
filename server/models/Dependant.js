const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const dependantSchema = new mongoose.Schema(
  {
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      required: true,
      index: true
    },
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    relationship: {
      type: String,
      required: true,
      trim: true // e.g. Spouse, Child, Ward, Domestic Staff
    },
    phone: {
      type: String,
      trim: true
    },
    canGenerateCodes: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

dependantSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('Dependant', dependantSchema);
