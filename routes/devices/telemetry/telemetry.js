// routes/telemetry.js
const express = require('express');
const router = express.Router();
const registerNewDevice = require('../../../model/devices/registerDevice');
const EnvTelemetry = require('../../../model/telemetry/envModel');
const { mapTelemetryData } = require('../../../utils/telemetryMapper');
const SensorModel = require('../../../model/devices/deviceModels');
const { cacheTelemetryToRedis } = require('../../../utils/redisTelemetry');
const { client: redisClient } = require('../../../config/redis/redis');
const modelRegistry = require('../../../utils/modelRegistry');
const {calculateAQI} = require('../../../utils/aqiFunction')
/**
 * @swagger
 * /api/telemetry/{model}:
 *   post:
 *     tags:
 *       - Telemetry
 *     summary: Submit short-keyed telemetry data for a specific device model
 *     description: Accepts telemetry data using short keys. Uses the device ID ("i") to verify the registered device and stores only mapped datapoints.
 *     parameters:
 *       - name: model
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The model type of the device (e.g., env, gas, terra).
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
 *                 description: Device ID
 *                 example: "device-id-123"
 *               t:
 *                 type: number
 *                 description: Temperature
 *                 example: 26.4
 *               h:
 *                 type: number
 *                 description: Humidity
 *                 example: 60.1
 *               p:
 *                 type: number
 *                 description: Pressure
 *                 example: 1013.2
 *               p1:
 *                 type: number
 *                 description: PM1
 *                 example: 4.2
 *               p2:
 *                 type: number
 *                 description: PM2.5
 *                 example: 18.7
 *               p10:
 *                 type: number
 *                 description: PM10
 *                 example: 30.3
 *               l:
 *                 type: number
 *                 description: Light (lux)
 *                 example: 430
 *               u:
 *                 type: number
 *                 description: UV index
 *                 example: 1.9
 *               s:
 *                 type: number
 *                 description: Sound level
 *                 example: 60
 *               d:
 *                 type: number
 *                 description: Epoch timestamp
 *                 example: 1721666400
 *               e:
 *                 type: string
 *                 description: Error code
 *                 example: "0000"
 *               b:
 *                 type: number
 *                 description: Battery level
 *                 example: 85
 *     responses:
 *       201:
 *         description: Telemetry stored successfully
 *       400:
 *         description: Missing or invalid device ID
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */

router.post('/:model', async (req, res) => {
  const model = req.params.model.toLowerCase();
  const { i: devid } = req.body;

  if (!devid) return res.status(400).json({ message: 'Missing device ID (i)' });

  try {
    // ✅ Check if sensor model exists
    const modelExists = await SensorModel.findOne({ model });
    if (!modelExists) {
      return res.status(404).json({ message: `Model '${model}' not found` });
    }

    // ✅ Check if device is registered
    const device = await registerNewDevice.findOne({ devid });
    if (!device) return res.status(404).json({ message: 'Device not found' });
        
    // ✅ Map the telemetry
    const mappedTelemetry = mapTelemetryData(model, req.body, device.datapoints);
    if (!mappedTelemetry.date) {
      return res.status(400).json({ message: 'Missing timestamp field (d)' });
    }

    const aqi = calculateAQI(mappedTelemetry.pm2_5);
    mappedTelemetry.aqi = aqi
    mappedTelemetry.auid = device.auid;
    console.log(mappedTelemetry)
    // ✅ Cache telemetry + metadata to Redis
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
 *     summary: Get telemetry and metadata for a device owned by a user
 *     description: Fetches telemetry entries and device metadata from Redis. Validates that the user has access to the device.
 *     parameters:
 *       - name: userid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID requesting telemetry
 *       - name: auid
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique AUID of the device
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 50
 *         description: Limit the number of telemetry entries returned (max 50)
 *     responses:
 *       200:
 *         description: Telemetry and metadata retrieved successfully
 *       403:
 *         description: Unauthorized access
 *       404:
 *         description: Device not found or no telemetry
 *       500:
 *         description: Server error
 */

router.get('/:userid/device/:auid', async (req, res) => {
  const { userid, auid } = req.params;
  let limit = parseInt(req.query.limit, 10);

  if (isNaN(limit) || limit <= 0) limit = 50;
  if (limit > 50) limit = 50;

  try {
    // ✅ Check ownership or access
    const device = await registerNewDevice.findOne({ auid });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    const isOwner = device.userid === userid;
    const isCollaborator = device.collaborators?.some(c => c.userid === userid);

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'Unauthorized access to device' });
    }

    // ✅ Fetch telemetry and metadata
    const entries = await redisClient.hGetAll(auid);
    if (!entries || Object.keys(entries).length === 0) {
      return res.status(404).json({ message: 'No telemetry found for this device' });
    }

    const metadata = entries.metadata ? JSON.parse(entries.metadata) : null;

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
      metadata,
      count: telemetryData.length,
      telemetry: telemetryData
    });
  } catch (err) {
    console.error(`Redis fetch error for ${auid}:`, err);
    return res.status(500).json({ message: 'Server error' });
  }
});


