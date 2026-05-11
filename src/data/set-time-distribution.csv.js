/**
 * Data loader: set-time-distribution.csv.js
 *
 * Queries the PROD_LOCAL SQL Server instance for the hourly distribution of
 * fishing set start times for both logsheet types, and writes a CSV to stdout.
 *
 * Output columns: type, hour, count, pct
 *   type  — "LonglineLogsheet" | "PurseseineLogsheet"
 *   pct   — percentage within each type (sums to 100 per type)
 */

import odbc from "odbc";
import {csvFormat} from "d3-dsv";
import {CONNECTION_STRING} from "./db.js";

const SQL = `
    WITH all_sets AS (SELECT CAST(LEFT(set_time, 2) AS INT) AS hour,
                             'LonglineLogsheet'             AS type
                      FROM log.sets_ll
                      WHERE set_time IS NOT NULL
                        AND l_activity_id = 1
                        AND logdate >= '2017-01-01'

                      UNION ALL

                      SELECT CAST(LEFT(set_time, 2) AS INT) AS hour,
                             'PurseseineLogsheet'           AS type
                      FROM log.sets_ps
                      WHERE set_time IS NOT NULL
                        AND s_activity_id = 1
                        AND logdate >= '2017-01-01')
    SELECT type,
           hour,
           COUNT(*)                                                            AS [count],
           ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY type), 2) AS pct
    FROM all_sets
    GROUP BY type, hour
    ORDER BY type, hour
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
    type: String(r.type),
    hour: Number(r.hour),
    count: Number(r.count),
    pct: Number(r.pct),
}))));
