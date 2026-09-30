const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true
    },
    targetModel: {
      type: String,
      required: true,
      index: true
    },
    targetId: {
      type: String,
      required: true,
      index: true
    },
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      default: null,
      index: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    performedBy: {
      type: String,
      required: true,
      index: true
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

// Immutable logs: Prevent manual updates
auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs are immutable and cannot be updated.');
});
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable and cannot be updated.');
});
auditLogSchema.pre('deleteOne', function () {
  throw new Error('Audit logs are immutable and cannot be deleted.');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
