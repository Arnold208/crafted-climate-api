const mongoose = require('mongoose');

const addDeviceSchema = new mongoose.Schema({
  devid: {
    type: String,
    required: true,
    unique: true
  },

  type: {
    type: String,
    required: true
  },

  model: {
    type: String,
    required: true
  },

  mac: {
    type: String,
    required: true,
    unique: true
  },

  manufacturingId: {
    type: String,
    required: true,
    unique: true
  },

  sku: {
    type: String,
    required: true
  },

  batchNumber: {
    type: String,
    required: true
  },

  serial: {
    type: String,
    unique: true,
    sparse: true // allow nulls until assigned
  },

  auid: {
    type: String,
    unique: true,
    sparse: true // allow nulls until assigned
  },

  status: {
    type: String,
    enum: ['MANUFACTURED', 'ASSIGNED', 'REGISTERED'],
    default: 'MANUFACTURED'
  },

  datapoints: {
    type: [String],
    default: []
  },

  date: {
    type: Date,
    default: Date.now
  }

}, { versionKey: false });

const addDevice = mongoose.model('addDevice', addDeviceSchema, 'AddDevice');

module.exports = addDevice;
