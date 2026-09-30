const mongoose = require('mongoose');

const estateAdminAssignmentSchema = new mongoose.Schema(
  {
    userId: {
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
    assignedRole: {
      type: String,
      enum: ['ESTATE_ADMIN', 'GUARD', 'AUDITOR'],
      required: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

estateAdminAssignmentSchema.index({ userId: 1, estateId: 1 }, { unique: true });

module.exports = mongoose.model('EstateAdminAssignment', estateAdminAssignmentSchema);
