'use strict';

const MRVSensorCapability = require('../../models/mrv/catalogue/MRVSensorCapability.model');
const sensorMetadata = require('../../utils/sensorMetadata');

const QUALIFICATION_RANK = {
  NOT_QUALIFIED: 0,
  SUPPORTING_EVIDENCE_ONLY: 1,
  SUPPORTING_ENVIRONMENTAL_INPUT: 2,
  SUPPORTING_MONITORING_INPUT: 3,
  USAGE_CROSS_CHECK: 4,
  QUALIFIED_CALCULATION_INPUT: 5,
  DIRECT_CO2E_QUANTIFICATION: 6,
};

const PARAM_ALIASES = {
  temp: 'temperature',
  waterTemp: 'water_temperature',
  pm25: 'pm2_5',
  'pm2.5': 'pm2_5',
  pm2_5: 'pm2_5',
  eco2: 'equivalent_co2',
  eco2_ppm: 'equivalent_co2',
  e_co2: 'equivalent_co2',
  tvoc_ppb: 'tvoc',
  battery: 'battery_percent',
  voltage: 'voltage',
  current: 'current',
};

const METHOD_RULES = {
  'VERRA-VM0050': {
    requiredAny: ['electricity_kwh', 'fuel_consumption', 'stove_usage_minutes', 'thermal_event_count'],
    acceptedDirect: {
      electricity_kwh: { qualification: 'QUALIFIED_CALCULATION_INPUT', role: 'PROJECT_ELECTRICITY_CONSUMPTION', notes: 'Commercial electricity meter input for VM0050 project energy use.' },
      fuel_consumption: { qualification: 'QUALIFIED_CALCULATION_INPUT', role: 'PROJECT_FUEL_CONSUMPTION', notes: 'Fuel-use reading for clean-cooking monitoring.' },
      stove_usage_minutes: { qualification: 'QUALIFIED_CALCULATION_INPUT', role: 'STOVE_USAGE', notes: 'Direct stove-use monitoring input where approved in the monitoring plan.' },
      thermal_event_count: { qualification: 'SUPPORTING_MONITORING_INPUT', role: 'STOVE_USAGE_CROSS_CHECK', notes: 'Thermal event proxy for stove-use corroboration.' },
    },
    acceptedSupporting: {
      pm1: { qualification: 'SUPPORTING_ENVIRONMENTAL_INPUT', role: 'IAQ_SUPPORTING_EVIDENCE', notes: 'Indoor air quality supporting evidence, not direct carbon quantification.' },
      pm2_5: { qualification: 'SUPPORTING_ENVIRONMENTAL_INPUT', role: 'IAQ_SUPPORTING_EVIDENCE', notes: 'PM2.5 supports indoor-air-quality and field-condition evidence only.' },
      pm10: { qualification: 'SUPPORTING_ENVIRONMENTAL_INPUT', role: 'IAQ_SUPPORTING_EVIDENCE', notes: 'PM10 supports indoor-air-quality evidence only.' },
      equivalent_co2: { qualification: 'SUPPORTING_EVIDENCE_ONLY', role: 'IAQ_SUPPORTING_EVIDENCE', notes: 'Equivalent CO2 is an indicator only, not project CO2e quantification.' },
      tvoc: { qualification: 'SUPPORTING_EVIDENCE_ONLY', role: 'IAQ_SUPPORTING_EVIDENCE', notes: 'TVOC supports environmental evidence only.' },
      temperature: { qualification: 'SUPPORTING_MONITORING_INPUT', role: 'FIELD_CONDITION_CROSS_CHECK', notes: 'Temperature can corroborate operating conditions.' },
      humidity: { qualification: 'SUPPORTING_MONITORING_INPUT', role: 'FIELD_CONDITION_CROSS_CHECK', notes: 'Humidity can corroborate operating conditions.' },
      pressure: { qualification: 'SUPPORTING_EVIDENCE_ONLY', role: 'FIELD_CONDITION_CONTEXT', notes: 'Pressure is contextual supporting evidence.' },
      sound: { qualification: 'SUPPORTING_MONITORING_INPUT', role: 'ACTIVITY_CROSS_CHECK', notes: 'Sound can support occupancy/activity context.' },
      voltage: { qualification: 'SUPPORTING_MONITORING_INPUT', role: 'DEVICE_HEALTH_CROSS_CHECK', notes: 'Voltage supports sensor/device health checks.' },
      current: { qualification: 'SUPPORTING_MONITORING_INPUT', role: 'DEVICE_HEALTH_CROSS_CHECK', notes: 'Current supports sensor/device health checks.' },
      battery_percent: { qualification: 'SUPPORTING_EVIDENCE_ONLY', role: 'DEVICE_HEALTH_CONTEXT', notes: 'Battery is device-health context only.' },
    },
    indirect: [
      {
        measurementCode: 'electricity_proxy',
        requiresAll: ['voltage', 'current'],
        qualification: 'SUPPORTING_MONITORING_INPUT',
        role: 'INDIRECT_ENERGY_PROXY',
        notes: 'Voltage and current together can indirectly corroborate energy-use activity, but do not replace a calibrated commercial meter unless approved.',
      },
      {
        measurementCode: 'stove_activity_proxy',
        requiresAny: ['temperature', 'pm2_5', 'sound'],
        qualification: 'SUPPORTING_MONITORING_INPUT',
        role: 'INDIRECT_STOVE_ACTIVITY_PROXY',
        notes: 'Environmental change can corroborate activity; it remains supporting evidence unless the methodology implementation approves it as a calculation input.',
      },
    ],
  },
};

