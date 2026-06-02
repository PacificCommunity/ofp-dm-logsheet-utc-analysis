/**
 * Data loader: ps-trip-training-features.csv.js
 *
 * For each observer-linked Purseseine logsheet trip, extracts the features
 * used to train the Bayesian UTC offset estimator, plus the known modal offset.
 *
 * Output columns:
 *   log_trip_id      — logsheet trip identifier
 *   vessel_flag      — most-recent flag from ref.vessel_instances
 *   primary_eez_code — EEZ with the most fishing sets in this trip
 *   departure_month  — MONTH(depart_date), 1–12, NULL if unknown
 *   modal_offset     — most frequent normalised observer offset for this trip
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

-- ── Normalised observer offsets per (trip, day) ───────────────────────────────
ps_offsets AS (
    SELECT
        po.log_trip_id,
        CASE
            WHEN ROUND(CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT) / 60.0 * 2, 0) / 2.0 > 12
            THEN ROUND(CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT) / 60.0 * 2, 0) / 2.0 - 24
            ELSE ROUND(CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT) / 60.0 * 2, 0) / 2.0
        END AS observer_offset
    FROM PSWithObserver po
    INNER JOIN obsv.s_day sd ON sd.obstrip_id = po.obstrip_id
    WHERE sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime     IS NOT NULL
      AND CAST(sd.start_dtime AS DATE) >= '${ANALYSIS_START_DATE}'
),

-- ── Discard outliers ──────────────────────────────────────────────────────────
ps_offsets_clean AS (
    SELECT log_trip_id, observer_offset
    FROM ps_offsets
    WHERE ABS(observer_offset) <= 14
),

-- ── Modal offset per trip ─────────────────────────────────────────────────────
ps_offset_counts AS (
    SELECT log_trip_id, observer_offset, COUNT(*) AS cnt
    FROM ps_offsets_clean
    GROUP BY log_trip_id, observer_offset
),
ps_modal_offset AS (
    SELECT log_trip_id, observer_offset AS modal_offset
    FROM ps_offset_counts
    WHERE cnt = (
        SELECT MAX(c2.cnt) FROM ps_offset_counts c2
        WHERE c2.log_trip_id = ps_offset_counts.log_trip_id
    )
),

-- ── Primary EEZ per trip (EEZ with most fishing sets) ────────────────────────
ps_eez_counts AS (
    SELECT tl.log_trip_id, sl.eez_code, COUNT(*) AS set_cnt
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN PSWithObserver po ON po.log_trip_id = tl.log_trip_id
    WHERE sl.s_activity_id = 1
      AND sl.eez_code IS NOT NULL
      AND sl.logdate >= '${ANALYSIS_START_DATE}'
    GROUP BY tl.log_trip_id, sl.eez_code
),
ps_primary_eez AS (
    SELECT log_trip_id, eez_code AS primary_eez_code
    FROM ps_eez_counts
    WHERE set_cnt = (
        SELECT MAX(e2.set_cnt) FROM ps_eez_counts e2
        WHERE e2.log_trip_id = ps_eez_counts.log_trip_id
    )
)

-- ── Final join ────────────────────────────────────────────────────────────────
SELECT DISTINCT
    tl.log_trip_id,
    vf.flag_id              AS vessel_flag,
    pe.primary_eez_code,
    MONTH(tl.depart_date)   AS departure_month,
    mo.modal_offset
FROM log.trips_ps tl
INNER JOIN PSWithObserver po    ON po.log_trip_id = tl.log_trip_id
INNER JOIN vessel_flag vf       ON vf.vessel_id   = tl.vessel_id
INNER JOIN ps_modal_offset mo   ON mo.log_trip_id = tl.log_trip_id
LEFT  JOIN ps_primary_eez pe    ON pe.log_trip_id = tl.log_trip_id
ORDER BY tl.log_trip_id
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  log_trip_id:      String(r.log_trip_id).trim(),
  vessel_flag:      String(r.vessel_flag).trim(),
  primary_eez_code: r.primary_eez_code != null ? String(r.primary_eez_code).trim() : "",
  departure_month:  r.departure_month != null ? Number(r.departure_month) : "",
  modal_offset:     Number(r.modal_offset),
}))));
