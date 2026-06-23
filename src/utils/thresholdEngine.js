const Threshold = require('../models/threshold/threshold');
const User = require('../models/user/userModel');
const NotificationPreference = require('../models/notification/NotificationPreference');
const registerNewDevice = require('../models/devices/registerDevice');

const { sendSMS } = require("../config/sms/sms");
const { sendCCEmail } = require("../services/email/craftedClimateMailer");

// ======================================================
// 0️⃣ Resolve device owner & details (nickname + model)
// ======================================================
async function getDeviceInfoByAUID(auid) {
  const device = await registerNewDevice.findOne({ auid });

  if (!device) {
    console.warn(`No registered device found for AUID: ${auid}`);
    return null;
  }

  // Note: We return result matching previous "user" key structure for backward compat with sendAlerts logic below
  // But now we will implement smarter recipient logic in checkThresholds

  const owner = await User.findOne({ userid: device.userid }).select("email contact firstName lastName userid");

  return {
    user: owner, // Still needed for legacy referencing
    deviceObject: device, // Pass full device for collaborator access
    nickname: device.nickname || "Your Sensor",
    model: device.model,
  };
}



// ======================================================
// 1️⃣ Evaluate telemetry against threshold rules
// ======================================================
async function checkThresholds(auid, data) {
  try {
    const rules = await Threshold.find({ deviceAuid: auid, enabled: true });
    if (!rules.length) {
      console.log(`No enabled thresholds for device ${auid}`);
      return;
    }

    const info = await getDeviceInfoByAUID(auid);
    if (!info) return;

    const { user, nickname } = info;
    const now = Date.now();

    for (const rule of rules) {
      const key = rule.datapoint;
      const value = data[key];

      if (value === undefined || value === null) {
        // No value for this datapoint in current telemetry
        continue;
      }

      const triggered = evaluateRule(rule, value);
      if (!triggered) continue;

      // Cooldown (avoid spamming)
      const last = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).getTime() : 0;
      const nextAllowed = last + rule.cooldownMinutes * 60 * 1000;

      if (now < nextAllowed) {
        console.log(`Cooldown active for ${key} on ${nickname}. Skipping alert.`);
        continue;
      }

      // Update last triggered time
      rule.lastTriggeredAt = now;
      await rule.save();

      // Build messages
      const smsMessage = buildSMSMessage(nickname, rule, value);
      const emailMessage = buildEmailMessage(nickname, rule, value);

      // Send notifications (Expanded)
      await sendAlerts(user, info.deviceObject, rule, smsMessage, emailMessage);

      // Dispatch outgoing webhook event
      try {
        const webhookService = require('../services/webhook.service');
        const orgId = info.deviceObject.organizationId || info.deviceObject.organization;
        if (orgId) {
          webhookService.dispatch(orgId, 'threshold.breached', {
            deviceAuid: auid,
            deviceNickname: nickname,
            deviceModel: info.model,
            datapoint: rule.datapoint,
            value: value,
            operator: rule.operator,
            min: rule.min,
            max: rule.max,
            triggeredAt: new Date(now).toISOString()
          });
        }
      } catch (webhookErr) {
        console.error("Failed to dispatch threshold.breached webhook:", webhookErr.message);
      }

      console.log(`ALERT SENT for ${nickname} (${key}) → value=${value}`);
    }
  } catch (err) {
    console.error("Threshold Engine Error:", err.message);
  }
}



// ======================================================
// 2️⃣ Rule evaluation logic
// ======================================================
function evaluateRule(rule, value) {
  switch (rule.operator) {
    case ">":
      return value > rule.min;
    case ">=":
      return value >= rule.min;
    case "<":
      return value < rule.max;
    case "<=":
      return value <= rule.max;
    case "between":
      return value >= rule.min && value <= rule.max;
    case "outside":
      return value < rule.min || value > rule.max;
    default:
      return false;
  }
}



// ======================================================
// 3️⃣ Units map
// ======================================================
function getUnitForDatapoint(dp) {
  const unitMap = {
    // Air quality
    aqi: "",               // AQI index (unit-less)
    pm1: "ug/m3",
    pm2_5: "ug/m3",
    pm10: "ug/m3",

    // Environmental
    temperature: "°C",
    temperature_ambient: "°C",
    temperature_water: "°C",
    hum: "%",             // legacy key
    humidity: "%",        // preferred key
    pressure: "hPa",
    altitude: "m",
    uv: "",               // UV index
    lux: "lux",
    sound: "dB",

    // Power / electronics
    battery: "%",         // remaining battery
    voltage: "V",
    current: "A",

    // Gas / air chemistry
    eco2_ppm: "ppm",
    tvoc_ppb: "ppb",

    // Water quality
    ph: "",
    ec: "uS/cm",
    turbidity: "NTU",

    // Soil / agriculture
    waterTemp: "°C",
    soilTemp: "°C",
    moisture: "%",
    npk_n: "mg/kg",
    npk_p: "mg/kg",
    npk_k: "mg/kg",

    // Flow / Pump
    tank_mm: "mm",
    tank_l: "L",
    tank_percentage: "%",
    bat_ma: "mA",
    bat_mw: "mW",

    // Pump Session
    ps_duration: "s",
    ps_avg_ma: "mA",
    ps_avg_mw: "mW",
    ps_min_v: "V",
    ps_max_v: "V",
    ps_samples: ""
  };

  return unitMap[dp] || "";
}



