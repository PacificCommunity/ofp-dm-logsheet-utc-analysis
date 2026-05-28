---
theme: air
title: Observer offset per vessel flag
toc: false
---

# Observer UTC offset per vessel flag

Observer trips linked to a logsheet, grouped by vessel flag.
Each pair of charts shows the distribution of **UTC offsets** derived from the observer's own datetime data:

- **Longline** — `obsv.l_set.set_dtime − utc_set_dtime` (per fishing set)
- **Purseseine** — `obsv.s_day.start_dtime − utc_start_dtime` (per fishing day)

```js
import * as d3 from "npm:d3";
import { miniPlot, offsetColorKey, offsetGrid, offsetCard, groupByFlagType, TYPE_LABEL } from "./components/offset-charts.js";

const raw = await FileAttachment("data/observer-fishing-activities-offset-per-vessel-flag.csv").csv({typed: true});
const { byFlagType, allFlags } = groupByFlagType(raw);
const plotW = Math.max(200, Math.floor((width - 80) / 2));
```

```js
display(offsetGrid(allFlags, flag => {
  const byType = byFlagType.get(flag) ?? new Map();
  return offsetCard(
    flag,
    miniPlot(byType.get("LonglineLogsheet") ?? [],    { offsetKey: "offset_bucket", title: TYPE_LABEL.LonglineLogsheet,    plotW }),
    miniPlot(byType.get("PurseseineLogsheet") ?? [], { offsetKey: "offset_bucket", title: TYPE_LABEL.PurseseineLogsheet, plotW }),
  );
}));
```

### Colour key

```js
display(offsetColorKey({ zero: "Zero offset (UTC entered as local)" }));
```
