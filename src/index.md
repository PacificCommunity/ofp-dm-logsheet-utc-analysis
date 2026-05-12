---
theme: air
title: Logsheet UTC analysis
toc: false
---

# Logsheet UTC analysis

```js
import * as d3 from "npm:d3";

// pairedOffsets: each row has observer_offset AND coordinate_offset for the SAME set.
// This ensures Table 1 only reflects sets where both observer and coordinate data exist.
const pairedOffsets   = await FileAttachment("data/observer-matched-coordinate-offset-per-vessel-flag.csv").csv({typed: true});
const obsOffsets      = await FileAttachment("data/observer-fishing-activities-offset-per-vessel-flag.csv").csv({typed: true});
const logVsObsOffsets = await FileAttachment("data/logsheet-vs-observer-offset-per-vessel-flag.csv").csv({typed: true});

// ── Table 1 helpers ────────────────────────────────────────────────────────
// Normalise offsets > 12 (e.g. UTC+13, UTC+14) to their [-12,+12] equivalent
// by subtracting 24. UTC+13 → UTC-11, UTC+14 → UTC-10.
// These are the same clock time but on opposite sides of the International Date Line.
function normaliseOffset(o) {
  return o > 12 ? o - 24 : o;
}

// Filter to LonglineLogsheet only; group by vessel_flag
const pairedLL     = pairedOffsets.filter(d => d.type === "LonglineLogsheet");
const pairedByFlag = d3.group(pairedLL, d => d.vessel_flag);

// For each flag compute the distribution overlap (histogram intersection):
//   overlap = sum_offset( min(p_obs[o], p_ll[o]) )  in [0, 1]
function distributionOverlap(rowsA, rowsB, keyA = "offset", keyB = "offset") {
  const totalA = d3.sum(rowsA, d => d.count);
  const totalB = d3.sum(rowsB, d => d.count);
  if (totalA === 0 || totalB === 0) return null;

  // Aggregate after normalisation (multiple source buckets may map to the same key)
  const mapA = new Map();
  for (const d of rowsA) {
    const k = normaliseOffset(d[keyA]);
    mapA.set(k, (mapA.get(k) ?? 0) + d.count / totalA);
  }
  const mapB = new Map();
  for (const d of rowsB) {
    const k = normaliseOffset(d[keyB]);
    mapB.set(k, (mapB.get(k) ?? 0) + d.count / totalB);
  }

  // Try shifts of -1, 0, +1 on B and return the best overlap.
  // This absorbs ±1h timezone boundary ambiguity (e.g. Marshall Islands at
  // 171°E sitting 1.5° west of the +11/+12 nautical boundary).
  let best = 0;
  for (let shift = -1; shift <= 1; shift++) {
    const allOffsets = new Set([...mapA.keys(), ...[...mapB.keys()].map(k => k + shift)]);
    let overlap = 0;
    for (const o of allOffsets) {
      overlap += Math.min(mapA.get(o) ?? 0, mapB.get(o - shift) ?? 0);
    }
    best = Math.max(best, overlap);
  }
  return best;
}

function dominantOffset(rows, key = "offset") {
  if (!rows || rows.length === 0) return "—";
  const top = rows.reduce((a, b) => b.count > a.count ? b : a);
  const v = normaliseOffset(top[key]);
  return `${v >= 0 ? "+" : ""}${v}h`;
}

const comparison = [...pairedByFlag.keys()]
  .map(flag => {
    const rows = pairedByFlag.get(flag);
    // Both distributions come from the same rows — observer_offset vs coordinate_offset
    // for the exact same sets. distributionOverlap handles normalisation internally.
    return {
      flag,
      overlap:     distributionOverlap(rows, rows, "observer_offset", "coordinate_offset"),
      pairedTotal: d3.sum(rows, d => d.count),
      dominantObs: dominantOffset(rows, "observer_offset"),
      dominantLL:  dominantOffset(rows, "coordinate_offset"),
    };
  })
  .sort((a, b) => b.overlap - a.overlap);

// ── Table 2 helpers ────────────────────────────────────────────────────────
// logVsObsOffsets: (type, vessel_flag, offset_bucket, count)
//   = logsheet local time − observer UTC time
// obsOffsets:      (type, vessel_flag, offset_bucket, count)
//   = observer local time − observer UTC time
// High overlap → logsheet times are consistent with observer UTC → reliable
// Low overlap  → logsheet times likely entered incorrectly (e.g. in UTC)

const logVsObsByTypeFlag = d3.rollup(logVsObsOffsets, rows => rows, d => d.type, d => d.vessel_flag);
const obsByTypeFlag      = d3.rollup(obsOffsets,      rows => rows, d => d.type, d => d.vessel_flag);

const TYPES = ["LonglineLogsheet", "PurseseineLogsheet"];
const TYPE_LABEL = { LonglineLogsheet: "Longline", PurseseineLogsheet: "Purseseine" };

// Collect all flags present in logVsObs for any type, sort by total count desc
const allLogVsObsFlags = [...new Set(logVsObsOffsets.map(d => d.vessel_flag))]
  .sort((a, b) => {
    const tot = flag => d3.sum(TYPES.flatMap(t => logVsObsByTypeFlag.get(t)?.get(flag) ?? []), d => d.count);
    return tot(b) - tot(a);
  });

const qualityRows = allLogVsObsFlags.flatMap(flag =>
  TYPES.flatMap(type => {
    const logRows = logVsObsByTypeFlag.get(type)?.get(flag) ?? [];
    const obsRows = obsByTypeFlag.get(type)?.get(flag) ?? [];
    if (logRows.length === 0 && obsRows.length === 0) return [];
    const overlap = distributionOverlap(logRows, obsRows, "offset_bucket", "offset_bucket");
    return [{
      flag,
      type: TYPE_LABEL[type],
      overlap,
      logTotal: d3.sum(logRows, d => d.count),
      obsTotal: d3.sum(obsRows, d => d.count),
      dominantLog: dominantOffset(logRows, "offset_bucket"),
      dominantObs: dominantOffset(obsRows, "offset_bucket"),
    }];
  })
);
```

