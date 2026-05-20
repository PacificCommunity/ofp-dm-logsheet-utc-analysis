/**
 * Data loader: entities-system-source.csv.js
 *
 * For each Date+Time migration candidate entity that carries a system_source
 * column, returns distinct system_source values with record counts.
 *
 * Output columns: entity, schema, system_source, row_count
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING } from "./db.js";

const SQL = `
SELECT 'HandlineLogsheet'           AS entity, 'log'      AS [schema], ISNULL(system_source,'(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_hl              GROUP BY system_source
UNION ALL
SELECT 'LonglineLogsheet'           AS entity, 'log'      AS [schema], ISNULL(system_source,'(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_ll              GROUP BY system_source
UNION ALL
SELECT 'PoleAndLineLogsheet'        AS entity, 'log'      AS [schema], ISNULL(system_source,'(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_pl              GROUP BY system_source
UNION ALL
SELECT 'PurseseineLogsheet'         AS entity, 'log'      AS [schema], ISNULL(system_source,'(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_ps              GROUP BY system_source
UNION ALL
SELECT 'SnapperLogsheet'            AS entity, 'log'      AS [schema], ISNULL(system_source,'(null)') AS system_source, COUNT(*) AS row_count FROM log.trips_ds              GROUP BY system_source
UNION ALL
SELECT 'ObserverTrip'               AS entity, 'obsv'     AS [schema], ISNULL(system_source,'(null)') AS system_source, COUNT(*) AS row_count FROM obsv.trip                GROUP BY system_source
UNION ALL
SELECT 'CarrierObserverTrip'        AS entity, 'obsv'     AS [schema], ISNULL(system_source,'(null)') AS system_source, COUNT(*) AS row_count FROM obsv.carrier_trip         GROUP BY system_source
ORDER BY [schema], entity, row_count DESC
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  entity:        String(r.entity).trim(),
  schema:        String(r.schema).trim(),
  system_source: String(r.system_source).trim(),
  row_count:     Number(r.row_count),
}))));
