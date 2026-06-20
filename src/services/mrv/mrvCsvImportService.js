'use strict';
/**
 * MRV CSV Import Service
 * ═══════════════════════
 * Allows bulk import of manual meter readings from CSV files.
 *
 * Flow:
 *   1. POST /csv/preview  → upload CSV buffer → parse headers + 5-row preview
 *   2. POST /csv/:importId/commit → confirm column mapping → create ManualObservations
 */

const { v4: uuidv4 }   = require('uuid');
const ManualObservation = require('../../models/mrv/evidence/ManualObservation.model');
const CSVImport         = require('../../models/mrv/evidence/CSVImport.model');
const MRVProject        = require('../../models/mrv/project/MRVProject.model');
const logger            = require('../../utils/logger');

// ── CSV Parser (no external dep — built-in split) ─────────────────────────

function parseCSVBuffer(buffer) {
  const text  = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV must have at least a header row and one data row');

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows    = lines.slice(1, 6).map(line => {  // first 5 data rows for preview
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row   = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });

  return { headers, previewRows: rows, totalRows: lines.length - 1 };
}

// ── Parse CSV Preview ─────────────────────────────────────────────────────

/**
 * Parse a CSV upload and return column headers + first 5 rows for mapping preview.
 * Saves a CSVImport record in PENDING_MAPPING state.
 *
 * @param {string}  projectId
 * @param {string}  monitoringPeriodId  - optional
 * @param {Buffer}  csvBuffer
 * @param {string}  originalFilename
 * @param {string}  uploadedBy
 * @returns {{ importId, headers, previewRows, totalRows }}
 */
async function parseCSVPreview(projectId, monitoringPeriodId, csvBuffer, originalFilename, uploadedBy) {
  const project = await MRVProject.findOne({ projectId }).lean();
  if (!project) throw Object.assign(new Error(`Project not found: ${projectId}`), { status: 404 });

  const { headers, previewRows, totalRows } = parseCSVBuffer(csvBuffer);

  const importId = `CSVIMPORT-${uuidv4()}`;
  await CSVImport.create({
    importId,
    projectId,
    monitoringPeriodId: monitoringPeriodId || null,
    organizationId:     project.organizationId,
    originalFilename:   originalFilename || 'upload.csv',
    status:             'PENDING_MAPPING',
    totalRows,
    uploadedBy,
    csvRaw:             csvBuffer.toString('utf8'),   // store raw CSV for commit phase
    headers,
    uploadedAt:         new Date(),
    createdAt:          new Date(),
    updatedAt:          new Date(),
  });

  logger.info(`[MRVCsvImport] Preview parsed: importId=${importId} rows=${totalRows} file=${originalFilename}`);

  return {
    importId,
    headers,
    previewRows,
    totalRows,
    hint: 'Map column names to MRV parameters using the columnMapping field, then POST to /csv/:importId/commit',
    suggestedMapping: suggestMapping(headers),
  };
}

// ── Auto-suggest common column names ─────────────────────────────────────

function suggestMapping(headers) {
  const mapping = {};
  const rules   = [
    { patterns: ['timestamp', 'date', 'time', 'datetime', 'recorded_at'],     target: 'observedAt'     },
    { patterns: ['auid', 'device', 'device_id', 'sensor_id', 'meter_id'],     target: 'auid'           },
    { patterns: ['co2', 'co2e', 'equivalent_co2', 'carbon', 'ghg'],           target: 'equivalent_co2' },
    { patterns: ['kwh', 'energy', 'electricity', 'electricity_kwh'],           target: 'electricity_kwh'},
    { patterns: ['lpg_kg', 'lpg', 'gas_kg', 'fuel_kg'],                       target: 'lpg_kg'         },
    { patterns: ['cookstove_sessions', 'sessions', 'stove_use'],               target: 'cookstove_sessions'},
    { patterns: ['temperature', 'temp', 'temp_c'],                             target: 'temperature'    },
    { patterns: ['humidity', 'rh', 'relative_humidity'],                       target: 'humidity'       },
    { patterns: ['notes', 'comment', 'remarks'],                               target: 'notes'          },
    { patterns: ['site', 'site_id', 'location'],                               target: 'siteId'         },
  ];

  for (const header of headers) {
    const h = header.toLowerCase().replace(/\s+/g, '_');
    for (const rule of rules) {
      if (rule.patterns.some(p => h.includes(p))) {
        mapping[header] = rule.target;
        break;
      }
    }
  }
  return mapping;
}

