const express = require('express');
const router = express.Router();
const publicController = require('./public.controller');
const verifyWebsiteApiKey = require('../../middleware/websiteApiKeyMiddleware');

/**
 * @swagger
 * /api/public/contact:
 *   post:
 *     summary: Submit a website contact form
 *     tags: [Public Website]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Enquiry sent successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Missing API key
 *       403:
 *         description: Invalid API key
 */
router.post('/contact', verifyWebsiteApiKey, publicController.submitContactForm);

/**
 * @swagger
 * /api/public/pilot:
 *   post:
 *     summary: Submit a website pilot request form
 *     tags: [Public Website]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orgName
 *               - yourName
 *               - email
 *               - productOfInterest
 *               - location
 *               - numLocations
 *               - envConcern
 *               - intendedUse
 *               - timeline
 *             properties:
 *               orgName:
 *                 type: string
 *               yourName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               orgType:
 *                 type: string
 *               productOfInterest:
 *                 type: string
 *               location:
 *                 type: string
 *               numLocations:
 *                 type: string
 *               envConcern:
 *                 type: string
 *               currentApproach:
 *                 type: string
 *               intendedUse:
 *                 type: string
 *               timeline:
 *                 type: string
 *               howHeard:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pilot request submitted successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Missing API key
 *       403:
 *         description: Invalid API key
 */
router.post('/pilot', verifyWebsiteApiKey, publicController.submitPilotForm);

module.exports = router;
