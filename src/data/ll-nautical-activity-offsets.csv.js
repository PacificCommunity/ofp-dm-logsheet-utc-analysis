/**
 * Data loader: ll-nautical-activity-offsets.csv.js
 *
 * Computes the *nautical timezone offset* for every Longline logsheet fishing
 * set using the simple formula:   nautical_offset = ROUND(longitude / 15, 0)
 *
 * This is the "physics-based" baseline: a vessel exactly at 150 °E is 10 hours
 * ahead of UTC. Unlike observer-derived offsets it is a pure geographic
 * estimate — it ignores the captain's clock choice (e.g., using departure-port
 * time instead of local time).
 *
 * Unlike observer-activity-offsets, this loader covers ALL logsheet sets (not
 * only those with a matched observer trip), so the counts are much larger.
 *
 * Output columns: vessel_flag, eez_code, nautical_offset, count
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

-- ── All LL fishing sets with a valid longitude & EEZ ─────────────────────────
nautical AS (
    SELECT
        vf.flag_id AS vessel_flag,
        sl.eez_code,
        ROUND(CAST(sl.lond AS FLOAT) / 15.0, 0) AS nautical_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN vessel_flag vf  ON vf.vessel_id   = tl.vessel_id
    WHERE sl.l_activity_id = 1
      AND sl.eez_code       IS NOT NULL
      AND sl.lond            IS NOT NULL
      AND sl.logdate         >= '${ANALYSIS_START_DATE}'
      AND sl.lond BETWEEN -180 AND 180
)

SELECT
    vessel_flag,
    eez_code,
    nautical_offset,
    COUNT(*) AS [count]
FROM nautical
WHERE ABS(nautical_offset) <= 14
GROUP BY vessel_flag, eez_code, nautical_offset
ORDER BY vessel_flag, eez_code, nautical_offset
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  vessel_flag:     String(r.vessel_flag).trim(),
  eez_code:        String(r.eez_code).trim(),
  nautical_offset: Number(r.nautical_offset),
  count:           Number(r.count),
}))));
