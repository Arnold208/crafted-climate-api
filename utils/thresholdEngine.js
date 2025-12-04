const Threshold = require("../model/threshold/threshold");
const User = require("../model/user/userModel");
const registerNewDevice = require("../model/devices/registerDevice");

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

  const user = await User.findOne({ userid: device.userid }).select(
    "email contact firstName lastName userid"
  );

  if (!user) {
    console.warn(`No user found with userid: ${device.userid}`);
    return null;
  }

  return {
    user,
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
    if (!rules.length) return;

    const info = await getDeviceInfoByAUID(auid);
    if (!info) return;

    const { user, nickname } = info;
    const now = Date.now();

    for (const rule of rules) {
      const key = rule.datapoint;
      const value = data[key];

      if (value === undefined || value === null) continue;

      const triggered = evaluateRule(rule, value);
      if (!triggered) continue;

      // Cooldown
      const last = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).getTime() : 0;
      const nextAllowed = last + rule.cooldownMinutes * 60 * 1000;

      if (now < nextAllowed) {
        console.log(`Cooldown active for ${key}. Skipping alert.`);
        continue;
      }

      rule.lastTriggeredAt = now;
      await rule.save();

      const smsMessage = buildSMSMessage(nickname, rule, value);
      const emailMessage = buildEmailMessage(nickname, rule, value);

      await sendAlerts(user, rule, smsMessage, emailMessage);

      console.log(`ALERT SENT → ${smsMessage}`);
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
    case ">": return value > rule.min;
    case ">=": return value >= rule.min;
    case "<": return value < rule.max;
    case "<=": return value <= rule.max;
    case "between": return value >= rule.min && value <= rule.max;
    case "outside": return value < rule.min || value > rule.max;
    default: return false;
  }
}



// ======================================================
// 3️⃣ SMS Message (Plain text – NO emojis, NO bold)
// ======================================================
function buildSMSMessage(nickname, rule, value) {
  const dp = prettyName(rule.datapoint);
  let condition = "";

  switch (rule.operator) {
    case ">": condition = `has gone above ${rule.min}`; break;
    case ">=": condition = `has reached or gone above ${rule.min}`; break;
    case "<": condition = `has dropped below ${rule.max}`; break;
    case "<=": condition = `is at or below ${rule.max}`; break;
    case "between": condition = `is between ${rule.min} and ${rule.max}`; break;
    case "outside": condition = `is outside the safe range of ${rule.min} to ${rule.max}`; break;
  }

  return `ALERT from ${nickname}\n${dp} is currently ${value} and ${condition}.`;
}



// ======================================================
// 3️⃣ Email Message (HTML allowed)
// ======================================================
function buildEmailMessage(nickname, rule, value) {
  const dp = prettyName(rule.datapoint);
  let condition = "";

  switch (rule.operator) {
    case ">": condition = `has gone above <b>${rule.min}</b>`; break;
    case ">=": condition = `has reached or gone above <b>${rule.min}</b>`; break;
    case "<": condition = `has dropped below <b>${rule.max}</b>`; break;
    case "<=": condition = `is at or below <b>${rule.max}</b>`; break;
    case "between": condition = `is between <b>${rule.min}</b> and <b>${rule.max}</b>`; break;
    case "outside": condition = `is outside the safe range of <b>${rule.min}</b> to <b>${rule.max}</b>`; break;
  }

  return `
    <p><strong>ALERT from ${nickname}</strong></p>
    <p>${dp} is currently <b>${value}</b>, which ${condition}.</p>
  `;
}



// ======================================================
// Pretty datapoint names
// ======================================================
function prettyName(dp) {
  const map = {
    pm2_5: "PM2.5",
    pm10: "PM10",
    pm1: "PM1",
    hum: "Humidity",
    humidity: "Humidity",
    temperature: "Temperature",
    aqi: "Air Quality Index",
    uv: "UV Index",
    lux: "Light Intensity",
    ph: "pH",
    ec: "Electrical Conductivity",
    turbidity: "Turbidity",
    waterTemp: "Water Temperature",
    temperature_water: "Water Temperature",
    temperature_ambient: "Ambient Temperature",
    soilTemp: "Soil Temperature",
    moisture: "Soil Moisture",
    npk_n: "Nitrogen (N)",
    npk_p: "Phosphorus (P)",
    npk_k: "Potassium (K)",
  };

  return map[dp] || dp.toUpperCase();
}



// ======================================================
// 4️⃣ Send Alerts (Email + SMS)
// ======================================================
async function sendAlerts(user, rule, smsMessage, emailMessage) {
  try {
    if (rule.alertChannels?.email && user.email) {
      await sendEmail(
        user.email,
        `ALERT from your CraftedClimate Sensor`,
        emailMessage
      );
    }

    if (rule.alertChannels?.sms && user.contact) {
      await sendSMS(user.contact, smsMessage);
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
  getDeviceInfoByAUID
};
