const User = require('../models/user/userModel');
const Organization = require('../models/organization/organizationModel');
const UserSubscription = require('../models/subscriptions/UserSubscription');
const { createAuditLog } = require('../utils/auditLogger');
const emailTemplateService = require('./emailTemplate.service');
const adminAuditService = require('./adminAudit.service');

/**
 * Admin User Service
 * Platform admin operations for user management
 */
class AdminUserService {

    /**
     * List all users with pagination and filters
     */
    async listUsers(filters = {}, pagination = {}) {
        const {
            search,
            platformRole,
            verified,
            deletedAt
        } = filters;

        const {
            page = 1,
            limit = 50
        } = pagination;

        const skip = (page - 1) * limit;

        // Build query
        const query = {};

        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } }
            ];
        }

        if (platformRole) {
            query.role = platformRole;
        }

        if (verified !== undefined) {
            query.verified = verified;
        }

        // Include deleted users if requested
        if (deletedAt === 'only') {
            query.deletedAt = { $ne: null };
        } else if (!deletedAt) {
            query.deletedAt = null;
        }

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password -refreshToken -otp')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .lean(),
            User.countDocuments(query)
        ]);

        return {
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get detailed user information
     */
    async getUserDetails(userid) {
        const user = await User.findOne({ userid })
            .select('-password -refreshToken -otp')
            .lean();

        if (!user) {
            throw new Error('User not found');
        }

        // Get user's organizations
        const organizations = await Organization.find({
            organizationId: { $in: user.organization || [] }
        }).select('organizationId name organizationType verified isPartner').lean();

        // Get user's subscriptions
        const subscriptions = await UserSubscription.find({ userid })
            .select('subscriptionId planId status billingCycle startDate endDate')
            .lean();

        return {
            ...user,
            organizations,
            subscriptions
        };
    }

    /**
     * Change user's platform role
     */
    async changeUserRole(userid, newRole, adminId) {
        // Validate role
        const validRoles = ['user', 'admin'];
        if (!validRoles.includes(newRole)) {
            throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
        }

        const user = await User.findOne({ userid });
        if (!user) {
            throw new Error('User not found');
        }

        const oldRole = user.role;

        // Prevent self-demotion
        if (userid === adminId && newRole !== 'admin') {
            throw new Error('Cannot demote yourself');
        }

        user.role = newRole;
        await user.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_CHANGE_USER_ROLE',
            userid: adminId,
            targetUserId: userid,
            details: {
                oldRole,
                newRole
            },
            ipAddress: null
        });

        return {
            userid: user.userid,
            email: user.email,
            role: user.role
        };
    }

    /**
     * Suspend user (soft delete)
     */
    async suspendUser(userid, reason, adminId) {
        const user = await User.findOne({ userid });
        if (!user) {
            throw new Error('User not found');
        }

        if (user.deletedAt) {
            throw new Error('User is already suspended');
        }

        // Prevent self-suspension
        if (userid === adminId) {
            throw new Error('Cannot suspend yourself');
        }

        user.deletedAt = new Date();
        await user.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_SUSPEND_USER',
            userid: adminId,
            targetUserId: userid,
            details: { reason },
            ipAddress: null
        });

        return {
            success: true,
            message: 'User suspended successfully'
        };
    }

    /**
     * Restore suspended user
     */
    async restoreUser(userid, adminId) {
        const user = await User.findOne({ userid });
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.deletedAt) {
            throw new Error('User is not suspended');
        }

        user.deletedAt = null;
        await user.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_RESTORE_USER',
            userid: adminId,
            targetUserId: userid,
            details: {},
            ipAddress: null
        });

        return {
            success: true,
            message: 'User restored successfully'
        };
    }

    /**
     * Hard delete user (permanent)
     */
    async deleteUser(userid, adminId) {
        const user = await User.findOne({ userid });
        if (!user) {
            throw new Error('User not found');
        }

        // Prevent self-deletion
        if (userid === adminId) {
            throw new Error('Cannot delete yourself');
        }

        // Store user data for audit
        const userData = {
            email: user.email,
            username: user.username
        };

        // Delete user
        await User.deleteOne({ userid });

        // Audit log
        await createAuditLog({
            action: 'ADMIN_DELETE_USER',
            userid: adminId,
            targetUserId: userid,
            details: userData,
            ipAddress: null
        });

        return {
            success: true,
            message: 'User permanently deleted'
        };
    }

    /**
     * Force password reset for user
     */
    async forcePasswordReset(userid, adminId) {
        const user = await User.findOne({ userid });
        if (!user) {
            throw new Error('User not found');
        }

        // Invalidate all refresh tokens
        user.refreshToken = null;
        await user.save();

        // Send password reset email using template
        await emailTemplateService.sendFromTemplate('password-reset', user.email, {
            userName: `${user.firstName} ${user.lastName}`,
            resetLink: `${process.env.APP_URL}/reset-password?token=force-reset`, // Placeholder link logic
            expiryHours: '24'
        });

        // Audit log
        await createAuditLog({
            action: 'ADMIN_FORCE_PASSWORD_RESET',
            userid: adminId,
            targetUserId: userid,
            details: {},
            ipAddress: null
        });

        return {
            success: true,
            message: 'Password reset initiated. User tokens invalidated.'
        };
    }

    async getUserActivity(userid, dateRange = {}) {
        const result = await adminAuditService.getUserLogs(userid, dateRange);

        return {
            userid,
            activities: result.logs,
            message: `Retrieved ${result.logs.length} activity records`
        };
    }
}

module.exports = new AdminUserService();
