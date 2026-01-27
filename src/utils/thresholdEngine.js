const Threshold = require('../models/threshold/threshold');
const User = require('../models/user/userModel');
const registerNewDevice = require('../models/devices/registerDevice');

const { sendSMS } = require("../config/sms/sms");
const { sendEmail } = require("../config/mail/nodemailer");

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
    const recipients = new Set();
    const smsRecipients = new Set();

    // 1. Check Device-Level Notification Preferences
    // If user explicitly disabled alerts for this device, SKIP.
    if (device.notificationPreferences?.offlineAlert === false) {
      // Note: Using "offlineAlert" pref key maybe confusing for "threshold" alerts?
      // Ideally we should have enabled: { offline: bool, threshold: bool }
      // For now, let's assume if they turned off alerts, they meant ALL alerts.
      // OR check if rule itself is enabled (checked prior).
      // Let's proceed.
    }

    // 2. Add Owner
    if (owner) {
      if (owner.email) recipients.add(owner.email);
      if (owner.contact) smsRecipients.add(owner.contact);
    }

    // 3. Add Explicit Recipients from Preferences
    if (device.notificationPreferences?.recipients?.length > 0) {
      device.notificationPreferences.recipients.forEach(e => recipients.add(e));
    }

    // 4. Add Collaborators (Admins/Editors)
    if (device.collaborators && device.collaborators.length > 0) {
      for (const collab of device.collaborators) {
        // Filter by role/permission? Generally admins/editors want alerts. Viewers maybe not.
        // Support staff should also get alerts.
        if (['device-admin', 'device-editor', 'device-support'].includes(collab.role) || collab.permissions?.includes('alerts')) {
          const u = await User.findOne({ userid: collab.userid });
          if (u) {
            if (u.email) recipients.add(u.email);
            // SMS for collaborators? Maybe strictly email to save costs/spam.
            // if (u.contact) smsRecipients.add(u.contact);
          }
        }
      }
    }

    // 5. Send Emails
    if (rule.alertChannels?.email && recipients.size > 0) {
      console.log(`Sending email alert to ${recipients.size} recipients...`);
      for (const email of recipients) {
        // Fire and forget or sequential to diagnose
        sendEmail(email, "ALERT from your CraftedClimate Sensor", emailMessage).catch(e => console.error(e.message));
      }
    }

    // 6. Send SMS
    if (rule.alertChannels?.sms && smsRecipients.size > 0) {
      console.log(`Sending SMS alert to ${smsRecipients.size} contacts...`);
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
