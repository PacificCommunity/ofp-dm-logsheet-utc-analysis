/**
 * Data loader: ll-trip-offset-count-per-eez.csv.js
 *
 * For each EEZ code, produces the distribution of "how many distinct UTC offsets
 * did a single Longline trip encounter?" bucketed into 1, 2, or 3+ offsets.
 *
 * This measures timezone stability within a trip: a trip with only 1 distinct offset
 * fished entirely in one timezone; 2+ suggests cross-timezone fishing.
 *
 * Output columns: eez_code, offset_bucket (1 | 2 | 3), trip_count, observer_trips
 *   offset_bucket = 3 means "3 or more distinct offsets"
 *   observer_trips = total observer-linked trips for that eez_code (repeated per row)
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

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

-- ── Raw observer offset per (eez_code, log_trip_id, set) ─────────────────────
raw_offsets AS (
    SELECT
        sl.eez_code,
        tl.log_trip_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl   ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN LLWithObserver lo  ON lo.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = lo.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id  = 1
      AND sl.eez_code        IS NOT NULL
      AND sl.logdate         >= '${ANALYSIS_START_DATE}'
      AND os.utc_set_dtime   IS NOT NULL
      AND os.set_dtime        IS NOT NULL
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

-- ── Count distinct offsets per (eez_code, log_trip_id) ───────────────────────
distinct_offset_count AS (
    SELECT eez_code, log_trip_id, COUNT(DISTINCT observer_offset) AS offset_count
    FROM trip_offsets_norm
    GROUP BY eez_code, log_trip_id
),

-- ── Bucket: 1, 2, or 3+ ──────────────────────────────────────────────────────
bucketed AS (
    SELECT
        eez_code,
        log_trip_id,
        CASE WHEN offset_count >= 3 THEN 3 ELSE offset_count END AS offset_bucket
    FROM distinct_offset_count
),

-- ── Count trips per (eez_code, offset_bucket) ────────────────────────────────
distribution AS (
    SELECT eez_code, offset_bucket, COUNT(*) AS trip_count
    FROM bucketed
    GROUP BY eez_code, offset_bucket
),

-- ── Total observer-linked trips per eez_code ─────────────────────────────────
totals AS (
    SELECT eez_code, COUNT(DISTINCT log_trip_id) AS observer_trips
    FROM trip_offsets_norm
    GROUP BY eez_code
)

SELECT
    d.eez_code,
    d.offset_bucket,
    d.trip_count,
    t.observer_trips
FROM distribution d
INNER JOIN totals t ON t.eez_code = d.eez_code
ORDER BY t.observer_trips DESC, d.eez_code, d.offset_bucket
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  eez_code:       String(r.eez_code).trim(),
  offset_bucket:  Number(r.offset_bucket),
  trip_count:     Number(r.trip_count),
  observer_trips: Number(r.observer_trips),
}))));
