const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userid: {
    type: String,
    required: true,
    unique: true
  },

  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  refreshToken: { type: String, default: "" },

  contact: { type: String, default: "" },
  firstName: { type: String, default: "" },
  lastName: { type: String, default: "" },

  profilePicture: { type: String, default: "" },

  /** ✅ PLATFORM ROLE */
  platformRole: {
    type: String,
    enum: ["admin", "support", "user"],
    default: "user"
  },

  /** 
   * ❗ DEPRECATED: previously organization was an array.
   * Now a user belongs to multiple orgs through org.collaborators.
   * But we keep one "active organization" context when working in UI.
   **/
  currentOrganizationId: {
    type: String,
    default: null
  },

  /** The user's auto-generated personal organization */
  personalOrganizationId: {
    type: String,
    default: null
  },

  /** Optional direct reference to orgs for backward compatibility */
  organization: {
    type: [String],
    default: []
  },

  deployments: {
    type: [String],
    default: []
  },

  otp: { type: Number, default: 0 },
  otpExpiresAt: { type: Date, default: 0 },
  lastOtpSentAt: { type: Date },
  verified: { type: Boolean, default: false },

  /** OLD system RBAC - kept for backwards compatibility */
  role: {
    type: String,
    enum: ['admin', 'supervisor', 'user'],
    default: 'user'
  },

  /** Subscription for personal org (freemium/premium) */
  subscription: {
  type: String,    
  default: null
},


  /** Devices owned or invited to */
  devices: [
    new mongoose.Schema(
      {
        deviceId: { type: String, required: true },
        accessType: {
          type: String,
          enum: ['owner', 'invited'],
          required: true
        }
      },
      { _id: false } // Disable _id for subdocuments
    )
  ]
});

const User = mongoose.model('User', userSchema);
module.exports = User;
