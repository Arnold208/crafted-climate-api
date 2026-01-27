const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
  deploymentid: {
    type: String,
    required: true,
    unique: true
  },

  /**
   * OLD FIELD (deprecated but still required for compatibility)
   * This is the user who originally created the deployment.
   */
  userid: {
    type: String,
    required: true
  },

  /**
   * NEW FIELD — we will start using this going forward.
   * After migration: userid → createdBy
   */
  createdBy: {
    type: String,
    default: null
  },

  /**
   * NEW FIELD REQUIRED FOR MULTI-TENANCY
   * If null → system uses old behavior.
   */
  organizationId: {
    type: String,
    default: null,
    index: true
  },

  name: { type: String, required: true },
  description: { type: String },

  /**
   * OLD FIELD — devices stored as strings
   */
  devices: {
    type: [String],
    default: []
  },

  /**
   * NEW FIELD ADDED BUT DO NOT REMOVE OLD FIELDS YET
   */
  collaborators: [
    new mongoose.Schema(
      {
        userid: String, // keep old naming
        role: {
          type: String,
          enum: ["deployment-admin", "deployment-support", "deployment-user"],
          default: "deployment-user"
        },
        addedAt: { type: Date, default: Date.now }
      },
      { _id: false } // Disable _id for subdocuments
    )
  ],

  /** Platform Hardening: Data Safety */
  deletedAt: {
    type: Date,
    default: null,
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Deployment', deploymentSchema);
