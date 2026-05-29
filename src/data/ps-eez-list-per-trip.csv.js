/**
 * Data loader: ps-eez-list-per-trip.csv.js
 *
 * For all Purseseine trips since 2017, produces the distribution of unique sorted
 * EEZ code combinations fished across all sets of a trip.
 *
 * Examples: a trip fishing only in Papua New Guinea EEZ → "PG"; a trip spanning
 * Papua New Guinea and Solomon Islands → "PG,SB".
 *
 * Covers ALL trips (not just observer-linked).
 *
 * Output columns: eez_list, trip_count, total_trips
 *   total_trips = total distinct trips with at least one valid EEZ set (repeated per row)
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

-- ── Distinct (trip, eez) pairs — one row per unique EEZ a trip fished in ──────
distinct_eez_per_trip AS (
    SELECT DISTINCT
        tl.log_trip_id,
        sl.eez_code
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    WHERE sl.s_activity_id = 1
      AND sl.eez_code IS NOT NULL
      AND sl.logdate >= '${ANALYSIS_START_DATE}'
),

-- ── Sorted EEZ list per trip ──────────────────────────────────────────────────
trip_eez_list AS (
    SELECT
        log_trip_id,
        STRING_AGG(eez_code, ',') WITHIN GROUP (ORDER BY eez_code) AS eez_list
    FROM distinct_eez_per_trip
    GROUP BY log_trip_id
),

-- ── Count trips per unique EEZ list ──────────────────────────────────────────
distribution AS (
    SELECT eez_list, COUNT(*) AS trip_count
    FROM trip_eez_list
    GROUP BY eez_list
),

-- ── Total trips in scope ──────────────────────────────────────────────────────
totals AS (
    SELECT COUNT(*) AS total_trips FROM trip_eez_list
)

SELECT
    d.eez_list,
    d.trip_count,
    t.total_trips
FROM distribution d, totals t
ORDER BY d.trip_count DESC
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  eez_list:    String(r.eez_list).trim(),
  trip_count:  Number(r.trip_count),
  total_trips: Number(r.total_trips),
}))));
