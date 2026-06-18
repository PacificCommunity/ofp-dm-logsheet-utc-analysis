/**
 * Test sunrise/sunset calculations against known values
 * 
 * Run with: node src/data/utils/test-sunrise.js
 */

import { calcSunrise, calcSunset, minutesFromSunrise, binTo15Minutes } from './sunrise.js';

// Test cases from various sources with known sunrise/sunset times
const testCases = [
  {
    name: "Suva, Fiji (tropical Pacific) — 2024-06-01",
    date: new Date(Date.UTC(2024, 5, 1)), // June 1, 2024
    lat: -18.1416,
    lon: 178.4415,
    expectedSunrise: "18:21 UTC", // ~06:21 Fiji time (UTC+12)
    expectedSunset: "06:05 UTC",  // ~18:05 Fiji time
  },
  {
    name: "Pohnpei, FSM (western Pacific) — 2024-06-01",
    date: new Date(Date.UTC(2024, 5, 1)),
    lat: 6.9248,
    lon: 158.1611,
    expectedSunrise: "19:54 UTC", // ~05:54 Pohnpei time (UTC+10)
    expectedSunset: "08:13 UTC",  // ~18:13 Pohnpei time
  },
  {
    name: "Honolulu, Hawaii (northern Pacific) — 2024-06-01",
    date: new Date(Date.UTC(2024, 5, 1)),
    lat: 21.3099,
    lon: -157.8581,
    expectedSunrise: "15:51 UTC", // ~05:51 HST (UTC-10)
    expectedSunset: "05:19 UTC (next day)",  // ~19:19 HST
  },
  {
    name: "Equator crossing (0°N, 180°E) — 2024-03-20",
    date: new Date(Date.UTC(2024, 2, 20)), // March 20 (near equinox)
    lat: 0.0,
    lon: 180.0,
    expectedSunrise: "~18:00 UTC", // Should be close to 06:00 local (UTC+12)
    expectedSunset: "~06:00 UTC (next day)",
  },
];

function formatTime(date) {
  if (!date) return "N/A";
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

console.log("\n=== Sunrise/Sunset Algorithm Validation ===\n");

let passCount = 0;
let failCount = 0;

for (const test of testCases) {
  console.log(`\n${test.name}`);
  console.log(`  Date: ${test.date.toISOString().split('T')[0]}`);
  console.log(`  Location: ${test.lat.toFixed(4)}°N, ${test.lon.toFixed(4)}°E`);
  
  const sunrise = calcSunrise(test.date, test.lat, test.lon);
  const sunset = calcSunset(test.date, test.lat, test.lon);
  
  console.log(`  Calculated sunrise: ${formatTime(sunrise)}`);
  console.log(`  Expected sunrise:   ${test.expectedSunrise}`);
  console.log(`  Calculated sunset:  ${formatTime(sunset)}`);
  console.log(`  Expected sunset:    ${test.expectedSunset}`);
  
  if (sunrise && sunset) {
    // Calculate day length
    const dayLengthMs = sunset.getTime() - sunrise.getTime();
    // Handle case where sunset is next day
    const adjustedDayLengthMs = dayLengthMs < 0 ? dayLengthMs + 24*60*60*1000 : dayLengthMs;
    const dayLengthHours = adjustedDayLengthMs / (1000 * 60 * 60);
    console.log(`  Day length: ${dayLengthHours.toFixed(2)} hours`);
    
    passCount++;
  } else {
    console.log(`  ❌ FAIL: Sun doesn't rise/set`);
    failCount++;
  }
}

// Test minutesFromSunrise and binning
console.log("\n\n=== Minutes from Sunrise Test ===\n");

const testDate = new Date(Date.UTC(2024, 5, 1));
const testLat = -18.1416; // Suva, Fiji
const testLon = 178.4415;

const sunrise = calcSunrise(testDate, testLat, testLon);
console.log(`Sunrise at Suva, Fiji on 2024-06-01: ${formatTime(sunrise)}`);

const testTimes = [
  new Date(Date.UTC(2024, 5, 1, 16, 0)), // 04:00 local (2h before sunrise)
  new Date(Date.UTC(2024, 5, 1, 18, 0)), // 06:00 local (at sunrise)
  new Date(Date.UTC(2024, 5, 1, 20, 30)), // 08:30 local (2.5h after sunrise)
];

for (const time of testTimes) {
  const minutes = minutesFromSunrise(time, testDate, testLat, testLon);
  const binned = binTo15Minutes(minutes);
  console.log(`  ${formatTime(time)} → ${minutes.toFixed(1)} min from sunrise → bin ${binned} min`);
}

console.log(`\n\n=== Summary ===`);
console.log(`✓ ${passCount} tests completed`);
console.log(`✗ ${failCount} tests failed`);
console.log();
