const mongoose = require('mongoose');
const { RESIDENT_RELATIONSHIPS } = require('@estate-manager/shared/constants/status');
const softDeletePlugin = require('./plugins/softDelete');

const userPropertySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true
    },
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      required: true,
      index: true
    },
    relationship: {
      type: String,
      enum: Object.values(RESIDENT_RELATIONSHIPS),
      default: RESIDENT_RELATIONSHIPS.OWNER
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    isVerified: {
      type: Boolean,
      default: true
    },
    moveInDate: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

userPropertySchema.index({ userId: 1, propertyId: 1 }, { unique: true });
userPropertySchema.plugin(softDeletePlugin);

module.exports = mongoose.model('UserProperty', userPropertySchema);
