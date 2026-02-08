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
      // Note: Unique index added separately with case-insensitive collation
    },

    /**
     * 🔒 ORGANIZATION NAME EDITING HISTORY
     * Tracks all name changes with 2x per 30 days rate limit
     */
    nameEditHistory: [
      new mongoose.Schema(
        {
          oldName: { type: String, required: true },
          newName: { type: String, required: true },
          editedBy: { type: String, required: true }, // userid
          editedAt: { type: Date, default: Date.now },
          reason: { type: String, default: "" }        // Optional justification
        },
        { _id: false }
      )
    ],

    lastNameEditAt: {
      type: Date,
      default: null  // For quick filtering in rate limit checks
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
     * 🏢 ORGANIZATION TYPE CLASSIFICATION
     * Granular classification for business logic and benefits
     */
    organizationType: {
      type: String,
      enum: [
        "personal",      // Individual user
        "business",      // For-profit company
        "non-profit",    // NGO, charity
        "government",    // Government agency
        "education",     // School, university
        "research"       // Research institution
      ],
      default: "personal"
    },

    /**
     * ✅ BUSINESS VERIFICATION WORKFLOW
     * For business, non-profit, government, education, research orgs
     */
    businessVerification: {
      status: {
        type: String,
        enum: ["unverified", "pending", "verified", "rejected"],
        default: "unverified"
      },
      submittedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: String, default: null },  // Platform admin userid
      rejectionReason: { type: String, default: null },

      // Business details for verification
      businessDetails: {
        legalName: { type: String, default: "" },
        tin: { type: String, default: "" },

        businessType: {
          type: String,
          enum: [
            "Sole Proprietorship",
            "Partnership",
            "Limited Liability Company (LLC)",
            "Corporation",
            "Non-Profit"
          ],
          default: "Sole Proprietorship" // fallback
        },

        industry: { type: String, default: "" },
        website: { type: String, default: "" },

        location: { type: String, default: "" } // Single string address
      },

      // Uploaded verification documents
      documents: [
        new mongoose.Schema(
          {
            type: {
              type: String,
              enum: [
                "business_license",
                "tax_certificate",
                "workplace_exterior",
                "authorization_letter",
                "other"
              ],
              required: true
            },
            url: { type: String, required: true },
            uploadedAt: { type: Date, default: Date.now },
            uploadedBy: { type: String, required: true }
          },
          { _id: false }
        )
      ]
    },

    /**
     * 🤝 PARTNER STATUS & BENEFITS
     * For Crafted Climate partners with special benefits
     */
    partnerStatus: {
      isPartner: { type: Boolean, default: false },
      tier: {
        type: String,
        enum: ["none", "standard", "premium", "enterprise"],
        default: "none"
      },
      approvedAt: { type: Date, default: null },
      approvedBy: { type: String, default: null },  // Platform admin userid
      expiresAt: { type: Date, default: null },     // Optional: annual renewal

      // Partner benefits
      benefits: {
        discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
        prioritySupport: { type: Boolean, default: false },
        dedicatedAccountManager: { type: Boolean, default: false },
        customBranding: { type: Boolean, default: false },
        apiRateLimitMultiplier: { type: Number, default: 1, min: 1, max: 10 },
        freeDevices: { type: Number, default: 0, min: 0 }
      }
    },

    /**
     * 📝 PARTNER APPLICATION WORKFLOW
     * Organizations apply to become partners
     */
    partnerApplication: {
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none"
      },
      appliedAt: { type: Date, default: null },
      requestedTier: {
        type: String,
        enum: ["standard", "premium", "enterprise"],
        default: null
      },
      businessCase: { type: String, default: "" },  // Why they want to be a partner
      expectedDeviceCount: { type: Number, default: 0 },
      expectedRevenue: { type: Number, default: 0 },
      reviewedBy: { type: String, default: null },  // Platform admin userid
      reviewedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: null }
    },

    /**
     * 🔄 ORGANIZATION TYPE CHANGE REQUEST WORKFLOW
     * Users can request to change org type with justification + docs + admin approval
     */
    organizationTypeChangeRequest: {
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none"
      },
      requestedType: {
        type: String,
        enum: ["personal", "business", "non-profit", "government", "education", "research"],
        default: null
      },
      currentType: { type: String, default: null },  // Type before change request
      justification: { type: String, default: "" },  // Why they want to change type
      requestedBy: { type: String, default: null },  // userid who requested
      requestedAt: { type: Date, default: null },
      reviewedBy: { type: String, default: null },   // Platform admin userid
      reviewedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: null },

      // Supporting documents for type change
      supportingDocuments: [
        new mongoose.Schema(
          {
            type: {
              type: String,
              enum: ["proof_of_status", "registration", "tax_document", "other"],
              required: true
            },
            url: { type: String, required: true },
            uploadedAt: { type: Date, default: Date.now },
            uploadedBy: { type: String, required: true }
          },
          { _id: false }
        )
      ]
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
    },

    /**
     * Platform Hardening: Global Settings & Safety
     */
    settings: {
      type: Object,
      default: {} // Stores feature flags, limits, policies
    },

    /**
     * ⛔ SUSPENSION STATUS
     * If true, organization is Read-Only/Frozen. No operations allowed.
     */
    suspended: {
      type: Boolean,
      default: false,
      index: true
    },
    suspendedAt: {
      type: Date,
      default: null
    },
    suspensionReason: {
      type: String,
      default: null
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true
    }
  },

  {
    timestamps: false // we already define createdAt manually
  }
);

/**
 * 🔒 SECURITY: Case-insensitive unique index for organization names
 * Prevents duplicate names while allowing soft-deleted orgs to reuse names
 */
organizationSchema.index(
  { name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 }, // Case-insensitive
    partialFilterExpression: { deletedAt: null } // Only enforce for active orgs
  }
);

module.exports = mongoose.model("Organization", organizationSchema);
