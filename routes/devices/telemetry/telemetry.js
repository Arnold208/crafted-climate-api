// routes/api/devices/telemetry.js
const express = require('express');
const router = express.Router();

const registerNewDevice = require('../../../model/devices/registerDevice');
const EnvTelemetry = require('../../../model/telemetry/envModel');
const AquaTelemetry = require('../../../model/telemetry/aquaModel');
const GasSoloTelemetry = require('../../../model/telemetry/gasSoloModel');

const Deployment = require('../../../model/deployment/deploymentModel');
const Organization = require('../../../model/organization/organizationModel');
const OrgMember = require('../../../model/organization/OrgMember');

const SensorModel = require('../../../model/devices/deviceModels');

const { mapTelemetryData } = require('../../../utils/telemetryMapper');
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { client: redisClient } = require('../../../config/redis/redis');
const { calculateAQI } = require('../../../utils/aqiFunction');

const { dbRouteLimiter, csvRouteLimiter } = require('../../../middleware/user/rateLimiter');
const enforceTelemetryIngestion = require('../../../middleware/subscriptions/enforceTelemetryIngestion');
const enforceTelemetryFeature = require('../../../middleware/subscriptions/enforceTelemetryFeature');
const authenticateToken = require('../../../middleware/user/bearermiddleware');

const MODEL_MAP = {
  env: EnvTelemetry,
  aqua: AquaTelemetry,
  'gas-solo': GasSoloTelemetry
};

const CSV_COLUMNS = {
  env: [
    'auid','transport_time','telem_time','temperature','humidity','pressure','altitude',
    'pm1','pm2_5','pm10','pm1s','pm2_5s','pm10s','lux','uv','sound','aqi','battery','error'
  ],
  aqua: [
    'auid','transport_time','telem_time','ec','humidity','temperature_water','temperature_ambient',
    'pressure','ph','lux','turbidity','voltage','current','aqi','battery','error'
  ],
  gasSolo: [
    'auid','transport_time','telem_time','temperature','humidity','pressure',
    'aqi','current','eco2_ppm','tvoc_ppb','voltage','battery','error'
  ]
};

/**
 * Small helper to decide if the authenticated user
 * can READ or EXPORT based on:
 *  - Device owner
 *  - Org owner/admin
 *  - Org member permissions
 *  - Deployment collaborator
 *  - Public device (for READ only, not export)
 */
async function evaluateDeviceAccess({
  device,
  authedUserid,
  requireAdminForExport = false
}) {
  // Public device: for *read* access, allow anyone.
  // NOTE: For EXPORT we still restrict by org/owner.
  const isPublicDevice = device.availability === 'public';

  // If no auth user and device is not public → no access at all.
  if (!authedUserid && !isPublicDevice) {
    return { allowed: false, reason: 'Unauthenticated and device not public' };
  }

  // Device owner always has READ access (C1).
  const isOwner = authedUserid && device.userid === authedUserid;

  // If this is a personal device with no orgid:
  const hasOrg = !!device.orgid;

  let org = null;
  let orgMember = null;
  let isOrgOwnerOrAdmin = false;
  let hasDeviceReadPermission = false;

  if (hasOrg && authedUserid) {
    org = await Organization.findOne({ orgid: device.orgid }).lean();
    orgMember = await OrgMember.findOne({ orgid: device.orgid, userid: authedUserid }).lean();

    if (org && org.ownerUserid === authedUserid) {
      isOrgOwnerOrAdmin = true;
    }

    if (orgMember) {
      if (['owner', 'admin'].includes(orgMember.role)) {
        isOrgOwnerOrAdmin = true;
      }
      if (
        Array.isArray(orgMember.permissions) &&
        (
          orgMember.permissions.includes('device_read') ||
          orgMember.permissions.includes('manage_devices')
        )
      ) {
        hasDeviceReadPermission = true;
      }
    }
  }

  // Deployment collaborator? (any role)
  let isDeploymentCollaborator = false;
  if (authedUserid) {
    const deployments = await Deployment.find({ devices: device.auid }).lean();
    isDeploymentCollaborator = deployments.some(dep =>
      Array.isArray(dep.collaborators) &&
      dep.collaborators.some(c => c.userid === authedUserid)
    );
  }

  // EXPORT requires admin-only per B1:
  // - If device has org → org owner/admin
  // - If personal device → owner
  if (requireAdminForExport) {
    if (hasOrg) {
      if (isOrgOwnerOrAdmin) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Export allowed only for org owner/admin' };
    } else {
      if (isOwner) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Export allowed only for device owner' };
    }
  }

  // READ access:
  // - Public device → allow (A1)
  // - Device owner → allow
  // - Org owner/admin → allow
  // - Org member with device_read/manage_devices → allow
  // - Deployment collaborator → allow
  if (
    isPublicDevice ||
    isOwner ||
    isOrgOwnerOrAdmin ||
    hasDeviceReadPermission ||
    isDeploymentCollaborator
  ) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Not owner, not org admin, no permissions, not collaborator' };
}

