const express = require('express');
const router = express.Router();
const paystackWebhookController = require('./paystackWebhook.controller');

/**
 * @swagger
 * /api/subscriptions/paystack/webhook:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Paystack Webhook Handler (Public)
 *     description: Receives transaction status notifications from Paystack. Signature verification enforced.
 *     responses:
 *       200: { description: Acknowledged }
 */
router.post('/webhook', paystackWebhookController.handleWebhook);

module.exports = router;
