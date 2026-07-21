'use strict';
const { v4: uuidv4 } = require('uuid');

/**
 * Build a canonical MRV envelope from a telemetry event.
 * This is called BEFORE any operational normalization so the raw
 * event is preserved exactly as received from the transport layer.
 *
 * @param {object} params
 * @param {object} params.rawEvent        - The raw body from MQTT / HTTP ingest
 * @param {string|null} params.devid      - Device hardware ID (null if unknown)
 * @param {string|null} params.auid       - Device logical ID (null if unresolved)
 * @param {string|null} params.model      - Device model code (null if unknown)
 * @param {string}      params.transport  - 'notehub-mqtt' | 'socketio' | 'http-ingest' | 'manual'
 * @param {string|null} params.sourceTopic        - MQTT topic or null
 * @param {string|null} params.sourceEventId      - Notecard event UUID or null
 * @param {string|null} params.observedAt         - ISO timestamp when data was observed
 * @param {number|null} params.sequenceNumber     - Device sequence number or null
 * @param {string|null} params.firmwareVersion    - Device firmware version or null
 * @param {string|null} params.organizationId     - Org ID or null
 * @param {string[]}    params.projectIds         - MRV project IDs (empty if unresolved)
 * @returns {object} Canonical envelope ready for the mrv-evidence queue
 */
function normalizeTransport(transport) {
  const value = String(transport || '').toLowerCase();
  if (value === 'hub' || value === 'notehub' || value === 'mqtt') return 'notehub-mqtt';
  if (value === 'socket' || value === 'socket.io') return 'socketio';
  if (value === 'http' || value === 'ingest') return 'http-ingest';
  if (['notehub-mqtt', 'socketio', 'http-ingest', 'manual'].includes(value)) return value;
  return 'notehub-mqtt';
}

function buildCanonicalEnvelope({
  rawEvent, devid, auid, model,
  transport, sourceTopic, sourceEventId,
  observedAt, sequenceNumber, firmwareVersion,
  organizationId, projectIds
}) {
  const ingestionId = uuidv4();
  const receivedAt = new Date().toISOString();
  const normalizedTransport = normalizeTransport(transport);

  // Determine clock quality heuristics
  let timeSource = 'server-received';
  let clockQuality = 'unverified';
  if (observedAt) {
    timeSource = normalizedTransport === 'notehub-mqtt' ? 'notehub' : 'device';
    clockQuality = normalizedTransport === 'notehub-mqtt' ? 'synchronised' : 'device-reported';
  }

  return {
    ingestionId,
    receivedAt,
    schemaVersion: '1.0.0',
    devid: devid || null,
    auid: auid || null,
    model: model || null,
    transport: normalizedTransport,
    sourceTopic: sourceTopic || null,
    sourceEventId: sourceEventId || null,
    observedAt: observedAt || null,
    timeSource,
    clockQuality,
    sequenceNumber: sequenceNumber || null,
    firmwareVersion: firmwareVersion || null,
    organizationId: organizationId || null,
    projectIds: projectIds || [],
    // Preserve the raw event payload without modification
    body: rawEvent || {}
  };
}

module.exports = { buildCanonicalEnvelope };
