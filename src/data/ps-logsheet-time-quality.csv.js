/**
 * Data loader: ps-logsheet-time-quality.csv.js
 *
 * For each Purseseine logsheet fishing set that has BOTH a matching observer
 * daily record AND a valid set_time (HHMM format), computes:
 *
 *   logsheet_offset — UTC offset implied by the captain's logsheet timestamp
 *                     = DATEDIFF(MINUTE, utc_start_dtime, logsheet_dt) / 60
 *                       where logsheet_dt = logdate + set_time
 *   observer_offset — UTC offset from the observer's own daily timestamps
 *                     = DATEDIFF(MINUTE, utc_start_dtime, start_dtime) / 60
 *
 * PS logsheets can have multiple fishing sets per day; each set is matched
 * independently to the observer's daily record (obsv.s_day) for that date.
 *
 * A set is "matching" when the two offsets agree within ±1 h.
 *
 * Interpretation:
 *   High match% → captain entered set_time in correct local time
 *   Low match%  → set_time was likely entered in UTC (common data quality issue)
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
-- Each PS set is matched to the observer's daily record (s_day) on the same
-- date. The observer UTC offset for the day is used as the reference.
ps_matched_sets AS (
    SELECT
        tl.vessel_id,
        -- logsheet_offset: how far is the captain's set timestamp from observer UTC?
        ROUND(
            CAST(DATEDIFF(MINUTE,
                sd.utc_start_dtime,
                DATEADD(MINUTE,
                    CAST(LEFT(sl.set_time, 2) AS INT) * 60
                    + CAST(RIGHT(sl.set_time, 2) AS INT),
                    CAST(sl.logdate AS DATETIME))
            ) AS FLOAT) / 60.0 * 2, 0
        ) / 2.0                                                           AS logsheet_offset,
        -- observer_offset: how far is the observer's daily start from their own UTC?
        ROUND(
            CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0                                                           AS observer_offset
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl
        ON  tl.log_trip_id = sl.log_trip_id
    INNER JOIN PurseseineLogsheetWithObserverTrip pot
        ON  pot.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.s_day sd
        ON  sd.obstrip_id = pot.obstrip_id
        AND CAST(sd.start_dtime AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id  = 1
      AND sl.set_time        IS NOT NULL
      AND LEN(sl.set_time)   = 4            -- must be HHMM format
      AND ISNUMERIC(sl.set_time) = 1        -- exclude non-numeric values
      AND sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime      IS NOT NULL
      AND tl.vessel_id       IS NOT NULL
      AND sl.logdate         >= '2017-01-01'
),

-- ── Normalise observer offset across the dateline ────────────────────────────
ps_normalised AS (
    SELECT
        vessel_id,
        logsheet_offset,
        observer_offset,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS observer_offset_norm
    FROM ps_matched_sets
    WHERE ABS(observer_offset) <= 14
      AND ABS(logsheet_offset)  <= 14
)

-- ── Aggregate per vessel flag ─────────────────────────────────────────────────
SELECT
    vf.flag_id                                            AS vessel_flag,
    COUNT(*)                                              AS total_sets,
    SUM(CASE
        WHEN ABS(pn.logsheet_offset - pn.observer_offset_norm) <= 2
        THEN 1 ELSE 0
    END)                                                  AS matching_sets,
    ROUND(
        100.0 * SUM(CASE
            WHEN ABS(pn.logsheet_offset - pn.observer_offset_norm) <= 2
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
