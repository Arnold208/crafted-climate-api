const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const Invitation = require('../../models/invitation/invitationModel');
const Organization = require('../../models/organization/organizationModel');
const User = require('../../models/user/userModel');
const Plan = require('../../models/subscriptions/Plan');
const UserSubscription = require('../../models/subscriptions/UserSubscription');
const emailService = require('./organizationEmail.service');
const OrganizationService = require('./organization.service');

class InvitationController {
    /**
     * Invite a member to the organization
     */
    async inviteMember(req, res) {
        try {
            const { orgId } = req.params;
            const { email, accessLevel } = req.body;
            const userid = req.user.userid;

            if (!email || !accessLevel) {
                return res.status(400).json({ message: 'Email and access level are required' });
            }

            const validRoles = ['org-admin', 'org-support', 'org-user', 'viewer', 'editor', 'admin', 'support', 'user'];
            if (!validRoles.includes(accessLevel)) {
                return res.status(400).json({ message: 'Invalid access level role' });
            }

            const org = await Organization.findOne({ organizationId: orgId, deletedAt: null });
            if (!org) {
                return res.status(404).json({ message: 'Organization not found' });
            }

            // Check if requester is org-admin
            const requester = org.collaborators.find(c => c.userid === userid);
            if (!requester || requester.role !== 'org-admin') {
                return res.status(403).json({ message: 'Only organization admins can invite members' });
            }

            // Check if invitee is already a member
            const invitee = await User.findOne({ email });
            if (invitee) {
                const alreadyMember = org.collaborators.some(c => c.userid === invitee.userid);
                if (alreadyMember) {
                    return res.status(400).json({ message: 'User is already a member of this organization' });
                }
            }

            // Check subscription limits (maxMembers)
            const subscription = await UserSubscription.findOne({ organizationId: orgId, status: 'active' });
            if (subscription) {
                const plan = await Plan.findOne({ planId: subscription.planId });
                if (plan && plan.features && plan.features.maxMembers != null) {
                    const activeMembersCount = org.collaborators.length;
                    const pendingInvitesCount = await Invitation.countDocuments({
                        organizationId: orgId,
                        accepted: false,
                        expiresAt: { $gt: new Date() }
                    });
                    if (activeMembersCount + pendingInvitesCount >= plan.features.maxMembers) {
                        return res.status(403).json({
                            message: `Upgrade required: Your plan allows max ${plan.features.maxMembers} members (including pending invitations).`
                        });
                    }
                }
            }

            // Generate token and IDs
            const token = crypto.randomBytes(32).toString('hex');
            const invitationId = `inv-${uuidv4()}`;
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 48); // 48h expiration

            const isNewUser = !invitee;

            // Remove any old pending invitations for this email to avoid duplicates
            await Invitation.deleteMany({ email, organizationId: orgId, accepted: false });

            const invitation = new Invitation({
                invitationId,
                token,
                email,
                organizationId: orgId,
                accessLevel,
                needsSignUp: isNewUser,
                expiresAt
            });

            await invitation.save();

            // Setup URLs
            const acceptUrl = `${process.env.APP_URL || 'https://console.craftedclimate.co'}/accept-invite?token=${token}`;
            const signupUrl = `${process.env.APP_URL || 'https://console.craftedclimate.co'}/signup?invitationId=${invitationId}&token=${token}`;

            // Send email
            await emailService.sendInvitation(email, org.name, acceptUrl, signupUrl, isNewUser);

            return res.status(201).json({
                message: 'Invitation sent successfully',
                invitation: {
                    invitationId,
                    email,
                    accessLevel,
                    expiresAt,
                    needsSignUp: isNewUser
                }
            });

        } catch (error) {
            console.error('[InvitationController] Invite Error:', error);
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * Accept invitation
     */
    async acceptInvitation(req, res) {
        try {
            const { token } = req.params;
            const user = req.user;

            const invitation = await Invitation.findOne({
                token,
                accepted: false,
                expiresAt: { $gt: new Date() }
            });

            if (!invitation) {
                return res.status(400).json({ message: 'Invalid or expired invitation token' });
            }

            if (user.email !== invitation.email) {
                return res.status(403).json({ message: 'This invitation was sent to a different email address.' });
            }

            const org = await Organization.findOne({ organizationId: invitation.organizationId, deletedAt: null });
            if (!org) {
                return res.status(404).json({ message: 'Organization not found or deleted' });
            }

            // Check if already in the organization
            const alreadyMember = org.collaborators.some(c => c.userid === user.userid);
            if (!alreadyMember) {
                org.collaborators.push({
                    userid: user.userid,
                    role: invitation.accessLevel || 'org-user',
                    joinedAt: new Date(),
                    permissions: []
                });
                await org.save();

                await User.updateOne(
                    { userid: user.userid },
                    { $addToSet: { organization: org.organizationId } }
                );
            }

            invitation.accepted = true;
            await invitation.save();

            // Invalidate cache
            await OrganizationService.invalidateOrgCache(org.organizationId);

            return res.status(200).json({
                message: 'Invitation accepted successfully',
                organizationId: org.organizationId,
                role: invitation.accessLevel
            });

        } catch (error) {
            console.error('[InvitationController] Accept Error:', error);
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * Decline invitation
     */
    async declineInvitation(req, res) {
        try {
            const { token } = req.params;
            const user = req.user;

            const invitation = await Invitation.findOne({
                token,
                accepted: false
            });

            if (!invitation) {
                return res.status(404).json({ message: 'Invitation not found' });
            }

            if (user.email !== invitation.email) {
                return res.status(403).json({ message: 'Unauthorized' });
            }

            // Delete or mark as declined (we delete to clean up)
            await Invitation.deleteOne({ token });

            return res.status(200).json({ message: 'Invitation declined successfully' });

        } catch (error) {
            console.error('[InvitationController] Decline Error:', error);
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * Get pending invitations for currently logged in user
     */
    async getMyInvitations(req, res) {
        try {
            const user = req.user;
            const invitations = await Invitation.find({
                email: user.email,
                accepted: false,
                expiresAt: { $gt: new Date() }
            });

            // Populate organization names
            const populated = [];
            for (const inv of invitations) {
                const org = await Organization.findOne({ organizationId: inv.organizationId, deletedAt: null });
                if (org) {
                    populated.push({
                        invitationId: inv.invitationId,
                        token: inv.token,
                        email: inv.email,
                        organizationId: inv.organizationId,
                        organizationName: org.name,
                        accessLevel: inv.accessLevel,
                        expiresAt: inv.expiresAt
                    });
                }
            }

            return res.status(200).json({ success: true, data: populated });

        } catch (error) {
            console.error('[InvitationController] GetMyInvitations Error:', error);
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new InvitationController();
