/**
 * Converts a voltage reading to a battery percentage.
 * @param {number} voltage - The current voltage value.
 * @param {number} minVoltage - The minimum voltage representing 0%.
 * @param {number} maxVoltage - The maximum voltage representing 100%.
 * @returns {number} Battery percentage (0–100).
 */
function batteryPercentage(voltage, minVoltage = 3.3, maxVoltage = 4.1) {
  if (voltage < minVoltage) {
    return 0;
  } else if (voltage > maxVoltage) {
    return 100;
  }

  const percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
  return parseFloat(percentage.toFixed(1));
}

module.exports = { batteryPercentage };
