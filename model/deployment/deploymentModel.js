const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
  deploymentid: {
    type: String,
    required: true,
    unique: true
  },
  userid: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  devices: {
    type: [String], // Array of device IDs associated with this deployment
    default: []
  },
  collaborators: {
    type: [String],  
  }
});

const Deployment = mongoose.model('Deployment', deploymentSchema);

module.exports = Deployment;
