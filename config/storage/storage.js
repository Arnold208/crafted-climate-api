const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

let envFile;

if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
} else {
  envFile = '.env';   // default for production or if NODE_ENV not set
}

dotenv.config({ path: path.resolve(__dirname, `../../${envFile}`) });

const multer = require("multer");
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require("@azure/storage-blob");

// Azure Blob Storage setup
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!AZURE_STORAGE_CONNECTION_STRING) {
  console.error("Azure Storage Connection String is not set in .env file.");
  process.exit(1); // Exit if connection string is missing
}

const CONTAINER_NAME = "images";

let containerClient;
let blobServiceClient;

try {
  blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
  containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  // Ensure container exists
  (async () => {
    try {
      await containerClient.createIfNotExists();
      console.log(`Azure Blob Storage Container "${CONTAINER_NAME}" is ready.`);
    } catch (err) {
      console.error("Error ensuring container exists:", err.message);
    }
  })();

} catch (err) {
  console.error("Error initializing BlobServiceClient:", err.message);
  process.exit(1); // Exit if BlobServiceClient cannot be initialized
}

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
});

// Generate Signed URL
const generateSignedUrl = (fileName) => {
  const blobClient = containerClient.getBlobClient(fileName);
  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + 5); // 5 years expiry

  // Extract account name and account key from the connection string
  const accountName = process.env.AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+)/)[1];
  const accountKey = process.env.AZURE_STORAGE_CONNECTION_STRING.match(/AccountKey=([^;]+)/)[1];

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: fileName,
      permissions: BlobSASPermissions.parse("r"), // Read-only access
      startsOn: now,
      expiresOn: expires,
    },
    sharedKeyCredential
  ).toString();

  return `${blobClient.url}?${sasToken}`;
};

// Export the configured container client and multer upload middleware
module.exports = {
  containerClient,
  upload,
  generateSignedUrl,
};
