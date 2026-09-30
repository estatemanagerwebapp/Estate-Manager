const mongoose = require('mongoose');
const { PROPERTY_TYPES } = require('@estate-manager/shared/constants/status');
const softDeletePlugin = require('./plugins/softDelete');
const auditPlugin = require('./plugins/auditPlugin');

const propertySchema = new mongoose.Schema(
  {
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(PROPERTY_TYPES),
      default: PROPERTY_TYPES.APARTMENT
    },
    court: {
      type: String,
      trim: true
    },
    block: {
      type: String,
      trim: true
    },
    floor: {
      type: String,
      trim: true
    },
    apartmentNumber: {
      type: String,
      required: true,
      trim: true
    },
    displayIdentifier: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    occupancyStatus: {
      type: String,
      enum: ['VACANT', 'OCCUPIED'],
      default: 'VACANT'
    }
  },
  {
    timestamps: true
  }
);

propertySchema.index({ estateId: 1, displayIdentifier: 1 }, { unique: true });
propertySchema.plugin(softDeletePlugin);
propertySchema.plugin(auditPlugin, { modelName: 'Property' });

module.exports = mongoose.model('Property', propertySchema);
