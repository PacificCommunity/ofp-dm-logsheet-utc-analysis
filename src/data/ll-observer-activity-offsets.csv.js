/**
 * Data loader: ll-observer-activity-offsets.csv.js
 *
 * The observer-activity dataset used both to visualise the training data and to
 * train the decision tree. One row per distinct (vessel_flag, eez_code, offset),
 * with `count` = number of observer fishing activities (sets) having that offset.
 *
 * Offset = observer vessel-time − UTC for each set, rounded to the nearest 0.5 h,
 * dateline-folded (>+12 h → −24) and clipped to |offset| ≤ 14. EEZ is taken from
 * the matching Longline logsheet set (joined by observer set date).
 *
 * Output columns: vessel_flag, eez_code, offset, count
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

-- ── One observer activity per (set) with flag, eez and raw offset ────────────
raw_activities AS (
    SELECT
        vf.flag_id AS vessel_flag,
        sl.eez_code,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl    ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN LLWithObserver lo  ON lo.log_trip_id = tl.log_trip_id
    INNER JOIN vessel_flag vf     ON vf.vessel_id   = tl.vessel_id
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = lo.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id  = 1
      AND sl.eez_code        IS NOT NULL
      AND sl.logdate         >= '${ANALYSIS_START_DATE}'
      AND os.utc_set_dtime   IS NOT NULL
      AND os.set_dtime        IS NOT NULL
),

-- ── Normalise across the dateline, clip outliers ─────────────────────────────
activities AS (
    SELECT
        vessel_flag,
        eez_code,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS offset
    FROM raw_activities
    WHERE ABS(observer_offset) <= 14
)

SELECT
    vessel_flag,
    eez_code,
    offset,
    COUNT(*) AS [count]
FROM activities
GROUP BY vessel_flag, eez_code, offset
ORDER BY vessel_flag, eez_code, offset
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  vessel_flag: String(r.vessel_flag).trim(),
  eez_code:    String(r.eez_code).trim(),
  offset:      Number(r.offset),
  count:       Number(r.count),
}))));
