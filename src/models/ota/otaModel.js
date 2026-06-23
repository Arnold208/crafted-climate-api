const mongoose = require("mongoose");
const { generateModelId } = require('../../utils/idGenerator');

const otaSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: generateModelId(),
    unique: true
  },
  firmware_version: {
    type: String,
    required: true
  },
  hardware_version: {
    type: String,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  firmware_url: {
    type: String,
    required: true
  },
  author: {
    type: String,
    required: true
  }
}, { timestamps: true });

// Note: createdAt index is created automatically by timestamps:true (Mongoose 8)


const OTAUpdate = mongoose.model("OTAUpdate", otaSchema);
module.exports = OTAUpdate;
