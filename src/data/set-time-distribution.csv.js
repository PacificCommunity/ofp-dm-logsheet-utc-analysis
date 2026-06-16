/**
 * Data loader: set-time-distribution.csv.js
 *
 * Queries the PROD_LOCAL SQL Server instance for the hourly distribution of
 * fishing set start times for both logsheet types, and writes a CSV to stdout.
 *
 * Output columns: type, school_type, hour, count, pct
 *   type        — "LonglineLogsheet" | "PurseseineLogsheet"
 *   school_type — NULL (LL) | "Free school" | "FAD-associated" (PS)
 *   pct         — percentage within each (type, school_type) group (sums to 100)
 */

import odbc from "odbc";
import {csvFormat} from "d3-dsv";
import {CONNECTION_STRING, ANALYSIS_START_DATE} from "./db.js";

const SQL = `
    WITH all_sets AS (
        SELECT CAST(LEFT(set_time, 2) AS INT) AS hour,
               'LonglineLogsheet'             AS type,
               NULL                           AS school_type
        FROM log.sets_ll
        WHERE set_time IS NOT NULL
          AND l_activity_id = 1
          AND logdate >= '${ANALYSIS_START_DATE}'

        UNION ALL

        SELECT CAST(LEFT(set_time, 2) AS INT) AS hour,
               'PurseseineLogsheet'           AS type,
               CASE
                   WHEN school_id IN (1, 2)        THEN 'Free school'
                   WHEN school_id BETWEEN 3 AND 5  THEN 'FAD-associated'
                   ELSE NULL
               END                                 AS school_type
        FROM log.sets_ps
        WHERE set_time IS NOT NULL
          AND s_activity_id = 1
          AND logdate >= '${ANALYSIS_START_DATE}'
    )
    SELECT type,
           school_type,
           hour,
           COUNT(*)                                                                          AS [count],
           ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY type, school_type), 2) AS pct
    FROM all_sets
    GROUP BY type, school_type, hour
    ORDER BY type, school_type, hour
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
    type:        String(r.type),
    school_type: r.school_type != null ? String(r.school_type) : "",
    hour:        Number(r.hour),
    count:       Number(r.count),
    pct:         Number(r.pct),
}))));
