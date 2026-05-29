/**
 * Data loader: ps-trip-offset-list-per-eez.csv.js
 *
 * For each EEZ code, produces the distribution of sorted UTC offset combinations
 * observed across all sets of a single Purseseine trip (e.g. "9,10", "10", "11,12").
 *
 * Observer offset is derived from obsv.s_day.start_dtime − utc_start_dtime,
 * one daily record matched by obstrip_id + date.
 *
 * Output columns: eez_code, offset_list, count, observer_trips
 *   observer_trips = total observer-linked trips for that eez_code (repeated per row)
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

-- ── Entity-link bridge: PS logsheet ↔ observer trip ──────────────────────────
PSWithObserver AS (
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

-- ── Raw observer offset per (eez_code, log_trip_id, day) ─────────────────────
raw_offsets AS (
    SELECT
        sl.eez_code,
        tl.log_trip_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl   ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN PSWithObserver po  ON po.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.s_day sd
        ON  sd.obstrip_id = po.obstrip_id
        AND CAST(sd.start_dtime AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id  = 1
      AND sl.eez_code        IS NOT NULL
      AND sl.logdate         >= '${ANALYSIS_START_DATE}'
      AND sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime      IS NOT NULL
),

-- ── Normalise: fold >+12 across dateline, discard outliers ───────────────────
trip_offsets_norm AS (
    SELECT DISTINCT
        eez_code,
        log_trip_id,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS observer_offset
    FROM raw_offsets
    WHERE ABS(observer_offset) <= 14
),

-- ── Sorted offset list per (eez_code, log_trip_id) ───────────────────────────
trip_offset_list AS (
    SELECT
        eez_code,
        log_trip_id,
        STRING_AGG(CAST(observer_offset AS VARCHAR(10)), ',')
            WITHIN GROUP (ORDER BY observer_offset) AS offset_list
    FROM trip_offsets_norm
    GROUP BY eez_code, log_trip_id
),

-- ── Count trips per (eez_code, offset_list) ──────────────────────────────────
list_distribution AS (
    SELECT eez_code, offset_list, COUNT(*) AS [count]
    FROM trip_offset_list
    GROUP BY eez_code, offset_list
),

-- ── Total observer-linked trips per eez_code ─────────────────────────────────
observer_trip_totals AS (
    SELECT eez_code, COUNT(DISTINCT log_trip_id) AS observer_trips
    FROM trip_offsets_norm
    GROUP BY eez_code
)

SELECT
    ld.eez_code,
    ld.offset_list,
    ld.[count],
    ot.observer_trips
FROM list_distribution ld
INNER JOIN observer_trip_totals ot ON ot.eez_code = ld.eez_code
ORDER BY ot.observer_trips DESC, ld.eez_code, ld.[count] DESC
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  eez_code:       String(r.eez_code).trim(),
  offset_list:    String(r.offset_list).trim(),
  count:          Number(r.count),
  observer_trips: Number(r.observer_trips),
}))));
