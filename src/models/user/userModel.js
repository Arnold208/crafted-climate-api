const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userid: {
    type: String,
    required: true,
    unique: true
  },

  username: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },

  googleId: { type: String, default: null },

  refreshToken: { type: String, default: "" },
  refreshTokens: { type: [String], default: [] },

  contact: { type: String, default: "" },
  firstName: { type: String, default: "" },
  lastName: { type: String, default: "" },
  country: { type: String, default: "Ghana" },

  profilePicture: { type: String, default: "" },

  /** ✅ PLATFORM ROLE */
  platformRole: {
    type: String,
    enum: ["admin", "supervisor", "support", "user"],
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
  mustChangePassword: { type: Boolean, default: false },

  /** OLD system RBAC - kept for backwards compatibility */
  role: {
    type: String,
    enum: ['admin', 'supervisor', 'support', 'user'],
    default: 'user'
  },

  /** Subscription for personal org (freemium/premium) */
  subscription: {
    type: String,
    default: null
  },


  /**
   * 👤 USER PROFILE DETAILS
   */
  jobTitle: { type: String, default: "" },
  bio: { type: String, default: "" },
  socialLinks: {
    linkedin: { type: String, default: "" },
    twitter: { type: String, default: "" },
    website: { type: String, default: "" }
  },

  /**
   * ⚙️ USER PREFERENCES (UI/UX)
   */
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    language: {
      type: String,
      default: 'en'
    },
    dashboardLayout: {
      type: String,
      enum: ['standard', 'compact'],
      default: 'standard'
    }
  },

  /**
   * 🔔 NOTIFICATION SETTINGS
   */
  notificationSettings: {
    emailAlerts: { type: Boolean, default: true },
    pushAlerts: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false }
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
  ],

  /** Platform Hardening: Data Safety */
  deletedAt: {
    type: Date,
    default: null,
    index: true
  },

  /**
   * 🏆 LOYALTY / POINTS SYSTEM
   * Tracks cumulative eco-points earned across all actions.
   * Default: 0 for all users (existing users inherit 0 on next update).
   */
  loyaltyPoints: {
    type: Number,
    default: 0,
    min: 0
  },

  /**
   * Whether the user has opted in to participate in the learning points system & leaderboard.
   * Default: null (unasked), false (opted out), true (opted in).
   */
  participateInPoints: {
    type: Boolean,
    default: null
  },

  /**
   * 📜 POINTS HISTORY — last 50 entries stored inline for fast reads.
   * For full history, query the PointsEvent collection.
   */
  pointsHistory: {
    type: [{
      action:    { type: String, required: true },
      value:     { type: Number, required: true },
      timestamp: { type: Date,   default: Date.now },
      metadata:  { type: mongoose.Schema.Types.Mixed, default: {} }
    }],
    default: [],
    _id: false
  },

  /**
   * 🎯 QUESTS — tracks which quests the user has completed.
   */
  completedQuests: {
    type: [{
      questId:     { type: String, required: true },
      completedAt: { type: Date,   default: Date.now },
    }],
    default: [],
    _id: false
  },

  /**
   * 🏅 BADGES — tracks which achievement badges the user has earned.
   */
  earnedBadges: {
    type: [{
      badgeId:  { type: String, required: true },
      earnedAt: { type: Date,   default: Date.now },
    }],
    default: [],
    _id: false
  }
}, { timestamps: true });


const User = mongoose.model('User', userSchema);
module.exports = User;
