---
theme: air
title: Logsheet UTC analysis
toc: false
---

# Logsheet UTC analysis

```js
// ── Table 1: GPS coordinate offset vs observer offset ─────────────────────
const llMatch = await FileAttachment("data/ll-observer-coordinate-match.csv").csv({typed: true});
const psMatch = await FileAttachment("data/ps-observer-coordinate-match.csv").csv({typed: true});

// Derive unique flags across both datasets
const allFlags1 = [...new Set([...llMatch.map(d => d.vessel_flag), ...psMatch.map(d => d.vessel_flag)])].sort();
const psMap1 = new Map(psMatch.map(d => [d.vessel_flag, d]));

// Group ll rows by vessel_flag → array of port rows
const llByFlag = Map.groupBy(llMatch, d => d.vessel_flag);

// Build display rows: a header row per flag (aggregate LL + PS), then one port sub-row per departure port
const coordRows = allFlags1.flatMap(flag => {
  const llPorts = llByFlag.get(flag) ?? [];
  const ps = psMap1.get(flag) ?? null;

  // Compute aggregate LL totals for the flag header row
  const llTotal    = llPorts.reduce((s, d) => s + d.total_sets,    0);
  const llMatching = llPorts.reduce((s, d) => s + d.matching_sets, 0);
  const llAggrPct  = llTotal > 0 ? Math.round(10 * 100 * llMatching / llTotal) / 10 : null;
  const llAggr     = llTotal > 0 ? { total_sets: llTotal, matching_sets: llMatching, match_pct: llAggrPct } : null;

  const header = { flag, isHeader: true, ll: llAggr, ps };

  // Only show port sub-rows when there are multiple ports
  const portRows = llPorts.length > 1
    ? llPorts
        .sort((a, b) => a.match_pct - b.match_pct)
        .map(d => ({ flag, isHeader: false, portName: d.port_name, ll: d, ps: null }))
    : [];

  return [header, ...portRows];
});

// ── Table 2: Logsheet set_time offset vs observer offset (Longline only) ────
// NOTE: Purseseine is excluded — obsv.s_daylog.utc_act_dtime is NULL for 83%
// of fishing rows, making per-set UTC comparison unreliable for PS.
const llTimeMatch = await FileAttachment("data/ll-logsheet-time-quality.csv").csv({typed: true});

const timeRows = [...llTimeMatch].sort((a, b) => a.match_pct - b.match_pct);
```

## Observer offset vs logsheet coordinate offset — by vessel flag and departure port

For each **fishing set** that has both an **observer trip record** and a valid **GPS longitude**,
the table below shows what percentage of sets have a GPS-derived UTC offset that agrees
within ±1 h with the observer-recorded UTC offset.

**Method :**
- Coordinate offset: `ROUND(lond / 15.0, 0)` — nautical timezone formula
- Observer offset: `ROUND(DATEDIFF(MINUTE, utc_dtime, local_dtime) / 60.0 × 2, 0) / 2`
- Offsets > UTC+12 (e.g. Kiribati UTC+13/+14) are folded back: +13 → −11, +14 → −10
- Sets are **paired**: only sets where both an observer record and valid coordinates exist are included
- Longline: one set per day, matched to observer `l_set` on the same date; grouped by departure port
- Purseseine: multiple sets per day, each matched to the observer daily record (`s_day`) on the same date

```js
const fmt = n => n == null ? "—" : n.toLocaleString();
const pct = (v, n) => v == null ? "—" : html`<span style="font-variant-numeric:tabular-nums">${v.toFixed(1)} %</span><span style="color:#9ca3af;font-size:0.8em"> (${fmt(n)})</span>`;

const bar = (v, col) =>
  v == null ? "" : `background:linear-gradient(90deg,${col} ${v.toFixed(1)}%,transparent 0)`;

const color = v => v == null ? "" : v >= 80 ? "#86efac" : v >= 60 ? "#fde68a" : "#fca5a5";

display(html`<table style="width:100%;border-collapse:collapse;font-size:0.9rem">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
      <th style="padding:6px 12px">Flag</th>
      <th style="padding:6px 12px">Departure port</th>
      <th style="padding:6px 12px;text-align:right">Longline match (paired sets)</th>
      <th style="padding:6px 12px;text-align:right">Purseseine match (paired sets)</th>
    </tr>
  </thead>
  <tbody>
    ${coordRows.map((row, i) => {
      const bg = row.isHeader ? "#f1f5f9" : (i % 2 === 0 ? "transparent" : "#f9fafb");
      const flagCell = row.isHeader
        ? html`<td style="padding:5px 12px;font-weight:700;border-top:1px solid #e5e7eb" colspan="${row.ll ? 1 : 2}">${row.flag}</td>`
        : html`<td style="padding:5px 12px"></td>`;
      const portCell = row.isHeader
        ? (row.ll ? html`<td style="padding:5px 12px;font-style:italic;color:#6b7280;border-top:1px solid #e5e7eb">all ports</td>` : html``)
        : html`<td style="padding:5px 12px;padding-left:2rem;color:#374151">${row.portName}</td>`;
      return html`<tr style="background:${bg}">
        ${flagCell}
        ${portCell}
        <td style="padding:5px 12px;text-align:right;${bar(row.ll?.match_pct, color(row.ll?.match_pct))}">${pct(row.ll?.match_pct, row.ll?.total_sets)}</td>
        <td style="padding:5px 12px;text-align:right;${bar(row.ps?.match_pct, color(row.ps?.match_pct))}">${pct(row.ps?.match_pct, row.ps?.total_sets)}</td>
      </tr>`;
    })}
  </tbody>
</table>`);
```

## Logsheet set time vs Observer set time — Longline only

For each **longline fishing set** that has a matching **observer trip set**,
the table below shows the percentage of sets where the logsheet set time
agrees with the observer-recorded UTC offset.

> **Note — Purseseine excluded**: The PS observer database stores UTC timestamps only
> at the daily level (`s_day.utc_start_dtime`). Per-set UTC times (`s_daylog.utc_act_dtime`)
> are NULL for 83 % of fishing rows, making this comparison unreliable for PS.

**Method:**
- Logsheet datetime: `logdate + set_time` (combining date and HHMM time columns)
- Logsheet offset: `DATEDIFF(MINUTE, utc_set_dtime, logsheet_dt) / 60` — how far is the logsheet timestamp from observer UTC?
- Observer offset: `DATEDIFF(MINUTE, utc_set_dtime, set_dtime) / 60`
- Match if `ABS(logsheet_offset − observer_offset_normalised) ≤ 1`
- Offsets > UTC+12 are folded back across the dateline (+13 → −11, +14 → −10)


```js
display(html`<table style="width:100%;border-collapse:collapse;font-size:0.9rem">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
      <th style="padding:6px 12px">Flag</th>
      <th style="padding:6px 12px;text-align:right">Longline match (paired sets)</th>
    </tr>
  </thead>
  <tbody>
    ${timeRows.map((row, i) => html`<tr style="background:${i % 2 === 0 ? "transparent" : "#f9fafb"}">
      <td style="padding:5px 12px;font-weight:600">${row.vessel_flag}</td>
      <td style="padding:5px 12px;text-align:right;${bar(row.match_pct, color(row.match_pct))}">${pct(row.match_pct, row.total_sets)}</td>
    </tr>`)}
  </tbody>
</table>`);
```