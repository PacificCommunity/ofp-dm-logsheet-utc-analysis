/**
 * Sunrise/Sunset Calculator
 * 
 * Based on the algorithm from:
 *   Almanac for Computers, 1990
 *   Nautical Almanac Office, United States Naval Observatory
 *   Washington, DC 20392
 * 
 * Source: https://edwilliams.org/sunrise_sunset_algorithm.htm
 * 
 * Calculates sunrise and sunset times in UTC for a given date and location.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Zenith for official sunrise/sunset (90 degrees 50 arcminutes)
const ZENITH_OFFICIAL = 90.833;

/**
 * Normalize an angle to the range [0, 360)
 */
function normalizeAngle(angle) {
  angle = angle % 360;
  if (angle < 0) angle += 360;
  return angle;
}

/**
 * Calculate day of year (N) from date
 * 
 * @param {Date} date - JavaScript Date object
 * @returns {number} Day of year (1-366)
 */
function dayOfYear(date) {
  const month = date.getUTCMonth() + 1; // getUTCMonth() returns 0-11
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  
  const N1 = Math.floor(275 * month / 9);
  const N2 = Math.floor((month + 9) / 12);
  const N3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const N = N1 - (N2 * N3) + day - 30;
  
  return N;
}

/**
 * Calculate sunrise or sunset time in UTC
 * 
 * @param {Date} date - Date for calculation (UTC)
 * @param {number} latitude - Latitude in degrees (positive North, negative South)
 * @param {number} longitude - Longitude in degrees (positive East, negative West)
 * @param {boolean} isSunrise - true for sunrise, false for sunset
 * @param {number} zenith - Sun's zenith angle (default: 90.833 for official)
 * @returns {Date|null} Sunrise/sunset time in UTC, or null if sun doesn't rise/set
 */
function calcSunEvent(date, latitude, longitude, isSunrise = true, zenith = ZENITH_OFFICIAL) {
  // Step 1: Calculate day of year
  const N = dayOfYear(date);
  
  // Step 2: Convert longitude to hour value and calculate approximate time
  const lngHour = longitude / 15.0;
  
  let t;
  if (isSunrise) {
    t = N + ((6 - lngHour) / 24);
  } else {
    t = N + ((18 - lngHour) / 24);
  }
  
  // Step 3: Calculate Sun's mean anomaly
  let M = (0.9856 * t) - 3.289;
  
  // Step 4: Calculate Sun's true longitude
  let L = M + (1.916 * Math.sin(M * DEG_TO_RAD)) + (0.020 * Math.sin(2 * M * DEG_TO_RAD)) + 282.634;
  L = normalizeAngle(L);
  
  // Step 5a: Calculate Sun's right ascension
  let RA = RAD_TO_DEG * Math.atan(0.91764 * Math.tan(L * DEG_TO_RAD));
  RA = normalizeAngle(RA);
  
  // Step 5b: Right ascension needs to be in same quadrant as L
  const Lquadrant = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = RA + (Lquadrant - RAquadrant);
  
  // Step 5c: Convert RA to hours
  RA = RA / 15;
  
  // Step 6: Calculate Sun's declination
  const sinDec = 0.39782 * Math.sin(L * DEG_TO_RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  
  // Step 7a: Calculate Sun's local hour angle
  const cosH = (Math.cos(zenith * DEG_TO_RAD) - (sinDec * Math.sin(latitude * DEG_TO_RAD))) 
                / (cosDec * Math.cos(latitude * DEG_TO_RAD));
  
  // Check if sun rises/sets at this location on this date
  if (cosH > 1) {
    // Sun never rises
    return null;
  }
  if (cosH < -1) {
    // Sun never sets
    return null;
  }
  
  // Step 7b: Finish calculating H and convert to hours
  let H;
  if (isSunrise) {
    H = 360 - (RAD_TO_DEG * Math.acos(cosH));
  } else {
    H = RAD_TO_DEG * Math.acos(cosH);
  }
  H = H / 15;
  
  // Step 8: Calculate local mean time
  const T = H + RA - (0.06571 * t) - 6.622;
  
  // Step 9: Adjust back to UTC
  let UT = T - lngHour;
  
  // Normalize to [0, 24)
  UT = UT % 24;
  if (UT < 0) UT += 24;
  
  // Convert to Date object
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  const hours = Math.floor(UT);
  const minutes = Math.floor((UT - hours) * 60);
  const seconds = Math.floor(((UT - hours) * 60 - minutes) * 60);
  
  const result = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  
  return result;
}

/**
 * Calculate sunrise time in UTC
 * 
 * @param {Date} date - Date for calculation (UTC)
 * @param {number} latitude - Latitude in degrees (positive North, negative South)
 * @param {number} longitude - Longitude in degrees (positive East, negative West)
 * @returns {Date|null} Sunrise time in UTC, or null if sun doesn't rise
 */
export function calcSunrise(date, latitude, longitude) {
  return calcSunEvent(date, latitude, longitude, true);
}

/**
 * Calculate sunset time in UTC
 * 
 * @param {Date} date - Date for calculation (UTC)
 * @param {number} latitude - Latitude in degrees (positive North, negative South)
 * @param {number} longitude - Longitude in degrees (positive East, negative West)
 * @returns {Date|null} Sunset time in UTC, or null if sun doesn't set
 */
export function calcSunset(date, latitude, longitude) {
  return calcSunEvent(date, latitude, longitude, false);
}

/**
 * Calculate minutes from sunrise for a given time
 * 
 * @param {Date} time - Time to check (UTC)
 * @param {Date} date - Date for sunrise calculation (UTC, typically same day as time)
 * @param {number} latitude - Latitude in degrees
 * @param {number} longitude - Longitude in degrees
 * @returns {number|null} Minutes from sunrise (negative = before, positive = after), or null if sunrise doesn't occur
 */
export function minutesFromSunrise(time, date, latitude, longitude) {
  const sunrise = calcSunrise(date, latitude, longitude);
  if (!sunrise) return null;
  
  const diffMs = time.getTime() - sunrise.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  
  return diffMinutes;
}

/**
 * Round minutes to nearest 15-minute bin
 * 
 * @param {number} minutes - Minutes to bin
 * @returns {number} Binned minutes (e.g., 17 → 15, 22 → 15, 23 → 30)
 */
export function binTo15Minutes(minutes) {
  return Math.floor(minutes / 15) * 15;
}
