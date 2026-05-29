---
theme: air
title: Logsheet activity IANA timezone offset by vessel flag
toc: false
---

# Logsheet activity IANA timezone offset by vessel flag

UTC offset estimated from the **geographic coordinates** of each fishing set,
resolved via [geo-tz](https://github.com/evansiroky/timezone-boundary-builder)
(IANA political timezone boundaries), then converted to a UTC offset (½ h resolution).

- **Longline** — `log.sets_ll` (`l_activity_id = 1`)
- **Purseseine** — `log.sets_ps` (`s_activity_id = 1`)

Please note that in open ocean, geo-tz willl return Etc/GMT+-N zones, which will be the same 
result as the nautical timezone.

```js
import * as d3 from "npm:d3";
import { rankedList, offsetGrid, offsetCard, groupByFlagType, TYPE_LABEL } from "./components/offset-charts.js";

const raw = await FileAttachment("data/longline-logsheet-activities-offset-per-vessel-flag.csv").csv({typed: true});
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
