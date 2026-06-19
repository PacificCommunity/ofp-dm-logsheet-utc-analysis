---
theme: air
title: Observer offset by vessel flag
toc: false
---

# Observer UTC offset by vessel flag — Longline

Observer-linked **Longline** trips, grouped by vessel flag. Each chart shows the distribution of
**UTC offsets** derived from the observer's own datetime data:

- `obsv.l_set.set_dtime − utc_set_dtime` (per fishing set)

These observer offsets are the **source of truth** for the decision tree.

```js
import * as d3 from "npm:d3";
import { rankedList, offsetGrid, offsetCard, groupByFlagType, TYPE_LABEL } from "./components/offset-charts.js";

const raw = await FileAttachment("data/observer-fishing-activities-offset-per-vessel-flag.csv").csv({typed: true});
const llRaw = raw.filter(d => d.type === "LonglineLogsheet");
const { byFlagType, allFlags } = groupByFlagType(llRaw);
```

```js
display(offsetGrid(allFlags, flag => {
  const byType = byFlagType.get(flag) ?? new Map();
  const llRows = byType.get("LonglineLogsheet") ?? [];
  return offsetCard(
    flag,
    rankedList(llRows, { labelKey: "offset_bucket", countKey: "count", title: TYPE_LABEL.LonglineLogsheet, subtitle: `${d3.format(",")(d3.sum(llRows, d => d.count))} sets`, labelFormat: v => `${v >= 0 ? "+" : ""}${v} h` }),
    html``,
  );
}));
```
