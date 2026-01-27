// model/user/organizationModel.js
const mongoose = require("mongoose");

/**
 * Organization Schema
 * -------------------
 * We allow _id for collaborators – this avoids all Mongoose save() issues
 * and DOES NOT break any RBAC logic. We never query a collaborator by _id,
 * so it has no negative effect.
 */

const organizationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: String,
      required: true,
      unique: true
    },

    name: {
      type: String,
      required: true
    },

    description: {
      type: String
    },

    createdBy: {
      type: String // userid of platform admin or user who created org
    },

    createdAt: {
      type: Date,
      default: Date.now
    },

    /**
     * PERSONAL org = single-user workspace
     * ENTERPRISE org = multi-user organization with billing
     */
    planType: {
      type: String,
      enum: ["personal", "enterprise"],
      default: "personal"
    },

    /**
     * Organization-level subscription (enterprise only)
     */
    subscription: {
      planId: { type: String, default: null },
      status: {
        type: String,
        enum: ["active", "inactive", "suspended"],
        default: "active"
      },
      subscribedAt: { type: Date, default: Date.now }
    },

    /**
     * Collaborators (RBAC)
     * _id is DISABLED to avoid Mongoose subdocument _id generation issues
     */
    collaborators: [
      new mongoose.Schema(
        {
          userid: { type: String, required: true },

          role: {
            type: String,
            enum: ["org-admin", "org-support", "org-user"],
            default: "org-user"
          },

          permissions: {
            type: [String],
            default: []
          },

          addedAt: { type: Date, default: Date.now }
        },
        { _id: false } // Disable _id for subdocuments
      )
    ],

    /**
     * Deployment IDs belonging to this organization
     */
    deployments: {
      type: [String],
      default: []
    },

    /**
     * Device AUIDs belonging to this organization
     */
    devices: {
      type: [String],
      default: []
    }
  },

  {
    timestamps: false // we already define createdAt manually
  }
);

module.exports = mongoose.model("Organization", organizationSchema);
