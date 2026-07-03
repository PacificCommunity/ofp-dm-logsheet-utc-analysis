/**
 * Data loader: ll-observer-port-offsets.csv.js
 *
 * The observer-activity offset dataset grouped by the trip's DEPARTURE PORT
 * (rather than by EEZ). One row per distinct (depart_port_id, offset), with
 * `count` = number of observer fishing activities (sets) on trips departing that
 * port that carried the given measured offset.
 *
 * Offset = observer vessel-time − UTC per set, rounded to the nearest 0.5 h,
 * dateline-folded (>+12 h → −24) and clipped to |offset| ≤ 14. The departure
 * port comes from log.trips_ll.depart_port_id → ref.ports.
 *
 * Used by the "By departure port" section of observer-offsets.md to show the
 * observer-measured offset distribution for trips leaving each port.
 *
 * Output columns: depart_port_id, depart_port_name, country_code, offset, count
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

-- ── Entity-link bridge: LL logsheet ↔ observer trip ──────────────────────────
LLWithObserver AS (
    SELECT el.dto_guid_left  AS log_trip_id,
           el.dto_guid_right AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'LonglineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'
    UNION
    SELECT el.dto_guid_right AS log_trip_id,
           el.dto_guid_left  AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_right = 'LonglineLogsheetDTO'
      AND el.dto_type_left  = 'ObserverTripDTO'
),

-- ── One observer activity per set, tagged with its trip's departure port ─────
raw_activities AS (
    SELECT
        tl.depart_port_id,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl    ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN LLWithObserver lo  ON lo.log_trip_id = tl.log_trip_id
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = lo.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id    = 1
      AND tl.depart_port_id    IS NOT NULL
      AND sl.logdate           >= '${ANALYSIS_START_DATE}'
      AND os.utc_set_dtime      IS NOT NULL
      AND os.set_dtime          IS NOT NULL
),

activities AS (
    SELECT
        depart_port_id,
        CASE WHEN observer_offset > 12
             THEN observer_offset - 24
             ELSE observer_offset
        END AS offset
    FROM raw_activities
    WHERE ABS(observer_offset) <= 14
)

SELECT
    a.depart_port_id,
    p.port_name       AS depart_port_name,
    p.country_code,
    a.offset,
    COUNT(*)          AS [count]
FROM activities a
LEFT JOIN ref.ports p ON p.port_id = a.depart_port_id
GROUP BY a.depart_port_id, p.port_name, p.country_code, a.offset
ORDER BY p.port_name, a.offset
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => ({
  depart_port_id:   String(r.depart_port_id).trim(),
  depart_port_name: (r.depart_port_name ?? "").toString().trim(),
  country_code:     (r.country_code ?? "").toString().trim(),
  offset:           Number(r.offset),
  count:            Number(r.count),
}))));
