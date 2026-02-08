const mongoose = require("mongoose");

/**
 * Organization Creation Request Schema
 * ------------------------------------
 * Stores data for a requested organization before it is officially created.
 * This allows Platform Admins to review and approve/reject new organization requests.
 * 
 * Flow: User Requests -> Pending -> Admin Approves -> System Creates Organization
 */

const organizationRequestSchema = new mongoose.Schema(
    {
        requestId: {
            type: String,
            required: true,
            unique: true
        },

        requesterUserId: {
            type: String, // userid of the user requesting creation
            required: true,
            index: true
        },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true
        },

        // 🏢 PROPOSED ORGANIZATION DETAILS
        proposedName: {
            type: String,
            required: true
        },

        tradingName: {
            type: String, // If different from legal name
            default: ""
        },

        proposedType: {
            type: String,
            enum: ["business", "non-profit", "government", "education", "research"], // Personal generally doesn't need approval
            required: true
        },

        description: {
            type: String,
            default: ""
        },

        // 📄 BUSINESS DETAILS (Mirrors Organization Model)
        businessDetails: {
            legalName: { type: String, required: true },
            tradingName: { type: String, default: "" },
            tin: { type: String, required: true }, // Tax Identification Number

            // STRICT BUSINESS TYPE ENUM
            businessType: {
                type: String,
                required: true,
                enum: [
                    "Sole Proprietorship",
                    "Partnership",
                    "Limited Liability Company (LLC)",
                    "Corporation",
                    "Non-Profit"
                ]
            },

            industry: { type: String, default: "" },
            website: { type: String, default: "" },

            // LOCATION DATA
            location: { type: String, required: true } // Single string for full address
        },

        // 📂 SUPPORTING DOCUMENTS
        // 📂 SUPPORTING DOCUMENTS
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
                    url: { type: String, required: true },      // S3/Azure Blob URL
                    fileName: { type: String },                 // Original filename
                    linkedRequestId: { type: String, default: null },
                    uploadedAt: { type: Date, default: Date.now },
                    uploadedBy: { type: String, required: true }
                },
                { _id: false }
            )
        ],

        // 📝 METADATA
        requestedAt: {
            type: Date,
            default: Date.now
        },

        adminNotes: {
            type: String,
            default: "" // Admin internal notes
        },

        reviewedBy: {
            type: String, // userid of admin
            default: null
        },

        reviewedAt: {
            type: Date,
            default: null
        },

        rejectionReason: {
            type: String,
            default: null
        },

        // If approved, link to the created Org ID
        createdOrganizationId: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Index for efficient admin listing
organizationRequestSchema.index({ status: 1, requestedAt: -1 });

module.exports = mongoose.model("OrganizationRequest", organizationRequestSchema);
