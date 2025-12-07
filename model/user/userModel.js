const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Primary public user identifier (NEVER use _id for business logic)
  userid: {
    type: String,
    required: true,
    unique: true
  },

  username: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true
  },

  refreshToken: {
    type: String,
    default: ""
  },

  contact: {
    type: String,
    default: ""
  },

  firstName: {
    type: String,
    default: ""
  },

  lastName: {
    type: String,
    default: ""
  },

  profilePicture: {
    type: String,
    default: ""
  },

  otp: {
    type: Number,
    default: 0
  },

  otpExpiresAt: {
    type: Date,
    default: 0
  },

  lastOtpSentAt: {
    type: Date
  },

  verified: {
    type: Boolean,
    default: false
  },

  // 🌍 GLOBAL ROLE (platform-level)
  // This is NOT org-level – this is for the whole platform (superadmin, staff, normal user)
  role: {
    type: String,
    enum: ['superadmin', 'staff', 'user'],
    default: 'user'
  },

  /**
   * Personal subscription context:
   * We don't strictly need to store a ref here, since we always
   * query UserSubscription by userid, but we keep this for convenience
   * if you want faster joins later.
   */
  personalSubscriptionId: {
    type: String,   // subscriptionId from UserSubscription
    default: null
  },

  /**
   * Organization memberships:
   * User can belong to many orgs, with different roles.
   */
  orgMemberships: [
    {
      orgid: {
        type: String,
        required: true
      },
      role: {
        type: String,
        enum: ['owner', 'admin', 'member', 'viewer'],
        default: 'member'
      },
      permissions: {
        type: [String],
        default: []  // e.g. ['manage_devices', 'view_telemetry']
      },
      joinedAt: {
        type: Date,
        default: Date.now
      },
      invitedBy: {
        type: String, // userid who invited them
        default: null
      },
      status: {
        type: String,
        enum: ['active', 'invited', 'suspended'],
        default: 'active'
      }
    }
  ],

  /**
   * Optional convenience arrays – not mandatory but useful.
   * You can keep them or drop them depending on how tight you want the model.
   */
  devices: [
    {
      auid: {
        type: String,
        required: true
      },
      accessType: {
        type: String,
        enum: ['owner', 'collaborator'],
        required: true
      }
    }
  ]

}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;
