/**
 * Data loader: ps-trip-prediction-targets.csv.js
 *
 * Purseseine logsheet trips that have NO linked observer trip — these are the
 * trips for which the Bayesian estimator must predict a UTC offset.
 *
 * Output columns:
 *   log_trip_id      — logsheet trip identifier
 *   vessel_flag      — most-recent flag from ref.vessel_instances
 *   primary_eez_code — EEZ with the most fishing sets in this trip (may be empty)
 *   departure_month  — MONTH(depart_date), 1–12, NULL if unknown
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

-- ── Latest active vessel flag per vessel ──────────────────────────────────────
vessel_flag AS (
    SELECT DISTINCT
        vi.vessel_id,
        FIRST_VALUE(vi.flag_id) OVER (
            PARTITION BY vi.vessel_id
            ORDER BY vi.start_date DESC
        ) AS flag_id
    FROM ref.vessel_instances vi
    WHERE vi.flag_id IS NOT NULL
),

-- ── All PS trips that DO have an observer link ────────────────────────────────
ps_observer_linked AS (
    SELECT DISTINCT dto_guid_left  AS log_trip_id FROM tufman2.entity_links
    WHERE dto_type_left = 'PurseseineLogsheetDTO' AND dto_type_right = 'ObserverTripDTO'
    UNION
    SELECT DISTINCT dto_guid_right AS log_trip_id FROM tufman2.entity_links
    WHERE dto_type_right = 'PurseseineLogsheetDTO' AND dto_type_left = 'ObserverTripDTO'
),

-- ── Primary EEZ per trip (EEZ with most fishing sets) ────────────────────────
ps_eez_counts AS (
    SELECT tl.log_trip_id, sl.eez_code, COUNT(*) AS set_cnt
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    WHERE sl.s_activity_id = 1
      AND sl.eez_code IS NOT NULL
      AND sl.logdate >= '${ANALYSIS_START_DATE}'
      AND NOT EXISTS (SELECT 1 FROM ps_observer_linked ol WHERE ol.log_trip_id = tl.log_trip_id)
    GROUP BY tl.log_trip_id, sl.eez_code
),
ps_primary_eez AS (
    SELECT log_trip_id, eez_code AS primary_eez_code
    FROM ps_eez_counts
    WHERE set_cnt = (
        SELECT MAX(e2.set_cnt) FROM ps_eez_counts e2
        WHERE e2.log_trip_id = ps_eez_counts.log_trip_id
    )
)

-- ── All unresolved PS trips with features ─────────────────────────────────────
SELECT
    tl.log_trip_id,
    vf.flag_id              AS vessel_flag,
    pe.primary_eez_code,
    MONTH(tl.depart_date)   AS departure_month
FROM log.trips_ps tl
INNER JOIN vessel_flag vf    ON vf.vessel_id   = tl.vessel_id
LEFT  JOIN ps_primary_eez pe ON pe.log_trip_id = tl.log_trip_id
WHERE tl.depart_date >= '${ANALYSIS_START_DATE}'
  AND NOT EXISTS (SELECT 1 FROM ps_observer_linked ol WHERE ol.log_trip_id = tl.log_trip_id)
ORDER BY tl.log_trip_id
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  log_trip_id:      String(r.log_trip_id).trim(),
  vessel_flag:      r.vessel_flag != null ? String(r.vessel_flag).trim() : "",
  primary_eez_code: r.primary_eez_code != null ? String(r.primary_eez_code).trim() : "",
  departure_month:  r.departure_month != null ? Number(r.departure_month) : "",
}))));