/**
 * Build a lightweight metadata object from a device document.
 */
function buildDeviceMetadata(device) {
  if (!device) return null;
  return {
    auid: device.auid,
    devid: device.devid,
    model: device.model,
    type: device.type,
    nickname: device.nickname,
    orgid: device.orgid || null,
    deploymentid: device.deploymentid || null,
    location: device.location || null,
    availability: device.availability || 'private',
    battery: device.battery ?? null
  };
}

/**
 * @swagger
 * tags:
 *   name: Telemetry
 *   description: Telemetry ingestion, querying, and export
 */

/**
 * @swagger
 * /api/telemetry/{model}:
 *   post:
 *     tags:
 *       - Telemetry
 *     summary: Submit short-keyed telemetry data for a specific device model
 *     description: >
 *       **Device-side ingestion endpoint**.  
 *       Accepts telemetry data using short keys and a device ID `i` (devid).  
 *       Validates that the device is registered and that ingestion is allowed by the current subscription.
 *     parameters:
 *       - name: model
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Device model key (e.g., `env`, `aqua`, `gas-solo`).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - i
 *             properties:
 *               i:
 *                 type: string
 *                 description: Device ID (`devid`)
 *                 example: "device-id-123"
 *               t:
 *                 type: number
 *                 description: Temperature
 *               h:
 *                 type: number
 *                 description: Humidity
 *               p:
 *                 type: number
 *                 description: Pressure
 *               p1:
 *                 type: number
 *                 description: PM1
 *               p2:
 *                 type: number
 *                 description: PM2.5
 *               p10:
 *                 type: number
 *                 description: PM10
 *               l:
 *                 type: number
 *                 description: Light (lux)
 *               u:
 *                 type: number
 *                 description: UV index
 *               s:
 *                 type: number
 *                 description: Sound level
 *               d:
 *                 type: number
 *                 description: Epoch timestamp (seconds or ms)
 *               e:
 *                 type: string
 *                 description: Error code
 *               b:
 *                 type: number
 *                 description: Battery level (%)
 *     responses:
 *       201:
 *         description: Telemetry cached successfully for async processing.
 *       400:
 *         description: Missing or invalid device ID.
 *       404:
 *         description: Device or model not found.
 *       429:
 *         description: Ingestion rate limit or subscription limit exceeded.
 *       500:
 *         description: Internal server error.
 */
