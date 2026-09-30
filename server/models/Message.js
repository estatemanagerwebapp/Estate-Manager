const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    estateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Estate',
      required: true,
      index: true
    },
    isBroadcast: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: ''
    },
    body: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Message', messageSchema);