// ======================================================
// 4️⃣ Pretty datapoint names
// ======================================================
function prettyName(dp) {
  const map = {
    pm2_5: "PM2.5",
    pm10: "PM10",
    pm1: "PM1",
    hum: "Humidity",
    humidity: "Humidity",
    temperature: "Temperature",
    temperature_ambient: "Ambient Temperature",
    temperature_water: "Water Temperature",
    aqi: "Air Quality Index",
    uv: "UV Index",
    lux: "Light Intensity",
    sound: "Sound Level",
    pressure: "Pressure",
    altitude: "Altitude",
    battery: "Battery Level",
    voltage: "Voltage",
    current: "Current",

    eco2_ppm: "eCO₂",
    tvoc_ppb: "TVOC",

    ph: "pH",
    ec: "Electrical Conductivity",
    turbidity: "Turbidity",

    waterTemp: "Water Temperature",
    soilTemp: "Soil Temperature",
    moisture: "Soil Moisture",
    npk_n: "Nitrogen (N)",
    npk_p: "Phosphorus (P)",
    npk_k: "Potassium (K)",

    // Flow / Pump
    tank_mm: "Tank Height",
    tank_l: "Tank Volume",
    tank_percentage: "Tank Percentage",
    bat_ma: "Battery Current",
    bat_mw: "Battery Power",
    sensor_ok: "Sensor Health",
    sleeping: "Sleep Mode",
    pump: "Pump Active",
    manual: "Manual Mode",

    // Pump Session
    ps_duration: "Session Duration",
    ps_avg_ma: "Session Avg Current",
    ps_avg_mw: "Session Avg Power",
    ps_min_v: "Session Min Voltage",
    ps_max_v: "Session Max Voltage",
    ps_samples: "Session Samples"
  };

  return map[dp] || dp.toUpperCase();
}



// ======================================================
// 5️⃣ SMS Message (Plain text – NO emojis, NO bold)
// ======================================================
function buildSMSMessage(nickname, rule, value) {
  const dp = prettyName(rule.datapoint);
  const unit = getUnitForDatapoint(rule.datapoint);

  const valueStr = unit ? `${value} ${unit}` : `${value}`;
  const minStr = rule.min !== undefined && rule.min !== null
    ? unit ? `${rule.min} ${unit}` : `${rule.min}`
    : null;
  const maxStr = rule.max !== undefined && rule.max !== null
    ? unit ? `${rule.max} ${unit}` : `${rule.max}`
    : null;

  let condition = "";

  switch (rule.operator) {
    case ">":
      condition = minStr ? `has gone above ${minStr}` : "is higher than your set limit";
      break;
    case ">=":
      condition = minStr ? `has reached or gone above ${minStr}` : "has reached your set limit";
      break;
    case "<":
      condition = maxStr ? `has dropped below ${maxStr}` : "is lower than your set limit";
      break;
    case "<=":
      condition = maxStr ? `is at or below ${maxStr}` : "is at or below your set limit";
      break;
    case "between":
      condition = minStr && maxStr
        ? `is between ${minStr} and ${maxStr}`
        : "is within your set range";
      break;
    case "outside":
      condition = minStr && maxStr
        ? `is outside the safe range of ${minStr} to ${maxStr}`
        : "is outside your set range";
      break;
  }

  return `ALERT from ${nickname}\n${dp} is currently ${valueStr} and ${condition}.`;
}



