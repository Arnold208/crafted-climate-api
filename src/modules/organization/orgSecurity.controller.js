'use strict';

/**
 * Org Security Controller
 * Self-service management of allowedOrigins and allowedIPs per organization.
 *
 * These values are enforced in authenticateApiKey.js via a Redis cache (5 min TTL).
 * Every write here invalidates the cache immediately so enforcement is near-instant.
 *
 * Rules:
 *  - Empty array = allow all (safe default — no existing org is broken)
 *  - Only org admins (org.manage permission) can modify these settings
 *  - Origin must be a valid URL (https:// required for production safety)
 *  - IP must be a valid IPv4 or IPv6 address
 */

const Organization = require('../../models/organization/organizationModel');
const { client: redis } = require('../../config/redis/redis');
const { createAuditLog } = require('../../utils/auditLogger');

// Cache key pattern — must match the one used in authenticateApiKey.js
const securityCacheKey = (orgId) => `org:security:${orgId}`;

// Invalidate Redis cache for this org's security settings
async function invalidateCache(orgId) {
    try {
        await redis.del(securityCacheKey(orgId));
    } catch (_) { /* non-fatal */ }
}

// Validate origin URL — must start with https:// or http:// (http allowed for dev/testing)
function isValidOrigin(origin) {
    try {
        const url = new URL(origin);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch (_) {
        return false;
    }
}

// Validate IPv4 or IPv6 address
function isValidIP(ip) {
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    if (ipv4.test(ip)) {
        return ip.split('.').every(seg => parseInt(seg, 10) <= 255);
    }
    return ipv6.test(ip) && ip.length >= 2;
}

// ── GET /api/org/:orgId/security ─────────────────────────────────────────────
exports.getSecuritySettings = async (req, res) => {
    try {
        const { orgId } = req.params;
        const org = await Organization.findOne({ organizationId: orgId })
            .select('security organizationId name')
            .lean();

        if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });

        return res.json({
            success: true,
            organizationId: org.organizationId,
            security: {
                allowedOrigins: org.security?.allowedOrigins || [],
                allowedIPs:     org.security?.allowedIPs     || [],
            },
            note: 'Empty arrays mean all origins/IPs are allowed. Add entries to restrict access.'
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};

// ── POST /api/org/:orgId/security/origins ────────────────────────────────────
// Body: { origin: "https://app.theirclient.com" }
exports.addOrigin = async (req, res) => {
    try {
        const { orgId } = req.params;
        const { origin } = req.body;

        if (!origin || typeof origin !== 'string') {
            return res.status(400).json({ success: false, error: 'origin is required (e.g. "https://app.yourcompany.com").' });
        }

        const trimmed = origin.trim().replace(/\/$/, ''); // strip trailing slash
        if (!isValidOrigin(trimmed)) {
            return res.status(400).json({ success: false, error: 'Invalid origin. Must be a valid URL starting with https:// or http://.' });
        }

        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });

        if (!org.security) org.security = { allowedOrigins: [], allowedIPs: [] };
        if (org.security.allowedOrigins.includes(trimmed)) {
            return res.status(409).json({ success: false, error: 'This origin is already whitelisted.' });
        }

        org.security.allowedOrigins.push(trimmed);
        await org.save();
        await invalidateCache(orgId);

        await createAuditLog({
            action: 'ORG_SECURITY_ORIGIN_ADDED',
            userid: req.user?.userid,
            details: { orgId, origin: trimmed }
        }).catch(() => {});

        return res.json({
            success: true,
            message: `Origin "${trimmed}" added to allowlist.`,
            allowedOrigins: org.security.allowedOrigins
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};

// ── DELETE /api/org/:orgId/security/origins ──────────────────────────────────
// Body: { origin: "https://app.theirclient.com" }
exports.removeOrigin = async (req, res) => {
    try {
        const { orgId } = req.params;
        const { origin } = req.body;

        if (!origin) return res.status(400).json({ success: false, error: 'origin is required.' });

        const trimmed = origin.trim().replace(/\/$/, '');
        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });

        const before = org.security?.allowedOrigins?.length || 0;
        org.security.allowedOrigins = (org.security.allowedOrigins || []).filter(o => o !== trimmed);

        if (org.security.allowedOrigins.length === before) {
            return res.status(404).json({ success: false, error: 'Origin not found in allowlist.' });
        }

        await org.save();
        await invalidateCache(orgId);

        await createAuditLog({
            action: 'ORG_SECURITY_ORIGIN_REMOVED',
            userid: req.user?.userid,
            details: { orgId, origin: trimmed }
        }).catch(() => {});

        return res.json({
            success: true,
            message: `Origin "${trimmed}" removed from allowlist.`,
            allowedOrigins: org.security.allowedOrigins
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};

// ── POST /api/org/:orgId/security/ips ────────────────────────────────────────
// Body: { ip: "102.45.67.89" }
exports.addIP = async (req, res) => {
    try {
        const { orgId } = req.params;
        const { ip } = req.body;

        if (!ip || typeof ip !== 'string') {
            return res.status(400).json({ success: false, error: 'ip is required (e.g. "102.45.67.89").' });
        }

        const trimmed = ip.trim();
        if (!isValidIP(trimmed)) {
            return res.status(400).json({ success: false, error: 'Invalid IP address. Must be a valid IPv4 or IPv6 address.' });
        }

        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });

        if (!org.security) org.security = { allowedOrigins: [], allowedIPs: [] };
        if (org.security.allowedIPs.includes(trimmed)) {
            return res.status(409).json({ success: false, error: 'This IP is already whitelisted.' });
        }

        org.security.allowedIPs.push(trimmed);
        await org.save();
        await invalidateCache(orgId);

        await createAuditLog({
            action: 'ORG_SECURITY_IP_ADDED',
            userid: req.user?.userid,
            details: { orgId, ip: trimmed }
        }).catch(() => {});

        return res.json({
            success: true,
            message: `IP "${trimmed}" added to allowlist.`,
            allowedIPs: org.security.allowedIPs
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};

// ── DELETE /api/org/:orgId/security/ips ──────────────────────────────────────
// Body: { ip: "102.45.67.89" }
exports.removeIP = async (req, res) => {
    try {
        const { orgId } = req.params;
        const { ip } = req.body;

        if (!ip) return res.status(400).json({ success: false, error: 'ip is required.' });

        const trimmed = ip.trim();
        const org = await Organization.findOne({ organizationId: orgId });
        if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });

        const before = org.security?.allowedIPs?.length || 0;
        org.security.allowedIPs = (org.security.allowedIPs || []).filter(i => i !== trimmed);

        if (org.security.allowedIPs.length === before) {
            return res.status(404).json({ success: false, error: 'IP not found in allowlist.' });
        }

        await org.save();
        await invalidateCache(orgId);

        await createAuditLog({
            action: 'ORG_SECURITY_IP_REMOVED',
            userid: req.user?.userid,
            details: { orgId, ip: trimmed }
        }).catch(() => {});

        return res.json({
            success: true,
            message: `IP "${trimmed}" removed from allowlist.`,
            allowedIPs: org.security.allowedIPs
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};