// ── Commit CSV Import ─────────────────────────────────────────────────────

/**
 * Commit a CSV import — applies columnMapping and creates ManualObservation records.
 *
 * @param {string} importId
 * @param {object} columnMapping   — { "CSV Column": "mrvField" }
 * @param {string} requestingUserId
 * @returns {{ committed, skipped, observationIds }}
 */
async function commitCSVImport(importId, columnMapping, requestingUserId) {
  const csvImport = await CSVImport.findOne({ importId });
  if (!csvImport) throw Object.assign(new Error(`CSV import not found: ${importId}`), { status: 404 });

  if (csvImport.status === 'COMMITTED') {
    throw Object.assign(new Error(`Import ${importId} was already committed`), { status: 409 });
  }
  if (!columnMapping || Object.keys(columnMapping).length === 0) {
    throw Object.assign(new Error('columnMapping is required — map at least one column to an MRV parameter'), { status: 400 });
  }
  if (!columnMapping.observedAt && !columnMapping.timestamp) {
    throw Object.assign(new Error('columnMapping must include a timestamp column mapped to "observedAt"'), { status: 400 });
  }

  // Parse the full CSV (all rows)
  const lines   = csvImport.csvRaw.split(/\r?\n/).filter(l => l.trim() !== '');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const dataRows = lines.slice(1);

  const observationIds = [];
  const skipped        = [];
  let   committed      = 0;

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const line  = dataRows[rowIdx];
    if (!line.trim()) continue;
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row   = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });

    // Apply column mapping
    const mapped = {};
    for (const [csvCol, mrvField] of Object.entries(columnMapping)) {
      if (row[csvCol] !== undefined) mapped[mrvField] = row[csvCol];
    }

    // Validate required fields
    const rawTs = mapped.observedAt || mapped.timestamp;
    if (!rawTs) {
      skipped.push({ row: rowIdx + 2, reason: 'Missing observedAt / timestamp value' });
      continue;
    }

    const observedAt = new Date(isNaN(rawTs) ? rawTs : Number(rawTs) < 1e12 ? Number(rawTs) * 1000 : Number(rawTs));
    if (isNaN(observedAt.getTime())) {
      skipped.push({ row: rowIdx + 2, reason: `Invalid timestamp: ${rawTs}` });
      continue;
    }

    // Build observation payload
    const observationId = `MANOBS-${uuidv4()}`;
    const readings = {};
    const skipFields = new Set(['observedAt', 'timestamp', 'auid', 'siteId', 'notes']);
    for (const [field, val] of Object.entries(mapped)) {
      if (!skipFields.has(field) && val !== '') {
        const num = parseFloat(val);
        readings[field] = isNaN(num) ? val : num;
      }
    }

    await ManualObservation.create({
      observationId,
      projectId:         csvImport.projectId,
      monitoringPeriodId: csvImport.monitoringPeriodId || null,
      organizationId:    csvImport.organizationId,
      auid:              mapped.auid || null,
      siteId:            mapped.siteId || null,
      observedAt,
      readings,
      notes:             mapped.notes || `Imported from CSV: ${csvImport.originalFilename} (row ${rowIdx + 2})`,
      source:            'CSV_IMPORT',
      importId,
      submittedBy:       requestingUserId,
      status:            'SUBMITTED',
      createdAt:         new Date(),
      updatedAt:         new Date(),
    });

    observationIds.push(observationId);
    committed++;
  }

  // Mark import as committed
  csvImport.status        = 'COMMITTED';
  csvImport.committedAt   = new Date();
  csvImport.committedBy   = requestingUserId;
  csvImport.committedRows = committed;
  csvImport.skippedRows   = skipped.length;
  csvImport.columnMapping = columnMapping;
  csvImport.updatedAt     = new Date();
  await csvImport.save();

  logger.info(`[MRVCsvImport] Committed: importId=${importId} committed=${committed} skipped=${skipped.length}`);

  return { importId, committed, skipped, observationIds };
}

module.exports = { parseCSVPreview, commitCSVImport };
