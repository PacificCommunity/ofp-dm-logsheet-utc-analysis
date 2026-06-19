/**
 * Data loader: ll-decision-tree-features.csv.js
 *
 * For each observer-linked Longline logsheet trip, extracts the features used to
 * build the in-page UTC offset decision tree, plus the known modal observer offset
 * (the source of truth).
 *
 * Output columns:
 *   log_trip_id      — logsheet trip identifier
 *   vessel_flag      — most-recent flag from ref.vessel_instances
 *   primary_eez_code — EEZ with the most fishing sets in this trip
 *   instance_source  — bigint matching TufmanInstance enum (e.g. 512 = WS)
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

-- ── Normalised observer offsets per (trip, set) ───────────────────────────────
ll_offsets AS (
    SELECT
        lo.log_trip_id,
        CASE
            WHEN ROUND(CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT) / 60.0 * 2, 0) / 2.0 > 12
            THEN ROUND(CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT) / 60.0 * 2, 0) / 2.0 - 24
            ELSE ROUND(CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT) / 60.0 * 2, 0) / 2.0
        END AS observer_offset
    FROM LLWithObserver lo
    INNER JOIN obsv.l_set os ON os.obstrip_id = lo.obstrip_id
    WHERE os.utc_set_dtime IS NOT NULL
      AND os.set_dtime     IS NOT NULL
      AND CAST(os.set_date AS DATE) >= '${ANALYSIS_START_DATE}'
),

-- ── Discard outliers ──────────────────────────────────────────────────────────
ll_offsets_clean AS (
    SELECT log_trip_id, observer_offset
    FROM ll_offsets
    WHERE ABS(observer_offset) <= 14
),

-- ── Modal offset per trip ─────────────────────────────────────────────────────
ll_offset_counts AS (
    SELECT log_trip_id, observer_offset, COUNT(*) AS cnt
    FROM ll_offsets_clean
    GROUP BY log_trip_id, observer_offset
),
ll_modal_offset AS (
    SELECT log_trip_id, observer_offset AS modal_offset
    FROM ll_offset_counts
    WHERE cnt = (
        SELECT MAX(c2.cnt) FROM ll_offset_counts c2
        WHERE c2.log_trip_id = ll_offset_counts.log_trip_id
    )
),

-- ── Primary EEZ per trip (EEZ with most fishing sets) ────────────────────────
ll_eez_counts AS (
    SELECT tl.log_trip_id, sl.eez_code, COUNT(*) AS set_cnt
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN LLWithObserver lo ON lo.log_trip_id = tl.log_trip_id
    WHERE sl.l_activity_id = 1
      AND sl.eez_code IS NOT NULL
      AND sl.logdate >= '${ANALYSIS_START_DATE}'
    GROUP BY tl.log_trip_id, sl.eez_code
),
ll_primary_eez AS (
    SELECT log_trip_id, eez_code AS primary_eez_code
    FROM ll_eez_counts
    WHERE set_cnt = (
        SELECT MAX(e2.set_cnt) FROM ll_eez_counts e2
        WHERE e2.log_trip_id = ll_eez_counts.log_trip_id
    )
)

-- ── Final join ────────────────────────────────────────────────────────────────
SELECT DISTINCT
    tl.log_trip_id,
    vf.flag_id              AS vessel_flag,
    pe.primary_eez_code,
    tl.instance_source,
    mo.modal_offset
FROM log.trips_ll tl
INNER JOIN LLWithObserver lo    ON lo.log_trip_id = tl.log_trip_id
INNER JOIN vessel_flag vf       ON vf.vessel_id   = tl.vessel_id
INNER JOIN ll_modal_offset mo   ON mo.log_trip_id = tl.log_trip_id
LEFT  JOIN ll_primary_eez pe    ON pe.log_trip_id = tl.log_trip_id
ORDER BY tl.log_trip_id
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  log_trip_id:      String(r.log_trip_id).trim(),
  vessel_flag:      String(r.vessel_flag).trim(),
  primary_eez_code: r.primary_eez_code != null ? String(r.primary_eez_code).trim() : "",
  instance_source:  r.instance_source != null ? Number(r.instance_source) : "",
  modal_offset:     Number(r.modal_offset),
}))));