/**
 * @swagger
 * /api/telemetry/public/telemetry:
 *   get:
 *     tags:
 *       - Telemetry
 *     summary: Get telemetry with metadata for public devices
 *     description: Retrieves cached telemetry data (capped per device) with metadata for devices marked public.
 *     parameters:
 *       - name: model
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter devices by model (e.g., "env", "gas-solo")
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *         description: Max telemetry points per device (default 50)
 *     responses:
 *       200:
 *         description: Telemetry and metadata fetched for public devices
 *       500:
 *         description: Server error
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

          // Collect telemetry fields (skip admin fields)
          const entries = [];
          for (const [field, value] of Object.entries(all)) {
            if (field === 'metadata' || field === 'flushed') continue;

            // Treat hash field name as a timestamp if possible
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

          // Sort newest → oldest and take top N
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
      data: filtered,
    });
  } catch (err) {
    console.error('❌ Error getting public telemetry:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// const GasTelemetry = require('../../../model/telemetry/gasModel'); // future
// const TerraTelemetry = require('../../../model/telemetry/terraModel'); // future

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}:
 *   get:
 *     summary: Fetch telemetry data for a device
 *     description: >
 *       Retrieve telemetry data from the database for a given device `auid` and telemetry `model`.
 *       Currently only the **env** model is supported.
 *     tags:
 *       - Telemetry
 *     parameters:
 *       - in: path
 *         name: model
 *         schema:
 *           type: string
 *           enum: [env]
 *         required: true
 *         description: Telemetry model (e.g. "env").
 *       - in: path
 *         name: auid
 *         schema:
 *           type: string
 *         required: true
 *         description: Device AUID (unique identifier).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 2
 *           maximum: 200
 *         description: Maximum number of records to return.
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: Optional start date/time (ISO string or epoch).
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: Optional end date/time (ISO string or epoch).
 *     responses:
 *       200:
 *         description: Telemetry data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model:
 *                   type: string
 *                 auid:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 telemetry:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: No telemetry data found for the given device or model.
 *       500:
 *         description: Server error.
 */
router.get('/db/:model/:auid', async (req, res) => {
  const model = String(req.params.model || '').toLowerCase();
  const auid  = String(req.params.auid || '').trim();

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 10;
  if (limit > 200) limit = 200;

  try {
    // pick the mongoose model
    let dataNew = null;
    if (model === 'env') {
      dataNew = EnvTelemetry;
    } else {
      return res.status(404).json({
        message: `Unknown telemetry model '${model}'`,
        valid: ['env']
      });
    }

    // build query
    const query = { auid };
    const { start, end } = req.query;
    if (start || end) {
      query.transport_time = {};
      if (start) query.transport_time.$gte = new Date(start);
      if (end)   query.transport_time.$lte = new Date(end);
    }

    // fetch
    const telemetryData = await dataNew
      .find(query)
      //.sort({ transport_time: -1 })
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
});

/**
 * @swagger
 * /api/telemetry/db/{model}/{auid}/csv:
 *   get:
 *     tags:
 *       - Telemetry
 *     summary: Download telemetry as CSV by AUID (descending order)
 *     description: >
 *       Streams telemetry rows for the given device AUID as CSV, sorted by `transport_time` **descending** (newest → oldest).
 *       Includes `transport_time`, `telem_time`, and all sensor fields.
 *       Optionally filter by a date range using `start` and/or `end` (applies to `transport_time`).
 *     parameters:
 *       - name: model
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [env]
 *         description: Telemetry model (currently only "env").
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
 *         description: Start of time range (inclusive). ISO 8601 or epoch milliseconds.
 *       - name: end
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of time range (inclusive). ISO 8601 or epoch milliseconds.
 *     responses:
 *       200:
 *         description: CSV stream (newest → oldest)
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *             examples:
 *               sample:
 *                 summary: Example CSV content
 *                 value: |
 *                   auid,transport_time,telem_time,temperature,humidity,pressure,altitude,pm1,pm2_5,pm10,pm1s,pm2_5s,pm10s,lux,uv,sound,aqi,battery,error
 *                   GH-XXXX,2025-09-23T18:00:00.000Z,2025-09-23T18:00:00.000Z,28.7,65.9,1009.43,0,0,0,0,0,0,0,15.67,38,0,0,27.5,00001
 *       404:
 *         description: Unknown model.
 *       500:
 *         description: Server error.
 */

router.get('/db/:model/:auid/csv', async (req, res) => {
  const model = String(req.params.model || '').toLowerCase();
  const auid  = String(req.params.auid || '').trim();

  try {
    if (model !== 'env') {
      return res.status(404).json({ message: `Unknown telemetry model '${model}'`, valid: ['env'] });
    }

    const columns = [
      'auid','transport_time','telem_time','temperature','humidity','pressure','altitude',
      'pm1','pm2_5','pm10','pm1s','pm2_5s','pm10s','lux','uv','sound','aqi','battery','error'
    ];

    const safeAuid = auid.replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${model}_${safeAuid}.csv"`);

    const escapeCsv = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    // write header
    res.write(columns.join(',') + '\n');

    // Build query with optional start/end
    const query = { auid };
    const { start, end } = req.query;
    if (start || end) {
      query.transport_time = {};
      if (start) query.transport_time.$gte = new Date(isNaN(start) ? start : Number(start));
      if (end)   query.transport_time.$lte = new Date(isNaN(end) ? end : Number(end));
    }

    // DESCENDING sort
    const cursor = EnvTelemetry.find(query)
      .sort({ transport_time: -1 }) // ✅ newest → oldest
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
      if (!res.headersSent) res.status(500).json({ message: 'Server error streaming CSV' });
      else res.end();
    });

    req.on('close', () => {
      if (cursor && typeof cursor.close === 'function') cursor.close().catch(() => {});
    });

  } catch (err) {
    console.error('❌ CSV route error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
