/**
 * Data loader: logsheet-vs-observer-offset-per-vessel-flag.csv.js
 *
 * For each logsheet fishing set that has a matching observer set on the same date,
 * computes:
 *
 *   LogObsvUtcOffset = log_set_dtime − obsv_utc_set_dtime
 *
 * where log_set_dtime is the logsheet local datetime (logdate + set_time HHMM).
 * This is the offset that would be implied if the logsheet time were in local time
 * and the observer UTC is the truth. If this diverges from the observer's own
 * local↔UTC offset (obsv_set_dtime − obsv_utc_set_dtime), the logsheet local time
 * was likely entered incorrectly.
 *
 * Mirrors the logic of SetOffsetAnalysisRunner (C#).
 *
 * Output columns: type, vessel_flag, offset_bucket, count
 *   type         — "LonglineLogsheet" | "PurseseineLogsheet"
 *   offset_bucket — nearest 0.5 h; capped at ±14 h
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";

const CONN_STR =
  "Driver={ODBC Driver 17 for SQL Server};" +
  "Server=nouesql6;" +
  "Database=tufman2;" +
  "Trusted_Connection=yes;" +
  "TrustServerCertificate=yes;" +
  "ApplicationIntent=ReadOnly;";

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

-- ── Longline: log_set_dtime vs obsv_utc_set_dtime ─────────────────────────
-- Reconstruct log_set_dtime from logdate + set_time (HHMM char field)
-- Same date-join as SetOffsetAnalysisRunner.LonglineSql (both entity_link orientations)
ll_raw AS (
    SELECT
        tl.vessel_id,
        DATEADD(MINUTE,
            CAST(RIGHT(sl.set_time, 2) AS INT),
            DATEADD(HOUR,
                CAST(LEFT(sl.set_time, 2) AS INT),
                CAST(sl.logdate AS DATETIME2)
            )
        ) AS log_set_dtime,
        os.utc_set_dtime
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_left  = tl.log_trip_id
        AND el.dto_type_left  = 'LonglineLogsheetDTO'
        AND el.dto_type_right = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot  ON ot.obstrip_id = el.dto_guid_right
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = ot.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id    = 1
      AND sl.set_time         IS NOT NULL
      AND sl.set_time         <> ''
      AND LEN(sl.set_time)    = 4
      AND ISNUMERIC(sl.set_time) = 1
      AND CAST(LEFT(sl.set_time,  2) AS INT) BETWEEN 0 AND 23
      AND CAST(RIGHT(sl.set_time, 2) AS INT) BETWEEN 0 AND 59
      AND os.utc_set_dtime    IS NOT NULL
      AND tl.vessel_id        IS NOT NULL
      AND sl.logdate          >= '2017-01-01'

    UNION

    SELECT
        tl.vessel_id,
        DATEADD(MINUTE,
            CAST(RIGHT(sl.set_time, 2) AS INT),
            DATEADD(HOUR,
                CAST(LEFT(sl.set_time, 2) AS INT),
                CAST(sl.logdate AS DATETIME2)
            )
        ) AS log_set_dtime,
        os.utc_set_dtime
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_right = tl.log_trip_id
        AND el.dto_type_right = 'LonglineLogsheetDTO'
        AND el.dto_type_left  = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot  ON ot.obstrip_id = el.dto_guid_left
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = ot.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id    = 1
      AND sl.set_time         IS NOT NULL
      AND sl.set_time         <> ''
      AND LEN(sl.set_time)    = 4
      AND ISNUMERIC(sl.set_time) = 1
      AND CAST(LEFT(sl.set_time,  2) AS INT) BETWEEN 0 AND 23
      AND CAST(RIGHT(sl.set_time, 2) AS INT) BETWEEN 0 AND 59
      AND os.utc_set_dtime    IS NOT NULL
      AND tl.vessel_id        IS NOT NULL
      AND sl.logdate          >= '2017-01-01'
),
ll_offsets AS (
    SELECT
        vessel_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, utc_set_dtime, log_set_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS offset_bucket
    FROM ll_raw
),

-- ── Purseseine: log_set_dtime vs obsv s_day UTC time ────────────────────
-- obsv.s_daylog.utc_act_dtime is NULL for PS-linked trips; use the confirmed
-- working column: obsv.s_day.utc_start_dtime, matched to logsheet by date.
obs_daily AS (
    SELECT
        sd.obstrip_id,
        CAST(sd.start_dtime AS DATE)   AS act_date,
        sd.utc_start_dtime             AS utc_dtime
    FROM obsv.s_day sd
    WHERE sd.utc_start_dtime IS NOT NULL
),
ps_raw AS (
    SELECT
        tl.vessel_id,
        DATEADD(MINUTE,
            CAST(RIGHT(sl.set_time, 2) AS INT),
            DATEADD(HOUR,
                CAST(LEFT(sl.set_time, 2) AS INT),
                CAST(sl.logdate AS DATETIME2)
            )
        ) AS log_set_dtime,
        od.utc_dtime AS utc_set_dtime
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_left  = tl.log_trip_id
        AND el.dto_type_left  = 'PurseseineLogsheetDTO'
        AND el.dto_type_right = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot ON ot.obstrip_id = el.dto_guid_right
    INNER JOIN obs_daily od
        ON  od.obstrip_id = ot.obstrip_id
        AND od.act_date   = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id  = 1
      AND sl.set_time        IS NOT NULL
      AND sl.set_time        <> ''
      AND LEN(sl.set_time)   = 4
      AND ISNUMERIC(sl.set_time) = 1
      AND CAST(LEFT(sl.set_time,  2) AS INT) BETWEEN 0 AND 23
      AND CAST(RIGHT(sl.set_time, 2) AS INT) BETWEEN 0 AND 59
      AND tl.vessel_id       IS NOT NULL
      AND sl.logdate         >= '2017-01-01'

    UNION

    SELECT
        tl.vessel_id,
        DATEADD(MINUTE,
            CAST(RIGHT(sl.set_time, 2) AS INT),
            DATEADD(HOUR,
                CAST(LEFT(sl.set_time, 2) AS INT),
                CAST(sl.logdate AS DATETIME2)
            )
        ) AS log_set_dtime,
        od.utc_dtime AS utc_set_dtime
    FROM log.sets_ps sl
    INNER JOIN log.trips_ps tl ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN tufman2.entity_links el
        ON  el.dto_guid_right = tl.log_trip_id
        AND el.dto_type_right = 'PurseseineLogsheetDTO'
        AND el.dto_type_left  = 'ObserverTripDTO'
    INNER JOIN obsv.trip ot ON ot.obstrip_id = el.dto_guid_left
    INNER JOIN obs_daily od
        ON  od.obstrip_id = ot.obstrip_id
        AND od.act_date   = CAST(sl.logdate AS DATE)
    WHERE sl.s_activity_id  = 1
      AND sl.set_time        IS NOT NULL
      AND sl.set_time        <> ''
      AND LEN(sl.set_time)   = 4
      AND ISNUMERIC(sl.set_time) = 1
      AND CAST(LEFT(sl.set_time,  2) AS INT) BETWEEN 0 AND 23
      AND CAST(RIGHT(sl.set_time, 2) AS INT) BETWEEN 0 AND 59
      AND tl.vessel_id       IS NOT NULL
      AND sl.logdate         >= '2017-01-01'
),
ps_offsets AS (
    SELECT
        vessel_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, utc_set_dtime, log_set_dtime) AS FLOAT) / 60.0 * 2,
            0
        ) / 2.0 AS offset_bucket
    FROM ps_raw
)

-- ── Aggregate both types ─────────────────────────────────────────────────────
SELECT
    'LonglineLogsheet'  AS type,
    vf.flag_id          AS vessel_flag,
    ll.offset_bucket,
    COUNT(*)            AS [count]
FROM ll_offsets ll
INNER JOIN vessel_flag vf ON vf.vessel_id = ll.vessel_id
WHERE ABS(ll.offset_bucket) <= 14
GROUP BY vf.flag_id, ll.offset_bucket

UNION ALL

SELECT
    'PurseseineLogsheet' AS type,
    vf.flag_id           AS vessel_flag,
    ps.offset_bucket,
    COUNT(*)             AS [count]
FROM ps_offsets ps
INNER JOIN vessel_flag vf ON vf.vessel_id = ps.vessel_id
WHERE ABS(ps.offset_bucket) <= 14
GROUP BY vf.flag_id, ps.offset_bucket

ORDER BY type, vessel_flag, offset_bucket
`;

const conn = await odbc.connect(CONN_STR);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  type:          String(r.type),
  vessel_flag:   String(r.vessel_flag).trim(),
  offset_bucket: Number(r.offset_bucket),
  count:         Number(r.count),
}))));
