/**
 * Organization Type Constants
 * Defines valid organization types and their characteristics
 */

const ORGANIZATION_TYPES = {
    PERSONAL: "personal",
    BUSINESS: "business",
    NON_PROFIT: "non-profit",
    GOVERNMENT: "government",
    EDUCATION: "education",
    RESEARCH: "research"
};

const ORGANIZATION_TYPE_LABELS = {
    [ORGANIZATION_TYPES.PERSONAL]: "Personal",
    [ORGANIZATION_TYPES.BUSINESS]: "Business",
    [ORGANIZATION_TYPES.NON_PROFIT]: "Non-Profit Organization",
    [ORGANIZATION_TYPES.GOVERNMENT]: "Government Agency",
    [ORGANIZATION_TYPES.EDUCATION]: "Educational Institution",
    [ORGANIZATION_TYPES.RESEARCH]: "Research Institution"
};

/**
 * Organization types that require business verification
 */
const TYPES_REQUIRING_VERIFICATION = [
    ORGANIZATION_TYPES.BUSINESS,
    ORGANIZATION_TYPES.NON_PROFIT,
    ORGANIZATION_TYPES.GOVERNMENT,
    ORGANIZATION_TYPES.EDUCATION,
    ORGANIZATION_TYPES.RESEARCH
];

/**
 * Check if an organization type requires verification
 * @param {string} type - Organization type
 * @returns {boolean}
 */
function requiresVerification(type) {
    return TYPES_REQUIRING_VERIFICATION.includes(type);
}

module.exports = {
    ORGANIZATION_TYPES,
    ORGANIZATION_TYPE_LABELS,
    TYPES_REQUIRING_VERIFICATION,
    requiresVerification
};
