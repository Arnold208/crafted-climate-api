const telemetryService = require('../services/telemetryService');
const registerNewDevice = require('../model/devices/registerDevice'); // Needed for direct ownership check in controller if strictly required, but service handles standard checks.

class TelemetryController {

    // POST /api/telemetry/:model
    async ingest(req, res) {
        try {
            const model = req.params.model;
            const { i: deviceId } = req.body;

            if (!deviceId) return res.status(400).json({ message: 'Missing device ID (i)' });

            await telemetryService.ingestTelemetry(model, deviceId, req.body);
            return res.status(201).json({ message: 'Telemetry cached successfully' });

        } catch (error) {
            console.error('[TelemetryController] Ingest Error:', error);
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('mismatch') || error.message.includes('Missing')) return res.status(400).json({ message: error.message });
            return res.status(500).json({ message: 'Server error' });
        }
    }

    // GET /api/telemetry/:userid/device/:auid
    async getDeviceTelemetry(req, res) {
        try {
            const { userid, auid } = req.params;
            let limit = parseInt(req.query.limit, 10);
            if (isNaN(limit) || limit <= 0) limit = 50;
            if (limit > 50) limit = 50;

            const result = await telemetryService.getDeviceTelemetry(userid, auid, limit);
            return res.status(200).json(result);

        } catch (error) {
            // console.error('[TelemetryController] Get Error:', error);
            if (error.message === 'Device not found' || error.message === 'No telemetry found') return res.status(404).json({ message: error.message });
            if (error.message === 'Unauthorized access') return res.status(403).json({ message: error.message });
            return res.status(500).json({ message: 'Server error' });
        }
    }

    // GET /api/telemetry/public/telemetry
    async getPublicTelemetry(req, res) {
        try {
            const { model } = req.query;
            const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 1000);

            const data = await telemetryService.getPublicTelemetry(model, limit);

            return res.status(200).json({
                count: data.length,
                per_device_limit: limit,
                data: data,
            });
        } catch (error) {
            console.error('[TelemetryController] Public Error:', error);
            return res.status(500).json({ message: 'Server error' });
        }
    }

    // GET /api/telemetry/db/:model/:auid
    async getDbTelemetry(req, res) {
        try {
            const model = String(req.params.model || '').toLowerCase();
            const auid = String(req.params.auid || '').trim();
            let limit = parseInt(req.query.limit, 10);
            if (!Number.isFinite(limit) || limit <= 0) limit = 10;
            if (limit > 200) limit = 200;

            const { start, end } = req.query;

            const telemetry = await telemetryService.getDbTelemetry(auid, model, limit, start, end);

            if (!telemetry.length) {
                return res.status(404).json({ message: 'No telemetry data found for this device.' });
            }

            return res.status(200).json({ model, auid, count: telemetry.length, telemetry });

        } catch (error) {
            console.error('[TelemetryController] DB Fetch Error:', error);
            if (error.message.includes('Unknown model')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: 'Server error' });
        }
    }

    // GET /api/telemetry/db/:model/:auid/csv
    async exportCsv(req, res) {
        let cursor = null;
        try {
            const model = String(req.params.model || '').toLowerCase();
            const auid = String(req.params.auid || '').trim();
            const { start, end } = req.query;

            const { cursor: dbCursor, columns } = await telemetryService.getCsvCursor(auid, model, start, end);
            cursor = dbCursor;

            const safeAuid = auid.replace(/[^A-Za-z0-9._-]/g, '_');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${model}_${safeAuid}.csv"`);

            const escapeCsv = (v) => {
                if (v === null || v === undefined) return '';
                const s = String(v);
                return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };

            res.write(columns.join(',') + '\n');

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
                if (cursor && typeof cursor.close === 'function') cursor.close().catch(() => { });
            });

        } catch (error) {
            console.error('[TelemetryController] CSV Error:', error);
            if (cursor && typeof cursor.close === 'function') cursor.close().catch(() => { });
            if (error.message.includes('Unknown model')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: 'Server error' });
        }
    }
}

module.exports = new TelemetryController();