router.post('/:model', enforceTelemetryIngestion, async (req, res) => {
  const model = req.params.model.toLowerCase();
  const { i: devid } = req.body;

  if (!devid) return res.status(400).json({ message: 'Missing device ID (i)' });

  try {
    // Check if sensor model exists
    const modelExists = await SensorModel.findOne({ model });
    if (!modelExists) {
      return res.status(404).json({ message: `Model '${model}' not found` });
    }

    // Check if device is registered
    const device = await registerNewDevice.findOne({ devid });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    // Map the telemetry
    const mappedTelemetry = mapTelemetryData(model, req.body, device.datapoints);
    if (!mappedTelemetry.date) {
      return res.status(400).json({ message: 'Missing timestamp field (d)' });
    }

    const aqi = calculateAQI(mappedTelemetry.pm2_5);
    mappedTelemetry.aqi = aqi;
    mappedTelemetry.auid = device.auid;

    // Cache telemetry + metadata to Redis
    await cacheTelemetryToRedis(device.auid, mappedTelemetry, device);

    return res.status(201).json({ message: 'Telemetry cached successfully' });
  } catch (err) {
    console.error('Redis cache error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/telemetry/{userid}/device/{auid}:
 *   get:
 *     tags:
 *       - Telemetry
 *     summary: Get latest telemetry for a device
 *     description: >
 *       Returns recent telemetry entries and metadata for a device.  
 *       Access is granted if:
 *       - The caller is the device owner, OR  
 *       - The device belongs to an organization and the caller is an org owner/admin or has `device_read` permission, OR  
 *       - The caller is a collaborator on any deployment that includes this device, OR  
 *       - The device is public (`availability=public`).  
 *       The `{userid}` in the path **must** match the authenticated user's `userid`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The authenticated user ID (must match JWT).
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID.
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 50
 *         description: Maximum number of telemetry points to return (default 50).
 *       - name: orgid
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional org context (informational only; access is resolved from device/org records).
 *     responses:
 *       200:
 *         description: Telemetry and metadata retrieved successfully.
 *       403:
 *         description: Not authorized to view this device's telemetry.
 *       404:
 *         description: Device not found or no telemetry.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/:userid/device/:auid',
  authenticateToken,
  enforceTelemetryFeature({ feature: 'device_read' }),
  async (req, res) => {
    const { userid, auid } = req.params;
    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit <= 0) limit = 50;
    if (limit > 50) limit = 50;

    // Ensure the path user matches JWT
    const authedUserid = req.user?.userid;
    if (!authedUserid || authedUserid !== userid) {
      return res.status(403).json({ message: 'User mismatch: path userid does not match token' });
    }

    try {
      // Fetch device
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found' });

      // Evaluate RBAC / org / collaborator access
      const { allowed, reason } = await evaluateDeviceAccess({
        device,
        authedUserid,
        requireAdminForExport: false
      });

      if (!allowed) {
        return res.status(403).json({ message: 'Unauthorized access to device', detail: reason });
      }

      // Try Redis first
      const entries = await redisClient.hGetAll(auid);

      if (entries && Object.keys(entries).length > 0) {
        const metadataFromRedis = entries.metadata ? JSON.parse(entries.metadata) : null;

        const telemetryData = Object.entries(entries)
          .filter(([key]) => key !== 'metadata' && key !== 'flushed')
          .map(([key, value]) => {
            try {
              const parsed = JSON.parse(value);
              return { timestamp: key, ...parsed };
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
          .slice(0, limit)
          .reverse();

        return res.status(200).json({
          source: 'redis',
          metadata: metadataFromRedis || buildDeviceMetadata(device),
          count: telemetryData.length,
          telemetry: telemetryData
        });
      }

      // Fallback to MongoDB
      console.warn(`ℹ️ No Redis data for ${auid}, falling back to MongoDB...`);

      const modelKey = device.model?.toLowerCase();
      const M = MODEL_MAP[modelKey];
      if (!M) {
        return res.status(404).json({ message: `No telemetry model registered for '${modelKey || 'unknown'}'` });
      }

      const telemetryData = await M.find({ auid })
        .sort({ transport_time: -1 })
        .limit(limit)
        .lean();

      if (!telemetryData.length) {
        return res.status(404).json({ message: 'No telemetry found for this device.' });
      }

      return res.status(200).json({
        source: 'mongo',
        metadata: buildDeviceMetadata(device),
        count: telemetryData.length,
        telemetry: telemetryData.reverse()
      });
    } catch (err) {
      console.error(`❌ Telemetry fetch error for ${auid}:`, err);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @swagger
 * /api/telemetry/public/telemetry:
 *   get:
 *     tags:
 *       - Telemetry
 *     summary: Get telemetry with metadata for public devices (no auth)
 *     description: >
 *       Returns cached telemetry and metadata for devices marked as `availability = public`.  
 *       This endpoint does **not** require authentication (A1).
 *     parameters:
 *       - name: model
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by device model key (e.g., `env`, `gas-solo`, `aqua`).
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 50
 *         description: Max telemetry points per device (default 50).
 *     responses:
 *       200:
 *         description: Telemetry and metadata fetched for public devices.
 *       500:
 *         description: Server error.
 */
router.get('/public/telemetry', async (req, res) => {
  const { model } = req.query;
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || '50', 10), 1),
    1000
  );

  try {
    const query = { availability: 'public' };
    if (model) query.model = model.toLowerCase();

    const devices = await registerNewDevice.find(query, { auid: 1 }).lean();

    const result = await Promise.all(
      devices.map(async ({ auid }) => {
        try {
          const all = await redisClient.hGetAll(auid);
          if (!all || Object.keys(all).length === 0) return null;

          const metadata = all.metadata ? JSON.parse(all.metadata) : null;

          const entries = [];
          for (const [field, value] of Object.entries(all)) {
            if (field === 'metadata' || field === 'flushed') continue;
            const ts = Number(field);
            if (!Number.isFinite(ts)) continue;
            try {
              const parsed = JSON.parse(value);
              entries.push([ts, parsed]);
            } catch {
              // skip bad JSON
            }
          }

          if (entries.length === 0) {
            return { metadata, telemetry: [] };
          }

          entries.sort((a, b) => b[0] - a[0]);
          const telemetry = entries.slice(0, limit).map(([_, v]) => v);

          return { metadata, telemetry };
        } catch (err) {
          console.warn(`⚠️ Error reading Redis for ${auid}:`, err.message);
          return null;
        }
      })
    );

    const filtered = result.filter(Boolean);
    return res.status(200).json({
      count: filtered.length,
      per_device_limit: limit,
      data: filtered
    });
  } catch (err) {
    console.error('❌ Error getting public telemetry:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}:
 *   get:
 *     tags:
 *       - Telemetry
 *     summary: Fetch historical telemetry from DB
 *     description: >
 *       Retrieves historical telemetry stored in MongoDB for the given device and model.  
 *       Access rules are the same as `/api/telemetry/{userid}/device/{auid}`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: model
 *         schema:
 *           type: string
 *           enum: [env, aqua, gas-solo]
 *         required: true
 *         description: Telemetry model key.
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 200
 *         required: false
 *         description: Max number of records to return (default 10, max 200).
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: Optional start of time range (applies to `transport_time`).
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: Optional end of time range (applies to `transport_time`).
 *       - in: query
 *         name: userid
 *         schema:
 *           type: string
 *         required: true
 *         description: Authenticated user ID (must match JWT).
 *     responses:
 *       200:
 *         description: Telemetry data retrieved successfully.
 *       403:
 *         description: Not authorized to view telemetry.
 *       404:
 *         description: No telemetry data found.
 *       500:
 *         description: Server error.
 */
router.get(
  '/db/:model/:auid',
  authenticateToken,
  dbRouteLimiter,
  enforceTelemetryFeature({ feature: 'device_read' }),
  async (req, res) => {
    const model = String(req.params.model || '').toLowerCase();
    const auid = String(req.params.auid || '').trim();
    const requestUserid = String(req.query.userid || '').trim();

    // make sure JWT and query userid match
    const authedUserid = req.user?.userid;
    if (!authedUserid || authedUserid !== requestUserid) {
      return res.status(403).json({ message: 'User mismatch: query userid does not match token' });
    }

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 10;
    if (limit > 200) limit = 200;

    try {
      const M = MODEL_MAP[model];
      if (!M) {
        return res.status(404).json({
          message: `Unknown telemetry model '${model}'`,
          valid: Object.keys(MODEL_MAP)
        });
      }

      // validate device + access
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found' });

      const { allowed, reason } = await evaluateDeviceAccess({
        device,
        authedUserid,
        requireAdminForExport: false
      });
      if (!allowed) {
        return res.status(403).json({ message: 'Unauthorized to view telemetry', detail: reason });
      }

      const query = { auid };
      const { start, end } = req.query;
      if (start || end) {
        query.transport_time = {};
        if (start) query.transport_time.$gte = new Date(isNaN(start) ? start : Number(start));
        if (end) query.transport_time.$lte = new Date(isNaN(end) ? end : Number(end));
      }

      const telemetryData = await M.find(query)
        .sort({ transport_time: -1 })
        .limit(limit)
        .lean();

      if (!telemetryData.length) {
        return res.status(404).json({ message: 'No telemetry data found for this device.' });
      }

      return res.status(200).json({
        model,
        auid,
        count: telemetryData.length,
        telemetry: telemetryData
      });
    } catch (err) {
      console.error('❌ DB telemetry fetch error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}/csv:
 *   get:
 *     tags:
 *       - Telemetry
 *     summary: Download telemetry as CSV (admin/owner only)
 *     description: >
 *       Streams telemetry as CSV for a given device.  
 *       **Export access rules (B1):**  
 *       - If the device belongs to an org → only org **owner/admin** may export.  
 *       - If the device is personal (no org) → only the **device owner** may export.  
 *       Additionally, the caller's subscription must have the `export` feature enabled.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: model
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [env, aqua, gas-solo]
 *         description: Telemetry model key.
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Device AUID.
 *       - name: start
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of time range (inclusive) for `transport_time`.
 *       - name: end
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of time range (inclusive) for `transport_time`.
 *       - name: userid
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Authenticated user ID (must match JWT).
 *     responses:
 *       200:
 *         description: CSV stream (newest → oldest).
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Not authorized to export telemetry.
 *       404:
 *         description: Unknown model or device not found.
 *       429:
 *         description: Export rate limit or quota exceeded.
 *       500:
 *         description: Server error.
 */
router.get(
  '/db/:model/:auid/csv',
  authenticateToken,
  csvRouteLimiter,
  enforceTelemetryFeature({
    feature: 'export',
    quotaKey: 'monthlyExports',
    log: 'monthlyExports'
  }),
  async (req, res) => {
    const model = String(req.params.model || '').toLowerCase();
    const auid = String(req.params.auid || '').trim();
    const requestUserid = String(req.query.userid || '').trim();
    const authedUserid = req.user?.userid;

    if (!authedUserid || authedUserid !== requestUserid) {
      return res.status(403).json({ message: 'User mismatch: query userid does not match token' });
    }

    try {
      const M = MODEL_MAP[model];
      const columns = CSV_COLUMNS[model];
      if (!M || !columns) {
        return res.status(404).json({
          message: `Unknown telemetry model '${model}'`,
          valid: Object.keys(MODEL_MAP)
        });
      }

      // validate device + export access
      const device = await registerNewDevice.findOne({ auid });
      if (!device) return res.status(404).json({ message: 'Device not found' });

      const { allowed, reason } = await evaluateDeviceAccess({
        device,
        authedUserid,
        requireAdminForExport: true // B1
      });

      if (!allowed) {
        return res.status(403).json({ message: 'Not authorized to export telemetry', detail: reason });
      }

      const safeAuid = auid.replace(/[^A-Za-z0-9._-]/g, '_');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${model}_${safeAuid}.csv"`);

      const escapeCsv = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      // header
      res.write(columns.join(',') + '\n');

      const query = { auid };
      const { start, end } = req.query;
      if (start || end) {
        query.transport_time = {};
        if (start) query.transport_time.$gte = new Date(isNaN(start) ? start : Number(start));
        if (end) query.transport_time.$lte = new Date(isNaN(end) ? end : Number(end));
      }

      // newest → oldest
      const cursor = M.find(query)
        .sort({ transport_time: -1 })
        .select(columns.join(' '))
        .lean()
        .cursor();

      cursor.on('data', (doc) => {
        const row = columns.map((key) => {
          const val = doc[key];
          if (val instanceof Date) return escapeCsv(val.toISOString());
          return escapeCsv(val);
        }).join(',');
        if (!res.write(row + '\n')) {
          cursor.pause();
          res.once('drain', () => cursor.resume());
        }
      });

      cursor.on('end', () => res.end());
      cursor.on('error', (err) => {
        console.error('❌ CSV stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Server error streaming CSV' });
        } else {
          res.end();
        }
      });

      req.on('close', () => {
        if (cursor && typeof cursor.close === 'function') {
          cursor.close().catch(() => {});
        }
      });
    } catch (err) {
      console.error('❌ CSV route error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
