/**
 * Data loader: ps-set-time-sunrise-relative.csv.js
 *
 * For every Purseseine fishing set (school_id 1–5), calculates the precise
 * sunrise time using the Ed Williams algorithm and outputs the set time
 * relative to sunrise in 15-minute bins.
 *
 * This matches the WCPFC paper format where t=0 represents sunrise.
 *
 * The Ed Williams algorithm calculates sunrise in UTC based on date, latitude,
 * and longitude, accounting for the equation of time and solar declination.
 * Much more precise than the fixed 06:00 approximation.
 *
 * Output columns:
 *   log_trip_id           — logsheet trip identifier
 *   instance_source       — bitmask from log.trips_ps (links to TufmanInstance enum)
 *   school_type           — "unassociated group" (school_id 1-2) | "associated group" (school_id 3-5)
 *   minutes_from_sunrise  — time relative to sunrise in minutes (15-min bins)
 *                            negative = before sunrise, positive = after
 *                            range: -360 to +720 minutes (-6h to +12h)
 *   set_time_utc          — original set time in UTC (for validation)
 *   sunrise_utc           — calculated sunrise time in UTC (for validation)
 *   logdate               — date of the set
 *   latd                  — latitude
 *   lond                  — longitude
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";
import { calcSunrise, minutesFromSunrise, binTo15Minutes } from "./utils/sunrise.js";

const SQL = `
SELECT 
    tl.log_trip_id,
    tl.instance_source,
    sl.set_time,
    sl.logdate,
    sl.latd,
    sl.lond,
    sl.school_id,
    CASE
        WHEN sl.school_id IN (1, 2)       THEN 'unassociated group'
        WHEN sl.school_id BETWEEN 3 AND 5 THEN 'associated group'
    END AS school_type
FROM log.sets_ps sl
INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
WHERE sl.s_activity_id  = 1
  AND sl.set_time        IS NOT NULL
  AND LEN(sl.set_time)   >= 4
  AND sl.school_id        BETWEEN 1 AND 5
  AND sl.latd             IS NOT NULL
  AND sl.lond             IS NOT NULL
  AND sl.lond             BETWEEN -180 AND 180
  AND sl.latd             BETWEEN -90 AND 90
  AND sl.logdate          >= '${ANALYSIS_START_DATE}'
  AND tl.instance_source  IS NOT NULL
ORDER BY tl.log_trip_id, sl.logdate
`;

console.error("Querying database for PS sets...");
const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();
console.error(`Retrieved ${rows.length} sets`);

console.error("Calculating sunrise times...");

const results = [];
let processedCount = 0;
let skippedCount = 0;

for (const row of rows) {
  try {
    // Parse set_time (HHMM format) and logdate
    const setTimeStr = String(row.set_time).trim().padStart(4, '0');
    const setHour = parseInt(setTimeStr.substring(0, 2), 10);
    const setMinute = parseInt(setTimeStr.substring(2, 4), 10);
    
    // Parse logdate (SQL Server datetime)
    const logdate = new Date(row.logdate);
    
    // Create set_time_utc as UTC datetime
    const setTimeUtc = new Date(Date.UTC(
      logdate.getUTCFullYear(),
      logdate.getUTCMonth(),
      logdate.getUTCDate(),
      setHour,
      setMinute,
      0
    ));
    
    // Calculate sunrise for this location and date
    const sunriseUtc = calcSunrise(logdate, row.latd, row.lond);
    
    if (!sunriseUtc) {
      // Sun doesn't rise at this location/date (polar regions)
      skippedCount++;
      continue;
    }
    
    // Calculate minutes from sunrise
    const minutesRaw = minutesFromSunrise(setTimeUtc, logdate, row.latd, row.lond);
    
    if (minutesRaw === null) {
      skippedCount++;
      continue;
    }
    
    // Bin to 15-minute intervals
    const minutesBinned = binTo15Minutes(minutesRaw);
    
    // Filter to range [-360, +720] minutes (-6h to +12h)
    if (minutesBinned < -360 || minutesBinned > 720) {
      skippedCount++;
      continue;
    }
    
    results.push({
      log_trip_id:          String(row.log_trip_id).trim(),
      instance_source:      Number(row.instance_source),
      school_type:          String(row.school_type).trim(),
      minutes_from_sunrise: minutesBinned,
      set_time_utc:         setTimeUtc.toISOString(),
      sunrise_utc:          sunriseUtc.toISOString(),
      logdate:              logdate.toISOString().split('T')[0],
      latd:                 Number(row.latd),
      lond:                 Number(row.lond),
    });
    
    processedCount++;
    
    // Progress indicator every 10000 rows
    if (processedCount % 10000 === 0) {
      console.error(`  Processed ${processedCount} sets...`);
    }
    
  } catch (err) {
    console.error(`Error processing row ${row.log_trip_id}:`, err.message);
    skippedCount++;
  }
}

console.error(`\nProcessed: ${processedCount} sets`);
console.error(`Skipped: ${skippedCount} sets`);
console.error(`Total output: ${results.length} rows`);

process.stdout.write(csvFormat(results));
