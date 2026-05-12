/**
 * Data loader: ll-logsheet-time-quality.csv.js
 *
 * For each Longline logsheet fishing set that has BOTH a matching observer set
 * AND a valid set_time (HHMM format), computes:
 *
 *   logsheet_offset — UTC offset implied by the captain's logsheet timestamp
 *                     = DATEDIFF(MINUTE, utc_set_dtime, logsheet_dt) / 60
 *                       where logsheet_dt = logdate + set_time
 *   observer_offset — UTC offset from the observer's own timestamps
 *                     = DATEDIFF(MINUTE, utc_set_dtime, set_dtime) / 60
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
-- Build logsheet full datetime from logdate (DATE) + set_time (HHMM varchar).
-- Observer UTC datetime is the reference; both offsets are relative to it.
ll_matched_sets AS (
    SELECT
        tl.vessel_id,
        -- logsheet_offset: how far is the captain's timestamp from observer UTC?
        ROUND(
            CAST(DATEDIFF(MINUTE,
                os.utc_set_dtime,
                DATEADD(MINUTE,
                    CAST(LEFT(sl.set_time, 2) AS INT) * 60
                    + CAST(RIGHT(sl.set_time, 2) AS INT),
                    CAST(sl.logdate AS DATETIME))
            ) AS FLOAT) / 60.0 * 2, 0
        ) / 2.0                                                           AS logsheet_offset,
        -- observer_offset: how far is the observer's local time from their own UTC?
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0                                                           AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl
        ON  tl.log_trip_id = sl.log_trip_id
    INNER JOIN LonglineLogsheetWithObserverTrip lot
        ON  lot.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = lot.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id  = 1
      AND sl.set_time        IS NOT NULL
      AND LEN(sl.set_time)   = 4            -- must be HHMM format
      AND ISNUMERIC(sl.set_time) = 1        -- exclude non-numeric values
      AND os.utc_set_dtime   IS NOT NULL
      AND os.set_dtime        IS NOT NULL
      AND tl.vessel_id       IS NOT NULL
      AND sl.logdate         >= '2017-01-01'
),

-- ── Normalise observer offset across the dateline ────────────────────────────
-- UTC+13 (Kiribati, Samoa) → -11, UTC+14 (Kiribati Line Islands) → -10
ll_normalised AS (
    SELECT
        vessel_id,
        logsheet_offset,
        observer_offset,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS observer_offset_norm
    FROM ll_matched_sets
    WHERE ABS(observer_offset) <= 14   -- discard obviously erroneous observer values
      AND ABS(logsheet_offset)  <= 14  -- discard obviously erroneous logsheet values
)

-- ── Aggregate per vessel flag ─────────────────────────────────────────────────
SELECT
    vf.flag_id                                            AS vessel_flag,
    COUNT(*)                                              AS total_sets,
    SUM(CASE
        WHEN ABS(ln.logsheet_offset - ln.observer_offset_norm) <= 2
        THEN 1 ELSE 0
    END)                                                  AS matching_sets,
    ROUND(
        100.0 * SUM(CASE
            WHEN ABS(ln.logsheet_offset - ln.observer_offset_norm) <= 2
            THEN 1 ELSE 0
        END) / COUNT(*),
    1)                                                    AS match_pct
FROM ll_normalised ln
INNER JOIN vessel_flag vf ON vf.vessel_id = ln.vessel_id
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
