/**
 * tmp-investigate5.mjs
 *
 * Investigation: validate s_daylog CROSS APPLY with derived UTC.
 * utc_act_dtime is NULL in this dataset, so we derive it:
 *   derived_utc_act_dtime = act_dtime - DATEDIFF(MINUTE, utc_start_dtime, start_dtime)
 *
 * PS Logsheet trip:  ff8b39d5-59e4-c1e5-0d99-3a1f7b736990
 * Observer trip:     452ec417-ea4b-7909-d50b-3a1fec5e8c28
 */

import odbc from "odbc";
import { CONNECTION_STRING } from "./src/data/db.js";

const SQL = `
SELECT
    sl.logdate,
    sl.set_time,

    DATEADD(MINUTE,
        CAST(LEFT(sl.set_time, 2) AS INT) * 60 + CAST(RIGHT(sl.set_time, 2) AS INT),
        CAST(sl.logdate AS DATETIME))                                   AS logsheet_dt,

    sdl.act_dtime,

    DATEADD(MINUTE,
        -DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime),
        sdl.act_dtime)                                                  AS derived_utc_act_dtime,

    ABS(DATEDIFF(MINUTE, sdl.act_dtime,
        DATEADD(MINUTE,
            CAST(LEFT(sl.set_time, 2) AS INT) * 60 + CAST(RIGHT(sl.set_time, 2) AS INT),
            CAST(sl.logdate AS DATETIME))))                              AS closest_match_min,

    CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT) / 60.0
                                                                        AS daily_offset_h,

    ROUND(CAST(DATEDIFF(MINUTE,
        DATEADD(MINUTE, -DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime), sdl.act_dtime),
        DATEADD(MINUTE,
            CAST(LEFT(sl.set_time, 2) AS INT) * 60 + CAST(RIGHT(sl.set_time, 2) AS INT),
            CAST(sl.logdate AS DATETIME))
    ) AS FLOAT) / 60.0 * 2, 0) / 2.0                                   AS logsheet_offset,

    ROUND(CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT)
          / 60.0 * 2, 0) / 2.0                                          AS observer_offset,

    CASE
        WHEN ABS(
            ROUND(CAST(DATEDIFF(MINUTE,
                DATEADD(MINUTE, -DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime), sdl.act_dtime),
                DATEADD(MINUTE,
                    CAST(LEFT(sl.set_time, 2) AS INT) * 60 + CAST(RIGHT(sl.set_time, 2) AS INT),
                    CAST(sl.logdate AS DATETIME))
            ) AS FLOAT) / 60.0 * 2, 0) / 2.0
            -
            ROUND(CAST(DATEDIFF(MINUTE, sd.utc_start_dtime, sd.start_dtime) AS FLOAT)
                  / 60.0 * 2, 0) / 2.0
        ) <= 1 THEN 'MATCH' ELSE 'no'
    END                                                                  AS match

FROM log.sets_ps sl
INNER JOIN log.trips_ps tp
    ON  tp.log_trip_id = sl.log_trip_id

INNER JOIN obsv.s_day sd
    ON  sd.obstrip_id = '452ec417-ea4b-7909-d50b-3a1fec5e8c28'
    AND CAST(sd.start_dtime AS DATE) = CAST(sl.logdate AS DATE)

CROSS APPLY (
    SELECT TOP 1 sdl2.act_dtime
    FROM obsv.s_daylog sdl2
    INNER JOIN obsv.s_day sd2 ON sd2.s_day_id = sdl2.s_day_id
    WHERE sd2.obstrip_id = '452ec417-ea4b-7909-d50b-3a1fec5e8c28'
      AND CAST(sdl2.act_dtime AS DATE) = CAST(sl.logdate AS DATE)
      AND sdl2.s_activ_id = 1
    ORDER BY ABS(DATEDIFF(MINUTE, sdl2.act_dtime,
        DATEADD(MINUTE,
            CAST(LEFT(sl.set_time, 2) AS INT) * 60 + CAST(RIGHT(sl.set_time, 2) AS INT),
            CAST(sl.logdate AS DATETIME))))
) AS sdl

WHERE tp.log_trip_id = 'ff8b39d5-59e4-c1e5-0d99-3a1f7b736990'
  AND sl.s_activity_id = 1
  AND sl.set_time IS NOT NULL
  AND LEN(sl.set_time) = 4
  AND ISNUMERIC(sl.set_time) = 1
ORDER BY sl.logdate, sl.set_time
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

if (rows.length === 0) { console.log("No rows."); process.exit(0); }

const cols = ["logdate","set_time","logsheet_dt","act_dtime","derived_utc_act_dtime","closest_match_min","daily_offset_h","logsheet_offset","observer_offset","match"];
const fmt = v => v == null ? "NULL" : v instanceof Date ? v.toISOString().replace("T"," ").slice(0,19) : String(v);
const widths = cols.map(c => Math.max(c.length, ...rows.map(r => fmt(r[c]).length)));

console.log(`\n${rows.length} rows\n`);
console.log(cols.map((c,i) => c.padEnd(widths[i])).join(" | "));
console.log(widths.map(w => "─".repeat(w)).join("─┼─"));
for (const r of rows) {
  console.log(cols.map((c,i) => fmt(r[c]).padEnd(widths[i])).join(" | "));
}

const matches = rows.filter(r => r.match === "MATCH").length;
console.log(`\nMatching: ${matches} / ${rows.length} (${(100*matches/rows.length).toFixed(1)}%)`);
