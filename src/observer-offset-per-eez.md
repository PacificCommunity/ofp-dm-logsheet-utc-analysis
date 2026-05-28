---
theme: air
title: Observer offset distribution by EEZ
toc: false
---

# Observer offset distribution by EEZ

UTC offset recorded by observers, grouped by **EEZ code** where the fishing sets occurred.

Distribution shows how many **trips** (not sets) had each unique combination of offsets,
sorted from most to least common.

- **Longline** — offset from `obsv.l_set.set_dtime − utc_set_dtime`, matched by observer trip + date
- **Purseseine** — offset from `obsv.s_day.start_dtime − utc_start_dtime`, one daily record matched by date
- Only sets since 2017 where `eez_code IS NOT NULL` are included
- Offsets outside ±14 h and dateline-shifted values (>+12 h folded by −24) are normalised
- Offsets per trip are deduplicated and sorted before grouping

```js
import * as d3 from "npm:d3";
import { html } from "npm:htl";
import { offsetGrid, offsetCard } from "./components/offset-charts.js";

const llRaw = await FileAttachment("data/ll-trip-offset-list-per-eez.csv").csv({typed: true});
const psRaw = await FileAttachment("data/ps-trip-offset-list-per-eez.csv").csv({typed: true});

const llByEez = d3.rollup(llRaw, rows => rows, d => d.eez_code);
const psByEez = d3.rollup(psRaw, rows => rows, d => d.eez_code);

// Total observer trips per EEZ (stored on every row, take first)
const llTotals = d3.rollup(llRaw, rows => rows[0].observer_trips, d => d.eez_code);
const psTotals = d3.rollup(psRaw, rows => rows[0].observer_trips, d => d.eez_code);

// All EEZ codes sorted by LL observer trips desc, then PS
const allEezCodes = [...new Set([...llByEez.keys(), ...psByEez.keys()])]
  .sort((a, b) => {
    const llA = llTotals.get(a) ?? 0;
    const llB = llTotals.get(b) ?? 0;
    if (llB !== llA) return llB - llA;
    return (psTotals.get(b) ?? 0) - (psTotals.get(a) ?? 0);
  });

function offsetListSection(rows, label, totalTrips) {
  if (!rows || rows.length === 0) {
    return html`<div style="color:#9ca3af;font-size:0.85rem;padding:0.5rem 0">No ${label} observer data</div>`;
  }
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const pct = n => (n / totalTrips * 100).toFixed(1);
  return html`<div style="margin-bottom:0.75rem">
    <div style="font-weight:600;font-size:0.8rem;color:#6b7280;margin-bottom:0.3rem">${label} — ${d3.format(",")(totalTrips)} trips with observer</div>
    <table style="width:100%;font-size:0.82rem;border-collapse:collapse">
      ${sorted.map(r => html`<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:2px 6px 2px 0;font-family:monospace;white-space:nowrap">${r.offset_list}</td>
        <td style="padding:2px 6px;width:100%">
          <div style="background:#dbeafe;height:10px;width:${Math.max(2, r.count / sorted[0].count * 100)}%;border-radius:2px"></div>
        </td>
        <td style="padding:2px 0 2px 6px;text-align:right;white-space:nowrap;color:#374151">${pct(r.count)}%</td>
        <td style="padding:2px 0 2px 8px;text-align:right;white-space:nowrap;color:#9ca3af">${d3.format(",")(r.count)}</td>
      </tr>`)}
    </table>
  </div>`;
}
```

```js
display(offsetGrid(allEezCodes, eez => {
  const llRows = llByEez.get(eez);
  const psRows = psByEez.get(eez);
  return offsetCard(
    eez,
    offsetListSection(llRows, "Longline",    llTotals.get(eez) ?? 0),
    offsetListSection(psRows, "Purseseine", psTotals.get(eez) ?? 0),
  );
}));
```

