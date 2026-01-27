const notecardService = require('./notecard.service');

class NotecardController {
    async updateDeviceEnv(req, res) {
        try {
            const { auid, envVars } = req.body;
            const { userid } = req.query;
            const orgId = req.user.organizationId;
            if (!userid || !auid || !envVars) return res.status(400).json({ message: "Missing params" });

            const result = await notecardService.updateDeviceEnv(auid, userid, orgId, envVars);
            res.json(result);
        } catch (err) {
            if (err.message.includes('not found') || err.message.includes('does not belong')) return res.status(403).json({ message: err.message });
            res.status(500).json({ error: err.message });
        }
    }

    async getDeviceEnv(req, res) {
        try {
            const { auid } = req.params;
            const { userid } = req.query;
            if (!userid || !auid) return res.status(400).json({ message: "Missing params" });

            const result = await notecardService.getDeviceEnv(auid, userid, req.user.organizationId);
            res.json(result);
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            res.status(500).json({ error: err.message });
        }
    }

    async deleteDeviceEnv(req, res) {
        try {
            const { auid, key } = req.params;
            const { userid } = req.query;
            if (!userid) return res.status(400).json({ message: "userid required" });

            const result = await notecardService.deleteDeviceEnv(auid, key, userid, req.user.organizationId);
            res.json({ message: `Env var ${key} deleted`, ...result });
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            res.status(500).json({ error: err.message });
        }
    }

    async updateDeploymentEnv(req, res) {
        try {
            const { deploymentId } = req.params;
            const { userid, model } = req.query;
            const envVars = req.body.envVars || req.body;

            if (!userid || !deploymentId || !model) return res.status(400).json({ message: "Missing params" });

            const result = await notecardService.updateDeploymentEnv(deploymentId, userid, req.user.organizationId, model, envVars);
            res.json(result);
        } catch (err) {
            if (err.message.includes('not found')) return res.status(404).json({ message: err.message });
            res.status(500).json({ error: err.message });
        }
    }

    async getDeploymentModels(req, res) {
        try {
            const { deploymentId } = req.params;
            const { userid } = req.query;
            if (!userid) return res.status(400).json({ message: "userid required" });
            const result = await notecardService.getDeploymentModels(deploymentId, userid, req.user.organizationId);
            res.json({ deploymentId, models: result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new NotecardController();
