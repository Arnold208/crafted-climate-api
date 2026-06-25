const levelConfigService = require('../../services/levelConfig.service');

/**
 * Admin Loyalty Controller
 * Manages the configurable loyalty points system (level thresholds & action values).
 *
 * All routes require: Bearer token + admin role.
 */
class AdminLoyaltyController {

  /**
   * GET /api/admin/loyalty/config
   * Returns the current live config (thresholds + action values + audit info).
   */
  async getConfig(req, res) {
    try {
      const config = await levelConfigService.getConfig();
      return res.status(200).json({ success: true, data: config });
    } catch (error) {
      console.error('[AdminLoyalty] getConfig error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /api/admin/loyalty/config/thresholds
   * Replace level thresholds.
   *
   * Body:
   * {
   *   "thresholds": [
   *     { "level": "Explorer",  "minPoints": 0    },
   *     { "level": "Learner",   "minPoints": 75   },
   *     { "level": "Advocate",  "minPoints": 200  },
   *     { "level": "Champion",  "minPoints": 450  },
   *     { "level": "Pioneer",   "minPoints": 900  },
   *     { "level": "Legend",    "minPoints": 1500 }
   *   ]
   * }
   */
  async updateThresholds(req, res) {
    try {
      const { thresholds } = req.body;
      if (!thresholds) {
        return res.status(400).json({
          success: false,
          message: 'Body must include a "thresholds" array',
        });
      }

      const adminId = req.user?.userid || req.user?.id;
      const doc = await levelConfigService.updateLevelThresholds(thresholds, adminId);

      return res.status(200).json({
        success: true,
        message: 'Level thresholds updated successfully. Cache invalidated.',
        data: {
          levelThresholds: doc.levelThresholds,
          lastUpdatedBy:   doc.lastUpdatedBy,
          lastUpdatedAt:   doc.lastUpdatedAt,
        },
      });
    } catch (error) {
      console.error('[AdminLoyalty] updateThresholds error:', error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /api/admin/loyalty/config/action-values
   * Replace the per-action point values.
   *
   * Body:
   * {
   *   "actionValues": {
   *     "lesson_completed":    10,
   *     "quiz_completed":      20,
   *     "challenge_completed": 30,
   *     "community_report":    8,
   *     "device_connected":    15,
   *     "daily_login":         3
   *   }
   * }
   *
   * You can add new action keys or remove existing ones.
   * Only keys present in this object will be accepted by the points/add endpoint.
   */
  async updateActionValues(req, res) {
    try {
      const { actionValues } = req.body;
      if (!actionValues || typeof actionValues !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Body must include an "actionValues" object mapping action keys to numbers',
        });
      }

      const adminId = req.user?.userid || req.user?.id;
      const doc = await levelConfigService.updateActionValues(actionValues, adminId);

      // Normalise Map → plain object for the response
      const returned = doc.actionValues instanceof Map
        ? Object.fromEntries(doc.actionValues)
        : doc.actionValues;

      return res.status(200).json({
        success: true,
        message: 'Action values updated successfully. Cache invalidated.',
        data: {
          actionValues:  returned,
          lastUpdatedBy: doc.lastUpdatedBy,
          lastUpdatedAt: doc.lastUpdatedAt,
        },
      });
    } catch (error) {
      console.error('[AdminLoyalty] updateActionValues error:', error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/admin/loyalty/config/reset
   * Reset all loyalty config back to factory defaults.
   */
  async resetToDefaults(req, res) {
    try {
      const adminId = req.user?.userid || req.user?.id;
      await levelConfigService.resetToDefaults(adminId);

      return res.status(200).json({
        success: true,
        message: 'Loyalty config reset to factory defaults. Cache invalidated.',
      });
    } catch (error) {
      console.error('[AdminLoyalty] resetToDefaults error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new AdminLoyaltyController();
