const User = require('../models/user/userModel');
const Organization = require('../models/organization/organizationModel');
const UserSubscription = require('../models/subscriptions/UserSubscription');
const RegisterDevice = require('../models/devices/registerDevice');
const { createAuditLog } = require('../utils/auditLogger');
const emailTemplateService = require('./emailTemplate.service');
const adminAuditService = require('./adminAudit.service');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const AdminPasswordResetRequest = require('../models/user/AdminPasswordResetRequest');

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
            query.platformRole = platformRole;
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
                .sort({ _id: -1 })
                .lean(),
            User.countDocuments(query)
        ]);

        // Populate devices for each user
        const userIds = users.map(u => u.userid);
        const devices = await RegisterDevice.find({
            $or: [
                { userid: { $in: userIds } },
                { 'collaborators.userid': { $in: userIds } }
            ]
        }).select('auid devid model status userid collaborators').lean();

        // Map devices to users
        users.forEach(user => {
            user.devices = devices.filter(d =>
                d.userid === user.userid ||
                (d.collaborators && d.collaborators.some(c => c.userid === user.userid))
            );
        });

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

        // Get devices OWNED by the user (excluding collaborations as requested)
        const devices = await RegisterDevice.find({ userid })
            .select('auid devid model status userid ownerUserId')
            .lean();

        return {
            ...user,
            organizations,
            subscriptions,
            devices
        };
    }

    /**
     * Change user's platform role
     */
    async changeUserRole(userid, newRole, adminId) {
        // Validate role
        const validRoles = ['user', 'admin', 'supervisor', 'support'];
        if (!validRoles.includes(newRole)) {
            throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
        }

        const user = await User.findOne({ userid });
        if (!user) {
            throw new Error('User not found');
        }

        if (user.deletedAt) {
            throw new Error('User is suspended. Restore user first before making changes.');
        }

        const oldRole = user.role;

        // Prevent self-demotion
        if (userid === adminId && newRole !== 'admin') {
            throw new Error('Cannot demote yourself');
        }

        user.platformRole = newRole;
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

        if (user.deletedAt) {
            throw new Error('User is suspended. Restore user first.');
        }

        // Invalidate all refresh tokens
        user.refreshToken = null;
        user.refreshTokens = [];
        user.markModified('refreshTokens');
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

    async getUserActivity(userid, dateRange = {}, pagination = {}) {
        const result = await adminAuditService.getUserLogs(userid, dateRange, pagination);

        return {
            userid,
            activities: result.logs,
            message: `Retrieved ${result.logs.length} activity records`
        };
    }

    /**
     * List admin password reset requests
     */
    async listPasswordResetRequests(status) {
        const query = {};
        if (status) {
            query.status = status;
        }
        return await AdminPasswordResetRequest.find(query).sort({ createdAt: -1 }).lean();
    }

    /**
     * Approve admin password reset request
     */
    async approvePasswordResetRequest(requestId, adminId) {
        const request = await AdminPasswordResetRequest.findOne({ requestId });
        if (!request) {
            throw new Error('Password reset request not found');
        }

        if (request.status !== 'pending') {
            throw new Error(`Request has already been ${request.status}`);
        }

        const targetUser = await User.findOne({ userid: request.userid });
        if (!targetUser) {
            throw new Error('Target user not found');
        }

        // Generate secure reset token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Send reset link email
        const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/backoffice/reset-password?token=${token}&requestId=${requestId}`;
        const message = `Your password reset request has been approved. Please click the link below to securely set your new password:\n\n${resetLink}\n\nThis link will expire in 24 hours.`;
        
        try {
            const { sendCCEmail } = require('../services/email/craftedClimateMailer');
            await sendCCEmail({
                type: 'admin.passwordResetApproved',
                to: targetUser.email,
                vars: {
                    userName:   targetUser.firstName || targetUser.username,
                    resetUrl:   resetLink,
                    expiresAt:  tokenExpiresAt.toISOString(),
                    expiresIn:  '24 hours',
                },
            });
        } catch (err) {
            console.error('[AdminUserService] Send reset link email error:', err.message);
        }

        // Update request state
        request.status = 'approved';
        request.resolvedAt = new Date();
        request.resolvedBy = adminId;
        request.token = token;
        request.tokenExpiresAt = tokenExpiresAt;
        await request.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_APPROVED_PASSWORD_RESET',
            userid: adminId,
            targetUserId: request.userid,
            details: { requestId },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Password reset request approved successfully. Reset link has been sent to the target user via email.'
        };
    }

    /**
     * Reject admin password reset request
     */
    async rejectPasswordResetRequest(requestId, adminId) {
        const request = await AdminPasswordResetRequest.findOne({ requestId });
        if (!request) {
            throw new Error('Password reset request not found');
        }

        if (request.status !== 'pending') {
            throw new Error(`Request has already been ${request.status}`);
        }

        request.status = 'rejected';
        request.resolvedAt = new Date();
        request.resolvedBy = adminId;
        await request.save();

        // Audit log
        await createAuditLog({
            action: 'ADMIN_REJECTED_PASSWORD_RESET',
            userid: adminId,
            targetUserId: request.userid,
            details: { requestId },
            ipAddress: null
        });

        return {
            success: true,
            message: 'Password reset request rejected.'
        };
    }
}

module.exports = new AdminUserService();
