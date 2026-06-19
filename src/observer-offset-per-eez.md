---
theme: air
title: Observer offset distribution by EEZ
toc: false
---

# Observer offset distribution by EEZ — Longline

UTC offset recorded by observers on **Longline** trips, grouped by **EEZ code** where the fishing
sets occurred.

Distribution shows how many **trips** (not sets) had each unique combination of offsets,
sorted from most to least common.

- Offset from `obsv.l_set.set_dtime − utc_set_dtime`, matched by observer trip + date
- Only sets since 2017 where `eez_code IS NOT NULL` are included
- Offsets outside ±14 h and dateline-shifted values (>+12 h folded by −24) are normalised
- Offsets per trip are deduplicated and sorted before grouping

```js
import * as d3 from "npm:d3";
import { offsetGrid, offsetCard, rankedList } from "./components/offset-charts.js";

const llRaw = await FileAttachment("data/ll-trip-offset-list-per-eez.csv").csv({typed: true});

const llByEez = d3.rollup(llRaw, rows => rows, d => d.eez_code);

// Total observer trips per EEZ (stored on every row, take first)
const llTotals = d3.rollup(llRaw, rows => rows[0].observer_trips, d => d.eez_code);

const allEezCodes = [...llByEez.keys()].sort((a, b) => (llTotals.get(b) ?? 0) - (llTotals.get(a) ?? 0));
```

```js
display(offsetGrid(allEezCodes, eez => {
  const llRows = llByEez.get(eez);
  return offsetCard(
    eez,
    rankedList(llRows, { labelKey: "offset_list", countKey: "count", title: "Longline", subtitle: `${d3.format(",")(llTotals.get(eez) ?? 0)} observer trips`, total: llTotals.get(eez), noDataText: "No longline observer data" }),
    html``,
  );
}));
```
