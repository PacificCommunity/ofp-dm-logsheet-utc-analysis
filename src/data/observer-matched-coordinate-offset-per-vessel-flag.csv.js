/**
 * Data loader: observer-matched-coordinate-offset-per-vessel-flag.csv.js
 *
 * For each fishing set that has BOTH a matching observer set AND valid GPS
 * coordinates, outputs:
 *
 *   observer_offset   — UTC offset implied by observer data (set_dtime − utc_set_dtime)
 *   coordinate_offset — UTC offset derived from the logsheet's GPS longitude
 *                       using the nautical formula: ROUND(lond / 15.0, 0)
 *
 * Both offsets come from the SAME set, enabling a properly paired comparison.
 *
 * Output columns: type, vessel_flag, observer_offset, coordinate_offset, count
 *   type             — "LonglineLogsheet" | "PurseseineLogsheet"
 *   observer_offset  — nearest 0.5 h; capped at ±14 h
 *   coordinate_offset — whole hour integer in [−12, +12]
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING } from "./db.js";

const SQL = `
WITH vessel_flag AS (
    SELECT DISTINCT
        vi.vessel_id,
        FIRST_VALUE(vi.flag_id) OVER (
            PARTITION BY vi.vessel_id
            ORDER BY vi.start_date DESC
        ) AS flag_id
    FROM ref.vessel_instances vi
    WHERE vi.flag_id IS NOT NULL
),

-- ── Longline: paired logsheet set + observer set ───────────────────────────
ll_raw AS (
    SELECT
        tl.vessel_id,
        ROUND(sl.lond / 15.0, 0) AS coordinate_offset,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_left  = tl.log_trip_id
        AND el.dto_type_left  = 'LonglineLogsheetDTO'
        AND el.dto_type_right = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot  ON ot.obstrip_id = el.dto_guid_right
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = ot.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id    = 1
      AND sl.lond              IS NOT NULL
      AND sl.latd              IS NOT NULL
      AND sl.lond              BETWEEN -180 AND 180
      AND sl.latd              BETWEEN -90  AND 90
      AND os.utc_set_dtime    IS NOT NULL
      AND os.set_dtime         IS NOT NULL
      AND tl.vessel_id        IS NOT NULL
      AND sl.logdate          >= '2017-01-01'

    UNION

    SELECT
        tl.vessel_id,
        ROUND(sl.lond / 15.0, 0) AS coordinate_offset,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_right = tl.log_trip_id
        AND el.dto_type_right = 'LonglineLogsheetDTO'
        AND el.dto_type_left  = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot  ON ot.obstrip_id = el.dto_guid_left
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = ot.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id    = 1
      AND sl.lond              IS NOT NULL
      AND sl.latd              IS NOT NULL
      AND sl.lond              BETWEEN -180 AND 180
      AND sl.latd              BETWEEN -90  AND 90
      AND os.utc_set_dtime    IS NOT NULL
      AND os.set_dtime         IS NOT NULL
      AND tl.vessel_id        IS NOT NULL
      AND sl.logdate          >= '2017-01-01'
),

-- ── Purseseine: paired logsheet set + observer daily record ────────────────
obs_daily AS (
    SELECT
        sd.obstrip_id,
        CAST(sd.start_dtime AS DATE) AS act_date,
        ROUND(
            CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS observer_offset
    FROM obsv.s_day sd
    WHERE sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime     IS NOT NULL
),
ps_raw AS (
    SELECT
        tl.vessel_id,
        ROUND(sl.lond / 15.0, 0) AS coordinate_offset,
        od.observer_offset
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_left  = tl.log_trip_id
        AND el.dto_type_left  = 'PurseseineLogsheetDTO'
        AND el.dto_type_right = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot ON ot.obstrip_id = el.dto_guid_right
    INNER JOIN obs_daily od
        ON  od.obstrip_id = ot.obstrip_id
        AND od.act_date   = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id = 1
      AND sl.lond           IS NOT NULL
      AND sl.latd           IS NOT NULL
      AND sl.lond           BETWEEN -180 AND 180
      AND sl.latd           BETWEEN -90  AND 90
      AND tl.vessel_id      IS NOT NULL
      AND sl.logdate        >= '2017-01-01'

    UNION

    SELECT
        tl.vessel_id,
        ROUND(sl.lond / 15.0, 0) AS coordinate_offset,
        od.observer_offset
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_right = tl.log_trip_id
        AND el.dto_type_right = 'PurseseineLogsheetDTO'
        AND el.dto_type_left  = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot ON ot.obstrip_id = el.dto_guid_left
    INNER JOIN obs_daily od
        ON  od.obstrip_id = ot.obstrip_id
        AND od.act_date   = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id = 1
      AND sl.lond           IS NOT NULL
      AND sl.latd           IS NOT NULL
      AND sl.lond           BETWEEN -180 AND 180
      AND sl.latd           BETWEEN -90  AND 90
      AND tl.vessel_id      IS NOT NULL
      AND sl.logdate        >= '2017-01-01'
)

-- ── Aggregate both types ─────────────────────────────────────────────────────
SELECT
    'LonglineLogsheet'       AS type,
    vf.flag_id               AS vessel_flag,
    ll.observer_offset,
    ll.coordinate_offset,
    COUNT(*)                 AS [count]
FROM ll_raw ll
INNER JOIN vessel_flag vf ON vf.vessel_id = ll.vessel_id
WHERE ABS(ll.observer_offset) <= 14
GROUP BY vf.flag_id, ll.observer_offset, ll.coordinate_offset

UNION ALL

SELECT
    'PurseseineLogsheet'     AS type,
    vf.flag_id               AS vessel_flag,
    ps.observer_offset,
    ps.coordinate_offset,
    COUNT(*)                 AS [count]
FROM ps_raw ps
INNER JOIN vessel_flag vf ON vf.vessel_id = ps.vessel_id
WHERE ABS(ps.observer_offset) <= 14
GROUP BY vf.flag_id, ps.observer_offset, ps.coordinate_offset

ORDER BY type, vessel_flag, observer_offset, coordinate_offset
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  type:               String(r.type),
  vessel_flag:        String(r.vessel_flag).trim(),
  observer_offset:    Number(r.observer_offset),
  coordinate_offset:  Number(r.coordinate_offset),
  count:              Number(r.count),
}))));
