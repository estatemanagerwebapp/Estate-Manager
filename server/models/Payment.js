const mongoose = require('mongoose');
const auditPlugin = require('./plugins/auditPlugin');

const paymentSchema = new mongoose.Schema(
  {
    paymentReference: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true
    },
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
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    gateway: {
      type: String,
      default: 'PAYSTACK'
    },
    channel: {
      type: String, // CARD, BANK_TRANSFER, USSD
      default: 'CARD'
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    paidAt: {
      type: Date,
      default: null
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

paymentSchema.plugin(auditPlugin, { modelName: 'Payment' });

module.exports = mongoose.model('Payment', paymentSchema);
