/**
 * Data loader: log-system-source.csv.js
 *
 * For each entity in the "log" schema that carries a system_source column,
 * returns distinct system_source values with record counts.
 *
 * Only the 6 logsheet (trip-level) tables carry system_source.
 * The 19 activity/catch child tables do not.
 *
 * Output columns: entity, db_table, system_source, row_count
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING } from "./db.js";

const SQL = `
SELECT 'HandlineLogsheet'    AS entity, 'log.trips_hl' AS db_table, ISNULL(system_source, '(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_hl  GROUP BY system_source
UNION ALL
SELECT 'LonglineLogsheet'    AS entity, 'log.trips_ll' AS db_table, ISNULL(system_source, '(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_ll  GROUP BY system_source
UNION ALL
SELECT 'PoleAndLineLogsheet' AS entity, 'log.trips_pl' AS db_table, ISNULL(system_source, '(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_pl  GROUP BY system_source
UNION ALL
SELECT 'PurseseineLogsheet'  AS entity, 'log.trips_ps' AS db_table, ISNULL(system_source, '(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_ps  GROUP BY system_source
UNION ALL
SELECT 'SnapperLogsheet'     AS entity, 'log.trips_ds' AS db_table, ISNULL(system_source, '(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_ds  GROUP BY system_source
UNION ALL
SELECT 'VietnamLogsheet'     AS entity, 'log.trips_vn' AS db_table, ISNULL(system_source, '(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_vn  GROUP BY system_source
ORDER BY entity, row_count DESC
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  entity:        String(r.entity).trim(),
  db_table:      String(r.db_table).trim(),
  system_source: String(r.system_source).trim(),
  row_count:     Number(r.row_count),
}))));
