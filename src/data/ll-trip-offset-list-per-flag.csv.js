/**
 * Data loader: ll-trip-offset-list-per-flag.csv.js
 *
 * For each vessel flag, produces the distribution of sorted UTC offset combinations
 * observed across all sets of a single Longline trip (e.g. "9,10", "10", "11,12").
 *
 * Vessel flag is the most-recent flag from ref.vessel_instances for that vessel.
 *
 * Output columns: vessel_flag, offset_list, count, observer_trips
 *   observer_trips = total observer-linked trips for that vessel_flag (repeated per row)
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

-- ── Entity-link bridge: LL logsheet ↔ observer trip ──────────────────────────
LLWithObserver AS (
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

-- ── Raw observer offset per (vessel_flag, log_trip_id, set) ──────────────────
raw_offsets AS (
    SELECT
        vf.flag_id           AS vessel_flag,
        tl.log_trip_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl    ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN vessel_flag vf     ON vf.vessel_id   = tl.vessel_id
    INNER JOIN LLWithObserver lo  ON lo.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = lo.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id  = 1
      AND sl.logdate         >= '${ANALYSIS_START_DATE}'
      AND os.utc_set_dtime   IS NOT NULL
      AND os.set_dtime        IS NOT NULL
),

-- ── Normalise: fold >+12 across dateline, discard outliers ───────────────────
trip_offsets_norm AS (
    SELECT DISTINCT
        vessel_flag,
        log_trip_id,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS observer_offset
    FROM raw_offsets
    WHERE ABS(observer_offset) <= 14
),

-- ── Sorted offset list per (vessel_flag, log_trip_id) ────────────────────────
trip_offset_list AS (
    SELECT
        vessel_flag,
        log_trip_id,
        STRING_AGG(CAST(observer_offset AS VARCHAR(10)), ',')
            WITHIN GROUP (ORDER BY observer_offset) AS offset_list
    FROM trip_offsets_norm
    GROUP BY vessel_flag, log_trip_id
),

-- ── Count trips per (vessel_flag, offset_list) ────────────────────────────────
list_distribution AS (
    SELECT vessel_flag, offset_list, COUNT(*) AS [count]
    FROM trip_offset_list
    GROUP BY vessel_flag, offset_list
),

-- ── Total observer-linked trips per vessel_flag ───────────────────────────────
observer_trip_totals AS (
    SELECT vessel_flag, COUNT(DISTINCT log_trip_id) AS observer_trips
    FROM trip_offsets_norm
    GROUP BY vessel_flag
)

SELECT
    ld.vessel_flag,
    ld.offset_list,
    ld.[count],
    ot.observer_trips
FROM list_distribution ld
INNER JOIN observer_trip_totals ot ON ot.vessel_flag = ld.vessel_flag
ORDER BY ot.observer_trips DESC, ld.vessel_flag, ld.[count] DESC
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  vessel_flag:    String(r.vessel_flag).trim(),
  offset_list:    String(r.offset_list).trim(),
  count:          Number(r.count),
  observer_trips: Number(r.observer_trips),
}))));
