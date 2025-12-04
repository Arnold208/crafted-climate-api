const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
  organization: {
    type: [String],
    default: []
  },
  deployments: {
    type: [String],
    default: []
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

  // ✅ Role-Based Access Control
  role: {
    type: String,
    enum: ['admin', 'supervisor', 'user'],
    default: 'user'
  },

  subscription: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "UserSubscription",
  default: null
},

  // ✅ Devices owned or invited to
  devices: [
    {
      deviceId: {
        type: String,
        required: true
      },
      accessType: {
        type: String,
        enum: ['owner', 'invited'],
        required: true
      }
    }
  ]
});

const User = mongoose.model('User', userSchema);
module.exports = User;
