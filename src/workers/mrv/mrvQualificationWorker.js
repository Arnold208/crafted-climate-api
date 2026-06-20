'use strict';
const { Worker } = require('bullmq');
const MRVObservation = require('../../models/mrv/evidence/MRVObservation.model');
const MRVMethodologyImplementation = require('../../models/mrv/catalogue/MRVMethodologyImplementation.model');
const SensorInstallation = require('../../models/mrv/evidence/SensorInstallation.model');
const logger = require('../../utils/logger');

function startMRVQualificationWorker() {
  const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT || '6379', 10), password: process.env.REDIS_PASSWORD || undefined, keepAlive: 30000, maxRetriesPerRequest: null };

  const worker = new Worker('mrv-qualification', async (job) => {
    const { observationId } = job.data;
    const obs = await MRVObservation.findOne({ observationId }).lean();
    if (!obs || obs.qualityStatus === 'QUARANTINED' || obs.qualityStatus === 'REJECTED') return;

    const installations = await SensorInstallation.find({
      auid: obs.auid,
      status: { $in: ['ACTIVE', 'MAINTENANCE'] }, // include MAINTENANCE so we can flag the gap
      validFrom: { $lte: obs.observedAt || obs.receivedAt },
      $or: [{ validTo: null }, { validTo: { $gte: obs.observedAt || obs.receivedAt } }]
    }).lean();
    if (!installations.length) return;

    const projectIds = [...new Set(installations.map(i => i.projectId))];
    const qualificationResults = [];
    for (const installation of installations) {
      // If the device is in MAINTENANCE during this observation timestamp, flag it — don't count toward monitoring
      if (installation.status === 'MAINTENANCE') {
        qualificationResults.push({
          methodologyVersionId: null,
          implementationId:     null,
          channel:              obs.model,
          qualification:        'MAINTENANCE_PERIOD',
          reason:               `Device auid=${obs.auid} was in MAINTENANCE at time of observation. Data preserved but excluded from monitoring calculations.`
        });
        continue;
      }

      const implementation = await MRVMethodologyImplementation.findOne({ status: 'APPROVED_FOR_PROJECT_DESIGN', mayCalculate: true }).lean();
      if (implementation) {
        const { sensorCapabilityMappings = [] } = implementation;
        const mapping = sensorCapabilityMappings.find(m => m.model === obs.model);
        const qualification = mapping ? mapping.role : 'SUPPORTING_EVIDENCE_ONLY';
        qualificationResults.push({ methodologyVersionId: implementation.methodologyVersionId, implementationId: implementation.implementationId, channel: obs.model, qualification, reason: mapping ? 'Sensor capability mapped' : 'No capability mapping found — defaulting to SUPPORTING_EVIDENCE_ONLY' });
      } else {
        qualificationResults.push({ methodologyVersionId: null, implementationId: null, channel: obs.model, qualification: 'SUPPORTING_EVIDENCE_ONLY', reason: 'No approved implementation — mayCalculate=false' });
      }
    }

    await MRVObservation.findOneAndUpdate({ observationId }, { $set: { qualificationResults, projectId: projectIds[0] || obs.projectId } });
    logger.info(`[MRVQualification] ${observationId}: ${qualificationResults.length} qualification(s) applied`);
    return { observationId, qualificationResults };
  }, { connection, concurrency: 20, removeOnComplete: { age: 3600, count: 500 }, removeOnFail: { age: 86400 } });

  worker.on('failed', (job, err) => logger.error(`[MRVQualification] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', err => logger.error('[MRVQualification] Worker error:', err));
  console.log('✅ MRV Qualification Worker started');
  return worker;
}

module.exports = { startMRVQualificationWorker };
