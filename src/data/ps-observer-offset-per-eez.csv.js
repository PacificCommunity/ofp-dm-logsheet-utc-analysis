/**
 * Data loader: ps-observer-offset-per-eez.csv.js
 *
 * For each EEZ code present on Purseseine fishing sets, produces:
 *   - Summary counts: total_sets, total_trips, observer_trips (per EEZ)
 *   - Observer UTC offset distribution: observer_offset + count
 *     (derived from obsv.s_day.start_dtime − utc_start_dtime, matched by obstrip_id + date)
 *
 * PS logsheets can have several fishing sets per day; each set is matched
 * to the single observer daily record (obsv.s_day) for that date.
 *
 * Output columns: eez_code, total_sets, total_trips, observer_trips, observer_offset, count
 *   total_sets / total_trips / observer_trips are repeated on every (eez_code, observer_offset) row.
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING } from "./db.js";

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

-- ── EEZ-level totals (all sets, regardless of observer coverage) ─────────────
eez_totals AS (
    SELECT
        sl.eez_code,
        COUNT(*)                       AS total_sets,
        COUNT(DISTINCT tl.log_trip_id) AS total_trips
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    WHERE sl.s_activity_id = 1
      AND sl.eez_code IS NOT NULL
      AND sl.logdate >= '2017-01-01'
    GROUP BY sl.eez_code
),

-- ── Observer-linked trips per EEZ ────────────────────────────────────────────
observer_trips_per_eez AS (
    SELECT
        sl.eez_code,
        COUNT(DISTINCT tl.log_trip_id) AS observer_trips
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN PSWithObserver po   ON po.log_trip_id = tl.log_trip_id
    WHERE sl.s_activity_id = 1
      AND sl.eez_code IS NOT NULL
      AND sl.logdate >= '2017-01-01'
    GROUP BY sl.eez_code
),

-- ── Per matched set: observer UTC offset (from s_day daily record) ────────────
observer_offsets AS (
    SELECT
        sl.eez_code,
        ROUND(
            CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN PSWithObserver po   ON po.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.s_day sd
        ON  sd.obstrip_id = po.obstrip_id
        AND CAST(sd.start_dtime AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id  = 1
      AND sl.eez_code        IS NOT NULL
      AND sl.logdate         >= '2017-01-01'
      AND sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime      IS NOT NULL
),

-- ── Normalise: fold UTC+13/+14 back across dateline, discard outliers ────────
observer_offsets_norm AS (
    SELECT
        eez_code,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS observer_offset
    FROM observer_offsets
    WHERE ABS(observer_offset) <= 14
),

-- ── Distribution: count per (eez_code, observer_offset) ─────────────────────
offset_distribution AS (
    SELECT eez_code, observer_offset, COUNT(*) AS [count]
    FROM observer_offsets_norm
    GROUP BY eez_code, observer_offset
)

-- ── Final join ────────────────────────────────────────────────────────────────
SELECT
    od.eez_code,
    et.total_sets,
    et.total_trips,
    ISNULL(ot.observer_trips, 0)  AS observer_trips,
    od.observer_offset,
    od.[count]
FROM offset_distribution od
INNER JOIN eez_totals et             ON et.eez_code = od.eez_code
LEFT  JOIN observer_trips_per_eez ot ON ot.eez_code = od.eez_code
ORDER BY et.total_sets DESC, od.eez_code, od.observer_offset
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  eez_code:        String(r.eez_code).trim(),
  total_sets:      Number(r.total_sets),
  total_trips:     Number(r.total_trips),
  observer_trips:  Number(r.observer_trips),
  observer_offset: Number(r.observer_offset),
  count:           Number(r.count),
}))));
