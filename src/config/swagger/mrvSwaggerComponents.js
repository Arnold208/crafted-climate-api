'use strict';
/**
 * MRV Engine — Swagger/OpenAPI Component Schemas
 *
 * All MRV schemas are defined here as JSDoc comments and picked up
 * by swagger-jsdoc via the `apis` glob in swaggerOptions.js.
 *
 * Reference any schema with: $ref: '#/components/schemas/SchemaName'
 */

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     # ─── CATALOGUE ──────────────────────────────────────────────────────
 *
 *     MRVStandard:
 *       type: object
 *       properties:
 *         standardId: { type: string, example: VERRA-VCS }
 *         name: { type: string, example: Verified Carbon Standard }
 *         owner: { type: string, example: Verra }
 *         programType: { type: string, enum: [GHG_CREDITING, GHG_REMOVAL, CO_BENEFIT, ENVIRONMENTAL_COMMODITY] }
 *         status: { type: string, enum: [ACTIVE, INACTIVE, ARCHIVED] }
 *         officialUrl: { type: string }
 *
 *     MRVStandardVersion:
 *       type: object
 *       properties:
 *         standardVersionId: { type: string, example: VERRA-VCS-5.0 }
 *         standardId: { type: string, example: VERRA-VCS }
 *         version: { type: string, example: '5.0' }
 *         status: { type: string, enum: [ACTIVE, TRANSITION, SUPERSEDED, WITHDRAWN] }
 *         isDefault: { type: boolean }
 *         effectiveAt: { type: string, format: date-time }
 *         transitionDeadline: { type: string, format: date-time }
 *
 *     MRVMethodology:
 *       type: object
 *       properties:
 *         methodologyId: { type: string, example: VERRA-VM0050 }
 *         standardId: { type: string, example: VERRA-VCS }
 *         name: { type: string }
 *         shortCode: { type: string, example: VM0050 }
 *         activityTypes: { type: array, items: { type: string } }
 *         status: { type: string, enum: [ACTIVE, WITHDRAWN, ARCHIVED] }
 *
 *     MRVMethodologyImplementation:
 *       type: object
 *       properties:
 *         implementationId: { type: string, example: CC-VERRA-VM0050-1.0-1.0.0 }
 *         methodologyVersionId: { type: string }
 *         craftedClimateVersion: { type: string }
 *         status: { type: string, enum: [CATALOGUED, REQUIREMENTS_MAPPING, IMPLEMENTATION_IN_DEVELOPMENT, INTERNAL_REVIEW, INTERNALLY_TESTED, APPROVED_FOR_PROJECT_DESIGN, SUSPENDED, SUPERSEDED, RETIRED] }
 *         mayCalculate: { type: boolean }
 *         requiresSignOffConditions: { type: array, items: { type: string } }
 *
 *     MRVSensorCapability:
 *       type: object
 *       properties:
 *         capabilityId: { type: string }
 *         model: { type: string, enum: [env, aqua, gas-solo, flow, terra, manual-meter, other] }
 *         measurementCode: { type: string }
 *         unit: { type: string }
 *         roles: { type: array, items: { type: string } }
 *         prohibitedRoles: { type: array, items: { type: string } }
 *         methodologyMappings:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               methodologyVersionId: { type: string }
 *               qualification: { type: string }
 *               notes: { type: string }
 *
 *     # ─── PROJECT ────────────────────────────────────────────────────────
 *
 *     MRVProject:
 *       type: object
 *       properties:
 *         projectId: { type: string, example: CC-CLEA-XXXXXXX }
 *         organizationId: { type: string }
 *         name: { type: string }
 *         description: { type: string }
 *         activityType: { type: string, enum: [CLEAN_COOKING, RICE_MANAGEMENT, AGRICULTURE, WASTEWATER, BIOCHAR, FORESTRY, WETLAND_RESTORATION, GRASSLAND, LANDFILL_GAS, ENTERIC_METHANE, OTHER] }
 *         claimType: { type: string, enum: [GHG_REDUCTION, GHG_REMOVAL, CO_BENEFIT, ENVIRONMENTAL_COMMODITY] }
 *         status: { type: string, enum: [SANDBOX, CANDIDATE, APPLICABILITY_REVIEW, LEGAL_REVIEW, READY_FOR_MONITORING, MONITORING, CALCULATION, VVB_VERIFICATION, VERRA_REVIEW, ISSUANCE_COMPLETE, PROJECT_CLOSED, WITHDRAWN, SUSPENDED] }
 *         sandboxFlag: { type: boolean }
 *         selectedStandardVersionId: { type: string, example: VERRA-VCS-5.0 }
 *         country: { type: string, example: GH }
 *         createdAt: { type: string, format: date-time }
 *
 *     CreateProjectRequest:
 *       type: object
 *       required: [name, activityType, claimType, organizationId]
 *       properties:
 *         name: { type: string, example: Foovante Clean Cooking Project Ghana }
 *         description: { type: string }
 *         activityType: { type: string, enum: [CLEAN_COOKING, RICE_MANAGEMENT, AGRICULTURE, WASTEWATER, BIOCHAR, FORESTRY, WETLAND_RESTORATION, GRASSLAND, LANDFILL_GAS, ENTERIC_METHANE, OTHER], example: CLEAN_COOKING }
 *         claimType: { type: string, enum: [GHG_REDUCTION, GHG_REMOVAL, CO_BENEFIT, ENVIRONMENTAL_COMMODITY], example: GHG_REDUCTION }
 *         organizationId: { type: string, example: org-abc123 }
 *         sandboxFlag: { type: boolean, default: false, description: "Set true for SANDBOX_NON_CREDITING development projects" }
 *         sandboxNote: { type: string, example: Software development and testing — non-crediting }
 *         selectedStandardVersionId: { type: string, default: VERRA-VCS-5.0, description: "VCS version to lock for this project. Immutable after creation." }
 *         country: { type: string, default: GH, example: GH }
 *         region: { type: string, example: Greater Accra }
 *         projectStart: { type: string, format: date, example: '2025-01-01' }
 *
 *     MRVSite:
 *       type: object
 *       properties:
 *         siteId: { type: string }
 *         projectId: { type: string }
 *         name: { type: string }
 *         siteType: { type: string, example: KITCHEN }
 *         address: { type: string }
 *         status: { type: string, enum: [ACTIVE, INACTIVE, REMOVED] }
 *
 *     CreateSiteRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name: { type: string, example: Household Site 1 - Accra }
 *         description: { type: string }
 *         siteType: { type: string, enum: [KITCHEN, FARM, FACILITY, HOUSEHOLD], example: KITCHEN }
 *         address: { type: string }
 *         region: { type: string }
 *         country: { type: string, default: GH }
 *         location:
 *           type: object
 *           properties:
 *             type: { type: string, default: Point }
 *             coordinates: { type: array, items: { type: number }, example: [-0.186964, 5.603717], description: "[longitude, latitude]" }
 *         attributes: { type: object, description: "Dynamic site-specific attributes (stove count, household size, etc.)" }
 *
 *     MRVProjectPartner:
 *       type: object
 *       properties:
 *         partnerId: { type: string }
 *         projectId: { type: string }
 *         organizationName: { type: string }
 *         roles: { type: array, items: { type: string } }
 *         agreementStatus: { type: string }
 *
 *     CreatePartnerRequest:
 *       type: object
 *       required: [organizationName, roles]
 *       properties:
 *         organizationName: { type: string, example: Foovante Global }
 *         internalOrganizationId: { type: string }
 *         roles:
 *           type: array
 *           items: { type: string, enum: [PROJECT_DEVELOPER, REGULATORY_COORDINATION, CARBON_MARKET_COORDINATION, STAKEHOLDER_ENGAGEMENT, DMRV_PLATFORM_PROVIDER, SENSOR_PROVIDER, DATA_PROCESSING_PROVIDER, CALCULATION_SUPPORT, REPORTING_SUPPORT, PROJECT_OWNER, CARBON_RIGHTS_HOLDER, VVB, LABORATORY] }
 *           example: [PROJECT_DEVELOPER, STAKEHOLDER_ENGAGEMENT]
 *         agreementStatus: { type: string, enum: [NOT_STARTED, DRAFT, UNDER_REVIEW, EXECUTED, TERMINATED], default: NOT_STARTED }
 *         contacts:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               role: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *         epaRelationshipType: { type: string, example: EPA_AIR_QUALITY_DATA_PARTNERSHIP }
 *         epaRelationshipNote: { type: string, example: "Data partnership with EPA Ghana — NOT a carbon-market approval" }
 *         notes: { type: string }
 *
 *     # ─── MONITORING ─────────────────────────────────────────────────────
 *
 *     MonitoringPeriod:
 *       type: object
 *       properties:
 *         monitoringPeriodId: { type: string }
 *         projectId: { type: string }
 *         name: { type: string }
 *         startDate: { type: string, format: date-time }
 *         endDate: { type: string, format: date-time }
 *         status: { type: string, enum: [DRAFT, OPEN, CLOSED, CALCULATION_IN_PROGRESS, CALCULATION_COMPLETE, CALCULATION_APPROVED, SUBMITTED, VERIFIED] }
 *         completenessSnapshot:
 *           type: object
 *           properties:
 *             total: { type: integer }
 *             accepted: { type: integer }
 *             quarantined: { type: integer }
 *             completenessRatio: { type: number }
 *
 *     CreateMonitoringPeriodRequest:
 *       type: object
 *       required: [startDate, endDate]
 *       properties:
 *         name: { type: string, example: Monitoring Period 1 - Q1 2026 }
 *         startDate: { type: string, format: date, example: '2026-01-01' }
 *         endDate: { type: string, format: date, example: '2026-03-31' }
 *         assignmentId: { type: string, description: "Methodology assignment ID to link" }
 *
 *     # ─── EVIDENCE ───────────────────────────────────────────────────────
 *
 *     TelemetryReceipt:
 *       type: object
 *       properties:
 *         receiptId: { type: string }
 *         ingestionId: { type: string }
 *         idempotencyKey: { type: string }
 *         devid: { type: string }
 *         auid: { type: string }
 *         model: { type: string }
 *         transport: { type: string, enum: [notehub-mqtt, socketio, http-ingest, manual] }
 *         receivedAt: { type: string, format: date-time }
 *         observedAt: { type: string, format: date-time, nullable: true }
 *         clockQuality: { type: string }
 *         status: { type: string, enum: [PENDING, STORED, OBSERVATION_CREATED, VALIDATED, DUPLICATE, UNRESOLVED, QUARANTINED, FAILED] }
 *         retentionClass: { type: string, enum: [OPERATIONAL, MRV] }
 *
 *     MRVObservation:
 *       type: object
 *       properties:
 *         observationId: { type: string }
 *         receiptId: { type: string }
 *         projectId: { type: string }
 *         monitoringPeriodId: { type: string }
 *         auid: { type: string }
 *         model: { type: string }
 *         observedAt: { type: string, format: date-time, nullable: true }
 *         measurements: { type: object, description: "Dynamic measurement key-value pairs" }
 *         qualityStatus: { type: string, enum: [PENDING, ACCEPTED, ACCEPTED_WITH_WARNING, QUARANTINED, REJECTED, MANUALLY_APPROVED, SUBSTITUTED, SUPERSEDED, VOIDED] }
 *         qualityWarnings: { type: array, items: { type: string } }
 *         qualificationResults: { type: array, items: { type: object } }
 *
 *     ManualObservationRequest:
 *       type: object
 *       required: [parameterId, value, unit, observedAt, sourceType]
 *       properties:
 *         parameterId: { type: string, example: VERRA-VM0050-PARAM-PROJECT-ELECTRICITY-CONSUMPTION }
 *         parameterName: { type: string, example: Project electricity consumption }
 *         value: { type: number, example: 125.4 }
 *         unit: { type: string, example: kWh }
 *         observedAt: { type: string, format: date-time, example: '2026-01-15T08:00:00Z' }
 *         sourceType: { type: string, enum: [MANUAL_METER_READING, MANUAL_SURVEY, MANUAL_LOG, MANUAL_KEY_VALUE, CALCULATED], example: MANUAL_METER_READING }
 *         readingType: { type: string, enum: [CUMULATIVE, INCREMENTAL, INSTANTANEOUS], default: INSTANTANEOUS }
 *         monitoringPeriodId: { type: string }
 *         siteId: { type: string }
 *         meterAssetId: { type: string, example: METER-001 }
 *         previousReadingId: { type: string, description: "For cumulative: link to previous reading record" }
 *         previousValue: { type: number }
 *         notes: { type: string }
 *         attributes: { type: object, description: "Any extra key-value metadata" }
 *
 *     SensorInstallationRequest:
 *       type: object
 *       required: [auid, validFrom]
 *       properties:
 *         auid: { type: string, example: dev-00001 }
 *         siteId: { type: string }
 *         devid: { type: string }
 *         model: { type: string, example: gas-solo }
 *         validFrom: { type: string, format: date-time, example: '2026-01-01T00:00:00Z' }
 *         validTo: { type: string, format: date-time }
 *         coordinates: { type: array, items: { type: number }, example: [-0.186964, 5.603717] }
 *         positionDescription: { type: string, example: "Installed 1m above cooking area" }
 *         approvedFirmwareVersions: { type: array, items: { type: string }, example: ['1.0.0', '1.1.0'] }
 *         expectedFrequencySeconds: { type: integer, example: 300 }
 *
 *     CalibrationRecordRequest:
 *       type: object
 *       required: [auid, channel, validFrom]
 *       properties:
 *         auid: { type: string }
 *         devid: { type: string }
 *         channel: { type: string, example: electricity_kwh }
 *         method: { type: string, example: Factory calibration }
 *         laboratory: { type: string }
 *         calibratedAt: { type: string, format: date-time }
 *         validFrom: { type: string, format: date-time }
 *         validTo: { type: string, format: date-time }
 *         accuracyClass: { type: string, example: 0.5 }
 *         unit: { type: string, example: kWh }
 *         rangeMin: { type: number }
 *         rangeMax: { type: number }
 *         traceabilityStandard: { type: string }
 *         certificateEvidenceId: { type: string }
 *         nextCalibrationDue: { type: string, format: date-time }
 *         notes: { type: string }
 *
 *     # ─── ASSURANCE ──────────────────────────────────────────────────────
 *
 *     VerificationCase:
 *       type: object
 *       properties:
 *         caseId: { type: string }
 *         projectId: { type: string }
 *         scope: { type: string, enum: [VALIDATION, VERIFICATION, COMBINED] }
 *         status: { type: string, enum: [OPEN, FINDINGS_RAISED, RESPONSES_SUBMITTED, OPINION_RECORDED, CLOSED] }
 *         vvbOrganizationName: { type: string }
 *         findings: { type: array, items: { type: string } }
 *         verificationOpinion: { type: object }
 *
 *     CreateVerificationCaseRequest:
 *       type: object
 *       required: [scope]
 *       properties:
 *         scope: { type: string, enum: [VALIDATION, VERIFICATION, COMBINED], example: VALIDATION }
 *         vvbOrganizationName: { type: string, example: Bureau Veritas }
 *         vvbContactName: { type: string }
 *         vvbContactEmail: { type: string, format: email }
 *         reportId: { type: string }
 *         calculationRunId: { type: string }
 *
 *     CreateFindingRequest:
 *       type: object
 *       required: [severity, description]
 *       properties:
 *         severity: { type: string, enum: [MINOR, MAJOR, CORRECTIVE_ACTION_REQUEST, FORWARD_ACTION_REQUEST, OBSERVATION], example: CORRECTIVE_ACTION_REQUEST }
 *         category: { type: string, example: Data Quality }
 *         description: { type: string, example: "Missing calibration certificate for electricity meter METER-001" }
 *         affectedEntities: { type: array, items: { type: string } }
 *
 *     RegistryEventRequest:
 *       type: object
 *       required: [registry, eventType, eventDate]
 *       properties:
 *         registry: { type: string, enum: [VERRA_VCS, GHANA_CMO, GOLD_STANDARD, CDM, OTHER], example: VERRA_VCS }
 *         eventType: { type: string, enum: [PROJECT_REGISTRATION_SUBMITTED, PROJECT_REGISTRATION_APPROVED, VALIDATION_REPORT_SUBMITTED, VALIDATION_COMPLETED, MONITORING_REPORT_SUBMITTED, VERIFICATION_COMPLETED, VCU_ISSUANCE_REQUESTED, VCU_ISSUED, CMO_AUTHORISATION_SUBMITTED, CMO_AUTHORISATION_GRANTED, PROJECT_CLOSED, OTHER], example: PROJECT_REGISTRATION_SUBMITTED }
 *         eventDate: { type: string, format: date, example: '2026-06-18' }
 *         description: { type: string }
 *         externalRef: { type: string, example: VCS-2026-GH-001 }
 *         evidenceIds: { type: array, items: { type: string } }
 *
 *     # ─── INGEST ─────────────────────────────────────────────────────────
 *
 *     TelemetryIngestRequest:
 *       type: object
 *       required: [devid, devmod]
 *       properties:
 *         devid: { type: string, example: dev:000000000000001 }
 *         devmod: { type: string, enum: [ENV, AQUA, GAS-SOLO, FLOW], example: GAS-SOLO }
 *         auid: { type: string, description: "Logical device ID (resolved from device registry)" }
 *         ts: { type: integer, description: "Unix timestamp in seconds", example: 1750204800 }
 *         event: { type: string, format: uuid, description: "Unique event UUID for idempotency" }
 *         seq: { type: integer, description: "Device sequence number" }
 *         version: { type: string, description: "Firmware version", example: '1.1.0' }
 *         organizationId: { type: string }
 *         projectIds: { type: array, items: { type: string } }
 *         body:
 *           type: object
 *           description: "Sensor-specific payload"
 *           example:
 *             equivalent_co2: 850
 *             tvoc: 120
 *             temperature: 28.5
 *             humidity: 65.2
 *             battery: 87
 *
 *     # ─── COMMON RESPONSES ───────────────────────────────────────────────
 *
 *     MRVSuccessResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: true }
 *         data: { type: object }
 *
 *     MRVListResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: true }
 *         data: { type: array, items: { type: object } }
 *         pagination:
 *           type: object
 *           properties:
 *             page: { type: integer }
 *             limit: { type: integer }
 *             total: { type: integer }
 *
 *     MRVError400:
 *       type: object
 *       properties:
 *         error: { type: string, example: "name, activityType, claimType, organizationId are required" }
 *
 *     MRVError401:
 *       type: object
 *       properties:
 *         error: { type: string, example: Unauthorized }
 *
 *     MRVError403:
 *       type: object
 *       properties:
 *         error: { type: string, example: "You do not have MRV project access. Contact the project manager." }
 *
 *     MRVError404:
 *       type: object
 *       properties:
 *         error: { type: string, example: MRV project not found }
 *
 *     MRVError409:
 *       type: object
 *       properties:
 *         error: { type: string, example: "Cannot hard-delete telemetry for device: MRV-retained evidence records exist" }
 */

// This file only contains JSDoc for swagger-jsdoc — no runtime exports needed.
