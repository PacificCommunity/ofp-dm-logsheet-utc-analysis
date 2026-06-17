/**
 * Data loader: ps-fad-set-hour-classification.csv.js
 *
 * For each observer-linked Purseseine logsheet trip, records the set_time hour
 * and school type for every fishing set (school_id 1–5), alongside the trip's
 * modal UTC offset derived from observer data.
 *
 * This data is used to determine — per instance_source — whether set_time was
 * entered as local time or UTC, using the "sunrise test":
 *   FAD sets (school_id 3–5) must occur before sunrise (~06:00 local time).
 *   Whichever interpretation (as-recorded vs UTC-adjusted) produces ~94% FAD
 *   sets before 06:00 is the correct one for that instance.
 *
 * Output columns:
 *   log_trip_id       — logsheet trip identifier
 *   instance_source   — bitmask from log.trips_ps (links to TufmanInstance enum)
 *   modal_utc_offset  — most frequent observer-derived UTC offset for this trip
 *   set_hour          — CAST(LEFT(set_time, 2) AS INT) from log.sets_ps
 *   school_type       — "Free school" (school_id 1-2) | "FAD-associated" (school_id 3-5)
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

-- ── Entity-link bridge: PS logsheet ↔ observer trip ──────────────────────────
-- UNION ALL is safe: the two legs cover opposite link directions (no duplicates).
PSWithObserver AS (
    SELECT el.dto_guid_left  AS log_trip_id,
           el.dto_guid_right AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'PurseseineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'

    UNION ALL

    SELECT el.dto_guid_right AS log_trip_id,
           el.dto_guid_left  AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_right = 'PurseseineLogsheetDTO'
      AND el.dto_type_left  = 'ObserverTripDTO'
),

-- ── Pre-compute date and offset from obsv.s_day once ─────────────────────────
s_day_offsets AS (
    SELECT
        obstrip_id,
        CAST(start_dtime AS DATE) AS set_date,
        ROUND(
            CAST(DATEDIFF(MINUTE, utc_start_dtime, start_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM obsv.s_day
    WHERE utc_start_dtime IS NOT NULL
      AND start_dtime      IS NOT NULL
),

-- ── Normalised observer offset per (trip, day) ────────────────────────────────
ps_offsets AS (
    SELECT
        po.log_trip_id,
        CASE
            WHEN sd.observer_offset > 12 THEN sd.observer_offset - 24
            ELSE sd.observer_offset
        END AS observer_offset
    FROM PSWithObserver po
    INNER JOIN s_day_offsets sd ON sd.obstrip_id = po.obstrip_id
    WHERE ABS(sd.observer_offset) <= 14
),

-- ── Modal offset per trip ─────────────────────────────────────────────────────
offset_counts AS (
    SELECT log_trip_id, observer_offset, COUNT(*) AS cnt
    FROM ps_offsets
    GROUP BY log_trip_id, observer_offset
),
modal_offset AS (
    SELECT log_trip_id, observer_offset AS modal_utc_offset
    FROM offset_counts
    WHERE cnt = (
        SELECT MAX(c2.cnt) FROM offset_counts c2
        WHERE c2.log_trip_id = offset_counts.log_trip_id
    )
)

-- ── Final: one row per (trip, set) with school type and hour ──────────────────
SELECT DISTINCT
    tl.log_trip_id,
    tl.instance_source,
    mo.modal_utc_offset,
    CAST(LEFT(sl.set_time, 2) AS INT) AS set_hour,
    CASE
        WHEN sl.school_id IN (1, 2)       THEN 'Free school'
        WHEN sl.school_id BETWEEN 3 AND 5 THEN 'FAD-associated'
    END AS school_type
FROM log.sets_ps sl
INNER JOIN log.trips_ps tl   ON tl.log_trip_id = sl.log_trip_id
INNER JOIN PSWithObserver po ON po.log_trip_id = tl.log_trip_id
INNER JOIN modal_offset mo   ON mo.log_trip_id = tl.log_trip_id
WHERE sl.s_activity_id = 1
  AND sl.set_time       IS NOT NULL
  AND LEN(sl.set_time)  >= 2
  AND sl.logdate        >= '${ANALYSIS_START_DATE}'
  AND sl.school_id      BETWEEN 1 AND 5
  AND tl.instance_source IS NOT NULL
ORDER BY tl.log_trip_id
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  log_trip_id:      String(r.log_trip_id).trim(),
  instance_source:  Number(r.instance_source),
  modal_utc_offset: Number(r.modal_utc_offset),
  set_hour:         Number(r.set_hour),
  school_type:      String(r.school_type).trim(),
}))));
