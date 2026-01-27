// aqiCalculator.js

function calculateAQI(pm25) {
    // Define the AQI breakpoints for PM2.5
    const breakpoints = [
      { pm25High: 12.0, aqiHigh: 50, aqiLow: 0 },
      { pm25High: 35.4, aqiHigh: 100, aqiLow: 51 },
      { pm25High: 55.4, aqiHigh: 150, aqiLow: 101 },
      { pm25High: 150.4, aqiHigh: 200, aqiLow: 151 },
      { pm25High: 250.4, aqiHigh: 300, aqiLow: 201 },
      { pm25High: 350.4, aqiHigh: 400, aqiLow: 301 },
      { pm25High: 500.4, aqiHigh: 500, aqiLow: 401 }
    ];
  
    // Find the correct breakpoint
    const breakpoint = breakpoints.find(b => pm25 <= b.pm25High);
  
    if (!breakpoint) {
      console.log("PM2.5 value out of range");
      return null; // PM2.5 value out of range
    }
  
    // Calculate the AQI
    const pm25Low = breakpoint === breakpoints[0] ? 0 : breakpoints[breakpoints.indexOf(breakpoint) - 1].pm25High;
    const aqi = ((breakpoint.aqiHigh - breakpoint.aqiLow) / (breakpoint.pm25High - pm25Low)) * (pm25 - pm25Low) + breakpoint.aqiLow;
  
    return Math.round(aqi);
  }
  
  module.exports = { calculateAQI }; // Export the function
  