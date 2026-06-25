const LevelConfig = require('../models/loyalty/LevelConfig');

/**
 * LevelConfig Service — provides a cached, always-available view of the
 * loyalty configuration. Falls back to hardcoded defaults if the DB is
 * unreachable so the points system never breaks.
 *
 * Cache TTL: 5 minutes. The cache is invalidated immediately on any admin update.
 */

// ── Hardcoded defaults (used as fallback when DB is unreachable) ─────────────
const DEFAULT_THRESHOLDS = [
  { level: 'Explorer',  minPoints: 0    },
  { level: 'Learner',   minPoints: 50   },
  { level: 'Advocate',  minPoints: 150  },
  { level: 'Champion',  minPoints: 350  },
  { level: 'Pioneer',   minPoints: 700  },
  { level: 'Legend',    minPoints: 1200 },
];

const DEFAULT_ACTION_VALUES = {
  lesson_completed:    10,
  quiz_completed:      15,
  challenge_completed: 25,
  community_report:    5,
  device_connected:    10,
  daily_login:         2,
};

// ── In-memory cache ──────────────────────────────────────────────────────────
let _cache = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class LevelConfigService {

  /** Invalidate the cache immediately (call after any admin update). */
  invalidateCache() {
    _cache = null;
    _cacheExpiry = 0;
  }

  /**
   * Returns the live config from cache or DB.
   * Creates the singleton document with defaults if it doesn't exist yet.
   * Never throws — returns defaults on error.
   */
  async getConfig() {
    // 1. Serve from cache if still fresh
    if (_cache && Date.now() < _cacheExpiry) {
      return _cache;
    }

    try {
      let doc = await LevelConfig.findOne({ key: 'default' }).lean();

      // Seed defaults on first run
      if (!doc) {
        doc = await LevelConfig.create({ key: 'default' });
        doc = doc.toObject();
      }

      // Normalise actionValues (Mongoose Map → plain object)
      const actionValues =
        doc.actionValues instanceof Map
          ? Object.fromEntries(doc.actionValues)
          : (doc.actionValues || DEFAULT_ACTION_VALUES);

      _cache = {
        levelThresholds: doc.levelThresholds || DEFAULT_THRESHOLDS,
        actionValues,
        lastUpdatedBy: doc.lastUpdatedBy,
        lastUpdatedAt: doc.lastUpdatedAt,
      };
      _cacheExpiry = Date.now() + CACHE_TTL_MS;

      return _cache;
    } catch (err) {
      console.error('[LevelConfigService] DB error, using defaults:', err.message);
      // Return defaults — don't crash the points system
      return {
        levelThresholds: DEFAULT_THRESHOLDS,
        actionValues:    DEFAULT_ACTION_VALUES,
        lastUpdatedBy:   null,
        lastUpdatedAt:   null,
      };
    }
  }

  /**
   * Computes the level label for a given points total.
   * Reads from the cached config so this is safe to call synchronously
   * after the first warm-up. For the very first call, use computeLevelAsync.
   */
  computeLevelSync(points) {
    if (!_cache) {
      // Cache not yet warm — use defaults directly
      return _computeLevelFromThresholds(points, DEFAULT_THRESHOLDS);
    }
    return _computeLevelFromThresholds(points, _cache.levelThresholds);
  }

  /** Async version — always uses the latest config. */
  async computeLevelAsync(points) {
    const config = await this.getConfig();
    return _computeLevelFromThresholds(points, config.levelThresholds);
  }

  // ── Admin operations ────────────────────────────────────────────────────────

  /**
   * Replace the level thresholds.
   * @param {Array<{level: string, minPoints: number}>} thresholds
   * @param {string} adminId
   */
  async updateLevelThresholds(thresholds, adminId) {
    _validateThresholds(thresholds);

    const doc = await LevelConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          levelThresholds: thresholds,
          lastUpdatedBy:   adminId,
          lastUpdatedAt:   new Date(),
        },
      },
      { new: true, upsert: true, lean: true }
    );

    this.invalidateCache();
    return doc;
  }

  /**
   * Replace the action values map.
   * @param {Object<string, number>} actionValues
   * @param {string} adminId
   */
  async updateActionValues(actionValues, adminId) {
    _validateActionValues(actionValues);

    const doc = await LevelConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          actionValues:  new Map(Object.entries(actionValues)),
          lastUpdatedBy: adminId,
          lastUpdatedAt: new Date(),
        },
      },
      { new: true, upsert: true, lean: true }
    );

    this.invalidateCache();
    return doc;
  }

  /**
   * Reset everything back to factory defaults.
   * @param {string} adminId
   */
  async resetToDefaults(adminId) {
    const doc = await LevelConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          levelThresholds: DEFAULT_THRESHOLDS,
          actionValues:    new Map(Object.entries(DEFAULT_ACTION_VALUES)),
          lastUpdatedBy:   adminId,
          lastUpdatedAt:   new Date(),
        },
      },
      { new: true, upsert: true, lean: true }
    );

    this.invalidateCache();
    return doc;
  }
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _computeLevelFromThresholds(points, thresholds) {
  // Sort descending so we match the highest qualifying threshold first
  const sorted = [...thresholds].sort((a, b) => b.minPoints - a.minPoints);
  for (const t of sorted) {
    if (points >= t.minPoints) return t.level;
  }
  return sorted[sorted.length - 1]?.level ?? 'Explorer';
}

function _validateThresholds(thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    throw new Error('levelThresholds must be a non-empty array');
  }
  for (const t of thresholds) {
    if (typeof t.level !== 'string' || typeof t.minPoints !== 'number' || t.minPoints < 0) {
      throw new Error('Each threshold must have { level: string, minPoints: number (>= 0) }');
    }
  }
  // Ensure at least one threshold starts at 0 (entry level)
  const hasZero = thresholds.some(t => t.minPoints === 0);
  if (!hasZero) {
    throw new Error('At least one threshold must have minPoints: 0 (the entry level)');
  }
}

function _validateActionValues(actionValues) {
  if (typeof actionValues !== 'object' || Array.isArray(actionValues)) {
    throw new Error('actionValues must be an object mapping action keys to point values');
  }
  for (const [key, val] of Object.entries(actionValues)) {
    if (typeof val !== 'number' || val < 0) {
      throw new Error(`actionValues["${key}"] must be a non-negative number`);
    }
  }
}

module.exports = new LevelConfigService();
