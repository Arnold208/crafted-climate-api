const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  siteId: { type: String, required: true, unique: true },
  projectId: { type: String, required: true }, // indexed via schema.index() below
  organizationId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  siteType: { type: String }, // 'KITCHEN', 'FARM', 'FACILITY', 'HOUSEHOLD'
  // GeoJSON centroid — single point representing the site centre
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] } // [lng, lat]
  },
  // GeoJSON boundary — supports Polygon OR MultiPolygon for non-contiguous sites
  // MultiPolygon example: households in two separate neighbourhoods
  boundary: {
    type: { type: String, enum: ['Polygon', 'MultiPolygon', 'GeometryCollection'], default: 'Polygon' },
    coordinates: { type: mongoose.Schema.Types.Mixed } // flexible: [[ring]] or [[[ring1],[ring2]]]
  },
  // Named sub-zones within a site (e.g. Village A, Village B within one project site)
  subZones: [{
    name: { type: String },
    description: { type: String },
    boundary: {
      type: { type: String, enum: ['Polygon', 'MultiPolygon'], default: 'Polygon' },
      coordinates: { type: mongoose.Schema.Types.Mixed }
    },
    _id: false
  }],
  address: { type: String },
  region: { type: String },
  country: { type: String, default: 'GH' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'REMOVED'], default: 'ACTIVE' },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} }, // dynamic site-specific attributes
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
}, { versionKey: false });
schema.index({ projectId: 1 });
module.exports = mongoose.model('MRVSite', schema, 'mrvSites');
