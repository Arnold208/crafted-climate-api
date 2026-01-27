/**
 * Document Upload Service for Organization Management
 * Handles uploading verification documents and supporting files to Azure Blob Storage
 * 
 * 🔒 SECURITY: File validation, size limits, virus scan ready
 */

const { containerClient, generateSignedUrl } = require('../../config/storage/storage');
const { validateDocumentUpload } = require('../../validators/organizationValidators');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

class DocumentUploadService {

    /**
     * Upload verification document to Azure Blob Storage
     * 
     * @param {Object} file - Multer file object
     * @param {string} orgId - Organization ID
     * @param {string} documentType - Type of document
     * @param {string} uploadedBy - User ID
     * @returns {Promise<Object>} { url, type, uploadedAt, uploadedBy }
     */
    async uploadVerificationDocument(file, orgId, documentType, uploadedBy) {
        // 🔒 SECURITY: Validate file
        const validation = validateDocumentUpload(file);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }

        // Generate unique filename
        const fileExtension = path.extname(file.originalname);
        const fileName = `verification/${orgId}/${documentType}-${uuidv4()}${fileExtension}`;

        try {
            // Upload to Azure Blob Storage
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            await blockBlobClient.upload(file.buffer, file.buffer.length, {
                blobHTTPHeaders: { blobContentType: file.mimetype }
            });

            // Generate signed URL (5-year expiry)
            const signedUrl = generateSignedUrl(fileName);

            return {
                type: documentType,
                url: signedUrl,
                uploadedAt: new Date(),
                uploadedBy
            };
        } catch (error) {
            console.error('Document upload error:', error);
            throw new Error('Failed to upload document to cloud storage');
        }
    }

    /**
     * Upload type change supporting document
     * 
     * @param {Object} file - Multer file object
     * @param {string} orgId - Organization ID
     * @param {string} documentType - Type of document
     * @param {string} uploadedBy - User ID
     * @returns {Promise<Object>}
     */
    async uploadTypeChangeDocument(file, orgId, documentType, uploadedBy) {
        // 🔒 SECURITY: Validate file
        const validation = validateDocumentUpload(file);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }

        // Generate unique filename
        const fileExtension = path.extname(file.originalname);
        const fileName = `type-change/${orgId}/${documentType}-${uuidv4()}${fileExtension}`;

        try {
            // Upload to Azure Blob Storage
            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            await blockBlobClient.upload(file.buffer, file.buffer.length, {
                blobHTTPHeaders: { blobContentType: file.mimetype }
            });

            // Generate signed URL
            const signedUrl = generateSignedUrl(fileName);

            return {
                type: documentType,
                url: signedUrl,
                uploadedAt: new Date(),
                uploadedBy
            };
        } catch (error) {
            console.error('Document upload error:', error);
            throw new Error('Failed to upload document to cloud storage');
        }
    }

    /**
     * Upload multiple documents
     * 
     * @param {Array} files - Array of multer file objects
     * @param {string} orgId - Organization ID
     * @param {string} category - 'verification' or 'type-change'
     * @param {string} uploadedBy - User ID
     * @returns {Promise<Array>}
     */
    async uploadMultipleDocuments(files, orgId, category, uploadedBy) {
        const uploadPromises = files.map((file, index) => {
            const documentType = file.fieldname || `document-${index}`;

            if (category === 'verification') {
                return this.uploadVerificationDocument(file, orgId, documentType, uploadedBy);
            } else {
                return this.uploadTypeChangeDocument(file, orgId, documentType, uploadedBy);
            }
        });

        return await Promise.all(uploadPromises);
    }
}

module.exports = new DocumentUploadService();
