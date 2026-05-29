/**
 * Data loader: longline-logsheet-activities-nautical-offset-per-vessel-flag.csv.js
 *
 * UTC offset derived purely from longitude using the nautical timezone convention:
 *
 *   offset = ROUND(lond / 15.0, 0)
 *
 * Each 15° band = 1 hour, centred on multiples of 15°E/W.
 * Longitude range -180…180 gives offsets -12…+12 with no clamping needed.
 * No external timezone library required — pure SQL.
 *
 * Output columns: type, vessel_flag, offset, count
 *   type — "LonglineLogsheet" | "PurseseineLogsheet"
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
  WITH vessel_flag AS (SELECT DISTINCT vi.vessel_id,
                                       FIRST_VALUE(vi.flag_id) OVER (
                                         PARTITION BY vi.vessel_id
                                         ORDER BY vi.start_date DESC
                                         ) AS flag_id
                       FROM ref.vessel_instances vi
                       WHERE vi.flag_id IS NOT NULL),
       all_sets AS (
         -- Longline fishing sets (l_activity_id = 1)
         SELECT 'LonglineLogsheet'           AS type,
                vf.flag_id                   AS vessel_flag,
                ROUND(sl.lond / 15.0, 0)    AS offset
         FROM log.sets_ll sl
                INNER JOIN log.trips_ll tl
                           ON tl.log_trip_id = sl.log_trip_id
                INNER JOIN vessel_flag vf
                           ON vf.vessel_id = tl.vessel_id
         WHERE sl.l_activity_id = 1
           AND sl.lond IS NOT NULL
           AND sl.lond BETWEEN -180 AND 180
           AND tl.vessel_id IS NOT NULL
           AND sl.logdate >= '${ANALYSIS_START_DATE}'

         UNION ALL

         -- Purseseine fishing sets
         SELECT 'PurseseineLogsheet'         AS type,
                vf.flag_id                   AS vessel_flag,
                ROUND(sl.lond / 15.0, 0)    AS offset
         FROM log.sets_ps sl
                INNER JOIN log.trips_ps tl
                           ON tl.log_trip_id = sl.log_trip_id
                INNER JOIN vessel_flag vf
                           ON vf.vessel_id = tl.vessel_id
         WHERE sl.s_activity_id = 1
           AND sl.lond IS NOT NULL
           AND sl.lond BETWEEN -180 AND 180
           AND tl.vessel_id IS NOT NULL
           AND sl.logdate >= '${ANALYSIS_START_DATE}')
  SELECT type,
         vessel_flag,
         offset,
         COUNT(*) AS [count]
  FROM all_sets
  GROUP BY type, vessel_flag, offset
  ORDER BY type, vessel_flag, offset
`;

// ── Query & output ────────────────────────────────────────────────────────────
const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows));

