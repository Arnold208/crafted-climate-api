const deploymentService = require('./deployment.service');

class DeploymentController {
    async createDeployment(req, res) {
        try {
            const { name, description } = req.body;
            const userid = req.user.userid;
            const organizationId = req.currentOrgId;

            if (!organizationId) return res.status(400).json({ message: "User has not selected an active organization." });

            const deployment = await deploymentService.createDeployment({ name, description, userid, organizationId });
            return res.status(201).json({ message: "Deployment created successfully", deployment });
        } catch (error) {
            if (error.message.includes('exists')) return res.status(400).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async getDeployment(req, res) {
        try {
            const deployment = await deploymentService.getDeployment(req.params.deploymentId, req.currentOrgId);
            if (!deployment) return res.status(404).json({ message: "Deployment not found in this organization" });
            return res.status(200).json({ deployment });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    async listDevicesInDeployment(req, res) {
        try {
            const devices = await deploymentService.listDevicesInDeployment(req.params.deploymentId, req.currentOrgId);
            return res.status(200).json({ devices });
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async updateDeployment(req, res) {
        try {
            const deployment = await deploymentService.updateDeployment(req.params.deploymentId, req.currentOrgId, req.body);
            return res.status(200).json({ deployment });
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('exists')) return res.status(400).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async deleteDeployment(req, res) {
        try {
            const result = await deploymentService.deleteDeployment(req.params.deploymentId, req.currentOrgId);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async addCollaborator(req, res) {
        try {
            const { email, role } = req.body;
            if (!email) return res.status(400).json({ message: "Missing required field: email" });

            const collaborators = await deploymentService.addCollaborator(
                req.params.deploymentId,
                req.currentOrgId,
                email,
                role || 'deployment-user'
            );
            return res.status(200).json({ message: "Collaborator added/updated", collaborators });
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async removeCollaborator(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ message: "Missing required field: email" });

            const collaborators = await deploymentService.removeCollaborator(
                req.params.deploymentId,
                req.currentOrgId,
                email
            );
            return res.status(200).json({ message: "Collaborator removed", collaborators });
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async addDeviceToDeployment(req, res) {
        try {
            const { auid } = req.body || {};
            if (!auid) return res.status(400).json({ message: "Missing required field: auid" });

            const result = await deploymentService.addDeviceToDeployment(req.params.deploymentId, req.currentOrgId, auid);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found')) return res.status(404).json({ message: error.message });
            if (error.message.includes('already belongs')) return res.status(400).json({ message: error.message });
            return res.status(500).json({ message: error.message });
        }
    }

    async removeDeviceFromDeployment(req, res) {
        try {
            const result = await deploymentService.removeDeviceFromDeployment(req.params.deploymentId, req.currentOrgId, req.params.auid);
            return res.status(200).json(result);
        } catch (error) {
            if (error.message.includes('not found') || error.message.includes('does not belong')) {
                return res.status(404).json({ message: error.message });
            }
            return res.status(500).json({ message: error.message });
        }
    }

    async listDeployments(req, res) {
        try {
            const deployments = await deploymentService.listDeployments(req.currentOrgId);
            return res.status(200).json({ deployments });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new DeploymentController();
