/**
 * Data loader: ll-observer-coordinate-match.csv.js
 *
 * For each Longline logsheet fishing set that has BOTH a matching observer set
 * AND a valid GPS longitude, computes:
 *
 *   observer_offset   — UTC offset from observer's set_dtime − utc_set_dtime
 *   coordinate_offset — ROUND(lond / 15.0, 0)  (nautical timezone formula)
 *
 * A set is considered "matching" when the dateline-normalised observer offset
 * agrees with the coordinate offset within ±1 hour.
 *
 * Output columns: vessel_flag, port_name, total_sets, matching_sets, match_pct
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING } from "./db.js";

const SQL = `
WITH vessel_flag AS (
    -- Latest active flag per vessel
    SELECT DISTINCT
        vi.vessel_id,
        FIRST_VALUE(vi.flag_id) OVER (
            PARTITION BY vi.vessel_id
            ORDER BY vi.start_date DESC
        ) AS flag_id
    FROM ref.vessel_instances vi
    WHERE vi.flag_id IS NOT NULL
),

-- ── Trip-level: which LL logsheet trips are linked to an observer trip ───────
LonglineLogsheetWithObserverTrip AS (
    SELECT el.dto_guid_left  AS log_trip_id,
           el.dto_guid_right AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'LonglineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'

    UNION

    SELECT el.dto_guid_right AS log_trip_id,
           el.dto_guid_left  AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_right = 'LonglineLogsheetDTO'
      AND el.dto_type_left  = 'ObserverTripDTO'
),

-- ── Set-level: paired logsheet set + observer set, both offsets ──────────────
-- One LL logsheet set per day; join to observer l_sets on the same date.
-- If multiple observer sets exist for that date, each produces one row.
ll_matched_sets AS (
    SELECT
        tl.vessel_id,
        p.port_name,
        ROUND(sl.lond / 15.0, 0)                                          AS coordinate_offset,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0                                                            AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl
        ON  tl.log_trip_id = sl.log_trip_id
    LEFT JOIN ref.ports p
        ON  p.port_id = tl.depart_port_id
    INNER JOIN LonglineLogsheetWithObserverTrip lot
        ON  lot.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = lot.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id  = 1
      AND sl.lond            IS NOT NULL
      AND sl.lond            BETWEEN -180 AND 180
      AND os.utc_set_dtime   IS NOT NULL
      AND os.set_dtime        IS NOT NULL
      AND tl.vessel_id       IS NOT NULL
      AND sl.logdate         >= '2017-01-01'
),

-- ── Per-set: normalise observer offset (fold UTC+13/+14 back across dateline) ─
ll_normalised AS (
    SELECT
        vessel_id,
        port_name,
        coordinate_offset,
        observer_offset,
        -- Fold +13 → -11, +14 → -10 (same clock time, opposite side of dateline)
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS observer_offset_norm
    FROM ll_matched_sets
    WHERE ABS(observer_offset) <= 14   -- discard obviously erroneous values
)

-- ── Aggregate per vessel flag + departure port ────────────────────────────────
SELECT
    vf.flag_id                                           AS vessel_flag,
    ISNULL(ln.port_name, '(unknown)')                    AS port_name,
    COUNT(*)                                             AS total_sets,
    SUM(CASE
        WHEN ABS(ln.observer_offset_norm - ln.coordinate_offset) <= 1
        THEN 1 ELSE 0
    END)                                                 AS matching_sets,
    ROUND(
        100.0 * SUM(CASE
            WHEN ABS(ln.observer_offset_norm - ln.coordinate_offset) <= 1
            THEN 1 ELSE 0
        END) / COUNT(*),
    1)                                                   AS match_pct
FROM ll_normalised ln
INNER JOIN vessel_flag vf ON vf.vessel_id = ln.vessel_id
GROUP BY vf.flag_id, ln.port_name
ORDER BY vf.flag_id, ln.port_name
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  vessel_flag:   String(r.vessel_flag).trim(),
  port_name:     r.port_name ? String(r.port_name).trim() : '(unknown)',
  total_sets:    Number(r.total_sets),
  matching_sets: Number(r.matching_sets),
  match_pct:     Number(r.match_pct),
}))));
