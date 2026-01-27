const { customAlphabet } = require('nanoid');
const BatchCounter = require('../models/devices/batchCounterModel');

// Custom alphabet for 21-character IDs (manufacturing ID, AUID)
const fullAlphabet = '_-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid21 = customAlphabet(fullAlphabet, 21);

// Custom alphabet for 10-character Serial Numbers (uppercase + digits)
const serialAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid10 = customAlphabet(serialAlphabet, 10);

// Generate 21-char Manufacturer ID
const generateManufacturerId = () => nanoid21();

// Serial Number: GH-{10 uppercase alphanumeric}
const generateSerialNumber = () => `GH-${nanoid10()}`;

// AUID: GH-{21-char nanoid}
const generateAUID = () => `GH-${nanoid21()}`;

// SKU model format: CS-ENV, CS-GAS, etc.
const generateSku = (model) => `CS-${model.toUpperCase()}`;


const generateBatchNumber = async () => {
  const currentYear = new Date().getFullYear();

  const counter = await BatchCounter.findOneAndUpdate(
    { year: currentYear },
    { $inc: { index: 1 } },
    { new: true, upsert: true } // Create if not exists
  );

  const batchIndex = String(counter.index).padStart(4, '0');
  return `CC-${currentYear}-${batchIndex}`;
};

const generateUserId = () => nanoid10();

const generateModelId = () => nanoid10();

const generateFirmwareId = () => nanoid10();


module.exports = {
  generateManufacturerId,
  generateSerialNumber,
  generateAUID,
  generateSku,
  generateBatchNumber,
  generateUserId,
  generateModelId,
  generateFirmwareId
};
