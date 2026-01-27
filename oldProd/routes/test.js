const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /api/test:
 *   get:
 *     summary: Simple test endpoint
 *     responses:
 *       200:
 *         description: Returns a success message
 */
router.get('/test', (req, res) => {
  res.json({ message: 'Hello from test route' });
});

module.exports = router;
