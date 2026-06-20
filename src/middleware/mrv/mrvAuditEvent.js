'use strict';
const { logMRVEvent } = require('../../services/mrv/mrvAuditService');

/**
 * mrvAuditEvent middleware factory.
 * Logs an MRV audit event AFTER the response is sent.
 * Usage: router.post('...', auth, mrvAuditEvent({ action: 'PROJECT_CREATED', entityType: 'MRVProject' }), ctrl)
 */
function mrvAuditEvent({ action, entityType, getEntityId }) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const result = originalJson(body);
      const entityId = getEntityId ? getEntityId(req, body) : (req.params.projectId || req.params.id || body?.data?.projectId);
      setImmediate(() => {
        logMRVEvent({
          projectId: req.mrvProject?.projectId || req.params.projectId,
          organizationId: req.currentOrgId || req.user?.organizationId,
          entityType,
          entityId,
          action,
          actorId: req.user?.userid || req.user?._id?.toString(),
          actorRole: req.mrvRole,
          actorIp: req.ip,
          correlationId: req.headers['x-correlation-id'] || null
        });
      });
      return result;
    };
    next();
  };
}

module.exports = { mrvAuditEvent };
