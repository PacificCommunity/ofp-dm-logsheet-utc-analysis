/**
 * Data loader: ps-fad-set-hour-classification.csv.js
 *
 * For every Purseseine fishing set (school_id 1–5), records the set_time hour,
 * school type, and the nautical UTC offset derived from the set's longitude
 * using the standard formula: ROUND(lond / 15.0, 0).
 *
 * This data is used to determine — per instance_source — whether set_time was
 * entered as local time or UTC, using the "sunrise test":
 *   FAD sets (school_id 3–5) must occur before sunrise (~06:00 local time).
 *   Whichever interpretation (as-recorded vs UTC-adjusted) produces ~94% FAD
 *   sets before 06:00 is the correct one for that instance.
 *
 * Output columns:
 *   log_trip_id      — logsheet trip identifier
 *   instance_source  — bitmask from log.trips_ps (links to TufmanInstance enum)
 *   nautical_offset  — ROUND(lond / 15.0, 0) — nautical timezone offset for the set
 *   set_hour         — CAST(LEFT(set_time, 2) AS INT) from log.sets_ps
 *   school_type      — "unassociated group" (school_id 1-2) | "associated group" (school_id 3-5)
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
SELECT DISTINCT
    tl.log_trip_id,
    tl.instance_source,
    ROUND(sl.lond / 15.0, 0)          AS nautical_offset,
    CAST(LEFT(sl.set_time, 2) AS INT)  AS set_hour,
    CASE
        WHEN sl.school_id IN (1, 2)       THEN 'unassociated group'
        WHEN sl.school_id BETWEEN 3 AND 5 THEN 'associated group'
    END                                AS school_type
FROM log.sets_ps sl
INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
WHERE sl.s_activity_id  = 1
  AND sl.set_time        IS NOT NULL
  AND LEN(sl.set_time)   >= 2
  AND sl.school_id        BETWEEN 1 AND 5
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
  school_type:     String(r.school_type).trim(),
}))));
