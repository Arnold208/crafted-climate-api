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

// 🔧 Add index for CosmosDB compatibility with sort()
otaSchema.index({ createdAt: -1 });

const OTAUpdate = mongoose.model("OTAUpdate", otaSchema);
module.exports = OTAUpdate;
