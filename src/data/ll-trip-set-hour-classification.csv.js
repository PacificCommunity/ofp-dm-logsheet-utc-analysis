/**
 * Data loader: ll-trip-set-hour-classification.csv.js
 *
 * For every Longline fishing set, records the set_time hour and the nautical
 * UTC offset derived from the set's longitude using the standard formula:
 * ROUND(lond / 15.0, 0).
 *
 * This data is used to determine — per instance_source — whether set_time was
 * entered as local time or UTC, using the "before-sunrise test":
 *   LL sets should predominantly occur before sunrise (~06:00 local time) in
 *   the tropical Pacific, since nets are typically set at night/early morning
 *   for optimal catch. Whichever interpretation (as-recorded vs UTC-adjusted)
 *   produces a higher proportion of before-sunrise sets is likely correct.
 *
 * Output columns:
 *   log_trip_id      — logsheet trip identifier
 *   instance_source  — bitmask from log.trips_ll (links to TufmanInstance enum)
 *   nautical_offset  — ROUND(lond / 15.0, 0) — nautical timezone offset for the set
 *   set_hour         — CAST(LEFT(set_time, 2) AS INT) from log.sets_ll
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
SELECT DISTINCT
    tl.log_trip_id,
    tl.instance_source,
    ROUND(sl.lond / 15.0, 0)          AS nautical_offset,
    CAST(LEFT(sl.set_time, 2) AS INT)  AS set_hour
FROM log.sets_ll sl
INNER JOIN log.trips_ll tl ON tl.log_trip_id = sl.log_trip_id
WHERE sl.l_activity_id  = 1
  AND sl.set_time        IS NOT NULL
  AND LEN(sl.set_time)   >= 2
  AND sl.lond             IS NOT NULL
  AND sl.lond             BETWEEN -180 AND 180
  AND sl.logdate          >= '${ANALYSIS_START_DATE}'
  AND tl.instance_source  IS NOT NULL
ORDER BY tl.log_trip_id
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  log_trip_id:     String(r.log_trip_id).trim(),
  instance_source: Number(r.instance_source),
  nautical_offset: Number(r.nautical_offset),
  set_hour:        Number(r.set_hour),
}))));
