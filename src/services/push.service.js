const { messaging } = require('../config/firebase');
const { pushQueue }  = require('../config/queue/bullMQ/pushQueue');
const FcmToken       = require('../models/fcmToken/FcmToken');
const User           = require('../models/user/userModel');
const { nanoid }     = require('nanoid');
const { BlobServiceClient } = require('@azure/storage-blob');

// FCM batch limit per sendEach call
const FCM_BATCH_LIMIT = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map our notification type to the correct FCM Android channel ID.
 * These channel IDs must match what is registered in the Flutter app.
 */
function channelIdForType(type) {
    switch ((type || '').toLowerCase()) {
        case 'alert':      return 'alerts_channel';
        case 'promotion':  return 'promotions_channel';
        default:           return 'general_channel';
    }
}

/**
 * Build a single FCM message object for the HTTP v1 API.
 *
 * @param {string}  token      FCM registration token
 * @param {string}  title
 * @param {string}  body
 * @param {string}  type       'general' | 'promotion' | 'alert'
 * @param {string}  [imageUrl] Permanent public Azure Blob URL
 * @param {object}  [data]     Extra key-value pairs (all values must be strings)
 */
function buildMessage(token, title, body, type, imageUrl, data = {}) {
    const channelId  = channelIdForType(type);
    const isHighPrio = type === 'alert';

    const message = {
        token,
        notification: {
            title,
            body,
            ...(imageUrl ? { imageUrl } : {}),
        },
        data: {
            type:   type || 'general',
            title,
            body,
            ...(imageUrl ? { imageUrl } : {}),
            ...Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
            ),
        },
        android: {
            priority: isHighPrio ? 'high' : 'normal',
            notification: {
                channelId,
                ...(imageUrl ? { imageUrl } : {}),
                sound: isHighPrio ? 'default' : undefined,
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: isHighPrio ? 'default' : undefined,
                    badge: 1,
                },
            },
            ...(imageUrl ? {
                fcmOptions: { imageUrl },
            } : {}),
        },
    };

    return message;
}

/**
 * Chunk an array into sub-arrays of `size`.
 */
function chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Image Upload — Azure Blob (permanent public URL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a notification image to Azure Blob Storage and return
 * a permanent, non-expiring public URL.
 *
 * The container must have public access level = "Blob" (set once in Azure portal
 * or via the Azure CLI: az storage container set-permission --public-access blob).
 *
 * @param {Buffer} fileBuffer
 * @param {string} originalName  original filename (for extension)
 * @param {string} mimeType      e.g. 'image/jpeg'
 * @returns {Promise<string>}    permanent public URL
 */
async function uploadNotificationImage(fileBuffer, originalName, mimeType) {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set');

    const CONTAINER = process.env.AZURE_NOTIFICATION_IMAGES_CONTAINER || 'notification-images';

    const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    const containerClient   = blobServiceClient.getContainerClient(CONTAINER);

    // Create container with public blob access if it doesn't exist
    await containerClient.createIfNotExists({ access: 'blob' });

    // Unique blob name: notifications/<uuid>.<ext>
    const ext      = (originalName.split('.').pop() || 'jpg').toLowerCase();
    const blobName = `notifications/${nanoid(16)}.${ext}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(fileBuffer, {
        blobHTTPHeaders: { blobContentType: mimeType },
    });

    // Permanent public URL — no SAS token, no expiry
    return blockBlobClient.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register or refresh a user's FCM token.
 * Upsert on token value: updates lastActiveAt and marks valid if previously invalid.
 */
async function registerToken(userid, token, platform = 'android', deviceId = null) {
    await FcmToken.findOneAndUpdate(
        { token },
        {
            userid,
            token,
            platform,
            deviceId,
            lastActiveAt: new Date(),
            invalid: false,
        },
        { upsert: true, new: true }
    );

    // Subscribe new token to the all-users FCM topic
    try {
        await messaging().subscribeToTopic([token], 'all-users');
    } catch (e) {
        console.warn('[PushService] Topic subscribe skipped:', e.message);
    }
}

/**
 * Invalidate a token on logout.
 * We mark invalid rather than delete so the TTL index cleans it up naturally,
 * and we avoid re-sending to a token that just logged out.
 */
async function invalidateToken(userid, token) {
    await FcmToken.findOneAndUpdate(
        { userid, token },
        { invalid: true }
    );
    try {
        await messaging().unsubscribeFromTopic([token], 'all-users');
    } catch (_) {}
}

/**
 * Remove all tokens for a user (e.g. account deletion).
 */
async function removeAllTokens(userid) {
    const docs = await FcmToken.find({ userid }).lean();
    const tokens = docs.map(d => d.token);
    if (tokens.length) {
        try {
            await messaging().unsubscribeFromTopic(tokens, 'all-users');
        } catch (_) {}
    }
    await FcmToken.deleteMany({ userid });
}

/**
 * Get all valid tokens for a single user.
 */
async function getTokensForUser(userid) {
    return FcmToken.find({ userid, invalid: false }).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sending — Direct (single user, instant, no queue)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a user has push notifications enabled.
 * Checks the simple User.notificationSettings.pushAlerts flag.
 * Returns true (allow) if the field is not explicitly set to false.
 */
async function _userHasPushEnabled(userid) {
    const user = await User
        .findOne({ userid })
        .select('notificationSettings')
        .lean();
    // Default to true if preference is not set
    return user?.notificationSettings?.pushAlerts !== false;
}

/**
 * Filter a list of userIds down to only those with push enabled.
 * One DB query using $in — efficient for batch sends.
 */
async function _filterPushEnabledUsers(userIds) {
    const users = await User
        .find({
            userid: { $in: userIds },
            'notificationSettings.pushAlerts': { $ne: false }, // not explicitly false
        })
        .select('userid')
        .lean();
    return users.map(u => u.userid);
}

/**
 * Send a push notification directly to ONE user.
 * Bypasses the queue — suitable for real-time alerts (AQI threshold, device offline).
 * Respects the user's push notification preference.
 *
 * @returns {{ sent: number, failed: number, invalidated: number, skipped?: string }}
 */
async function sendToUser(userid, { title, body, type = 'general', imageUrl, data }) {
    // Preference gate — respect user's push setting
    const pushEnabled = await _userHasPushEnabled(userid);
    if (!pushEnabled) {
        console.log(`[PushService] Push disabled for user ${userid} — skipped`);
        return { sent: 0, failed: 0, invalidated: 0, skipped: 'push_disabled' };
    }

    const tokenDocs = await getTokensForUser(userid);
    if (!tokenDocs.length) return { sent: 0, failed: 0, invalidated: 0 };

    const messages = tokenDocs.map(t => buildMessage(t.token, title, body, type, imageUrl, data));
    return _sendBatch(messages);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sending — Queued (group / mass, goes through BullMQ)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queue a notification to a list of userIds.
 * The worker resolves tokens for each user and sends in FCM batches of 500.
 *
 * @param {string[]} userIds
 * @param {object}   payload  { title, body, type, imageUrl, data }
 * @returns {Promise<{ jobCount: number }>}
 */
async function queueToUsers(userIds, payload) {
    const jobId = nanoid(10);

    // For small groups (<= 10 users) put into one job; larger groups chunk by user count
    const userChunks = chunk(userIds, 100);

    const jobs = userChunks.map((chunk, i) => ({
        name: 'send_batch_users',
        data: {
            jobId: `${jobId}-${i}`,
            userIds: chunk,
            payload,
        },
    }));

    await pushQueue.addBulk(jobs);
    return { jobCount: jobs.length };
}

/**
 * Queue a broadcast to ALL users via FCM topic.
 * FCM handles delivery fanout — far more efficient than iterating every token.
 *
 * @param {object} payload  { title, body, type, imageUrl, data }
 * @returns {Promise<{ jobCount: 1 }>}
 */
async function queueToAll(payload) {
    await pushQueue.add('send_topic', {
        topic: 'all-users',
        payload,
    });
    return { jobCount: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal — FCM sendEach wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a pre-built list of FCM messages (max 500) via sendEach.
 * Automatically marks failed tokens invalid in the DB.
 *
 * @param {object[]} messages  FCM message objects
 * @returns {{ sent: number, failed: number, invalidated: number }}
 */
async function _sendBatch(messages) {
    if (!messages.length) return { sent: 0, failed: 0, invalidated: 0 };

    let sent = 0, failed = 0, invalidated = 0;

    for (const batch of chunk(messages, FCM_BATCH_LIMIT)) {
        const response = await messaging().sendEach(batch);

        for (let i = 0; i < response.responses.length; i++) {
            const r = response.responses[i];
            if (r.success) {
                sent++;
            } else {
                failed++;
                const errCode = r.error?.code || '';
                // Dead token — mark invalid so it's never sent to again
                if (
                    errCode === 'messaging/registration-token-not-registered' ||
                    errCode === 'messaging/invalid-registration-token'
                ) {
                    const token = batch[i].token;
                    await FcmToken.findOneAndUpdate({ token }, { invalid: true });
                    invalidated++;
                    console.warn(`[PushService] Dead token invalidated: ${token.slice(0, 20)}...`);
                } else {
                    console.error(`[PushService] FCM error: ${errCode} — ${r.error?.message}`);
                }
            }
        }
    }

    return { sent, failed, invalidated };
}

/**
 * Send to an FCM topic (used by the worker for mass sends).
 */
async function _sendToTopic(topic, { title, body, type = 'general', imageUrl, data = {} }) {
    const channelId = channelIdForType(type);

    const message = {
        topic,
        notification: {
            title,
            body,
            ...(imageUrl ? { imageUrl } : {}),
        },
        data: {
            type,
            title,
            body,
            ...(imageUrl ? { imageUrl } : {}),
            ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        },
        android: {
            priority: type === 'alert' ? 'high' : 'normal',
            notification: {
                channelId,
                ...(imageUrl ? { imageUrl } : {}),
            },
        },
    };

    const res = await messaging().send(message);
    console.log(`[PushService] Topic "${topic}" sent: ${res}`);
    return { sent: 1, failed: 0, invalidated: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker-callable processor (used by pushWorker.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a queued push job.
 * Called by the BullMQ worker — NOT called directly by controllers.
 */
async function processQueueJob(job) {
    const { name, data } = job;

    switch (name) {
        case 'send_batch_users': {
            const { userIds, payload } = data;

            // Filter out users who have disabled push notifications
            const enabledUserIds = await _filterPushEnabledUsers(userIds);
            if (!enabledUserIds.length) {
                console.log(`[PushWorker] All ${userIds.length} users have push disabled — skipped`);
                return { sent: 0, failed: 0, invalidated: 0, skipped: userIds.length };
            }
            if (enabledUserIds.length < userIds.length) {
                console.log(`[PushWorker] ${userIds.length - enabledUserIds.length} users skipped (push disabled)`);
            }

            // Resolve all tokens for push-enabled users in one DB call
            const tokenDocs = await FcmToken.find({
                userid: { $in: enabledUserIds },
                invalid: false,
            }).lean();

            if (!tokenDocs.length) {
                console.log(`[PushWorker] No valid tokens for ${userIds.length} users`);
                return { sent: 0, failed: 0, invalidated: 0 };
            }

            const messages = tokenDocs.map(t =>
                buildMessage(t.token, payload.title, payload.body, payload.type, payload.imageUrl, payload.data)
            );

            const result = await _sendBatch(messages);
            console.log(`[PushWorker] Batch job ${data.jobId}: sent=${result.sent} failed=${result.failed}`);
            return result;
        }

        case 'send_topic': {
            const { topic, payload } = data;
            return _sendToTopic(topic, payload);
        }

        default:
            console.warn(`[PushWorker] Unknown job name: ${name}`);
            return {};
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Resolution Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a single email OR userId to a userId string.
 * Tries userId first (fast path), then looks up by email.
 * Returns null if not found.
 */
async function resolveToUserId(emailOrId) {
    if (!emailOrId) return null;

    // Heuristic: if it looks like an email, query by email; otherwise treat as userid
    const isEmail = emailOrId.includes('@');

    const user = await User
        .findOne(isEmail ? { email: emailOrId.toLowerCase().trim() } : { userid: emailOrId })
        .select('userid email')
        .lean();

    if (!user) {
        console.warn(`[PushService] User not found for: ${emailOrId}`);
        return null;
    }
    return user.userid;
}

/**
 * Resolve an array of emails to an array of userIds.
 * One DB query using $in — efficient regardless of array size.
 * Returns { userIds, notFound } so callers can log missing addresses.
 */
async function resolveEmailsToUserIds(emails) {
    if (!emails || !emails.length) return { userIds: [], notFound: [] };

    const normalised = emails.map(e => e.toLowerCase().trim());

    const users = await User
        .find({ email: { $in: normalised } })
        .select('userid email')
        .lean();

    const foundEmails = new Set(users.map(u => u.email.toLowerCase()));
    const notFound    = normalised.filter(e => !foundEmails.has(e));

    if (notFound.length) {
        console.warn(`[PushService] ${notFound.length} email(s) not found:`, notFound);
    }

    return { userIds: users.map(u => u.userid), notFound };
}

/**
 * Send to a single user identified by email OR userId.
 * Direct (no queue) — for real-time alerts.
 */
async function sendToEmail(emailOrId, payload) {
    const userid = await resolveToUserId(emailOrId);
    if (!userid) return { sent: 0, failed: 0, invalidated: 0, error: 'User not found' };
    return sendToUser(userid, payload);
}

/**
 * Queue a notification to a group of users identified by email addresses.
 * Resolves all emails → userIds in ONE DB query, then queues batch jobs.
 *
 * @param {string[]} emails
 * @param {object}   payload  { title, body, type, imageUrl, data }
 * @returns {Promise<{ jobCount: number, notFound: string[] }>}
 */
async function queueToEmails(emails, payload) {
    const { userIds, notFound } = await resolveEmailsToUserIds(emails);
    if (!userIds.length) return { jobCount: 0, notFound };
    const result = await queueToUsers(userIds, payload);
    return { ...result, notFound };
}

module.exports = {
    // Token management
    registerToken,
    invalidateToken,
    removeAllTokens,
    getTokensForUser,

    // Sending — by userId
    sendToUser,       // direct, instant — single user by userid
    queueToUsers,     // queued   — array of userIds
    queueToAll,       // queued via FCM topic — all users

    // Sending — by email (resolved to userId internally)
    sendToEmail,      // direct, instant — single user by email or userid
    queueToEmails,    // queued   — array of email addresses

    // Resolution utilities
    resolveToUserId,
    resolveEmailsToUserIds,

    // Image upload
    uploadNotificationImage,

    // Worker processor
    processQueueJob,
};
