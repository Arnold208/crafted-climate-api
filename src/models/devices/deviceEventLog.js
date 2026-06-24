/**
 * DeviceEventLog — Persistent timeline of everything that happens to a device.
 *
 * Records: connectivity transitions (ONLINE/OFFLINE/DEGRADED),
 * batch health (BATCH_CONFIRMED/BATCH_MISMATCH), config changes,
 * alert firings, and state changes.
 *
 * Queryable by: auid, userId, orgId, eventType, severity, date range.
 */
'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    logId: {
        type:     String,
        required: true,
        unique:   true,
        index:    true,
    },
    // ── Device identity ──────────────────────────────────────────────────────
    auid: {
        type:     String,
        required: true,
        index:    true,
    },
    devid: {
        type:  String,
        index: true,
    },
    // ── Ownership context (for efficient multi-device queries) ────────────────
    userId: {
        type:  String,
        index: true,
    },
    orgId: {
        type:  String,
        index: true,
    },
    // ── Event classification ─────────────────────────────────────────────────
    eventType: {
        type: String,
        enum: [
            'ONLINE',            // device came back online
            'OFFLINE',           // device went offline
            'DEGRADED',          // partial batches detected — not fully offline yet
            'BATCH_CONFIRMED',   // server confirmed full batch receipt (received === expected)
            'BATCH_MISMATCH',    // server received fewer readings than configured batch size
            'CONFIG_CHANGED',    // frequency, batch, netMode, or notification prefs updated
            'ALERT_FIRED',       // alert email/SMS sent to recipients
            'STATE_CHANGED',     // device.state changed (active/inactive/disabled)
            'REGISTRATION',      // device was first registered
            'DEPLOYMENT_CHANGE', // device added to / removed from a deployment
        ],
        required: true,
        index:    true,
    },
    severity: {
        type:    String,
        enum:    ['INFO', 'WARNING', 'ERROR'],
        default: 'INFO',
        index:   true,
    },
    // ── Human-readable message ────────────────────────────────────────────────
    message: {
        type:     String,
        required: true,
    },
    // ── Structured event payload (varies by eventType) ────────────────────────
    // BATCH_MISMATCH / BATCH_CONFIRMED:
    //   { batchSeq, received, expected, readingIdxs[] }
    // ALERT_FIRED:
    //   { alertLevel, alertTag, recipientCount, emailCount, smsCount }
    // CONFIG_CHANGED:
    //   { before: { frequency, batch }, after: { frequency, batch } }
    // OFFLINE / ONLINE:
    //   { minutesOffline, lastSeen }
    // DEGRADED:
    //   { consecutivePartials, batchSeq }
    metadata: {
        type:    mongoose.Schema.Types.Mixed,
        default: {},
    },

    createdAt: {
        type:    Date,
        default: Date.now,
        // NOTE: do NOT add index:true here — the TTL schema.index below
        // already declares { createdAt: 1 }. A second index would trigger
        // a Mongoose duplicate index warning.
    },
}, { versionKey: false });

// ── Compound indexes for common query patterns ────────────────────────────────
schema.index({ auid: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ orgId: 1, createdAt: -1 });
schema.index({ auid: 1, eventType: 1, createdAt: -1 });
schema.index({ orgId: 1, eventType: 1, createdAt: -1 });

// TTL: auto-delete log entries older than 90 days to prevent unbounded growth
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('DeviceEventLog', schema, 'deviceEventLogs');
