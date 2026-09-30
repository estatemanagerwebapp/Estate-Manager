const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
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
      index: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['ACCESS_RESTRICTION', 'VISITOR_ARRIVAL', 'INVOICE_DUE', 'PAYMENT_RECEIPT', 'BROADCAST', 'EMERGENCY_SOS'],
      default: 'BROADCAST'
    },
    read: {
      type: Boolean,
      default: false
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Notification', notificationSchema);
