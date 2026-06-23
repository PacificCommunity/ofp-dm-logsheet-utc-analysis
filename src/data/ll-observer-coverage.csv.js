/**
 * Data loader: ll-observer-coverage.csv.js
 *
 * Longline observer coverage per vessel flag (since ANALYSIS_START_DATE):
 *   - how many Longline logsheet trips exist
 *   - how many of those have a linked observer trip
 *   - the resulting coverage percentage
 *   - the total number of observer fishing sets reported on those trips
 *
 * Used to assess whether there is enough observer data to train a model that
 * predicts the UTC offset for every Longline logsheet.
 *
 * Output columns:
 *   vessel_flag       — most-recent flag from ref.vessel_instances
 *   n_logsheets       — total LL logsheet trips for the flag
 *   n_observer_trips  — LL logsheet trips with a linked observer trip
 *   coverage_pct      — n_observer_trips / n_logsheets (0..1)
 *   n_observer_sets   — total fishing sets reported by the linked observer trips
 */

import odbc from "odbc";
import { csvFormat } from "d3-dsv";
import { CONNECTION_STRING, ANALYSIS_START_DATE } from "./db.js";

const SQL = `
WITH

-- ── Latest active vessel flag per vessel ──────────────────────────────────────
vessel_flag AS (
    SELECT DISTINCT
        vi.vessel_id,
        FIRST_VALUE(vi.flag_id) OVER (
            PARTITION BY vi.vessel_id
            ORDER BY vi.start_date DESC
        ) AS flag_id
    FROM ref.vessel_instances vi
    WHERE vi.flag_id IS NOT NULL
),

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

-- ── Longline logsheet trips active since the analysis start date ─────────────
ll_trips AS (
    SELECT DISTINCT tl.log_trip_id, tl.vessel_id
    FROM log.trips_ll tl
    INNER JOIN log.sets_ll sl ON sl.log_trip_id = tl.log_trip_id
    WHERE sl.l_activity_id = 1
      AND sl.logdate      >= '${ANALYSIS_START_DATE}'
),

-- ── Per-trip: linked-observer flag + observer set count ──────────────────────
trip_flags AS (
    SELECT
        t.log_trip_id,
        vf.flag_id AS vessel_flag,
        CASE WHEN lo.obstrip_id IS NOT NULL THEN 1 ELSE 0 END AS has_observer,
        lo.obstrip_id
    FROM ll_trips t
    INNER JOIN vessel_flag vf ON vf.vessel_id = t.vessel_id
    LEFT  JOIN LLWithObserver lo ON lo.log_trip_id = t.log_trip_id
),

-- ── Observer set counts per linked observer trip ─────────────────────────────
obs_set_counts AS (
    SELECT lo.log_trip_id, COUNT(*) AS n_sets
    FROM LLWithObserver lo
    INNER JOIN obsv.l_set os ON os.obstrip_id = lo.obstrip_id
    WHERE CAST(os.set_date AS DATE) >= '${ANALYSIS_START_DATE}'
    GROUP BY lo.log_trip_id
)

SELECT
    tf.vessel_flag,
    COUNT(DISTINCT tf.log_trip_id) AS n_logsheets,
    COUNT(DISTINCT CASE WHEN tf.has_observer = 1 THEN tf.log_trip_id END) AS n_observer_trips,
    ISNULL(SUM(osc.n_sets), 0) AS n_observer_sets
FROM trip_flags tf
LEFT JOIN obs_set_counts osc ON osc.log_trip_id = tf.log_trip_id
GROUP BY tf.vessel_flag
ORDER BY n_logsheets DESC
`;

const conn = await odbc.connect(CONNECTION_STRING);
const rows = await conn.query(SQL);
await conn.close();

process.stdout.write(csvFormat(rows.map(r => {
  const nLog = Number(r.n_logsheets);
  const nObs = Number(r.n_observer_trips);
  return {
    vessel_flag:      String(r.vessel_flag).trim(),
    n_logsheets:      nLog,
    n_observer_trips: nObs,
    coverage_pct:     nLog ? nObs / nLog : 0,
    n_observer_sets:  Number(r.n_observer_sets),
  };
})));
