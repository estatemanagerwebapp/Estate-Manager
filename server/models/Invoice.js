const mongoose = require('mongoose');
const { INVOICE_STATUS } = require('@estate-manager/shared/constants/status');
const softDeletePlugin = require('./plugins/softDelete');
const auditPlugin = require('./plugins/auditPlugin');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
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
      required: true,
      index: true
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: Object.values(INVOICE_STATUS),
      default: INVOICE_STATUS.PENDING,
      index: true
    },
    dueDate: {
      type: Date,
      required: true
    },
    items: [
      {
        description: { type: String, required: true },
        amount: { type: Number, required: true }
      }
    ]
  },
  {
    timestamps: true
  }
);

invoiceSchema.plugin(softDeletePlugin);
invoiceSchema.plugin(auditPlugin, { modelName: 'Invoice' });

module.exports = mongoose.model('Invoice', invoiceSchema);
