/**
 * Data loader: observer-fishing-activities-offset-per-instance.csv.js
 *
 * For observer trips linked to a logsheet, computes the UTC offset implied by
 * the observer's own datetime data, grouped by logsheet instance_source and type.
 *
 *  LonglineLogsheet   — offset from obsv.l_set.set_dtime − utc_set_dtime (per set)
 *  PurseseineLogsheet — offset from obsv.s_day.start_dtime − utc_start_dtime (per day)
 *
 * Output columns: type, instance_source, offset_bucket, count
 *   instance_source — bigint matching TufmanInstance enum (e.g. 512 = WS)
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

-- ── Longline: linked observer trips + logsheet instance_source ────────────────
ll_obs_trips AS (
    SELECT el.dto_guid_right AS obstrip_id, el.dto_guid_left AS log_trip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'LonglineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'
    UNION
    SELECT el.dto_guid_left AS obstrip_id, el.dto_guid_right AS log_trip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'ObserverTripDTO'
      AND el.dto_type_right = 'LonglineLogsheetDTO'
),
ll_offsets AS (
    SELECT
        tl.instance_source,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS offset_bucket
    FROM ll_obs_trips lt
    INNER JOIN log.trips_ll tl  ON tl.log_trip_id = lt.log_trip_id
    INNER JOIN obsv.l_set   os  ON os.obstrip_id  = lt.obstrip_id
    WHERE os.utc_set_dtime IS NOT NULL
      AND os.set_dtime     IS NOT NULL
      AND tl.instance_source IS NOT NULL
      AND CAST(os.set_date AS DATE) >= '${ANALYSIS_START_DATE}'
),

-- ── Purseseine: linked observer trips + logsheet instance_source ──────────────
ps_obs_trips AS (
    SELECT el.dto_guid_right AS obstrip_id, el.dto_guid_left AS log_trip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'PurseseineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'
    UNION
    SELECT el.dto_guid_left AS obstrip_id, el.dto_guid_right AS log_trip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'ObserverTripDTO'
      AND el.dto_type_right = 'PurseseineLogsheetDTO'
),
ps_offsets AS (
    SELECT
        tl.instance_source,
        ROUND(
            CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS offset_bucket
    FROM ps_obs_trips pt
    INNER JOIN log.trips_ps tl  ON tl.log_trip_id = pt.log_trip_id
    INNER JOIN obsv.s_day   sd  ON sd.obstrip_id  = pt.obstrip_id
    WHERE sd.utc_start_dtime IS NOT NULL
      AND sd.start_dtime     IS NOT NULL
      AND tl.instance_source IS NOT NULL
      AND CAST(sd.start_dtime AS DATE) >= '${ANALYSIS_START_DATE}'
)

-- ── Union both types ──────────────────────────────────────────────────────────
SELECT
    'LonglineLogsheet'   AS type,
    lo.instance_source,
    lo.offset_bucket,
    COUNT(*)             AS [count]
FROM ll_offsets lo
WHERE ABS(lo.offset_bucket) <= 14
GROUP BY lo.instance_source, lo.offset_bucket

UNION ALL

SELECT
    'PurseseineLogsheet' AS type,
    po.instance_source,
    po.offset_bucket,
    COUNT(*)             AS [count]
FROM ps_offsets po
WHERE ABS(po.offset_bucket) <= 14
GROUP BY po.instance_source, po.offset_bucket

ORDER BY type, instance_source, offset_bucket
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  type:            String(r.type),
  instance_source: Number(r.instance_source),
  offset_bucket:   Number(r.offset_bucket),
  count:           Number(r.count),
}))));