## Observer offset vs logsheet coordinate offset — Longline by vessel flag

Distribution overlap between the UTC offset measured from **observer trip data** (longline sets)
and the UTC offset estimated from **the same set's GPS coordinates** (nautical formula: `ROUND(lond / 15°, 0)`),
per vessel flag — **only for sets where both an observer record and valid coordinates exist**.

Overlap is computed as the best histogram intersection across shifts of −1 h, 0, +1 h:
`overlap = max over δ∈{-1,0,+1} of Σ min(p_observer[h], p_coordinate[h+δ])` — 100 % = identical distributions, 0 % = no shared offset buckets within ±1 h.

This ±1 h tolerance absorbs boundary ambiguity for vessels fishing near a nautical timezone line
(e.g. Marshall Islands at 171°E, 1.5° west of the UTC+11/+12 boundary).

Offsets greater than UTC+12 (e.g. UTC+13 for Kiribati, Samoa; UTC+14 for Kiribati Line Islands) are folded
back into the [−12, +12] range before comparison (UTC+13 → UTC−11, UTC+14 → UTC−10).
These represent the same clock time on opposite sides of the International Date Line.

```js
const fmt = d3.format(",.0f");
const pct = v => v == null ? "—" : `${(v * 100).toFixed(1)} %`;

display(html`<table style="width:100%;border-collapse:collapse;font-size:0.9rem">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
      <th style="padding:6px 12px">Flag</th>
      <th style="padding:6px 12px;text-align:right">Overlap</th>
      <th style="padding:6px 12px;text-align:right">Paired sets</th>
      <th style="padding:6px 12px;text-align:center">Dominant observer offset</th>
      <th style="padding:6px 12px;text-align:center">Dominant coordinate offset</th>
    </tr>
  </thead>
  <tbody>
    ${comparison.map((row, i) => {
      const bg = i % 2 === 0 ? "transparent" : "#f9fafb";
      const bar = `linear-gradient(90deg,${row.overlap > 0.66 ? "#86efac" : row.overlap > 0.33 ? "#fde68a" : "#fca5a5"} ${(row.overlap*100).toFixed(1)}%,transparent 0)`;
      return html`<tr style="background:${bg}">
        <td style="padding:5px 12px;font-weight:600">${row.flag}</td>
        <td style="padding:5px 12px;text-align:right;background:${bar};font-variant-numeric:tabular-nums">${pct(row.overlap)}</td>
        <td style="padding:5px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmt(row.pairedTotal)}</td>
        <td style="padding:5px 12px;text-align:center">${row.dominantObs}</td>
        <td style="padding:5px 12px;text-align:center">${row.dominantLL}</td>
      </tr>`;
    })}
  </tbody>
</table>`);
```

## Logsheet local time quality — by vessel flag and logsheet type

Distribution overlap between the **observer's own UTC offset** (`obsv_set_dtime − obsv_utc_set_dtime`)
and the **offset implied by the logsheet's local time** (`log_set_dtime − obsv_utc_set_dtime`),
per vessel flag and logsheet type (sets from 2017 onwards).

High overlap → logsheet times are consistent with the observer UTC → times are likely **correct**.  
Low overlap → logsheet times diverge from observer UTC → times were likely **entered incorrectly** (e.g. in UTC rather than local time).

```js
display(html`<table style="width:100%;border-collapse:collapse;font-size:0.9rem">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
      <th style="padding:6px 12px">Flag</th>
      <th style="padding:6px 12px">Type</th>
      <th style="padding:6px 12px;text-align:right">Overlap</th>
      <th style="padding:6px 12px;text-align:right">Observer sets</th>
      <th style="padding:6px 12px;text-align:right">Logsheet sets</th>
      <th style="padding:6px 12px;text-align:center">Dominant observer offset</th>
      <th style="padding:6px 12px;text-align:center">Dominant logsheet offset</th>
    </tr>
  </thead>
  <tbody>
    ${qualityRows.map((row, i) => {
      const bg = i % 2 === 0 ? "transparent" : "#f9fafb";
      const bar = row.overlap == null
        ? "transparent"
        : `linear-gradient(90deg,${row.overlap > 0.66 ? "#86efac" : row.overlap > 0.33 ? "#fde68a" : "#fca5a5"} ${(row.overlap*100).toFixed(1)}%,transparent 0)`;
      return html`<tr style="background:${bg}">
        <td style="padding:5px 12px;font-weight:600">${row.flag}</td>
        <td style="padding:5px 12px;color:#6b7280">${row.type}</td>
        <td style="padding:5px 12px;text-align:right;background:${bar};font-variant-numeric:tabular-nums">${pct(row.overlap)}</td>
        <td style="padding:5px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmt(row.obsTotal)}</td>
        <td style="padding:5px 12px;text-align:right;font-variant-numeric:tabular-nums">${fmt(row.logTotal)}</td>
        <td style="padding:5px 12px;text-align:center">${row.dominantObs}</td>
        <td style="padding:5px 12px;text-align:center">${row.dominantLog}</td>
      </tr>`;
    })}
  </tbody>
</table>`);
```