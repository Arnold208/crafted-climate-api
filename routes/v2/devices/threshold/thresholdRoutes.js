const express = require('express');
const router = express.Router();

const Threshold = require('../../../model/threshold/threshold');
const Device = require('../../../model/devices/registerDevice');
const sensorMetadata = require('../../../utils/sensorMetadata');


/**
 * @swagger
 * /api/devices/{auid}/metadata:
 *   get:
 *     tags:
 *       - Thresholds
 *     summary: Get sensor datapoint metadata for a device
 *     description: >
 *       Returns all supported sensor datapoints and their min/max ranges  
 *       based on the device’s **base model** (ENV, AQUA, GAS, TERRA).  
 *       Automatically normalizes device model names (e.g., "gas-solo" → "GAS").
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique device AUID
 *     responses:
 *       200:
 *         description: Metadata returned successfully
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.get('/devices/:auid/metadata', async (req, res) => {
  try {
    const { auid } = req.params;

    const device = await Device.findOne({ auid });
    if (!device) return res.status(404).json({ message: "Device not found" });

    const baseModel = device.model.split('-')[0].toUpperCase();
    const metadata = sensorMetadata[baseModel];

    if (!metadata) {
      return res.status(400).json({ message: `No metadata found for model ${device.model}` });
    }

    res.status(200).json({
      auid,
      model: baseModel,
      datapoints: metadata
    });

  } catch (err) {
    console.error("Error fetching device metadata:", err);
    res.status(500).json({ message: err.message });
  }
});



/**
 * @swagger
 * /api/devices/{auid}/thresholds:
 *   get:
 *     tags:
 *       - Thresholds
 *     summary: Get all threshold rules for a device
 *     description: Retrieves all thresholds that have been created for a device.
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of thresholds
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.get('/devices/:auid/thresholds', async (req, res) => {
  try {
    const { auid } = req.params;

    const thresholds = await Threshold.find({ deviceAuid: auid });

    res.status(200).json(thresholds);

  } catch (err) {
    console.error("Error fetching thresholds:", err);
    res.status(500).json({ message: err.message });
  }
});



/**
 * @swagger
 * /api/devices/{auid}/thresholds:
 *   post:
 *     tags:
 *       - Thresholds
 *     summary: Create a new threshold rule
 *     description: >
 *       Creates a threshold rule for a specific datapoint on a device.  
 *       Validates operator, min/max, model type, and allowed sensor ranges.
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [datapoint, operator]
 *             properties:
 *               datapoint:
 *                 type: string
 *                 example: "pm2_5"
 *               operator:
 *                 type: string
 *                 enum: [">", "<", ">=", "<=", "between", "outside"]
 *               min:
 *                 type: number
 *                 example: 30
 *               max:
 *                 type: number
 *                 example: 150
 *               cooldownMinutes:
 *                 type: number
 *                 example: 10
 *               alertChannels:
 *                 type: object
 *                 properties:
 *                   email: { type: boolean, example: true }
 *                   sms: { type: boolean, example: false }
 *                   push: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Threshold successfully created
 *       400:
 *         description: Invalid values or datapoint
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.post('/devices/:auid/thresholds', async (req, res) => {
  try {
    const { auid } = req.params;
    let { datapoint, operator, min, max, alertChannels, cooldownMinutes } = req.body;

    const device = await Device.findOne({ auid });
    if (!device) return res.status(404).json({ message: "Device not found" });

    const baseModel = device.model.split('-')[0].toUpperCase();
    const metadata = sensorMetadata[baseModel];
    if (!metadata) return res.status(400).json({ message: `No metadata available for ${device.model}` });

    // Validate datapoint exists on device
    if (!device.datapoints.includes(datapoint)) {
      return res.status(400).json({
        message: `Device does not support datapoint "${datapoint}". Supported: ${device.datapoints.join(', ')}`
      });
    }

    // Validate datapoint in metadata
    const allowed = metadata[datapoint];
    if (!allowed) {
      return res.status(400).json({
        message: `Datapoint "${datapoint}" is not defined in metadata for model ${baseModel}`
      });
    }

    // ========== Operator Rules ==========
    switch (operator) {
      case '>':
      case '>=':
        if (min === undefined) return res.status(400).json({ message: "min is required" });
        if (min < allowed.min || min > allowed.max) {
          return res.status(400).json({ message: `min must be ${allowed.min}-${allowed.max}` });
        }
        max = null; // auto clean
        break;

      case '<':
      case '<=':
        if (max === undefined) return res.status(400).json({ message: "max is required" });
        if (max < allowed.min || max > allowed.max) {
          return res.status(400).json({ message: `max must be ${allowed.min}-${allowed.max}` });
        }
        min = null; // auto clean
        break;

      case 'between':
      case 'outside':
        if (min === undefined || max === undefined) {
          return res.status(400).json({ message: "Both min and max required" });
        }
        if (min >= max) {
          return res.status(400).json({ message: "min must be less than max" });
        }
        if (min < allowed.min || max > allowed.max) {
          return res.status(400).json({ message: `Range must be ${allowed.min}-${allowed.max}` });
        }
        break;

      default:
        return res.status(400).json({ message: "Invalid operator" });
    }

    const newThreshold = await Threshold.create({
      deviceAuid: auid,
      datapoint,
      operator,
      min,
      max,
      cooldownMinutes,
      alertChannels
    });

    res.status(200).json({
      message: "Threshold created successfully",
      threshold: newThreshold
    });

  } catch (err) {
    console.error("Error creating threshold:", err);
    res.status(500).json({ message: err.message });
  }
});



/**
 * @swagger
 * /api/thresholds/{id}:
 *   put:
 *     tags:
 *       - Thresholds
 *     summary: Update an existing threshold rule
 *     description: Updates a threshold rule and automatically cleans invalid min/max combinations based on operator.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Threshold updated
 *       404:
 *         description: Not found
 *       500:
 *         description: Server error
 */
