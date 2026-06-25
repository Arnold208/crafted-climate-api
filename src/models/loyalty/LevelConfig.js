const mongoose = require('mongoose');

/**
 * LevelConfig — singleton document that controls the loyalty points system.
 *
 * There is always exactly ONE document in this collection (key: 'default').
 * It is seeded on first read if it does not exist.
 *
 * Admins can update levelThresholds and actionValues via the admin API.
 * The mobile app and _computeLevel() always read from this, with a short
 * in-memory cache to avoid DB round-trips on every points call.
 */
const levelConfigSchema = new mongoose.Schema({
  // Singleton key — never changes
  key: { type: String, default: 'default', unique: true, immutable: true },

  /**
   * Level thresholds — minimum points to reach each level.
   * Must be provided in ASCENDING order.
   * Default values shipped with the product.
   */
  levelThresholds: {
    type: [
      {
        level:     { type: String, required: true }, // e.g. "Learner"
        minPoints: { type: Number, required: true }, // e.g. 50
        _id: false,
      }
    ],
    default: [
      { level: 'Explorer',  minPoints: 0    },
      { level: 'Learner',   minPoints: 50   },
      { level: 'Advocate',  minPoints: 150  },
      { level: 'Champion',  minPoints: 350  },
      { level: 'Pioneer',   minPoints: 700  },
      { level: 'Legend',    minPoints: 1200 },
    ],
  },

  /**
   * Server-authoritative point values per action type.
   * Clients submit the action key; the server looks up the value here.
   * This replaces the hardcoded ALLOWED_ACTIONS map in user.controller.js.
   */
  actionValues: {
    type: Map,
    of: Number,
    default: {
      lesson_completed:    10,
      quiz_completed:      15,
      challenge_completed: 25,
      community_report:    5,
      device_connected:    10,
      daily_login:         2,
    },
  },

  // Audit: who last changed this config and when
  lastUpdatedBy: { type: String, default: null },
  lastUpdatedAt: { type: Date,   default: null },

}, { timestamps: true });

const LevelConfig = mongoose.model('LevelConfig', levelConfigSchema);
module.exports = LevelConfig;
