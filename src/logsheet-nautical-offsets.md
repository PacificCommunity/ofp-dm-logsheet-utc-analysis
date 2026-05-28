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
import { miniPlot, offsetColorKey, offsetGrid, offsetCard, groupByFlagType, TYPE_LABEL } from "./components/offset-charts.js";

const raw = await FileAttachment("data/longline-logsheet-activities-nautical-offset-per-vessel-flag.csv").csv({typed: true});
const { byFlagType, allFlags } = groupByFlagType(raw);
const plotW = Math.max(200, Math.floor((width - 80) / 2));
```

```js
display(offsetGrid(allFlags, flag => {
  const byType = byFlagType.get(flag) ?? new Map();
  return offsetCard(
    flag,
    miniPlot(byType.get("LonglineLogsheet") ?? [],    { title: TYPE_LABEL.LonglineLogsheet,    plotW }),
    miniPlot(byType.get("PurseseineLogsheet") ?? [], { title: TYPE_LABEL.PurseseineLogsheet, plotW }),
  );
}));
```

### Colour key

```js
display(offsetColorKey({ zero: "Zero offset — coordinate on a UTC boundary" }));
```
