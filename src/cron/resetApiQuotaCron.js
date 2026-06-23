'use strict';

/**
 * Reset API Quota Cron
 *
 * Runs at 00:01 UTC on the 1st of every month.
 * Resets UserSubscription.usage.apiCallsThisMonth to 0 for all active subscriptions.
 *
 * Without this, orgs on limited plans would permanently hit their quota after the
 * first month — this gives them a fresh quota at the start of every billing cycle.
 */

const cron = require('node-cron');
const UserSubscription = require('../models/subscriptions/UserSubscription');

function startResetApiQuotaCron() {
    // "1 0 1 * *" → at 00:01 UTC on the 1st day of every month
    cron.schedule('1 0 1 * *', async () => {
        const ts = new Date().toISOString();
        console.log(`\n🔄 [ResetApiQuotaCron] ${ts} — Resetting monthly API call counters...`);

        try {
            const result = await UserSubscription.updateMany(
                { status: 'active' },
                { $set: { 'usage.apiCallsThisMonth': 0 } }
            );

            console.log(`✅ [ResetApiQuotaCron] Reset complete — ${result.modifiedCount} subscription(s) cleared.`);
        } catch (err) {
            console.error(`❌ [ResetApiQuotaCron] Failed to reset quotas:`, err.message);
        }
    }, {
        scheduled: true,
        timezone: 'UTC'
    });

    console.log('✅ Monthly API quota reset cron scheduled (1st of month, 00:01 UTC)');
}

module.exports = { startResetApiQuotaCron };
