'use strict';
const MRVStandard = require('../../models/mrv/catalogue/MRVStandard.model');
const MRVStandardVersion = require('../../models/mrv/catalogue/MRVStandardVersion.model');
const MRVMethodology = require('../../models/mrv/catalogue/MRVMethodology.model');
const MRVMethodologyVersion = require('../../models/mrv/catalogue/MRVMethodologyVersion.model');
const MRVMethodologyImplementation = require('../../models/mrv/catalogue/MRVMethodologyImplementation.model');
const MRVSensorCapability = require('../../models/mrv/catalogue/MRVSensorCapability.model');

async function seedMRVCatalogue() {
  try {
    // ── Standard ──
    await MRVStandard.findOneAndUpdate(
      { standardId: 'VERRA-VCS' },
      { standardId: 'VERRA-VCS', name: 'Verified Carbon Standard', owner: 'Verra', programType: 'GHG_CREDITING', description: 'Verra VCS programme for GHG crediting', officialUrl: 'https://verra.org/programs/verified-carbon-standard/', status: 'ACTIVE' },
      { upsert: true, new: true }
    );

    // ── Standard Versions ──
    await MRVStandardVersion.findOneAndUpdate(
      { standardVersionId: 'VERRA-VCS-4.7' },
      { standardVersionId: 'VERRA-VCS-4.7', standardId: 'VERRA-VCS', version: '4.7', issuedAt: new Date('2023-01-01'), effectiveAt: new Date('2023-01-01'), transitionDeadline: new Date('2027-01-01'), status: 'TRANSITION', isDefault: false, notes: 'Active during transition period until 1 January 2027' },
      { upsert: true, new: true }
    );
    await MRVStandardVersion.findOneAndUpdate(
      { standardVersionId: 'VERRA-VCS-5.0' },
      { standardVersionId: 'VERRA-VCS-5.0', standardId: 'VERRA-VCS', version: '5.0', issuedAt: new Date('2025-12-16'), effectiveAt: new Date('2025-12-16'), corrections: [{ code: 'VCS-CC-2026-06-09', issuedAt: new Date('2026-06-09'), description: 'June 2026 corrections to VCS v5.0', required: true }], status: 'ACTIVE', isDefault: true, notes: 'Current active standard version — default for new projects' },
      { upsert: true, new: true }
    );
    console.log('✅ MRV Seed: Standard versions seeded');

    // ── Methodologies ──
    const methodologies = [
      { methodologyId: 'VERRA-VM0050', standardId: 'VERRA-VCS', name: 'Energy Efficiency and Fuel-Switch Measures in Cookstoves', shortCode: 'VM0050', activityTypes: ['CLEAN_COOKING', 'FUEL_SWITCH'], tier: 1, officialUrl: 'https://verra.org/methodologies/vm0050-energy-efficiency-and-fuel-switch-measures-in-cookstoves-v1-0/' },
      { methodologyId: 'VERRA-VM0051', standardId: 'VERRA-VCS', name: 'Improved Management in Rice Production Systems', shortCode: 'VM0051', activityTypes: ['RICE_MANAGEMENT'], tier: 1, officialUrl: 'https://verra.org/methodologies/improved-management-in-rice-production-systems/' },
      { methodologyId: 'VERRA-VM0042', standardId: 'VERRA-VCS', name: 'Improved Agricultural Land Management', shortCode: 'VM0042', activityTypes: ['AGRICULTURE'], tier: 1, officialUrl: 'https://verra.org/methodologies/vm0042-improved-agricultural-land-management-v2-2/' },
      { methodologyId: 'VERRA-VMR0018', standardId: 'VERRA-VCS', name: 'Methane Avoidance through Separation of Solids from Wastewater or Manure Treatment', shortCode: 'VMR0018', activityTypes: ['WASTEWATER'], tier: 1 },
      { methodologyId: 'VERRA-VM0044', standardId: 'VERRA-VCS', name: 'Biochar Utilization in Soil and Non-Soil Applications', shortCode: 'VM0044', activityTypes: ['BIOCHAR'], tier: 2, officialUrl: 'https://verra.org/methodologies/vm0044-biochar-utilization-in-soil-and-non-soil-applications-v1-2/' },
      { methodologyId: 'VERRA-VM0047', standardId: 'VERRA-VCS', name: 'Afforestation, Reforestation and Revegetation', shortCode: 'VM0047', activityTypes: ['FORESTRY'], tier: 2 },
      { methodologyId: 'VERRA-VM0033', standardId: 'VERRA-VCS', name: 'Tidal Wetland and Seagrass Restoration', shortCode: 'VM0033', activityTypes: ['WETLAND_RESTORATION'], tier: 2 },
      { methodologyId: 'VERRA-VMR0016', standardId: 'VERRA-VCS', name: 'Flaring or Use of Landfill Gas', shortCode: 'VMR0016', activityTypes: ['LANDFILL_GAS'], tier: 3 },
      { methodologyId: 'VERRA-VM0041', standardId: 'VERRA-VCS', name: 'Reduction of Enteric Methane Emissions from Ruminants', shortCode: 'VM0041', activityTypes: ['ENTERIC_METHANE'], tier: 3 },
      { methodologyId: 'VERRA-VM0032', standardId: 'VERRA-VCS', name: 'Adoption of Sustainable Grasslands through Adjustment of Fire and Grazing', shortCode: 'VM0032', activityTypes: ['GRASSLAND'], tier: 3 }
    ];
    for (const m of methodologies) {
      await MRVMethodology.findOneAndUpdate({ methodologyId: m.methodologyId }, m, { upsert: true, new: true });
    }
    console.log('✅ MRV Seed: Methodologies seeded');

    // ── Methodology Versions ──
    await MRVMethodologyVersion.findOneAndUpdate(
      { methodologyVersionId: 'VERRA-VM0050-1.0' },
      { methodologyVersionId: 'VERRA-VM0050-1.0', methodologyId: 'VERRA-VM0050', standardId: 'VERRA-VCS', version: '1.0', issuedAt: new Date('2023-01-01'), status: 'ACTIVE' },
      { upsert: true, new: true }
    );
    await MRVMethodologyVersion.findOneAndUpdate(
      { methodologyVersionId: 'VERRA-VM0051-1.0' },
      { methodologyVersionId: 'VERRA-VM0051-1.0', methodologyId: 'VERRA-VM0051', standardId: 'VERRA-VCS', version: '1.0', status: 'ACTIVE' },
      { upsert: true, new: true }
    );

    // ── VM0050 Implementation — IMPLEMENTATION_IN_DEVELOPMENT ──
    await MRVMethodologyImplementation.findOneAndUpdate(
      { implementationId: 'CC-VERRA-VM0050-1.0-1.0.0' },
      {
        implementationId: 'CC-VERRA-VM0050-1.0-1.0.0',
        methodologyVersionId: 'VERRA-VM0050-1.0',
        methodologyId: 'VERRA-VM0050',
        standardVersionId: 'VERRA-VCS-5.0',
        craftedClimateVersion: '1.0.0',
        status: 'IMPLEMENTATION_IN_DEVELOPMENT',
        mayCalculate: false,
        notes: 'VM0050 v1.0 implementation in development. mayCalculate will be set to true only after all 10 sign-off conditions are met.',
        requiresSignOffConditions: [
          'Winsen sensor exact model recorded in SensorModel',
          'Commercial energy meter selected',
          'Meter calibration documentation available',
          'First project site confirmed',
          'Stove and participant registries available',
          'Baseline procedures agreed',
          'Foovante-CraftedClimate responsibilities signed',
          'Ghana CMO pathway confirmed',
          'VVB readiness feedback obtained',
          'Reference calculations pass internal review'
        ]
      },
      { upsert: true, new: true }
    );
    console.log('✅ MRV Seed: VM0050 implementation seeded (IMPLEMENTATION_IN_DEVELOPMENT)');

    // ── Sensor Capabilities ──
    const capabilities = [
      { capabilityId: 'CAP-GAS-SOLO-ECO2', model: 'gas-solo', measurementCode: 'equivalent_co2', description: 'Gas Solo eCO2 indicator — NOT a direct CO2e measurement', unit: 'ppm', roles: ['CO_BENEFIT', 'USAGE_CROSS_CHECK'], prohibitedRoles: ['DIRECT_CO2E_QUANTIFICATION'], methodologyMappings: [{ methodologyVersionId: 'VERRA-VM0050-1.0', methodologyId: 'VERRA-VM0050', qualification: 'SUPPORTING_EVIDENCE_ONLY', notes: 'Gas Solo eCO2 is an indoor air quality indicator. Not used for direct tCO2e quantification under VM0050.' }] },
      { capabilityId: 'CAP-GAS-SOLO-TVOC', model: 'gas-solo', measurementCode: 'tvoc', unit: 'ppb', roles: ['CO_BENEFIT', 'SUPPORTING_EVIDENCE_ONLY'], prohibitedRoles: ['DIRECT_CO2E_QUANTIFICATION'], methodologyMappings: [{ methodologyVersionId: 'VERRA-VM0050-1.0', methodologyId: 'VERRA-VM0050', qualification: 'SUPPORTING_EVIDENCE_ONLY', notes: 'TVOC supports IAQ evidence only' }] },
      { capabilityId: 'CAP-ENV-PM25', model: 'env', measurementCode: 'pm2_5', unit: 'µg/m³', roles: ['CO_BENEFIT', 'SUPPORTING_EVIDENCE_ONLY'], prohibitedRoles: ['DIRECT_CO2E_QUANTIFICATION'], methodologyMappings: [] },
      { capabilityId: 'CAP-FLOW-VOLUME', model: 'flow', measurementCode: 'water_volume', unit: 'L', roles: ['QUALIFIED_CALCULATION_INPUT', 'SUPPORTING_MONITORING_INPUT'], prohibitedRoles: [], methodologyMappings: [{ methodologyVersionId: 'VERRA-VM0051-1.0', methodologyId: 'VERRA-VM0051', qualification: 'SUPPORTING_MONITORING_INPUT', notes: 'Water volume for irrigation monitoring' }] },
      { capabilityId: 'CAP-AQUA-DO', model: 'aqua', measurementCode: 'dissolved_oxygen', unit: 'mg/L', roles: ['SUPPORTING_EVIDENCE_ONLY', 'SUPPORTING_ENVIRONMENTAL_INPUT'], prohibitedRoles: ['DIRECT_CO2E_QUANTIFICATION'], methodologyMappings: [] },
      { capabilityId: 'CAP-MANUAL-ELECTRICITY', model: 'manual-meter', measurementCode: 'electricity_kwh', description: 'Commercial energy meter — manual reading, cumulative kWh', unit: 'kWh', roles: ['QUALIFIED_CALCULATION_INPUT'], prohibitedRoles: [], methodologyMappings: [{ methodologyVersionId: 'VERRA-VM0050-1.0', methodologyId: 'VERRA-VM0050', qualification: 'QUALIFIED_CALCULATION_INPUT', notes: 'Primary carbon quantification input for VM0050 when methodology is approved and meter is calibrated' }] }
    ];
    for (const cap of capabilities) {
      await MRVSensorCapability.findOneAndUpdate({ capabilityId: cap.capabilityId }, cap, { upsert: true, new: true });
    }
    console.log('✅ MRV Seed: Sensor capabilities seeded');
    console.log('✅ MRV Catalogue seeding complete');
  } catch (err) {
    console.error('❌ MRV Seed failed:', err.message);
  }
}

module.exports = { seedMRVCatalogue };
