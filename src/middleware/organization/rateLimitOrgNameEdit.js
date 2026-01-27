/**
 * Rate Limiting Middleware for Organization Name Editing
 * Enforces strict 2x per 30 days limit at middleware level
 * 
 * 🔒 SECURITY: Prevents abuse of name editing feature
 */

const Organization = require('../../models/organization/organizationModel');
const { hasPlatformPermission } = require('../../constants/organizationPermissions');

/**
 * Rate limit middleware for organization name editing
 * Strict 2x per 30 days limit (platform admins bypass)
 */
async function rateLimitOrgNameEdit(req, res, next) {
    try {
        const { orgId } = req.params;
        const userid = req.user.userid;
        const platformRole = req.user.platformRole || 'user';

        // Platform admins bypass rate limit
        if (hasPlatformPermission(platformRole, 'platform:orgs:manage')) {
            return next();
        }

        // Fetch organization
        const org = await Organization.findOne({
            organizationId: orgId,
            deletedAt: null
        });

        if (!org) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Check rate limit: 2 edits per 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentEdits = org.nameEditHistory.filter(edit =>
            new Date(edit.editedAt) >= thirtyDaysAgo
        );

        if (recentEdits.length >= 2) {
            const oldestEdit = recentEdits[0];
            const nextAllowedDate = new Date(oldestEdit.editedAt);
            nextAllowedDate.setDate(nextAllowedDate.getDate() + 30);

            const daysUntilAllowed = Math.ceil((nextAllowedDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

            return res.status(429).json({
                message: `Name edit limit reached. You can edit again in ${daysUntilAllowed} days.`,
                limit: 2,
                period: '30 days',
                editsUsed: recentEdits.length,
                nextAllowedDate: nextAllowedDate.toISOString()
            });
        }

        // Attach org to request for use in controller
        req.organization = org;
        req.editsRemaining = 2 - recentEdits.length;

        next();
    } catch (error) {
        console.error('Rate limit check error:', error);
        return res.status(500).json({
            message: 'Rate limit check failed',
            error: error.message
        });
    }
}

module.exports = rateLimitOrgNameEdit;
