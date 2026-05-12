---
theme: air
title: Logsheet UTC analysis
toc: false
---

# Logsheet UTC analysis

```js
const llMatch = await FileAttachment("data/ll-observer-coordinate-match.csv").csv({typed: true});
const psMatch = await FileAttachment("data/ps-observer-coordinate-match.csv").csv({typed: true});

// Join LL and PS by vessel_flag
const psMap = new Map(psMatch.map(d => [d.vessel_flag, d]));
const allFlags = [...new Set([...llMatch.map(d => d.vessel_flag), ...psMatch.map(d => d.vessel_flag)])].sort();

const rows = allFlags.map(flag => {
  const ll = llMatch.find(d => d.vessel_flag === flag) ?? null;
  const ps = psMap.get(flag) ?? null;
  return { flag, ll, ps };
}).sort((a, b) => {
  // Sort by LL match_pct ascending (worst first); fall back to PS if no LL
  const pctA = a.ll?.match_pct ?? a.ps?.match_pct ?? 100;
  const pctB = b.ll?.match_pct ?? b.ps?.match_pct ?? 100;
  return pctA - pctB;
});
```

## Observer offset vs logsheet coordinate offset — by vessel flag

For each **fishing set** that has both an **observer trip record** and a valid **GPS longitude**,
the table below shows what percentage of sets have a GPS-derived UTC offset that agrees
within ±1 h with the observer-recorded UTC offset.

**Method (computed entirely in SQL):**
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
    ${rows.map((row, i) => html`<tr style="background:${i % 2 === 0 ? "transparent" : "#f9fafb"}">
      <td style="padding:5px 12px;font-weight:600">${row.flag}</td>
      <td style="padding:5px 12px;text-align:right;${bar(row.ll?.match_pct, color(row.ll?.match_pct))}">${pct(row.ll?.match_pct, row.ll?.total_sets)}</td>
      <td style="padding:5px 12px;text-align:right;${bar(row.ps?.match_pct, color(row.ps?.match_pct))}">${pct(row.ps?.match_pct, row.ps?.total_sets)}</td>
    </tr>`)}
  </tbody>
</table>`);
```