router.put('/thresholds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let updates = req.body;

    const threshold = await Threshold.findById(id);
    if (!threshold) return res.status(404).json({ message: "Threshold not found" });

    const device = await Device.findOne({ auid: threshold.deviceAuid });
    const baseModel = device.model.split('-')[0].toUpperCase();
    const metadata = sensorMetadata[baseModel];
    const allowed = metadata[updates.datapoint || threshold.datapoint];

    let operator = updates.operator || threshold.operator;
    let min = updates.min ?? threshold.min;
    let max = updates.max ?? threshold.max;

    // Reapply operator rules (same as POST)
    switch (operator) {
      case '>':
      case '>=':
        if (min === undefined) return res.status(400).json({ message: "min required" });
        if (min < allowed.min || min > allowed.max)
          return res.status(400).json({ message: `min must be ${allowed.min}-${allowed.max}` });
        max = null;
        break;

      case '<':
      case '<=':
        if (max === undefined) return res.status(400).json({ message: "max required" });
        if (max < allowed.min || max > allowed.max)
          return res.status(400).json({ message: `max must be ${allowed.min}-${allowed.max}` });
        min = null;
        break;

      case 'between':
      case 'outside':
        if (min === undefined || max === undefined)
          return res.status(400).json({ message: "min and max required" });
        if (min >= max)
          return res.status(400).json({ message: "min must be less than max" });
        break;

      default:
        return res.status(400).json({ message: "Invalid operator" });
    }

    threshold.datapoint = updates.datapoint ?? threshold.datapoint;
    threshold.operator = operator;
    threshold.min = min;
    threshold.max = max;
    threshold.cooldownMinutes = updates.cooldownMinutes ?? threshold.cooldownMinutes;
    threshold.alertChannels = updates.alertChannels ?? threshold.alertChannels;

    await threshold.save();

    res.status(200).json({
      message: "Threshold updated successfully",
      threshold
    });

  } catch (err) {
    console.error("Error updating threshold:", err);
    res.status(500).json({ message: err.message });
  }
});



/**
 * @swagger
 * /api/thresholds/{id}:
 *   delete:
 *     tags:
 *       - Thresholds
 *     summary: Delete a threshold rule
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 *       500:
 *         description: Server error
 */
router.delete('/thresholds/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const removed = await Threshold.findByIdAndDelete(id);
    if (!removed) return res.status(404).json({ message: "Threshold not found" });

    res.status(200).json({ message: "Threshold deleted successfully" });

  } catch (err) {
    console.error("Error deleting threshold:", err);
    res.status(500).json({ message: err.message });
  }
});



/**
 * @swagger
 * /api/devices/{auid}/threshold-parameters:
 *   get:
 *     tags:
 *       - Thresholds
 *     summary: Get valid datapoints and threshold ranges for device
 *     description: >
 *       Returns only datapoints that:  
 *       • The device supports  
 *       • AND exist in metadata  
 *       Ensures only valid datapoints are configurable.
 *     parameters:
 *       - in: path
 *         name: auid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Valid threshold datapoints returned
 *       404:
 *         description: Device not found
 *       500:
 *         description: Server error
 */
router.get('/devices/:auid/threshold-parameters', async (req, res) => {
  try {
    const { auid } = req.params;

    const device = await Device.findOne({ auid });
    if (!device) return res.status(404).json({ message: "Device not found" });

    const baseModel = device.model.split('-')[0].toUpperCase();
    const metadata = sensorMetadata[baseModel];

    if (!metadata)
      return res.status(400).json({ message: `No metadata found for ${device.model}` });

    const labelMap = {
      temperature: "Temperature",
      humidity: "Humidity",
      pm1: "PM1",
      pm2_5: "PM2.5",
      pm10: "PM10",
      pressure: "Pressure",
      altitude: "Altitude",
      lux: "Light Intensity",
      uv: "UV Index",
      sound: "Sound Level",
      aqi: "Air Quality Index",
      battery: "Battery Level",
      eco2_ppm: "eCO₂",
      tvoc_ppb: "TVOC",
      current: "Current",
      voltage: "Voltage",
      ph: "pH Level",
      ec: "Electrical Conductivity",
      turbidity: "Turbidity",
      waterTemp: "Water Temperature",
      moisture: "Soil Moisture",
      npk_n: "Nitrogen (N)",
      npk_p: "Phosphorus (P)",
      npk_k: "Potassium (K)",
      soilTemp: "Soil Temperature"
    };

    const supported = device.datapoints.filter(dp => metadata[dp]);

    const thresholdOptions = supported.map(dp => ({
      datapoint: dp,
      label: labelMap[dp] || dp,
      min: metadata[dp].min,
      max: metadata[dp].max,
      operators: [">", "<", ">=", "<=", "between", "outside"]
    }));

    res.status(200).json({
      auid,
      model: baseModel,
      allowedDatapoints: supported,
      thresholdOptions
    });

  } catch (err) {
    console.error("Error fetching threshold parameters:", err);
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
