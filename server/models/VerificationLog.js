const mongoose = require('mongoose');

const verificationLogSchema = new mongoose.Schema(
  {
    accessCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccessCode',
      default: null,
      index: true
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
      default: null,
      index: true
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    verifiedByGuardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    gateAction: {
      type: String,
      enum: ['ENTRY', 'EXIT', 'DENIED'],
      required: true,
      index: true
    },
    visitorName: {
      type: String,
      required: true
    },
    vehiclePlate: {
      type: String,
      default: null
    },
    visitorImageUrl: {
      type: String,
      default: null
    },
    vehicleImageUrl: {
      type: String,
      default: null
    },
    guardNotes: {
      type: String,
      default: null
    },
    isOfflineSynced: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model('VerificationLog', verificationLogSchema);