function normalizeModel(model) {
  return String(model || '').trim().toLowerCase();
}

function normalizeParameter(parameter) {
  const raw = String(parameter || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '_');
  return PARAM_ALIASES[compact] || PARAM_ALIASES[compact.toLowerCase()] || compact.toLowerCase();
}

function unique(values) {
  return [...new Set(values.map(normalizeParameter).filter(Boolean))];
}

function modelMetadataKey(model) {
  return normalizeModel(model).split('-')[0].toUpperCase();
}

function deviceMeasuredParameters(device = {}) {
  const explicit = unique(device.datapoints || device.parameters || device.capabilities || []);
  if (explicit.length) return explicit;
  const metadata = sensorMetadata[modelMetadataKey(device.model)];
  return metadata ? unique(Object.keys(metadata)) : [];
}

function bestQualification(matches) {
  return matches.reduce((best, item) => {
    const currentRank = QUALIFICATION_RANK[item.qualification] || 0;
    const bestRank = QUALIFICATION_RANK[best] || 0;
    return currentRank > bestRank ? item.qualification : best;
  }, 'NOT_QUALIFIED');
}

function ruleMatches(selected, rules) {
  if (!rules) return [];
  const selectedSet = new Set(selected);
  const direct = Object.entries(rules.acceptedDirect || {})
    .filter(([code]) => selectedSet.has(code))
    .map(([measurementCode, meta]) => ({ measurementCode, source: 'methodology_direct', ...meta }));
  const supporting = Object.entries(rules.acceptedSupporting || {})
    .filter(([code]) => selectedSet.has(code))
    .map(([measurementCode, meta]) => ({ measurementCode, source: 'methodology_supporting', ...meta }));
  const indirect = (rules.indirect || [])
    .filter((item) => {
      if (item.requiresAll) return item.requiresAll.every((code) => selectedSet.has(code));
      if (item.requiresAny) return item.requiresAny.some((code) => selectedSet.has(code));
      return false;
    })
    .map((item) => ({ ...item, source: 'methodology_indirect' }));
  return [...direct, ...supporting, ...indirect];
}

async function catalogueMatches(model, selected, methodologyId, methodologyVersionId) {
  if (MRVSensorCapability.db.readyState !== 1) return [];
  let caps = [];
  try {
    caps = await MRVSensorCapability.find({ model: normalizeModel(model) }).lean();
  } catch (_) {
    return [];
  }
  const selectedSet = new Set(selected);
  return caps
    .filter((cap) => selectedSet.has(normalizeParameter(cap.measurementCode)))
    .flatMap((cap) => (cap.methodologyMappings || [])
      .filter((mapping) => mapping.methodologyId === methodologyId || mapping.methodologyVersionId === methodologyVersionId)
      .filter((mapping) => mapping.qualification && mapping.qualification !== 'NOT_QUALIFIED')
      .map((mapping) => ({
        measurementCode: normalizeParameter(cap.measurementCode),
        qualification: mapping.qualification,
        role: mapping.qualification,
        notes: mapping.notes || cap.description,
        source: 'catalogue',
        capabilityId: cap.capabilityId,
      })));
}

async function evaluateDeviceMethodologySuitability({ device, methodologyId, methodologyVersionId, selectedParameters }) {
  const model = normalizeModel(device?.model);
  const measuredParameters = deviceMeasuredParameters(device);
  const selected = unique(selectedParameters && selectedParameters.length ? selectedParameters : measuredParameters);
  const rules = METHOD_RULES[methodologyId] || null;
  const catalogue = await catalogueMatches(model, selected, methodologyId, methodologyVersionId);
  const derived = ruleMatches(selected, rules);
  const matches = [...catalogue, ...derived];
  const qualification = bestQualification(matches);
  const requiredAny = rules?.requiredAny || [];
  const hasCalculationInput = matches.some((item) => item.qualification === 'QUALIFIED_CALCULATION_INPUT');

  return {
    model,
    methodologyId,
    methodologyVersionId: methodologyVersionId || null,
    measuredParameters,
    selectedParameters: selected,
    defaultedSelection: !(selectedParameters && selectedParameters.length),
    qualification,
    qualified: qualification !== 'NOT_QUALIFIED',
    hasCalculationInput,
    matches,
    missingCalculationInputs: requiredAny.filter((code) => !selected.includes(code)),
    warnings: [
      !matches.length ? `No selected parameter on model ${model || 'unknown'} matches ${methodologyId}.` : null,
      matches.length && !hasCalculationInput ? 'Device is suitable as supporting MRV evidence, but not as a primary calculation input.' : null,
    ].filter(Boolean),
  };
}

module.exports = {
  evaluateDeviceMethodologySuitability,
  normalizeParameter,
  deviceMeasuredParameters,
};
