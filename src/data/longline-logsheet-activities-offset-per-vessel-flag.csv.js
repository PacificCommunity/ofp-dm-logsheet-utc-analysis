/**
 * Data loader: longline-logsheet-activities-offset-per-vessel-flag.csv.js
 *
 * Loads all fishing sets from both logsheet types, groups by vessel flag
 * and rounded coordinates (0.1° grid), then resolves the IANA timezone via
 * geo-tz (same underlying data as GeoTimeZone in .NET) and converts to a
 * UTC offset in hours.
 *
 * Output columns: type, vessel_flag, offset, count
 *   type — "LonglineLogsheet" | "PurseseineLogsheet"
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
// geo-tz v8 is CJS; use default import and destructure
import geoTzDefault from "geo-tz";
const { find } = geoTzDefault;
import { CONNECTION_STRING } from "./db.js";

// Aggregate by (type, vessel_flag, 1° grid cell) to minimise geo-tz lookups.
// latd / lond are stored as decimal(13,8).
const SQL = `
  WITH vessel_flag AS (SELECT DISTINCT vi.vessel_id,
                                       FIRST_VALUE(vi.flag_id) OVER (
                                         PARTITION BY vi.vessel_id
                                         ORDER BY vi.start_date DESC
                                         ) AS flag_id
                       FROM ref.vessel_instances vi
                       WHERE vi.flag_id IS NOT NULL),
       all_sets AS (
         -- Longline fishing sets (l_activity_id = 1)
         SELECT 'LonglineLogsheet' AS type,
                vf.flag_id         AS vessel_flag,
                ROUND(sl.latd, 0)  AS lat_r,
                ROUND(sl.lond, 0)  AS lon_r
         FROM log.sets_ll sl
                INNER JOIN log.trips_ll tl
                           ON tl.log_trip_id = sl.log_trip_id
                INNER JOIN vessel_flag vf
                           ON vf.vessel_id = tl.vessel_id
         WHERE sl.l_activity_id = 1
           AND sl.latd IS NOT NULL
           AND sl.lond IS NOT NULL
           AND sl.latd BETWEEN -90 AND 90
           AND sl.lond BETWEEN -180 AND 180
           AND tl.vessel_id IS NOT NULL
           AND sl.logdate >= '2017-01-01'

         UNION ALL

         -- Purseseine fishing sets (all sets_ps with valid coordinates)
         SELECT 'PurseseineLogsheet' AS type,
                vf.flag_id           AS vessel_flag,
                ROUND(sl.latd, 0)    AS lat_r,
                ROUND(sl.lond, 0)    AS lon_r
         FROM log.sets_ps sl
                INNER JOIN log.trips_ps tl
                           ON tl.log_trip_id = sl.log_trip_id
                INNER JOIN vessel_flag vf
                           ON vf.vessel_id = tl.vessel_id
         WHERE sl.s_activity_id = 1
           AND sl.latd IS NOT NULL
           AND sl.lond IS NOT NULL
           AND sl.latd BETWEEN -90 AND 90
           AND sl.lond BETWEEN -180 AND 180
           AND tl.vessel_id IS NOT NULL
           AND sl.logdate >= '2017-01-01')
  SELECT type,
         vessel_flag,
         lat_r,
         lon_r,
         COUNT(*) AS [count]
  FROM all_sets
  GROUP BY type, vessel_flag, lat_r, lon_r
  ORDER BY type, vessel_flag, lat_r, lon_r
`;

/**
 * Convert an IANA timezone name to a UTC offset in hours (±0.5 h resolution)
 * using a fixed reference date (January 2020 = standard time in most zones).
 */
function tzToOffsetHours(tzName) {
  try {
    const refDate = new Date("2020-01-15T12:00:00Z");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tzName,
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
      hour12: false,
    }).formatToParts(refDate);
    const get = t => parseInt(parts.find(p => p.type === t)?.value ?? "0", 10);
    const h = get("hour") === 24 ? 0 : get("hour");
    const localMs = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
    const offsetMinutes = (localMs - refDate.getTime()) / 60000;
    return Math.round(offsetMinutes / 30) * 0.5; // nearest 0.5 h
  } catch {
    return null;
  }
}

// Cache (lat_r, lon_r) → offset so each unique cell is only looked up once
const coordCache = new Map();

function coordToOffset(lat, lon) {
  const key = `${lat},${lon}`;
  if (coordCache.has(key)) return coordCache.get(key);
  const tzNames = find(lat, lon);
  const offset = tzNames.length > 0 ? tzToOffsetHours(tzNames[0]) : null;
  coordCache.set(key, offset);
  return offset;
}

// ── Query ────────────────────────────────────────────────────────────────────
const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

// ── Enrich & re-aggregate ─────────────────────────────────────────────────────
const agg = new Map(); // key: "type|vessel_flag|offset" → total count

for (const row of rows) {
  const type  = String(row.type);
  const flag  = String(row.vessel_flag).trim();
  const lat   = Number(row.lat_r);
  const lon   = Number(row.lon_r);
  const count = Number(row.count);

  const offset = coordToOffset(lat, lon);
  if (offset === null || !isFinite(offset)) continue;

  const key = `${type}|${flag}|${offset}`;
  agg.set(key, (agg.get(key) ?? 0) + count);
}

// ── Output ────────────────────────────────────────────────────────────────────
const result = [...agg.entries()]
  .map(([key, count]) => {
    const parts = key.split("|");
    return {
      type:        parts[0],
      vessel_flag: parts[1],
      offset:      Number(parts[2]),
      count,
    };
  })
  .sort((a, b) =>
    a.type.localeCompare(b.type) ||
    a.vessel_flag.localeCompare(b.vessel_flag) ||
    a.offset - b.offset
  );

process.stdout.write(csvFormat(result));
