const mongoose = require('mongoose');

const thresholdSchema = new mongoose.Schema({
  deviceAuid: {
    type: String,
    required: true
  },

  datapoint: { 
    type: String, 
    required: true 
  }, 

  label: { 
    type: String 
  },

  operator: { 
    type: String, 
    enum: ['>', '<', '>=', '<=', 'between', 'outside'],
    required: true 
  },

  min: { type: Number },
  max: { type: Number },

  enabled: { 
    type: Boolean, 
    default: true 
  },

  cooldownMinutes: { 
    type: Number, 
    default: 10 
  },

  lastTriggeredAt: { 
    type: Date, 
    default: null 
  },

  alertChannels: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },

  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('DeviceThreshold', thresholdSchema);
