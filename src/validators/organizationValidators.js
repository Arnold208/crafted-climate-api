/**
 * Organization Validators
 * Security-focused validation and sanitization for organization data
 */

const validator = require('validator');

/**
 * 🔒 SECURITY: Validate and sanitize organization name
 * Prevents XSS, SQL injection, and ensures reasonable length
 * 
 * @param {string} name - Organization name to validate
 * @returns {Object} { isValid: boolean, sanitized: string, error: string }
 */
function validateOrganizationName(name) {
    if (!name || typeof name !== 'string') {
        return { isValid: false, sanitized: '', error: 'Organization name is required' };
    }

    // Trim whitespace
    let sanitized = name.trim();

    // Length validation
    if (sanitized.length < 2) {
        return { isValid: false, sanitized, error: 'Organization name must be at least 2 characters' };
    }

    if (sanitized.length > 100) {
        return { isValid: false, sanitized, error: 'Organization name must be less than 100 characters' };
    }

    // 🔒 SECURITY: Prevent XSS attacks
    sanitized = validator.escape(sanitized);

    // 🔒 SECURITY: Prevent special characters that could be used for injection
    const dangerousChars = /[<>{}[\]\\\/\$\#\@\!\%\^\&\*\(\)\=\+\|\~\`]/g;
    if (dangerousChars.test(sanitized)) {
        return { isValid: false, sanitized, error: 'Organization name contains invalid characters' };
    }

    // Allow alphanumeric, spaces, hyphens, underscores, periods, apostrophes
    const validPattern = /^[a-zA-Z0-9\s\-\_\.\'\,]+$/;
    if (!validPattern.test(sanitized)) {
        return { isValid: false, sanitized, error: 'Organization name contains invalid characters' };
    }

    return { isValid: true, sanitized, error: null };
}

/**
 * 🔒 SECURITY: Validate business details for verification
 * 
 * @param {Object} businessDetails - Business details object
 * @returns {Object} { isValid: boolean, errors: Array }
 */
function validateBusinessDetails(businessDetails) {
    const errors = [];

    if (!businessDetails || typeof businessDetails !== 'object') {
        return { isValid: false, errors: ['Business details are required'] };
    }

    // Legal name validation
    if (!businessDetails.legalName || businessDetails.legalName.trim().length < 2) {
        errors.push('Legal name is required and must be at least 2 characters');
    }

    // Registration number validation
    if (!businessDetails.registrationNumber || businessDetails.registrationNumber.trim().length < 3) {
        errors.push('Registration number is required');
    }

    // Tax ID validation (if provided)
    if (businessDetails.taxId && businessDetails.taxId.trim().length < 5) {
        errors.push('Tax ID must be at least 5 characters if provided');
    }

    // Country validation
    if (!businessDetails.country || businessDetails.country.trim().length < 2) {
        errors.push('Country is required');
    }

    // Website validation (if provided)
    if (businessDetails.website && !validator.isURL(businessDetails.website, { require_protocol: true })) {
        errors.push('Website must be a valid URL');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * 🔒 SECURITY: Validate partner application data
 * 
 * @param {Object} applicationData - Partner application data
 * @returns {Object} { isValid: boolean, errors: Array }
 */
function validatePartnerApplication(applicationData) {
    const errors = [];

    if (!applicationData || typeof applicationData !== 'object') {
        return { isValid: false, errors: ['Application data is required'] };
    }

    // Requested tier validation
    const validTiers = ['standard', 'premium', 'enterprise'];
    if (!applicationData.requestedTier || !validTiers.includes(applicationData.requestedTier)) {
        errors.push('Valid requested tier is required (standard, premium, or enterprise)');
    }

    // Business case validation
    if (!applicationData.businessCase || applicationData.businessCase.trim().length < 50) {
        errors.push('Business case is required and must be at least 50 characters');
    }

    if (applicationData.businessCase && applicationData.businessCase.length > 2000) {
        errors.push('Business case must be less than 2000 characters');
    }

    // Expected device count validation
    if (typeof applicationData.expectedDeviceCount !== 'number' || applicationData.expectedDeviceCount < 1) {
        errors.push('Expected device count must be at least 1');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * 🔒 SECURITY: Sanitize text input to prevent XSS
 * 
 * @param {string} text - Text to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized text
 */
function sanitizeText(text, maxLength = 1000) {
    if (!text || typeof text !== 'string') return '';

    let sanitized = text.trim();
    sanitized = validator.escape(sanitized);

    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
}

/**
 * 🔒 SECURITY: Validate file upload
 * 
 * @param {Object} file - Uploaded file object
 * @returns {Object} { isValid: boolean, error: string }
 */
function validateDocumentUpload(file) {
    if (!file) {
        return { isValid: false, error: 'File is required' };
    }

    // File size limit: 10MB
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        return { isValid: false, error: 'File size must be less than 10MB' };
    }

    // Allowed file types
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
        return { isValid: false, error: 'File type not allowed. Please upload PDF, JPG, PNG, or DOC files' };
    }

    return { isValid: true, error: null };
}

module.exports = {
    validateOrganizationName,
    validateBusinessDetails,
    validatePartnerApplication,
    sanitizeText,
    validateDocumentUpload
};
