const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');
const auditPlugin = require('./plugins/auditPlugin');

const estateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    address: {
      type: String,
      required: true
    },
    city: {
      type: String,
      default: 'Lagos'
    },
    state: {
      type: String,
      default: 'Lagos'
    },
    country: {
      type: String,
      default: 'Nigeria'
    },
    gateConfiguration: {
      requireVisitorImage: {
        type: Boolean,
        default: true
      },
      requireVehicleImage: {
        type: Boolean,
        default: false
      },
      defaultCodeValidityHours: {
        type: Number,
        default: 12
      }
    },
    contactEmail: {
      type: String,
      trim: true
    },
    contactPhone: {
      type: String,
      trim: true
    },
    imageUrl: {
      type: String,
      default: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80'
    },
    totalUnits: {
      type: Number,
      default: 100
    },
    occupancyRate: {
      type: Number,
      default: 85
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

estateSchema.plugin(softDeletePlugin);
estateSchema.plugin(auditPlugin, { modelName: 'Estate' });

module.exports = mongoose.model('Estate', estateSchema);
