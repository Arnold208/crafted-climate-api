const Plan = require('../../models/subscriptions/Plan');
const RegisterDevice = require('../../models/devices/registerDevice');
const registryService = require('../devices/registry/registry.service');
const logger = require('../../utils/logger');

/**
 * Reconciles device active/disabled states according to plan limits.
 *  - Downgrades: automatically disables excess devices beyond plan limit.
 *                forces purchase devices into Wi-Fi mode if freemium.
 *                disables all MaaS devices if freemium.
 *  - Upgrades: automatically re-enables devices previously disabled by system,
 *              and restores cellular mode.
 * 
 * @param {string} userid - The owner/actor ID
 * @param {string|null} organizationId - The organization context ID
 * @param {string} planId - The newly assigned plan ID
 * @param {string} actorId - The operator performing this change (e.g. userid or 'system')
 */
async function reconcileDeviceStates(userid, organizationId, planId, actorId) {
    try {
        const plan = await Plan.findOne({ planId });
        if (!plan) {
            logger.error(`[ReconcileDeviceStates] Plan not found for planId: ${planId}`);
            return;
        }

        const planName = plan.name.toLowerCase();
        const maxDevices = plan.maxDevices;
        const isFreemium = (planName === 'freemium');

        const query = organizationId 
            ? { organizationId, deletedAt: null } 
            : { userid, organizationId: null, deletedAt: null };

        const devices = await RegisterDevice.find(query);
        // Sort in memory to avoid Cosmos DB indexing limitations on sorted queries
        devices.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

        logger.info(`[ReconcileDeviceStates] Reconciling ${devices.length} devices for Org ${organizationId || 'Personal'} against plan '${plan.name}' (limit: ${maxDevices}, isFreemium: ${isFreemium})`);

        if (maxDevices === -1 || maxDevices === null || maxDevices === undefined) {
            // Unlimited Capacity: Re-enable all devices that were auto-disabled on downgrade
            for (const device of devices) {
                const isRented = (device.acquisitionType === 'maas');
                const isMaaSPlan = planName.startsWith('maas_');
                if (isRented && !isMaaSPlan) {
                    // Disable rented device since it is on a standard non-rented plan
                    if (device.state === 'active') {
                        logger.warn(`[ReconcileDeviceStates] Disabling rented device ${device.auid} (unlimited plan, but not a MaaS/rental plan).`);
                        await registryService.setDeviceState(device.auid, 'disabled', 'system:downgrade');
                    }
                    continue;
                }

                if (device.state === 'disabled' && device.stateChangedBy === 'system:downgrade') {
                    logger.info(`[ReconcileDeviceStates] Re-activating device ${device.auid} after upgrade to unlimited plan.`);
                    await registryService.setDeviceState(device.auid, 'active', actorId, 'cellular');
                } else if (device.state === 'active') {
                    // Ensure it is in cellular mode if it was previously wifi mode on freemium
                    const prevNetMode = device.netMode || 'cellular';
                    if (prevNetMode === 'wifi') {
                        logger.info(`[ReconcileDeviceStates] Upgrading device ${device.auid} back to cellular mode.`);
                        await registryService.setDeviceState(device.auid, 'active', actorId, 'cellular');
                    }
                }
            }
        } else {
            // Limited Capacity
            const isMaaSPlan = planName.startsWith('maas_');
            let activeSlotsConsumed = 0;
            for (let i = 0; i < devices.length; i++) {
                const device = devices[i];
                const isRented = (device.acquisitionType === 'maas');

                // Skip manually deactivated/disabled devices (they don't count towards active capacity slots)
                const isManuallyInactiveOrDisabled = (device.state === 'inactive') || 
                    (device.state === 'disabled' && device.stateChangedBy !== 'system:downgrade');
                
                if (isManuallyInactiveOrDisabled) {
                    continue;
                }

                // Business Rule: MaaS devices require a MaaS plan. They cannot run on Freemium or standard SaaS plans.
                if (isRented && !isMaaSPlan) {
                    if (device.state === 'active') {
                        logger.warn(`[ReconcileDeviceStates] Disabling rented device ${device.auid} (on standard/freemium plan).`);
                        await registryService.setDeviceState(device.auid, 'disabled', 'system:downgrade');
                    }
                    continue;
                }

                if (activeSlotsConsumed < maxDevices) {
                    // This slot is within plan capacity
                    activeSlotsConsumed++;
                    
                    // Enforce Wi-Fi mode if freemium, otherwise cellular
                    const targetNetMode = isFreemium ? 'wifi' : 'cellular';
                    
                    if (device.state === 'disabled' && device.stateChangedBy === 'system:downgrade') {
                        logger.info(`[ReconcileDeviceStates] Re-activating device ${device.auid} (within slot capacity ${activeSlotsConsumed}/${maxDevices}) in ${targetNetMode} mode.`);
                        await registryService.setDeviceState(device.auid, 'active', actorId, targetNetMode);
                    } else {
                        // Device is already active, but check if we need to toggle its network mode (e.g. cellular <-> wifi)
                        const prevNetMode = device.netMode || 'cellular';
                        if (prevNetMode !== targetNetMode) {
                            logger.info(`[ReconcileDeviceStates] Switching device ${device.auid} network mode to ${targetNetMode}.`);
                            await registryService.setDeviceState(device.auid, 'active', actorId, targetNetMode);
                        }
                    }
                } else {
                    // Exceeds plan capacity. We must disable it.
                    if (device.state === 'active') {
                        logger.warn(`[ReconcileDeviceStates] Disabling device ${device.auid} (exceeds slot capacity, active slots consumed: ${activeSlotsConsumed}/${maxDevices}).`);
                        await registryService.setDeviceState(device.auid, 'disabled', 'system:downgrade');
                    }
                }
            }
        }
        logger.info(`[ReconcileDeviceStates] Reconcile complete.`);
    } catch (error) {
        logger.error(`[ReconcileDeviceStates] Error during reconciliation: ${error.message}`);
    }
}

module.exports = reconcileDeviceStates;
