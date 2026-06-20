const { Worker } = require('bullmq');
const { client: redis } = require('../config/redis/redis');
const RegisterDevice = require('../models/devices/registerDevice');
const User = require('../models/user/userModel');
const NotificationPreference = require('../models/notification/NotificationPreference');
const Organization = require('../models/organization/organizationModel');
const Deployment = require('../models/deployment/deploymentModel');
const { sendSMS } = require('../config/sms/sms');
const emailTemplateService = require('../services/emailTemplate.service');
const logger = require('../utils/logger');
const eventLog = require('../modules/devices/eventLog/eventLog.service');

const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    keepAlive: 30000,
    maxRetriesPerRequest: null,
};

function formatDuration(minutes) {
    if (minutes < 60) {
        return `${Math.round(minutes)} minutes`;
    }
    const hours = minutes / 60;
    if (hours === 1) {
        return `1 hour`;
    }
    return `${parseFloat(hours.toFixed(1))} hours`;
}

function getStageConfig(stage, device, lastSeen, extras = {}) {
    const timeStr = new Date(lastSeen).toLocaleString();
    const nickname = device.nickname || device.devid;
    const location = device.metadata?.location || device.location || 'Unknown';
    const appUrl   = process.env.APP_URL || 'https://app.craftedclimate.com';

    let sms = '';
    let templateSlug = '';

    const variables = {
        nickname,
        devid:               device.devid,
        lastSeen:            timeStr,
        location:            typeof location === 'string' ? location : JSON.stringify(location),
        minutesOffline:      extras.minutesOffline || '',
        durationFormatted:   extras.minutesOffline ? formatDuration(extras.minutesOffline) : '',
        consecutivePartials: extras.consecutivePartials || 0,
        batchHealth:         extras.consecutivePartials > 0 ? `⚠️ ${extras.consecutivePartials} partial batch(es) detected before going offline` : 'No batch issues detected',
        deviceModel:         device.devmod || device.model || 'Unknown',
        orgName:             device.organizationName || '',
        dashboardUrl:        `${appUrl}/devices/${device.auid}`,
        supportUrl:          `${appUrl}/support`,
    };

    switch (stage.level) {
        case 1:
            sms = `CraftedClimate Alert: ${nickname} has been offline since ${timeStr}. Please check power and connectivity.`;
            templateSlug = 'device-offline-warning';
            break;
        case 2:
            sms = `Urgent: ${nickname} has been offline for over ${formatDuration(stage.minMinutes)}. Please inspect the device immediately to prevent data loss.`;
            templateSlug = 'device-offline-critical';
            break;
        case 3:
            sms = `Severe: ${nickname} has been offline for over ${formatDuration(stage.minMinutes)}. Immediate action required to restore data flow.`;
            templateSlug = 'device-offline-severe';
            break;
        default:
            return null;
    }

    return { sms, templateSlug, variables };
}

async function sendStageAlert(device, recipients, smsRecipients, stage, lastSeen, extras = {}) {
    const config = getStageConfig(stage, device, lastSeen, extras);
    if (!config) return;

    logger.info(`📢 Sending [${stage.tag}] Alert for ${device.devid} to ${recipients.length} emails, ${smsRecipients.length} SMS`);

    // 1. Send Emails
    await Promise.allSettled(recipients.map(email =>
        emailTemplateService.sendFromTemplate(config.templateSlug, email, config.variables)
            .catch(e => logger.error(`❌ Email Template failed for ${email}:`, e.message))
    ));

    // 2. Send SMS
    await Promise.allSettled(smsRecipients.map(contact =>
        sendSMS(contact, config.sms)
            .catch(e => logger.error(`❌ SMS failed for ${contact}:`, e.message))
    ));
}

class AlertWorker {
    constructor() {
        this.worker = null;
    }

    async start() {
        if (this.worker) {
            console.log('[AlertWorker] Already running');
            return;
        }

        console.log('[AlertWorker] Starting...');

        this.worker = new Worker('device-alerts', async (job) => {
            await this.processJob(job);
        }, {
            connection,
            concurrency: 5, // Process up to 5 offline alerts concurrently
        });

        this.worker.on('completed', (job) => {
            console.log(`[AlertWorker] Job ${job.id} completed`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`[AlertWorker] Job ${job.id} failed:`, err.message);
        });

        console.log('[AlertWorker] Started successfully');
    }

