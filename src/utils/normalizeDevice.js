/**
 * normalizeDevice.js
 *
 * A single, canonical normaliser for device documents before they leave the
 * backend and reach ANY client (mobile, web, future integrations).
 *
 * Guarantees the following stable API contract:
 *
 *   ownerUserId      — always a non-empty string (falls back to 'userid')
 *   datapoints       — always an Array of strings  (["ec","humidity",...])
 *   isConfigured     — always a boolean at top-level (reads nested setup obj if needed)
 *   requiresConfiguration — always a boolean at top-level
 *   wifiConfigured   — always a boolean at top-level
 *   shared           — always a boolean (defaults false)
 *   read_interval_minutes — always a number
 *
 * This function is IDEMPOTENT: calling it multiple times on the same object is safe.
 */

/**
 * @param {object} doc — Plain JS object (result of doc.toObject() or doc.toJSON()).
 *                       Do NOT pass a raw Mongoose document; call .toObject() first.
 * @returns {object} Normalised plain object safe to send to any client.
 */
function normalizeDevice(doc) {
    if (!doc || typeof doc !== 'object') return doc;

    // Work on a shallow clone so we never mutate the original.
    const d = { ...doc };

    // ── 1. ownerUserId ────────────────────────────────────────────────────────
    // Legacy documents use 'userid'; newer ones use 'ownerUserId'.
    // Always expose BOTH as 'ownerUserId' (canonical) and keep 'userid' for compat.
    if (!d.ownerUserId && d.userid) {
        d.ownerUserId = d.userid;
    }
    if (!d.userid && d.ownerUserId) {
        d.userid = d.ownerUserId;  // keep legacy field in sync for RBAC middleware
    }

    // ── 2. datapoints — normalise to Array<string> ───────────────────────────
    // MongoDB stores datapoints either as:
    //   (a) Array of strings  → ["ec", "humidity", "temperature_water"]
    //   (b) Map / Object      → { "eco2_ppm": 450, "temperature": 25.1 }
    //   (c) null / undefined
    // Canonical form: ALWAYS return as Array<string> of datapoint names.
    // Clients that need the map form can build it themselves.
    const raw = d.datapoints;
    if (!raw) {
        d.datapoints = [];
    } else if (Array.isArray(raw)) {
        // Already the canonical form; ensure all items are strings.
        d.datapoints = raw.map(String);
    } else if (typeof raw === 'object') {
        // Convert map keys → array of names. Ignore telemetry values.
        d.datapoints = Object.keys(raw);
    } else {
        d.datapoints = [];
    }

    // ── 3. setup flags — flatten nested 'setup' sub-object ───────────────────
    // Backend stores: { setup: { is_configured, requires_configuration, wifi_configured } }
    // Clients should NOT have to drill into sub-objects for these booleans.
    const setup = (d.setup && typeof d.setup === 'object') ? d.setup : null;

    if (typeof d.isConfigured !== 'boolean') {
        d.isConfigured = setup?.is_configured ?? true;
    }
    if (typeof d.requiresConfiguration !== 'boolean') {
        d.requiresConfiguration = setup?.requires_configuration ?? false;
    }
    if (typeof d.wifiConfigured !== 'boolean') {
        d.wifiConfigured = setup?.wifi_configured ?? false;
    }

    // ── 4. shared flag — always present ──────────────────────────────────────
    if (typeof d.shared !== 'boolean') {
        d.shared = false;
    }

    // ── 5. read_interval_minutes — computed, always a number ─────────────────
    if (typeof d.read_interval_minutes !== 'number') {
        const freq  = typeof d.frequency === 'number' ? d.frequency : 10;
        const batch = typeof d.batch     === 'number' ? d.batch     : 2;
        d.read_interval_minutes = parseFloat((freq / batch).toFixed(2));
    }

    // ── 6. _id alias ─────────────────────────────────────────────────────────
    // Some clients prefer 'id' over '_id'. Expose both.
    if (d._id && !d.id) {
        d.id = d._id.toString();
    }

    return d;
}

module.exports = { normalizeDevice };
