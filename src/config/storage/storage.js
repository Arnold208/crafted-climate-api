const dotenv = require('dotenv');
const path = require('path');
const multer = require("multer");
const {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters
} = require("@azure/storage-blob");

const {
  TableClient,
  AzureNamedKeyCredential
} = require("@azure/data-tables");

// --------------------------------------------------
// ENV LOADING
// --------------------------------------------------
let envFile = process.env.NODE_ENV === 'development'
  ? '.env.development'
  : '.env';

dotenv.config({ path: path.resolve(__dirname, `../../../${envFile}`) });

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!AZURE_STORAGE_CONNECTION_STRING) {
  console.error("Azure Storage Connection String missing");
  process.exit(1);
}

// --------------------------------------------------
// BLOB STORAGE SETUP
// --------------------------------------------------
const CONTAINER_NAME = "images";

let blobServiceClient, containerClient;

try {
  blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );

  containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  (async () => {
    await containerClient.createIfNotExists();
    console.log(`Blob Container "${CONTAINER_NAME}" is ready.`);
  })();

} catch (err) {
  console.error("Blob init error:", err.message);
  process.exit(1);
}

// --------------------------------------------------
// MULTER for uploads
// --------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// --------------------------------------------------
// SIGNED URL GENERATOR
// --------------------------------------------------
const generateSignedUrl = (fileName) => {
  const blobClient = containerClient.getBlobClient(fileName);
  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + 5);

  const accountName = AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+)/)[1];
  const accountKey = AZURE_STORAGE_CONNECTION_STRING.match(/AccountKey=([^;]+)/)[1];

  const credential = new StorageSharedKeyCredential(accountName, accountKey);

  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: fileName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: now,
      expiresOn: expires
    },
    credential
  ).toString();

  return `${blobClient.url}?${sas}`;
};

// --------------------------------------------------
// TABLE STORAGE SETUP (Same storage account)
// --------------------------------------------------
const TABLE_NAME = process.env.AZURE_TABLE_NAME || "AuditLogs";
const STORAGE_ACCOUNT_NAME = AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+)/)[1];
const STORAGE_ACCOUNT_KEY = AZURE_STORAGE_CONNECTION_STRING.match(/AccountKey=([^;]+)/)[1];

const tableCredential = new AzureNamedKeyCredential(
  STORAGE_ACCOUNT_NAME,
  STORAGE_ACCOUNT_KEY
);

const tableClient = new TableClient(
  `https://${STORAGE_ACCOUNT_NAME}.table.core.windows.net`,
  TABLE_NAME,
  tableCredential
);

// Ensure table exists
(async () => {
  try {
    await tableClient.createTable();
    console.log(`Azure Table "${TABLE_NAME}" ready.`);
  } catch (err) {
    if (!err.message.includes("TableAlreadyExists")) {
      console.error("Table init error:", err.message);
    }
  }
})();

// --------------------------------------------------
// WRITE LOG FUNCTION
// --------------------------------------------------
async function writeAuditLog(log) {
  try {
    await tableClient.createEntity(log);
  } catch (err) {
    console.error("Audit Log Write Error:", err.message);
  }
}

// --------------------------------------------------
// EXPORTS
// --------------------------------------------------
module.exports = {
  upload,
  containerClient,
  generateSignedUrl,
  tableClient,
  writeAuditLog
};
