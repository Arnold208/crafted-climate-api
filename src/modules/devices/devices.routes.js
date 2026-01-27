const express = require('express');
const router = express.Router();

const manufacturerRoutes = require('./manufacturer/manufacturer.routes');
const sensorModelRoutes = require('./sensorModel/sensorModel.routes');
const registryRoutes = require('./registry/registry.routes');
const otaRoutes = require('./ota/ota.routes');
const deploymentRoutes = require('./deployment/deployment.routes');
const notecardRoutes = require('./notecard/notecard.routes');

// Mount sub-modules
// Manufacturer is mounted at /manufacturer to avoid root conflicts if any, and maintain clear namespace
router.use('/manufacturer', manufacturerRoutes);

// The following modules define their own paths relative to /api/devices (e.g., /models, /upload-firmware)
// So we mount them at root of this router.
router.use('/', sensorModelRoutes);
router.use('/', registryRoutes);
router.use('/', otaRoutes);
router.use('/', deploymentRoutes);

router.use('/', notecardRoutes);

module.exports = router;
