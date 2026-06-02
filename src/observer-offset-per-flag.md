---
theme: air
title: Observer offset distribution by vessel flag
toc: false
---

# Observer offset distribution by vessel flag

UTC offset recorded by observers, grouped by **vessel flag**.

Distribution shows how many **trips** (not sets) had each unique combination of offsets,
sorted from most to least common.

- **Longline** — offset from `obsv.l_set.set_dtime − utc_set_dtime`, matched by observer trip + date
- **Purseseine** — offset from `obsv.s_day.start_dtime − utc_start_dtime`, one daily record matched by date
- Only sets since 2017 are included
- Offsets outside ±14 h and dateline-shifted values (>+12 h folded by −24) are normalised
- Offsets per trip are deduplicated and sorted before grouping

```js
import * as d3 from "npm:d3";
import { offsetGrid, offsetCard, rankedList } from "./components/offset-charts.js";

const llRaw = await FileAttachment("data/ll-trip-offset-list-per-flag.csv").csv({typed: true});
const psRaw = await FileAttachment("data/ps-trip-offset-list-per-flag.csv").csv({typed: true});

const llByFlag = d3.rollup(llRaw, rows => rows, d => d.vessel_flag);
const psByFlag = d3.rollup(psRaw, rows => rows, d => d.vessel_flag);

// Total observer trips per flag (stored on every row, take first)
const llTotals = d3.rollup(llRaw, rows => rows[0].observer_trips, d => d.vessel_flag);
const psTotals = d3.rollup(psRaw, rows => rows[0].observer_trips, d => d.vessel_flag);

// All flags sorted by LL observer trips desc, then PS
const allFlags = [...new Set([...llByFlag.keys(), ...psByFlag.keys()])]
  .sort((a, b) => {
    const llA = llTotals.get(a) ?? 0;
    const llB = llTotals.get(b) ?? 0;
    if (llB !== llA) return llB - llA;
    return (psTotals.get(b) ?? 0) - (psTotals.get(a) ?? 0);
  });
```

```js
display(offsetGrid(allFlags, flag => {
  const llRows = llByFlag.get(flag);
  const psRows = psByFlag.get(flag);
  return offsetCard(
    flag,
    rankedList(llRows, { labelKey: "offset_list", countKey: "count", title: "Longline",    subtitle: `${d3.format(",")(llTotals.get(flag) ?? 0)} observer trips`, total: llTotals.get(flag), noDataText: "No longline observer data" }),
    rankedList(psRows, { labelKey: "offset_list", countKey: "count", title: "Purseseine", subtitle: `${d3.format(",")(psTotals.get(flag) ?? 0)} observer trips`, total: psTotals.get(flag), noDataText: "No purseseine observer data" }),
  );
}));
```
