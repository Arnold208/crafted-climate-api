'use strict';
const { BlobServiceClient } = require('@azure/storage-blob');
const logger = require('../../utils/logger');

let blobServiceClient;

function getBlobServiceClient() {
  if (!blobServiceClient) {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) {
      logger.warn('[MRVBlob] AZURE_STORAGE_CONNECTION_STRING not set — Blob writes will be skipped in dev');
      return null;
    }
    blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  }
  return blobServiceClient;
}

const CONTAINERS = {
  RAW: 'mrv-raw',
  EVIDENCE: 'mrv-evidence',
  METHODOLOGY_SNAPSHOTS: 'mrv-methodology-snapshots',
  CALCULATION_SNAPSHOTS: 'mrv-calculation-snapshots',
  REPORTS: 'mrv-reports',
  FINAL: 'mrv-final'
};

async function ensureContainers() {
  const client = getBlobServiceClient();
  if (!client) return;
  for (const name of Object.values(CONTAINERS)) {
    try {
      await client.createContainer(name); // private by default — no access option needed
      logger.info(`[MRVBlob] Container ensured: ${name}`);
    } catch (err) {
      if (err.code !== 'ContainerAlreadyExists') {
        logger.error(`[MRVBlob] Failed to ensure container ${name}: ${err.message}`);
      }
    }
  }
}

async function writeRawEvent({ ingestionId, canonicalJson, hash }) {
  const client = getBlobServiceClient();
  if (!client) return null;
  const blobName = `${new Date().toISOString().slice(0, 10)}/${ingestionId}.json`;
  try {
    const containerClient = client.getContainerClient(CONTAINERS.RAW);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(canonicalJson, Buffer.byteLength(canonicalJson), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
      metadata: { ingestionId, sha256: hash }
    });
    return { blobPath: blobName, blobContainer: CONTAINERS.RAW, hash };
  } catch (err) {
    logger.error(`[MRVBlob] Failed to write raw event ${ingestionId}: ${err.message}`);
    return null;
  }
}

async function uploadEvidence({ projectId, evidenceId, buffer, mimeType, filename, metadata = {} }) {
  const client = getBlobServiceClient();
  if (!client) return null;
  const blobName = `${projectId}/${evidenceId}/${filename}`;
  try {
    const containerClient = client.getContainerClient(CONTAINERS.EVIDENCE);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: mimeType },
      metadata: { evidenceId, projectId, ...metadata }
    });
    return { blobPath: blobName, blobContainer: CONTAINERS.EVIDENCE };
  } catch (err) {
    logger.error(`[MRVBlob] Failed to upload evidence ${evidenceId}: ${err.message}`);
    return null;
  }
}

async function generateUploadToken({ projectId, evidenceId, filename, expiryMinutes = 60 }) {
  const client = getBlobServiceClient();
  if (!client) return null;
  const blobName = `${projectId}/${evidenceId}/${filename}`;
  const containerClient = client.getContainerClient(CONTAINERS.EVIDENCE);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + expiryMinutes);
  return { blobName, blobUrl: blockBlobClient.url, expiresAt: expiry };
}

module.exports = { ensureContainers, writeRawEvent, uploadEvidence, generateUploadToken, CONTAINERS };
