const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const scheduleSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4() },
    name: { type: String, default: "Irrigation Schedule" },
    startTime: { type: String, required: true }, // HH:mm
    durationMinutes: { type: Number, required: true },
    days: {
        type: [String],
        enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        required: true
    },
    enabled: { type: Boolean, default: true },
}, { _id: false });

const flowConfigSchema = new mongoose.Schema({
    auid: { type: String, required: true, unique: true },
    devid: { type: String, required: true },

    // Desired State (Shadow)
    desiredState: {
        pump: { type: Boolean, default: false },
        mode: { type: String, enum: ["AUTO", "MANUAL"], default: "AUTO" }
    },

    // Irrigation Schedules
    schedules: [scheduleSchema],

    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

flowConfigSchema.index({ auid: 1 });

module.exports = mongoose.model('FlowConfig', flowConfigSchema);