    async processJob(job) {
        const { auid, lastSeen, targetStage, now, consecutivePartials = 0, minutesOffline = 0 } = job.data;

        try {
            const device = await RegisterDevice.findOne({ auid });
            if (!device) {
                logger.warn(`[AlertWorker] Device ${auid} not found in database.`);
                return;
            }

            const emails = new Set();
            const phones = new Set();

            const addUserIfAllowed = async (userId, userEmail, userContact) => {
                if (!userId) return;
                const prefs = await NotificationPreference.findOne({ userid: userId });

                if (prefs) {
                    const isMuted = prefs.mutedDevices && (prefs.mutedDevices.includes(device.auid) || prefs.mutedDevices.includes(device.devid));
                    if (isMuted) {
                        logger.debug(`[AlertWorker] User ${userId} muted device ${device.auid}. Skipping.`);
                        return;
                    }

                    const emailEnabled = prefs.preferences?.email?.enabled !== false;
                    const pushEnabled = prefs.preferences?.push?.enabled !== false; // Map push to SMS/Contact

                    if (emailEnabled && userEmail) emails.add(userEmail);
                    if (pushEnabled && userContact) phones.add(userContact);
                } else {
                    if (userEmail) emails.add(userEmail);
                    if (userContact) phones.add(userContact);
                }
            };

            // 1. Owner
            const owner = await User.findOne({ userid: device.userid });
            if (owner) {
                await addUserIfAllowed(owner.userid, owner.email, owner.contact);
            }

            // 2. Custom Recipients
            if (device.notificationPreferences?.recipients?.length > 0) {
                device.notificationPreferences.recipients.forEach(e => emails.add(e));
            }

            // 3. Device Collaborators
            if (device.collaborators?.length > 0) {
                for (const c of device.collaborators) {
                    if (['device-admin', 'device-support', 'device-user', 'admin', 'support', 'user', 'editor'].includes(c.role)) {
                        const u = await User.findOne({ userid: c.userid });
                        if (u) {
                            await addUserIfAllowed(u.userid, u.email, u.contact);
                        }
                    }
                }
            }

            // 4. Organization Collaborators
            const orgId = device.organizationId || device.organization;
            if (orgId) {
                const org = await Organization.findOne({ organizationId: orgId });
                if (org && org.collaborators?.length > 0) {
                    for (const c of org.collaborators) {
                        if (['org-admin', 'org-support', 'org-user', 'admin', 'support', 'user', 'editor'].includes(c.role)) {
                            const u = await User.findOne({ userid: c.userid });
                            if (u) {
                                await addUserIfAllowed(u.userid, u.email, u.contact);
                            }
                        }
                    }
                }
            }

            // 5. Deployment Collaborators
            const depId = device.deploymentId || device.deployment;
            if (depId) {
                const dep = await Deployment.findOne({ deploymentid: depId });
                if (dep && dep.collaborators?.length > 0) {
                    for (const c of dep.collaborators) {
                        if (['deployment-admin', 'deployment-support', 'deployment-user', 'admin', 'support', 'user', 'editor'].includes(c.role)) {
                            const u = await User.findOne({ userid: c.userid });
                            if (u) {
                                await addUserIfAllowed(u.userid, u.email, u.contact);
                            }
                        }
                    }
                }
            }

            // E. Send Alert
            if (emails.size > 0 || phones.size > 0) {
                await sendStageAlert(device, Array.from(emails), Array.from(phones), targetStage, lastSeen, {
                    minutesOffline,
                    consecutivePartials,
                });

                // 📋 EVENT LOG — alert dispatched
                eventLog.alertFired({
                    auid,
                    devid:          device.devid,
                    userId:         device.userid || device.userId,
                    orgId:          device.organizationId,
                    alertLevel:     targetStage.level,
                    alertTag:       targetStage.tag,
                    recipientCount: emails.size + phones.size,
                    emailCount:     emails.size,
                    smsCount:       phones.size,
                }).catch(() => {});
            }

            // F. Update Context in Redis
            const contextKey = `device:${auid}:alert_context`;
            await redis.hSet(contextKey, {
                level: targetStage.level,
                lastAlertAt: now,
                lastStageTag: targetStage.tag
            });
            await redis.expire(contextKey, 48 * 3600);

            // Keep the last alert time for anti-spam flapping check
            await redis.set(`device:${auid}:last_alert_time`, now.toString(), { EX: 24 * 3600 });

            // G. Update Dashboard Status to 'offline' in Redis
            try {
                const metaStr = await redis.hGet(auid, 'metadata');
                if (metaStr) {
                    const meta = JSON.parse(metaStr);
                    if (meta.status !== 'offline') {
                        meta.status = 'offline';
                        await redis.hSet(auid, 'metadata', JSON.stringify(meta));
                        
                        // 📣 Publish real-time status change event
                        await redis.publish('device:status-change', JSON.stringify({ auid, status: 'offline' }));
                    }
                }
            } catch (e) { /* ignore */ }

        } catch (error) {
            logger.error(`[AlertWorker] Error processing alert for device ${auid}:`, error);
            throw error;
        }
    }

    async stop() {
        if (this.worker) {
            await this.worker.close();
            this.worker = null;
        }
        console.log('[AlertWorker] Stopped');
    }
}

module.exports = new AlertWorker();
