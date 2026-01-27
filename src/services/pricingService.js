/**
 * Enterprise Pricing Service
 * Calculates subscription pricing based on device count tiers
 * 
 * Tier Structure:
 * - Tier 1 (0-50 devices): Base price, 0% discount
 * - Tier 2 (51-100 devices): 5% discount
 * - Tier 3 (101-500 devices): 10% discount
 * - Tier 4 (500+ devices): 15% discount
 */

const ENTERPRISE_TIERS = {
    TIER_1: {
        name: 'Tier 1',
        minDevices: 0,
        maxDevices: 50,
        discountPercentage: 0,
        description: 'Small business (0-50 devices)'
    },
    TIER_2: {
        name: 'Tier 2',
        minDevices: 51,
        maxDevices: 100,
        discountPercentage: 5,
        description: 'Growing business (51-100 devices)'
    },
    TIER_3: {
        name: 'Tier 3',
        minDevices: 101,
        maxDevices: 500,
        discountPercentage: 10,
        description: 'Large enterprise (101-500 devices)'
    },
    TIER_4: {
        name: 'Tier 4',
        minDevices: 501,
        maxDevices: Infinity,
        discountPercentage: 15,
        description: 'Enterprise scale (500+ devices)'
    }
};

class PricingService {

    /**
     * Determine enterprise tier based on device count
     * @param {number} deviceCount - Number of devices
     * @returns {object} Tier information
     */
    determineEnterpriseTier(deviceCount) {
        if (deviceCount <= 50) return ENTERPRISE_TIERS.TIER_1;
        if (deviceCount <= 100) return ENTERPRISE_TIERS.TIER_2;
        if (deviceCount <= 500) return ENTERPRISE_TIERS.TIER_3;
        return ENTERPRISE_TIERS.TIER_4;
    }

    /**
     * Calculate enterprise price with volume discount
     * @param {number} basePrice - Base monthly or yearly price
     * @param {number} deviceCount - Number of devices
     * @returns {object} Pricing breakdown
     */
    calculateEnterprisePrice(basePrice, deviceCount) {
        const tier = this.determineEnterpriseTier(deviceCount);
        const discountAmount = basePrice * (tier.discountPercentage / 100);
        const finalPrice = basePrice - discountAmount;

        return {
            tier: tier.name,
            tierDescription: tier.description,
            deviceCount,
            basePrice,
            discountPercentage: tier.discountPercentage,
            discountAmount,
            finalPrice,
            savings: discountAmount
        };
    }

    /**
     * Apply volume discount to a price
     * @param {number} price - Original price
     * @param {string} tierName - Tier name (Tier 1, Tier 2, etc.)
     * @returns {number} Discounted price
     */
    applyVolumeDiscount(price, tierName) {
        const tier = Object.values(ENTERPRISE_TIERS).find(t => t.name === tierName);
        if (!tier) return price;

        return price * (1 - tier.discountPercentage / 100);
    }

    /**
     * Get all enterprise tiers
     * @returns {object} All tier definitions
     */
    getAllTiers() {
        return ENTERPRISE_TIERS;
    }

    /**
     * Calculate pricing for both monthly and yearly billing
     * @param {number} monthlyBasePrice - Base monthly price
     * @param {number} yearlyBasePrice - Base yearly price
     * @param {number} deviceCount - Number of devices
     * @returns {object} Complete pricing breakdown
     */
    calculateCompletePricing(monthlyBasePrice, yearlyBasePrice, deviceCount) {
        const monthly = this.calculateEnterprisePrice(monthlyBasePrice, deviceCount);
        const yearly = this.calculateEnterprisePrice(yearlyBasePrice, deviceCount);

        return {
            deviceCount,
            tier: monthly.tier,
            tierDescription: monthly.tierDescription,
            monthly: {
                basePrice: monthlyBasePrice,
                discountPercentage: monthly.discountPercentage,
                discountAmount: monthly.discountAmount,
                finalPrice: monthly.finalPrice
            },
            yearly: {
                basePrice: yearlyBasePrice,
                discountPercentage: yearly.discountPercentage,
                discountAmount: yearly.discountAmount,
                finalPrice: yearly.finalPrice,
                monthlySavings: (monthlyBasePrice * 12) - yearly.finalPrice
            }
        };
    }

    /**
     * Check if device count change triggers tier change
     * @param {number} oldDeviceCount - Previous device count
     * @param {number} newDeviceCount - New device count
     * @returns {object} Tier change information
     */
    checkTierChange(oldDeviceCount, newDeviceCount) {
        const oldTier = this.determineEnterpriseTier(oldDeviceCount);
        const newTier = this.determineEnterpriseTier(newDeviceCount);

        return {
            tierChanged: oldTier.name !== newTier.name,
            oldTier: oldTier.name,
            newTier: newTier.name,
            oldDiscount: oldTier.discountPercentage,
            newDiscount: newTier.discountPercentage,
            discountIncrease: newTier.discountPercentage - oldTier.discountPercentage
        };
    }
}

module.exports = new PricingService();
module.exports.ENTERPRISE_TIERS = ENTERPRISE_TIERS;
