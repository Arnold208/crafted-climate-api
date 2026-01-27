// middleware/auditLogger.js

const { v4: uuidv4 } = require('uuid');
const { writeAuditLog } = require('../config/storage/storage');
const jwt = require('jsonwebtoken');

/**
 * Global Audit Logger Middleware
 * 
 * Logs all API requests to Azure Table Storage
 * - Attaches to ALL routes except authentication routes
 * - Runs BEFORE route, finalizes AFTER response
 * - Never throws or blocks (fail-safe logging with fallback)
 * - Uses exponential backoff retry logic
 */

// In-memory fallback queue for logs when storage is unavailable
const fallbackLogQueue = [];
const MAX_FALLBACK_QUEUE_SIZE = 1000;
let storageAvailable = true;
let retryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [100, 500, 2000]; // ms

function auditLogger(req, res, next) {
  // Skip logging for auth routes
  const skipPaths = [
    '/api/auth',
    '/api/user/login',
    '/api/user/signup'
  ];

  if (skipPaths.some(path => req.originalUrl.startsWith(path))) {
    return next();
  }

  // Extract JWT info if available (routes may have authenticateToken middleware)
  let userid = null;
  let platformRole = null;
  let currentOrgId = null;

  if (req.user) {
    // User already authenticated by downstream middleware
    userid = req.user.userid || null;
    platformRole = req.user.platformRole || null;
    currentOrgId = req.user.currentOrganizationId || null;
  } else if (req.headers.authorization) {
    // Try to extract from JWT if available
    try {
      const token = req.headers.authorization.split(' ')[1];
      if (token) {
        const decoded = jwt.decode(token);
        if (decoded) {
          userid = decoded.userid || null;
          platformRole = decoded.platformRole || null;
          currentOrgId = decoded.currentOrganizationId || null;
        }
      }
    } catch (err) {
      // Silent failure - invalid token will be handled by route handlers
    }
  }

  // Extract audit info from request
  const timestamp = new Date().toISOString();
  const rowKey = `${timestamp}-${uuidv4()}`;
  
  // Determine partition key: org-isolated or platform
  const organizationId = currentOrgId || req.currentOrgId || null;
  const partitionKey = organizationId || 'platform';

  // Sanitize request body (remove sensitive fields)
  let requestBody = {};
  if (req.body) {
    requestBody = sanitizeRequestBody(req.body);
  }

  // Create base audit log entity
  const auditLog = {
    PartitionKey: partitionKey,
    RowKey: rowKey,
    timestamp: new Date(timestamp),
    userid: userid || 'anonymous',
    platformRole: platformRole || null,
    organizationId: organizationId,
    route: req.originalUrl,
    method: req.method,
    ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
    requestBody: JSON.stringify(requestBody),
    permissionUsed: req.permissionUsed || null,
    meta: JSON.stringify(req.auditMeta || {})
  };

  // Hook into response.on('finish') to capture status code
  res.on('finish', () => {
    auditLog.statusCode = res.statusCode;
    auditLog.allowed = res.statusCode < 400;

    // Write to Azure Table Storage with retry logic and fallback
    writeAuditLogWithRetry(auditLog).catch(err => {
      // Only log at console level if repeatedly failing
      if (retryCount >= MAX_RETRIES) {
        console.error('[AuditLogger] Storage unavailable after retries, using fallback queue');
      }
      // Intentionally silent - do not break the request
    });
  });

  next();
}

/**
 * Write log with exponential backoff retry and fallback to queue
 */
async function writeAuditLogWithRetry(auditLog) {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await writeAuditLog(auditLog);
      retryCount = 0; // Reset retry count on success
      storageAvailable = true;
      return; // Success - exit
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        // Wait before retrying (exponential backoff)
        await delay(RETRY_DELAYS[attempt]);
      }
    }
  }

  // All retries failed - use fallback
  storageAvailable = false;
  retryCount = MAX_RETRIES;
  useAuditLogFallback(auditLog, lastError);
}

/**
 * Fallback queue mechanism when storage is unavailable
 */
function useAuditLogFallback(auditLog, error) {
  // Add to fallback queue
  if (fallbackLogQueue.length < MAX_FALLBACK_QUEUE_SIZE) {
    fallbackLogQueue.push({
      ...auditLog,
      fallbackTime: new Date().toISOString(),
      originalError: error?.message || 'Unknown error'
    });
  } else {
    // Queue full - drop oldest entry
    fallbackLogQueue.shift();
    fallbackLogQueue.push({
      ...auditLog,
      fallbackTime: new Date().toISOString(),
      originalError: error?.message || 'Unknown error'
    });
  }

  console.warn(
    `[AuditLogger] Fallback queue size: ${fallbackLogQueue.length}/${MAX_FALLBACK_QUEUE_SIZE}`
  );
}

/**
 * Async delay utility for retry backoff
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitize request body to remove sensitive fields
 */
function sanitizeRequestBody(body) {
  const sensitive = ['password', 'token', 'secret', 'key', 'authorization'];
  const sanitized = {};

  for (const [key, value] of Object.entries(body)) {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Get fallback queue for monitoring/recovery
 * (Can be exposed via admin endpoint for monitoring)
 */
function getFallbackQueue() {
  return {
    size: fallbackLogQueue.length,
    maxSize: MAX_FALLBACK_QUEUE_SIZE,
    storageAvailable: storageAvailable,
    queue: fallbackLogQueue.slice() // Return copy
  };
}

/**
 * Flush fallback queue (call when storage is back online)
 */
async function flushFallbackQueue() {
  if (fallbackLogQueue.length === 0) {
    return { flushed: 0, success: true };
  }

  let flushed = 0;
  const failed = [];

  while (fallbackLogQueue.length > 0) {
    const log = fallbackLogQueue.shift();
    try {
      await writeAuditLog(log);
      flushed++;
    } catch (err) {
      // Put back in queue on error
      fallbackLogQueue.unshift(log);
      failed.push({ log, error: err.message });
      break; // Stop on first failure
    }
  }

  if (failed.length === 0) {
    storageAvailable = true;
    console.log(`[AuditLogger] Fallback queue flushed: ${flushed} logs recovered`);
  }

  return {
    flushed,
    remaining: fallbackLogQueue.length,
    failed: failed.length,
    success: failed.length === 0
  };
}

module.exports = auditLogger;
module.exports.getFallbackQueue = getFallbackQueue;
module.exports.flushFallbackQueue = flushFallbackQueue;
