const mongoose = require('mongoose');
const { ACCESS_CODE_TYPES, ACCESS_CODE_STATUS } = require('@estate-manager/shared/constants/status');
const softDeletePlugin = require('./plugins/softDelete');
const auditPlugin = require('./plugins/auditPlugin');

const accessCodeSchema = new mongoose.Schema(
  {
    codeHash: {
      type: String,
      required: true,
      index: true
    },
    codeDisplay: {
      type: String, // Masked or sanitized identifier for logs
      required: true
    },
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      required: true,
      index: true
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(ACCESS_CODE_TYPES),
      default: ACCESS_CODE_TYPES.GUEST
    },
    status: {
      type: String,
      enum: Object.values(ACCESS_CODE_STATUS),
      default: ACCESS_CODE_STATUS.ACTIVE,
      index: true
    },
    visitorName: {
      type: String,
      required: true,
      trim: true
    },
    visitorPhone: {
      type: String,
      trim: true
    },
    vehiclePlate: {
      type: String,
      trim: true,
      uppercase: true
    },
    validFrom: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    maxUses: {
      type: Number,
      default: 1
    },
    useCount: {
      type: Number,
      default: 0
    },
    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

accessCodeSchema.plugin(softDeletePlugin);
accessCodeSchema.plugin(auditPlugin, { modelName: 'AccessCode' });

module.exports = mongoose.model('AccessCode', accessCodeSchema);
