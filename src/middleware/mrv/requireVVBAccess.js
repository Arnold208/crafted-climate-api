'use strict';
const crypto = require('crypto');
const MRVVVBAccessGrant = require('../../models/mrv/assurance/MRVVVBAccessGrant.model');
const { createAuditLog } = require('../../utils/auditLogger');

/**
 * Middleware: validates a VVB scoped API key.
 * Key format: Authorization: Bearer vvb_<randomHex>
 * The DB stores a SHA-256 hash of the key (never the raw key).
 */
module.exports = async function requireVVBAccess(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token || !token.startsWith('vvb_')) {
      return res.status(401).json({
        success: false,
        error: 'VVB access key required. Use Authorization: Bearer vvb_<key>'
      });
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const grant = await MRVVVBAccessGrant.findOne({ apiKey: hash, status: 'ACTIVE' });

    if (!grant) {
      return res.status(401).json({ success: false, error: 'Invalid or expired VVB access key.' });
    }

    if (grant.expiresAt < new Date()) {
      grant.status = 'EXPIRED';
      await grant.save();
      return res.status(401).json({ success: false, error: 'VVB access key has expired.' });
    }

    // Check projectId matches if provided in URL
    const urlProjectId = req.params.projectId;
    if (urlProjectId && grant.projectId !== urlProjectId) {
      return res.status(403).json({
        success: false,
        error: 'This key is not authorised for the requested project.'
      });
    }

    // Update usage stats (non-blocking)
    MRVVVBAccessGrant.updateOne(
      { grantId: grant.grantId },
      { $set: { lastUsedAt: new Date() }, $inc: { useCount: 1 } }
    ).catch(() => {});

    // Audit log the access (non-blocking)
    createAuditLog({
      action: 'VVB_ACCESS_GRANT_USED',
      userid: grant.vvbEmail || grant.grantId,
      details: { grantId: grant.grantId, projectId: grant.projectId, path: req.path }
    }).catch(() => {});

    req.vvbGrant = grant;
    req.vvbProjectId = grant.projectId;
    next();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'VVB access validation failed.' });
  }
};
