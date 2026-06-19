---
theme: air
title: EEZ combinations fished per trip
toc: false
---

# EEZ combinations fished per trip — Longline

*Intermediate analysis — evaluating how hard it is to estimate a single UTC offset per trip.*

For each **Longline trip** with at least one set with a known EEZ code (since 2017), this shows
the distribution of unique sorted EEZ combinations.

- Sets from `log.sets_ll` (`l_activity_id = 1`)
- EEZ codes are sorted alphabetically within each combination

> When a trip stays within a single EEZ, a single UTC offset usually applies. Trips that span
> several EEZs — especially across the dateline — are the ones where a single per-trip offset is
> least reliable.

```js
import * as d3 from "npm:d3";
import { rankedList } from "./components/offset-charts.js";

const llEezList = await FileAttachment("data/ll-eez-list-per-trip.csv").csv({ typed: true });
```

```js
display(html`<div style="max-width:560px">${rankedList(llEezList, {
  labelKey: "eez_list",
  countKey: "trip_count",
  title: "Longline",
  subtitle: `${d3.format(",")(llEezList[0]?.total_trips ?? 0)} trips`,
  total: llEezList[0]?.total_trips,
})}</div>`);
```
