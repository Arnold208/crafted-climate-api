// routes/logs/auditLogRoutes.js

const express = require('express');
const router = express.Router();
const authenticateToken = require('../../middleware/bearermiddleware');
const checkOrgAccess = require('../../middleware/organization/checkOrgAccess');
const { tableClient } = require('../../config/storage/storage');
const rateLimit = require('express-rate-limit');

/**
 * @swagger
 * tags:
 *   name: Audit Logs
 *   description: Access audit logs for organizations and platform
 */

// ============================================================
// RATE LIMITING FOR LOG QUERIES
// ============================================================

const logQueryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per window
  message: 'Too many log queries, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

/**
 * @swagger
 * /api/org/{orgId}/logs:
 *   get:
 *     summary: Get audit logs for an organization with timestamp filtering
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Retrieve audit logs for a specific organization with advanced filtering.
 *       Only org admins and support staff can access this endpoint.
 *       Super-admin users are DENIED access to org logs (tenant isolation).
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start timestamp (ISO 8601 format, e.g., 2025-12-08T10:00:00Z)
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End timestamp (ISO 8601 format, e.g., 2025-12-08T15:00:00Z)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 500
 *         description: Number of records to return (max 500 to prevent system overload)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Successfully retrieved organization logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *       400:
 *         description: Invalid query parameters
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get('/:orgId/logs', 
  authenticateToken,
  logQueryLimiter,
  checkOrgAccess('org.logs.view'),
  async (req, res) => {
  try {
    const { orgId } = req.params;
    let { limit = 50, offset = 0, startTime, endTime } = req.query;

    // ============================================================
    // VALIDATE PAGINATION PARAMETERS
    // ============================================================

    limit = Math.min(parseInt(limit) || 50, 500); // Max 500 per query
    offset = Math.max(parseInt(offset) || 0, 0);

    if (limit < 1) {
      return res.status(400).json({ error: 'limit must be at least 1' });
    }

    if (offset < 0) {
      return res.status(400).json({ error: 'offset cannot be negative' });
    }

    // ============================================================
    // VALIDATE TIMESTAMP PARAMETERS
    // ============================================================

    let startDate = null;
    let endDate = null;

    if (startTime) {
      startDate = new Date(startTime);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startTime format. Use ISO 8601 (e.g., 2025-12-08T10:00:00Z)' });
      }
    }

    if (endTime) {
      endDate = new Date(endTime);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endTime format. Use ISO 8601 (e.g., 2025-12-08T15:00:00Z)' });
      }
    }

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: 'startTime cannot be after endTime' });
    }

    // ============================================================
    // SECURITY CHECKS
    // ============================================================

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user' });
    }

    // Check: Super-admin CANNOT read org logs (platform isolation)
    if (req.user.platformRole === 'super-admin') {
      return res.status(403).json({ error: 'Denied: Super-admin cannot access organization logs' });
    }

    // Check: Tenant isolation - orgId must match user's current org
    // (Already verified by checkOrgAccess middleware via req.currentOrgId)
    if (orgId !== req.currentOrgId) {
      return res.status(403).json({ error: 'Denied: Cannot access logs from other organizations' });
    }

    // ============================================================
    // BUILD QUERY FILTER
    // ============================================================

    let filters = [`PartitionKey eq '${orgId}'`];

    // Add timestamp filters if provided
    if (startDate) {
      const startISO = startDate.toISOString();
      filters.push(`timestamp ge datetime'${startISO}'`);
    }

    if (endDate) {
      const endISO = endDate.toISOString();
      filters.push(`timestamp le datetime'${endISO}'`);
    }

    const filter = filters.join(' and ');

    // ============================================================
    // QUERY LOGS WITH PAGINATION
    // ============================================================

    const logs = [];
    let totalCount = 0;

    try {
      const entities = tableClient.listEntities({
        filter: filter
      });

      // Manual pagination - collect and slice
      for await (const entity of entities) {
        totalCount++;
        if (totalCount > offset && logs.length < limit) {
          logs.push(entity);
        }
        // Continue counting to get total
        if (totalCount > offset + limit + 1000) {
          // Stop counting after a reasonable buffer to prevent timeout
          break;
        }
      }

      const hasMore = totalCount > offset + limit;

      return res.status(200).json({
        logs: logs,
        total: totalCount,
        limit: limit,
        offset: offset,
        hasMore: hasMore,
        timestamp: new Date().toISOString()
      });
    } catch (queryErr) {
      console.error('[OrgLogs] Query error:', queryErr.message);
      return res.status(500).json({ error: 'Failed to query logs' });
    }

  } catch (error) {
    console.error('[OrgLogs] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/platform/logs:
 *   get:
 *     summary: Get platform audit logs with timestamp filtering
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Retrieve platform-wide audit logs.
 *       Only platform admins can access this endpoint.
 *       Org admins and support staff are DENIED.
 *     parameters:
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start timestamp (ISO 8601 format, e.g., 2025-12-08T10:00:00Z)
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End timestamp (ISO 8601 format, e.g., 2025-12-08T15:00:00Z)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 500
 *         description: Number of records to return (max 500 to prevent system overload)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Successfully retrieved platform logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *       400:
 *         description: Invalid query parameters
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get('/logs', authenticateToken, logQueryLimiter, async (req, res) => {
  try {
    let { limit = 50, offset = 0, startTime, endTime } = req.query;

    // ============================================================
    // VALIDATE PAGINATION PARAMETERS
    // ============================================================

    limit = Math.min(parseInt(limit) || 50, 500); // Max 500 per query
    offset = Math.max(parseInt(offset) || 0, 0);

    if (limit < 1) {
      return res.status(400).json({ error: 'limit must be at least 1' });
    }

    if (offset < 0) {
      return res.status(400).json({ error: 'offset cannot be negative' });
    }

    // ============================================================
    // VALIDATE TIMESTAMP PARAMETERS
    // ============================================================

    let startDate = null;
    let endDate = null;

    if (startTime) {
      startDate = new Date(startTime);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startTime format. Use ISO 8601 (e.g., 2025-12-08T10:00:00Z)' });
      }
    }

    if (endTime) {
      endDate = new Date(endTime);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endTime format. Use ISO 8601 (e.g., 2025-12-08T15:00:00Z)' });
      }
    }

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: 'startTime cannot be after endTime' });
    }

    // ============================================================
    // SECURITY CHECKS
    // ============================================================

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user' });
    }

    // Only platform-level admins allowed
    const platformRole = req.user.platformRole;
    const allowedRoles = ['platform-admin', 'admin', 'super-admin'];
    
    if (!allowedRoles.includes(platformRole)) {
      return res.status(403).json({ error: 'Denied: Only platform admins can access platform logs' });
    }

    // ============================================================
    // BUILD QUERY FILTER
    // ============================================================

    let filters = [`PartitionKey eq 'platform'`];

    // Add timestamp filters if provided
    if (startDate) {
      const startISO = startDate.toISOString();
      filters.push(`timestamp ge datetime'${startISO}'`);
    }

    if (endDate) {
      const endISO = endDate.toISOString();
      filters.push(`timestamp le datetime'${endISO}'`);
    }

    const filter = filters.join(' and ');

    // ============================================================
    // QUERY LOGS WITH PAGINATION
    // ============================================================

    const logs = [];
    let totalCount = 0;

    try {
      const entities = tableClient.listEntities({
        filter: filter
      });

      // Manual pagination - collect and slice
      for await (const entity of entities) {
        totalCount++;
        if (totalCount > offset && logs.length < limit) {
          logs.push(entity);
        }
        // Continue counting to get total
        if (totalCount > offset + limit + 1000) {
          // Stop counting after a reasonable buffer to prevent timeout
          break;
        }
      }

      const hasMore = totalCount > offset + limit;

      return res.status(200).json({
        logs: logs,
        total: totalCount,
        limit: limit,
        offset: offset,
        hasMore: hasMore,
        timestamp: new Date().toISOString()
      });
    } catch (queryErr) {
      console.error('[PlatformLogs] Query error:', queryErr.message);
      return res.status(500).json({ error: 'Failed to query logs' });
    }

  } catch (error) {
    console.error('[PlatformLogs] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
