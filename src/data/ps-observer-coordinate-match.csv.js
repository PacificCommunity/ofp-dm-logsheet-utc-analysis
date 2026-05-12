/**
 * Data loader: ps-observer-coordinate-match.csv.js
 *
 * For each Purseseine logsheet fishing set that has BOTH a matching observer
 * daily record AND a valid GPS longitude, computes:
 *
 *   observer_offset   — UTC offset from observer's start_dtime − utc_start_dtime
 *                       (obsv.s_day: one daily record per observer trip per day)
 *   coordinate_offset — ROUND(lond / 15.0, 0)  (nautical timezone formula)
 *
 * PS logsheets can have several fishing sets per day; each set is matched
 * independently to the observer's daily record for that date.
 *
 * A set is considered "matching" when the dateline-normalised observer offset
 * agrees with the coordinate offset within ±1 hour.
 *
 * Output columns: vessel_flag, total_sets, matching_sets, match_pct
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

-- ── Trip-level: which PS logsheet trips are linked to an observer trip ───────
PurseseineLogsheetWithObserverTrip AS (
    SELECT el.dto_guid_left  AS log_trip_id,
           el.dto_guid_right AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'PurseseineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'

    UNION

    SELECT el.dto_guid_right AS log_trip_id,
           el.dto_guid_left  AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_right = 'PurseseineLogsheetDTO'
      AND el.dto_type_left  = 'ObserverTripDTO'
),

-- ── Set-level: paired PS set + observer daily record, both offsets ───────────
-- PS can have multiple fishing sets per day; each set is matched to the
-- single observer daily record (obsv.s_day) for that date.
ps_matched_sets AS (
    SELECT
        tl.vessel_id,
        ROUND(sl.lond / 15.0, 0)                                           AS coordinate_offset,
        ROUND(
            CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0                                                             AS observer_offset
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl
        ON  tl.log_trip_id = sl.log_trip_id
    INNER JOIN PurseseineLogsheetWithObserverTrip pot
        ON  pot.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.s_day sd
        ON  sd.obstrip_id = pot.obstrip_id
        AND CAST(sd.start_dtime AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id  = 1
      AND sl.lond            IS NOT NULL
      AND sl.lond            BETWEEN -180 AND 180
      AND sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime      IS NOT NULL
      AND tl.vessel_id       IS NOT NULL
      AND sl.logdate         >= '2017-01-01'
),

-- ── Per-set: normalise observer offset (fold UTC+13/+14 back across dateline) ─
ps_normalised AS (
    SELECT
        vessel_id,
        coordinate_offset,
        observer_offset,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS observer_offset_norm
    FROM ps_matched_sets
    WHERE ABS(observer_offset) <= 14
)

-- ── Aggregate per vessel flag ─────────────────────────────────────────────────
SELECT
    vf.flag_id                                            AS vessel_flag,
    COUNT(*)                                              AS total_sets,
    SUM(CASE
        WHEN ABS(pn.observer_offset_norm - pn.coordinate_offset) <= 1
        THEN 1 ELSE 0
    END)                                                  AS matching_sets,
    ROUND(
        100.0 * SUM(CASE
            WHEN ABS(pn.observer_offset_norm - pn.coordinate_offset) <= 1
            THEN 1 ELSE 0
        END) / COUNT(*),
    1)                                                    AS match_pct
FROM ps_normalised pn
INNER JOIN vessel_flag vf ON vf.vessel_id = pn.vessel_id
GROUP BY vf.flag_id
ORDER BY vf.flag_id
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  vessel_flag:   String(r.vessel_flag).trim(),
  total_sets:    Number(r.total_sets),
  matching_sets: Number(r.matching_sets),
  match_pct:     Number(r.match_pct),
}))));
