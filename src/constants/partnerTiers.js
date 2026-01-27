/**
 * Partner Tier Constants
 * Defines partner tiers and their default benefits
 */

const PARTNER_TIERS = {
    NONE: "none",
    STANDARD: "standard",
    PREMIUM: "premium",
    ENTERPRISE: "enterprise"
};

const PARTNER_TIER_LABELS = {
    [PARTNER_TIERS.NONE]: "Not a Partner",
    [PARTNER_TIERS.STANDARD]: "Standard Partner",
    [PARTNER_TIERS.PREMIUM]: "Premium Partner",
    [PARTNER_TIERS.ENTERPRISE]: "Enterprise Partner"
};

/**
 * Default benefits for each partner tier
 */
const PARTNER_TIER_BENEFITS = {
    [PARTNER_TIERS.STANDARD]: {
        discountPercentage: 10,
        prioritySupport: false,
        dedicatedAccountManager: false,
        customBranding: false,
        apiRateLimitMultiplier: 1.5,
        freeDevices: 5
    },
    [PARTNER_TIERS.PREMIUM]: {
        discountPercentage: 20,
        prioritySupport: true,
        dedicatedAccountManager: false,
        customBranding: true,
        apiRateLimitMultiplier: 2,
        freeDevices: 15
    },
    [PARTNER_TIERS.ENTERPRISE]: {
        discountPercentage: 30,
        prioritySupport: true,
        dedicatedAccountManager: true,
        customBranding: true,
        apiRateLimitMultiplier: 5,
        freeDevices: 50
    }
};

/**
 * Get default benefits for a partner tier
 * @param {string} tier - Partner tier
 * @returns {Object} Benefits object
 */
function getDefaultBenefits(tier) {
    return PARTNER_TIER_BENEFITS[tier] || {
        discountPercentage: 0,
        prioritySupport: false,
        dedicatedAccountManager: false,
        customBranding: false,
        apiRateLimitMultiplier: 1,
        freeDevices: 0
    };
}

module.exports = {
    PARTNER_TIERS,
    PARTNER_TIER_LABELS,
    PARTNER_TIER_BENEFITS,
    getDefaultBenefits
};
