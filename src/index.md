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

const psMap1 = new Map(psMatch.map(d => [d.vessel_flag, d]));
const allFlags1 = [...new Set([...llMatch.map(d => d.vessel_flag), ...psMatch.map(d => d.vessel_flag)])].sort();

const coordRows = allFlags1.map(flag => ({
  flag,
  ll: llMatch.find(d => d.vessel_flag === flag) ?? null,
  ps: psMap1.get(flag) ?? null,
})).sort((a, b) => {
  const pctA = a.ll?.match_pct ?? a.ps?.match_pct ?? 100;
  const pctB = b.ll?.match_pct ?? b.ps?.match_pct ?? 100;
  return pctA - pctB;
});

// ── Table 2: Logsheet set_time offset vs observer offset ──────────────────
const llTimeMatch = await FileAttachment("data/ll-logsheet-time-quality.csv").csv({typed: true});
const psTimeMatch = await FileAttachment("data/ps-logsheet-time-quality.csv").csv({typed: true});

const psMap2 = new Map(psTimeMatch.map(d => [d.vessel_flag, d]));
const allFlags2 = [...new Set([...llTimeMatch.map(d => d.vessel_flag), ...psTimeMatch.map(d => d.vessel_flag)])].sort();

const timeRows = allFlags2.map(flag => ({
  flag,
  ll: llTimeMatch.find(d => d.vessel_flag === flag) ?? null,
  ps: psMap2.get(flag) ?? null,
})).sort((a, b) => {
  const pctA = a.ll?.match_pct ?? a.ps?.match_pct ?? 100;
  const pctB = b.ll?.match_pct ?? b.ps?.match_pct ?? 100;
  return pctA - pctB;
});
```

## Observer offset vs logsheet coordinate offset — by vessel flag

For each **fishing set** that has both an **observer trip record** and a valid **GPS longitude**,
the table below shows what percentage of sets have a GPS-derived UTC offset that agrees
within ±1 h with the observer-recorded UTC offset.

**Method :**
- Coordinate offset: `ROUND(lond / 15.0, 0)` — nautical timezone formula
- Observer offset: `ROUND(DATEDIFF(MINUTE, utc_dtime, local_dtime) / 60.0 × 2, 0) / 2`
- Offsets > UTC+12 (e.g. Kiribati UTC+13/+14) are folded back: +13 → −11, +14 → −10
- Sets are **paired**: only sets where both an observer record and valid coordinates exist are included
- Longline: one set per day, matched to observer `l_set` on the same date
- Purseseine: multiple sets per day, each matched to the observer daily record (`s_day`) on the same date

```js
const fmt = n => n == null ? "—" : n.toLocaleString();
const pct = (v, n) => v == null ? "—" : html`<span style="font-variant-numeric:tabular-nums">${v.toFixed(1)} %</span><span style="color:#9ca3af;font-size:0.8em"> (${fmt(n)})</span>`;

const bar = (v, color) =>
  v == null ? "" : `background:linear-gradient(90deg,${color} ${v.toFixed(1)}%,transparent 0)`;

const color = v => v == null ? "" : v >= 80 ? "#86efac" : v >= 60 ? "#fde68a" : "#fca5a5";

display(html`<table style="width:100%;border-collapse:collapse;font-size:0.9rem">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
      <th style="padding:6px 12px">Flag</th>
      <th style="padding:6px 12px;text-align:right">Longline match (paired sets)</th>
      <th style="padding:6px 12px;text-align:right">Purseseine match (paired sets)</th>
    </tr>
  </thead>
  <tbody>
    ${coordRows.map((row, i) => html`<tr style="background:${i % 2 === 0 ? "transparent" : "#f9fafb"}">
      <td style="padding:5px 12px;font-weight:600">${row.flag}</td>
      <td style="padding:5px 12px;text-align:right;${bar(row.ll?.match_pct, color(row.ll?.match_pct))}">${pct(row.ll?.match_pct, row.ll?.total_sets)}</td>
      <td style="padding:5px 12px;text-align:right;${bar(row.ps?.match_pct, color(row.ps?.match_pct))}">${pct(row.ps?.match_pct, row.ps?.total_sets)}</td>
    </tr>`)}
  </tbody>
</table>`);
```

## Logsheet set time vs Observer set time — by vessel flag

For each **fishing set** that has a matching **observer trip set**,
The table below shows the percentage of matching, between the observer set time utc offset, 
and the logsheet set time utc offset calculated from the difference between the observer utc time and the logsheet timestamp.  
It's possible that the observer and the captain entered the set time not exactly at the same time, so there is a tolerance of 2h.  
However a difference of more than 2h is likely a data quality issue. If the calculated offset is 0, then it's  
the sign that the logsheet set time was entered entered in UTC.

**Method:**
- Logsheet datetime: `logdate + set_time` (combining date and HHMM time columns)
- Logsheet offset: `DATEDIFF(MINUTE, utc_set_dtime, logsheet_dt) / 60` — how far is the logsheet timestamp from observer UTC?
- Observer offset: `DATEDIFF(MINUTE, utc_set_dtime, set_dtime) / 60`
- Match if `ABS(logsheet_offset − observer_offset_normalised) ≤ 2`
- Offsets > UTC+12 are folded back across the dateline (+13 → −11, +14 → −10)


```js
display(html`<table style="width:100%;border-collapse:collapse;font-size:0.9rem">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
      <th style="padding:6px 12px">Flag</th>
      <th style="padding:6px 12px;text-align:right">Longline match (paired sets)</th>
      <th style="padding:6px 12px;text-align:right">Purseseine match (paired sets)</th>
    </tr>
  </thead>
  <tbody>
    ${timeRows.map((row, i) => html`<tr style="background:${i % 2 === 0 ? "transparent" : "#f9fafb"}">
      <td style="padding:5px 12px;font-weight:600">${row.flag}</td>
      <td style="padding:5px 12px;text-align:right;${bar(row.ll?.match_pct, color(row.ll?.match_pct))}">${pct(row.ll?.match_pct, row.ll?.total_sets)}</td>
      <td style="padding:5px 12px;text-align:right;${bar(row.ps?.match_pct, color(row.ps?.match_pct))}">${pct(row.ps?.match_pct, row.ps?.total_sets)}</td>
    </tr>`)}
  </tbody>
</table>`);
```