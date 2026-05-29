/**
 * Data loader: observer-fishing-activities-offset-per-vessel-flag.csv.js
 *
 * For observer trips linked to a logsheet, computes the UTC offset implied by
 * the observer's own datetime data, grouped by vessel flag and logsheet type.
 *
 *  LonglineLogsheet  — offset from obsv.l_set.set_dtime − utc_set_dtime (per set)
 *  PurseseineLogsheet — offset from obsv.s_day.start_dtime − utc_start_dtime (per day)
 *
 * Output columns: type, vessel_flag, offset_bucket, count
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH vessel_flag AS (
    SELECT DISTINCT
        vi.vessel_id,
        FIRST_VALUE(vi.flag_id) OVER (
            PARTITION BY vi.vessel_id
            ORDER BY vi.start_date DESC
        ) AS flag_id
    FROM ref.vessel_instances vi
    WHERE vi.flag_id IS NOT NULL
),

-- ── Longline: linked observer trips → obsv.l_set ──────────────────────────
ll_obs_trips AS (
    SELECT el.dto_guid_right AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'LonglineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'
    UNION
    SELECT el.dto_guid_left AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'ObserverTripDTO'
      AND el.dto_type_right = 'LonglineLogsheetDTO'
),
ll_offsets AS (
    SELECT
        ot.vessel_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS offset_bucket
    FROM ll_obs_trips lt
    INNER JOIN obsv.trip ot  ON ot.obstrip_id = lt.obstrip_id
    INNER JOIN obsv.l_set os ON os.obstrip_id = ot.obstrip_id
    WHERE os.utc_set_dtime IS NOT NULL
      AND os.set_dtime     IS NOT NULL
      AND ot.vessel_id     IS NOT NULL
      AND CAST(os.set_date AS DATE) >= '${ANALYSIS_START_DATE}'
),

-- ── Purseseine: linked observer trips → obsv.s_day ────────────────────────
ps_obs_trips AS (
    SELECT el.dto_guid_right AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'PurseseineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'
    UNION
    SELECT el.dto_guid_left AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'ObserverTripDTO'
      AND el.dto_type_right = 'PurseseineLogsheetDTO'
),
ps_offsets AS (
    SELECT
        ot.vessel_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS offset_bucket
    FROM ps_obs_trips pt
    INNER JOIN obsv.trip  ot ON ot.obstrip_id = pt.obstrip_id
    INNER JOIN obsv.s_day sd ON sd.obstrip_id = ot.obstrip_id
    WHERE sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime     IS NOT NULL
      AND ot.vessel_id       IS NOT NULL
      AND CAST(sd.start_dtime AS DATE) >= '${ANALYSIS_START_DATE}'
)

-- ── Union both types ─────────────────────────────────────────────────────────
SELECT
    'LonglineLogsheet'   AS type,
    vf.flag_id           AS vessel_flag,
    lo.offset_bucket,
    COUNT(*)             AS [count]
FROM ll_offsets lo
INNER JOIN vessel_flag vf ON vf.vessel_id = lo.vessel_id
WHERE ABS(lo.offset_bucket) <= 14
GROUP BY vf.flag_id, lo.offset_bucket

UNION ALL

SELECT
    'PurseseineLogsheet' AS type,
    vf.flag_id           AS vessel_flag,
    po.offset_bucket,
    COUNT(*)             AS [count]
FROM ps_offsets po
INNER JOIN vessel_flag vf ON vf.vessel_id = po.vessel_id
WHERE ABS(po.offset_bucket) <= 14
GROUP BY vf.flag_id, po.offset_bucket

ORDER BY type, vessel_flag, offset_bucket
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  type:          String(r.type),
  vessel_flag:   String(r.vessel_flag).trim(),
  offset_bucket: Number(r.offset_bucket),
  count:         Number(r.count),
}))));
