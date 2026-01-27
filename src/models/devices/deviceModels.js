const mongoose = require("mongoose");
const {
 generateModelId
} = require('../../utils/idGenerator');

const sensorModelSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: generateModelId(),
    unique: true,
  },
  model: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  description: {
    type: String,
    required: true,
  },
  version: {
    type: Number,
    default: 1.0,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const SensorModel = mongoose.model("sensor_models", sensorModelSchema);
module.exports = SensorModel;
