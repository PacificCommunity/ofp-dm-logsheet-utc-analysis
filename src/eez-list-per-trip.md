---
theme: air
title: EEZ combinations fished per trip
toc: false
---

# EEZ combinations fished per trip

For each **trip** with at least one set with a known EEZ code (since 2017), shows the
distribution of unique sorted EEZ combinations.

- **Longline** — sets from `log.sets_ll` (`l_activity_id = 1`)
- **Purseseine** — sets from `log.sets_ps` (`s_activity_id = 1`)
- EEZ codes are sorted alphabetically within each combination
- Covers all longline and purseseine logsheets.

```js
import * as d3 from "npm:d3";
import { rankedList } from "./components/offset-charts.js";

const llEezList = await FileAttachment("data/ll-eez-list-per-trip.csv").csv({typed: true});
const psEezList = await FileAttachment("data/ps-eez-list-per-trip.csv").csv({typed: true});
```

```js
display(html`<div style="display:flex;gap:2.5rem;flex-wrap:wrap;align-items:flex-start">
  <div style="flex:1;min-width:280px">${rankedList(llEezList, { labelKey: "eez_list", countKey: "trip_count", title: "Longline",    subtitle: `${d3.format(",")(llEezList[0]?.total_trips ?? 0)} trips`, total: llEezList[0]?.total_trips })}</div>
  <div style="flex:1;min-width:280px">${rankedList(psEezList, { labelKey: "eez_list", countKey: "trip_count", title: "Purseseine", subtitle: `${d3.format(",")(psEezList[0]?.total_trips ?? 0)} trips`, total: psEezList[0]?.total_trips })}</div>
</div>`);
```