// ======================================================
// 6️⃣ Email Message (HTML allowed, units included)
// ======================================================
function buildEmailMessage(nickname, rule, value) {
  const dp = prettyName(rule.datapoint);
  const unit = getUnitForDatapoint(rule.datapoint);

  const valueStr = unit ? `${value} ${unit}` : `${value}`;
  const minStr = rule.min !== undefined && rule.min !== null
    ? unit ? `${rule.min} ${unit}` : `${rule.min}`
    : null;
  const maxStr = rule.max !== undefined && rule.max !== null
    ? unit ? `${rule.max} ${unit}` : `${rule.max}`
    : null;

  let condition = "";

  switch (rule.operator) {
    case ">":
      condition = minStr
        ? `has gone above <b>${minStr}</b>`
        : "is higher than your set limit";
      break;
    case ">=":
      condition = minStr
        ? `has reached or gone above <b>${minStr}</b>`
        : "has reached your set limit";
      break;
    case "<":
      condition = maxStr
        ? `has dropped below <b>${maxStr}</b>`
        : "is lower than your set limit";
      break;
    case "<=":
      condition = maxStr
        ? `is at or below <b>${maxStr}</b>`
        : "is at or below your set limit";
      break;
    case "between":
      condition = minStr && maxStr
        ? `is between <b>${minStr}</b> and <b>${maxStr}</b>`
        : "is within your set range";
      break;
    case "outside":
      condition = minStr && maxStr
        ? `is outside the safe range of <b>${minStr}</b> to <b>${maxStr}</b>`
        : "is outside your set range";
      break;
  }

  return `
    <p><strong>ALERT from ${nickname}</strong></p>
    <p>${dp} is currently <b>${valueStr}</b>, which ${condition}.</p>
  `;
}



// ======================================================
// 7️⃣ Send Alerts (Email + SMS)
// ======================================================
// ======================================================
// 7️⃣ Send Alerts (Email + SMS)
// ======================================================
async function sendAlerts(owner, device, rule, smsMessage, emailMessage) {
  try {
    // 0. Global Check: Is notification enabled for this sensor?
    if (device.notificationPreferences?.enabled === false) {
      console.log(`[ThresholdEngine] All notifications disabled for device ${device.auid}`);
      return;
    }

    const recipients = new Set();
    const smsRecipients = new Set();

    /**
     * Helper to add user to recipient lists if their personal preferences allow it.
     */
    const addUserIfAllowed = async (userId, email, contact) => {
      if (!userId) return;

      const prefs = await NotificationPreference.findOne({ userid: userId });

      // Check if this specific device is muted for this user
      // Note: Using device.auid as the canonical internal identifier for muting
      if (prefs && prefs.mutedDevices && (prefs.mutedDevices.includes(device.auid) || prefs.mutedDevices.includes(device.devid))) {
        console.log(`[ThresholdEngine] Alert suppressed: Device ${device.auid} is muted for user ${userId}`);
        return;
      }

      // Check Email Channel
      if (rule.alertChannels?.email) {
        const emailEnabled = prefs ? prefs.preferences?.email?.enabled !== false : true;
        if (emailEnabled && email) recipients.add(email);
      }

      // Check SMS Channel (Mapped to push preference currently)
      if (rule.alertChannels?.sms) {
        const smsEnabled = prefs ? prefs.preferences?.push?.enabled !== false : true;
        if (smsEnabled && contact) smsRecipients.add(contact);
      }
    };

    // 1. Add Owner
    if (owner) {
      await addUserIfAllowed(owner.userid, owner.email, owner.contact);
    }

    // 2. Add Explicit Recipients from Preferences (Custom list - usually emails only)
    if (device.notificationPreferences?.recipients?.length > 0) {
      device.notificationPreferences.recipients.forEach(e => recipients.add(e));
    }

    // 3. Add Collaborators (Admins/Support/with Alert permissions)
    if (device.collaborators && device.collaborators.length > 0) {
      for (const collab of device.collaborators) {
        const isEligible = ['device-admin', 'device-support'].includes(collab.role) ||
          collab.permissions?.includes('alerts');

        if (isEligible) {
          const u = await User.findOne({ userid: collab.userid }).select("userid email contact");
          if (u) {
            await addUserIfAllowed(u.userid, u.email, u.contact);
          }
        }
      }
    }

    // 4. Send Emails
    if (recipients.size > 0) {
      console.log(`Sending email alert for ${device.auid} to ${recipients.size} recipients...`);
      for (const email of recipients) {
        sendCCEmail({
          type: 'notification.generic',
          to: email,
          vars: {
            title: `Sensor Alert: ${device.nickname || device.auid}`,
            bodyHtml: emailMessage,
            theme: 'warning',
            category: 'Device Alert',
            actionUrl: `${process.env.APP_URL || 'https://console.craftedclimate.co'}/devices/${device.auid}`,
            actionLabel: 'View Device',
            transactional: true
          }
        }).catch(e => console.error('[ThresholdEngine] Email failed:', e.message));
      }
    }

    // 5. Send SMS
    if (smsRecipients.size > 0) {
      console.log(`Sending SMS alert for ${device.auid} to ${smsRecipients.size} contacts...`);
      for (const contact of smsRecipients) {
        sendSMS(contact, smsMessage).catch(e => console.error(e.message));
      }
    }

  } catch (err) {
    console.error("Alert Send Error:", err.message);
  }
}



// ======================================================
// EXPORTS
// ======================================================
module.exports = {
  checkThresholds,
  getDeviceInfoByAUID,
  // exporting helpers can be handy for unit tests
  evaluateRule,
  prettyName,
  getUnitForDatapoint,
};
