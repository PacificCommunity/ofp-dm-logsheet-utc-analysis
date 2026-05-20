/**
 * Data loader: entities-to-migrate.csv.js
 *
 * Counts records for every entity that has both *Date (DateTime) and *Time (char4)
 * fields and is therefore a candidate for DateTimeOffset migration.
 *
 * Output columns: entity, schema, db_table, row_count
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING } from "./db.js";

const SQL = `
-- LogsheetDomainBase subclasses (log schema)
SELECT 'HandlineLogsheet'    AS entity, 'log' AS [schema], 'log.trips_hl' AS db_table, COUNT(*) AS row_count FROM log.trips_hl
UNION ALL
SELECT 'LonglineLogsheet',   'log', 'log.trips_ll', COUNT(*) FROM log.trips_ll
UNION ALL
SELECT 'PoleAndLineLogsheet','log', 'log.trips_pl', COUNT(*) FROM log.trips_pl
UNION ALL
SELECT 'PurseseineLogsheet', 'log', 'log.trips_ps', COUNT(*) FROM log.trips_ps
UNION ALL
SELECT 'SnapperLogsheet',    'log', 'log.trips_ds', COUNT(*) FROM log.trips_ds

-- ActivityDomainBase subclasses (log schema)
UNION ALL
SELECT 'HandlineActivity',    'log', 'log.sets_hl', COUNT(*) FROM log.sets_hl
UNION ALL
SELECT 'LonglineActivity',    'log', 'log.sets_ll', COUNT(*) FROM log.sets_ll
UNION ALL
SELECT 'PoleAndLineActivity', 'log', 'log.sets_pl', COUNT(*) FROM log.sets_pl
UNION ALL
SELECT 'PurseseineActivity',  'log', 'log.sets_ps', COUNT(*) FROM log.sets_ps
UNION ALL
SELECT 'SnapperActivity',     'log', 'log.sets_ds', COUNT(*) FROM log.sets_ds

-- ObserverDaylogBase subclasses (obsv schema)
UNION ALL
SELECT 'ObserverPurseseineDaylog',  'obsv', 'obsv.s_daylog', COUNT(*) FROM obsv.s_daylog
UNION ALL
SELECT 'ObserverPoleAndLineDaylog', 'obsv', 'obsv.p_daylog', COUNT(*) FROM obsv.p_daylog

-- Observer concrete classes
UNION ALL
SELECT 'ObserverTrip',                        'obsv', 'obsv.trip',                COUNT(*) FROM obsv.trip
UNION ALL
SELECT 'CarrierObserverTrip',                 'obsv', 'obsv.carrier_trip',        COUNT(*) FROM obsv.carrier_trip
UNION ALL
SELECT 'CarrierObserverTransshipmentActivity','obsv', 'obsv.carrier_transshipment',COUNT(*) FROM obsv.carrier_transshipment
UNION ALL
SELECT 'ObserverLonglineSet',                 'obsv', 'obsv.l_set',              COUNT(*) FROM obsv.l_set
UNION ALL
SELECT 'ObserverLonglineSetCatch',            'obsv', 'obsv.l_setcatch',         COUNT(*) FROM obsv.l_setcatch

-- log schema misc
UNION ALL
SELECT 'NetShareReceive', 'log', 'log.net_share_receives', COUNT(*) FROM log.net_share_receives
UNION ALL
SELECT 'Transshipment',   'log', 'log.transshipments',     COUNT(*) FROM log.transshipments

-- Tagging
UNION ALL
SELECT 'TaggingBaitCaptureSet', 'tagging', 'tagging.bait_capture_sets', COUNT(*) FROM tagging.bait_capture_sets

ORDER BY [schema], entity
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  entity:    String(r.entity).trim(),
  schema:    String(r.schema).trim(),
  db_table:  String(r.db_table).trim(),
  row_count: Number(r.row_count),
}))));
