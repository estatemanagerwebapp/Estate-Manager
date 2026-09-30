const mongoose = require('mongoose');
const { ROLES } = require('@estate-manager/shared/constants/roles');
const { ACCESS_CONTROL_STATUS } = require('@estate-manager/shared/constants/status');
const softDeletePlugin = require('./plugins/softDelete');
const auditPlugin = require('./plugins/auditPlugin');

const userSchema = new mongoose.Schema(
  {
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
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.RESIDENT,
      index: true
    },
    // Rule 11/12/13: Surgical access code control (Account remains active for payments)
    accessControlStatus: {
      type: String,
      enum: Object.values(ACCESS_CONTROL_STATUS),
      default: ACCESS_CONTROL_STATUS.ENABLED,
      index: true
    },
    restrictionMetadata: {
      restrictedAt: { type: Date, default: null },
      restrictedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, default: null }
    },
    avatar: {
      type: String,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

userSchema.plugin(softDeletePlugin);
userSchema.plugin(auditPlugin, { modelName: 'User' });

module.exports = mongoose.model('User', userSchema);
