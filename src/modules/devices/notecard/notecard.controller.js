const notecardService = require('./notecard.service');

class NotecardController {

    // ── DEVICE ENV ────────────────────────────────────────────────────────────

    async updateDeviceEnv(req, res) {
        try {
            const { auid } = req.params;
            const envVars = req.body.envVars || req.body;

            if (!auid) return res.status(400).json({ message: 'auid is required' });
            if (!envVars || typeof envVars !== 'object' || Array.isArray(envVars)) {
                return res.status(400).json({ message: 'envVars must be a key-value object' });
            }

            const result = await notecardService.updateDeviceEnv(auid, req, envVars);
            res.status(200).json(result);
        } catch (err) {
            const status = err.status || (err.message.includes('not found') ? 404 : err.message.includes('Forbidden') ? 403 : 500);
            res.status(status).json({ message: err.message });
        }
    }

    async getDeviceEnv(req, res) {
        try {
            const { auid } = req.params;
            if (!auid) return res.status(400).json({ message: 'auid is required' });

            const result = await notecardService.getDeviceEnv(auid, req);
            res.status(200).json(result);
        } catch (err) {
            const status = err.status || (err.message.includes('not found') ? 404 : err.message.includes('Forbidden') ? 403 : 500);
            res.status(status).json({ message: err.message });
        }
    }

    async deleteDeviceEnv(req, res) {
        try {
            const { auid, key } = req.params;
            if (!auid || !key) return res.status(400).json({ message: 'auid and key are required' });

            const result = await notecardService.deleteDeviceEnv(auid, key, req);
            res.status(200).json({ message: `Env var '${key}' deleted`, ...result });
        } catch (err) {
            const status = err.status || (err.message.includes('not found') ? 404 : err.message.includes('Forbidden') ? 403 : 500);
            res.status(status).json({ message: err.message });
        }
    }

    // ── DEPLOYMENT ENV ────────────────────────────────────────────────────────

    async updateDeploymentEnv(req, res) {
        try {
            const { deploymentId } = req.params;
            const { model } = req.query;
            const envVars = req.body.envVars || req.body;

            if (!deploymentId) return res.status(400).json({ message: 'deploymentId is required' });
            if (!model) return res.status(400).json({ message: 'model query param is required (e.g. ?model=env)' });
            if (!envVars || typeof envVars !== 'object' || Array.isArray(envVars)) {
                return res.status(400).json({ message: 'Request body must be a key-value object of env vars' });
            }

            const result = await notecardService.updateDeploymentEnv(deploymentId, model, envVars, req);
            res.status(200).json(result);
        } catch (err) {
            const status = err.status || (err.message.includes('not found') ? 404 : err.message.includes('organization') ? 403 : 500);
            res.status(status).json({ message: err.message });
        }
    }

    async getDeploymentModels(req, res) {
        try {
            const { deploymentId } = req.params;
            if (!deploymentId) return res.status(400).json({ message: 'deploymentId is required' });

            const result = await notecardService.getDeploymentModels(deploymentId, req);
            res.status(200).json(result);
        } catch (err) {
            const status = err.status || (err.message.includes('not found') ? 404 : 500);
            res.status(status).json({ message: err.message });
        }
    }

    // ── ORGANIZATION ENV ──────────────────────────────────────────────────────

    async updateOrganizationEnv(req, res) {
        try {
            const { orgId } = req.params;
            const { model } = req.query; // Optional filter
            const envVars = req.body.envVars || req.body;

            if (!orgId) return res.status(400).json({ message: 'orgId is required' });
            if (!envVars || typeof envVars !== 'object' || Array.isArray(envVars)) {
                return res.status(400).json({ message: 'Request body must be a key-value object of env vars' });
            }

            // Guard: user must be acting in this org's context
            const requestOrgId = req.user.currentOrganizationId || req.headers['x-org-id'];
            if (requestOrgId && requestOrgId !== orgId) {
                return res.status(403).json({ message: 'Forbidden: You can only push env vars to your current organization.' });
            }

            const result = await notecardService.updateOrganizationEnv(orgId, envVars, req, model);
            res.status(200).json(result);
        } catch (err) {
            const status = err.status || (err.message.includes('not found') ? 404 : err.message.includes('Forbidden') ? 403 : 500);
            res.status(status).json({ message: err.message });
        }
    }
}

module.exports = new NotecardController();
