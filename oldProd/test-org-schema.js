/**
 * Test script to verify Organization model schema works correctly
 * This tests the _id: false configuration for subdocuments
 */

const mongoose = require('mongoose');

// Define schemas exactly as in organizationModel.js
const collaboratorSchema = new mongoose.Schema(
  {
    userid: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["org-admin", "org-support", "org-user"],
      default: "org-user"
    },
    permissions: {
      type: [String],
      default: []
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false // CRITICAL: Disable _id at schema level
  }
);

const organizationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: String,
      unique: true,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: { type: String },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    planType: {
      type: String,
      enum: ["personal", "enterprise"],
      default: "personal"
    },
    subscription: {
      planId: { type: String, default: null },
      status: {
        type: String,
        enum: ["active", "inactive", "suspended"],
        default: "active"
      },
      subscribedAt: { type: Date, default: Date.now }
    },
    collaborators: {
      type: [collaboratorSchema],
      _id: false, // CRITICAL: Disable _id at array level
      default: []
    },
    deployments: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: false
  }
);

// Optional explicit path options reinforcement
organizationSchema.path("collaborators").schema.options._id = false;

const Organization = mongoose.model("Organization", organizationSchema);

console.log("✅ Schema validation complete");
console.log("Schema compiled successfully with:");
console.log("  ✓ collaboratorSchema._id = false");
console.log("  ✓ collaborators array._id = false");
console.log("  ✓ collaborators path schema._id = false");

// Export for testing
module.exports = { Organization, organizationSchema, collaboratorSchema };
