---
theme: air
title: Logsheet activity Nautical timezone offset by vessel flag
toc: false
---

# Logsheet activity Nautical timezone offset by vessel flag

UTC offset estimated from the **geographic coordinates** of each fishing set
using the **nautical timezone convention** :

> offset = round(longitude / 15)

Each 15° longitude band = 1 hour. This reflects how a GPS device at sea would
determine local time, absent any cellular network or land-based timezone lookup.

- **Longline** — `log.sets_ll` (`l_activity_id = 1`)
- **Purseseine** — `log.sets_ps` (`s_activity_id = 1`)

```js
import * as d3 from "npm:d3";
import { rankedList, offsetGrid, offsetCard, groupByFlagType, TYPE_LABEL } from "./components/offset-charts.js";

const raw = await FileAttachment("data/longline-logsheet-activities-nautical-offset-per-vessel-flag.csv").csv({typed: true});
const { byFlagType, allFlags } = groupByFlagType(raw);
```

```js
display(offsetGrid(allFlags, flag => {
  const byType = byFlagType.get(flag) ?? new Map();
  const llRows = byType.get("LonglineLogsheet") ?? [];
  const psRows = byType.get("PurseseineLogsheet") ?? [];
  return offsetCard(
    flag,
    rankedList(llRows, { labelKey: "offset", countKey: "count", title: TYPE_LABEL.LonglineLogsheet,    subtitle: `${d3.format(",")(d3.sum(llRows, d => d.count))} sets`, labelFormat: v => `${v >= 0 ? "+" : ""}${v} h` }),
    rankedList(psRows, { labelKey: "offset", countKey: "count", title: TYPE_LABEL.PurseseineLogsheet, subtitle: `${d3.format(",")(d3.sum(psRows, d => d.count))} sets`, labelFormat: v => `${v >= 0 ? "+" : ""}${v} h` }),
  );
}));
```
