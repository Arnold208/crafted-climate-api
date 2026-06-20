'use strict';
/**
 * MRV Field Visibility Utility
 *
 * MRV fields added to Device and Organization models must NOT be exposed
 * to users who haven't been granted MRV project access. This utility provides:
 *
 * 1. stripMRVFields()     — removes MRV fields from any object/lean document
 * 2. hasMRVAccess()       — checks if a user has MRV access for an org/project
 * 3. applyMRVVisibility() — conditionally strips based on access
 *
 * Usage in controllers:
 *   const { applyMRVVisibility } = require('../services/mrv/mrvFieldVisibility');
 *   const device = await Device.findOne(...).lean();
 *   return res.json({ data: applyMRVVisibility(device, req.user, req.currentOrgId) });
 */

// Fields added to Device model that are MRV-only
const DEVICE_MRV_FIELDS = [
  'mrvEnabled',
  'mrvProjectAssignments',
  'retentionClass',
  'expectedFrequencySeconds',
  'approvedFirmwareVersions'
];

// Fields added to Organization model that are MRV-only
const ORG_MRV_FIELDS = [
  'mrvEnabled',
  'mrvProjectIds',
  'programmeAccountReferences'
];

/**
 * Remove MRV-specific fields from a plain object.
 * Works with lean() mongoose documents or any plain JS object.
 * @param {object} obj - The document to sanitize
 * @param {string[]} fields - MRV field names to remove
 * @returns {object} A new object with MRV fields omitted
 */
function stripMRVFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const f of fields) {
    delete result[f];
  }
  return result;
}

/**
 * Determine if a user has MRV access for a given organization.
 * A user has MRV access if:
 *   - They are a platform admin
 *   - They are a member of at least one MRV project in this org
 *     (checked by the caller via req.mrvRole being set, OR via DB lookup)
 *
 * For lightweight use in controllers that don't have mrvRole pre-resolved,
 * we use a simple heuristic: if req.mrvRole is set, user has access.
 * Full DB lookup is done by verifyMRVProjectAccess middleware.
 *
 * @param {object} user        - req.user
 * @param {string} orgId       - current org ID
 * @param {object} [req]       - optional full request (for mrvRole check)
 * @returns {boolean}
 */
function hasMRVAccess(user, orgId, req) {
  if (!user) return false;
  // Platform admins always have access
  if (user.platformRole === 'admin') return true;
  // If verifyMRVProjectAccess already ran, mrvRole is set
  if (req && req.mrvRole) return true;
  // Default: no access
  return false;
}

/**
 * Apply MRV field visibility to a device document.
 * Strips MRV fields if the user does not have MRV access.
 *
 * @param {object|object[]} data - device document or array of documents
 * @param {object} user          - req.user
 * @param {string} orgId         - current org ID
 * @param {object} [req]         - full request object (optional)
 * @returns {object|object[]}    - sanitized document(s)
 */
function applyDeviceMRVVisibility(data, user, orgId, req) {
  const hasAccess = hasMRVAccess(user, orgId, req);
  if (hasAccess) return data;
  if (Array.isArray(data)) {
    return data.map(d => stripMRVFields(d, DEVICE_MRV_FIELDS));
  }
  return stripMRVFields(data, DEVICE_MRV_FIELDS);
}

/**
 * Apply MRV field visibility to an organization document.
 * Strips MRV fields if the user does not have MRV access.
 *
 * @param {object|object[]} data - org document or array of documents
 * @param {object} user          - req.user
 * @param {string} orgId         - current org ID
 * @param {object} [req]         - full request object (optional)
 * @returns {object|object[]}    - sanitized document(s)
 */
function applyOrgMRVVisibility(data, user, orgId, req) {
  const hasAccess = hasMRVAccess(user, orgId, req);
  if (hasAccess) return data;
  if (Array.isArray(data)) {
    return data.map(d => stripMRVFields(d, ORG_MRV_FIELDS));
  }
  return stripMRVFields(data, ORG_MRV_FIELDS);
}

/**
 * Express middleware factory: automatically strips MRV fields from
 * JSON response body for non-MRV users.
 *
 * Usage: router.get('/device/:auid', authenticateToken, mrvVisibilityMiddleware('device'), ctrl.getDevice)
 *
 * @param {'device'|'organization'} entityType
 */
function mrvVisibilityMiddleware(entityType) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (hasMRVAccess(req.user, req.currentOrgId, req)) {
        return originalJson(body);
      }
      // Strip MRV fields from response body.data or body (if array)
      if (body && body.data) {
        const fields = entityType === 'device' ? DEVICE_MRV_FIELDS : ORG_MRV_FIELDS;
        if (Array.isArray(body.data)) {
          body = { ...body, data: body.data.map(d => stripMRVFields(d, fields)) };
        } else if (typeof body.data === 'object') {
          body = { ...body, data: stripMRVFields(body.data, fields) };
        }
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = {
  DEVICE_MRV_FIELDS,
  ORG_MRV_FIELDS,
  stripMRVFields,
  hasMRVAccess,
  applyDeviceMRVVisibility,
  applyOrgMRVVisibility,
  mrvVisibilityMiddleware
};
