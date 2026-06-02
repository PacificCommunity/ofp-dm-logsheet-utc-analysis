---
theme: air
title: Observer offset per instance source
toc: false
---

# Observer UTC offset per instance source

Observer trips linked to a logsheet, grouped by logsheet instance source (i.e. which Tufman instance entered the data).
Each pair of charts shows the distribution of **UTC offsets** derived from the observer's own datetime data:

- **Longline** — `obsv.l_set.set_dtime − utc_set_dtime` (per fishing set)
- **Purseseine** — `obsv.s_day.start_dtime − utc_start_dtime` (per fishing day)

```js
import * as d3 from "npm:d3";
import { rankedList, offsetGrid, offsetCard, TYPE_LABEL } from "./components/offset-charts.js";

// TufmanInstance enum values → short name
const INSTANCE_NAMES = new Map([
  [1,        "INDUSTRY"],
  [2,        "OFP"],
  [4,        "MH"],
  [16,       "CK"],
  [32,       "UST"],
  [128,      "KI"],
  [256,      "TO"],
  [512,      "WS"],
  [1024,     "PF"],
  [2048,     "NR"],
  [4096,     "NU"],
  [16384,    "TV"],
  [32768,    "VU"],
  [131072,   "TK"],
  [262144,   "SB"],
  [524288,   "FJ"],
  [1048576,  "VN"],
  [2097152,  "PH"],
  [4194304,  "WCPFC"],
  [16777216, "WF"],
  [33554432, "DWFN"],
]);

const instanceLabel = v => INSTANCE_NAMES.get(v) ?? String(v);

const raw = await FileAttachment("data/observer-fishing-activities-offset-per-instance.csv").csv({ typed: true });

// Group rows: instance_source → type → rows[]
const byInstanceType = d3.rollup(raw, rows => rows, d => d.instance_source, d => d.type);

// Sort instances by total count descending
const allInstances = [...byInstanceType.keys()].sort((a, b) => {
  const tot = k => d3.sum([...( byInstanceType.get(k)?.values() ?? [])].flat(), d => d.count);
  return tot(b) - tot(a);
});
```

```js
display(offsetGrid(allInstances, instance => {
  const byType = byInstanceType.get(instance) ?? new Map();
  const llRows = byType.get("LonglineLogsheet")    ?? [];
  const psRows = byType.get("PurseseineLogsheet")  ?? [];
  return offsetCard(
    instanceLabel(instance),
    rankedList(llRows, { labelKey: "offset_bucket", countKey: "count", title: TYPE_LABEL.LonglineLogsheet,    subtitle: `${d3.format(",")(d3.sum(llRows, d => d.count))} sets`, labelFormat: v => `${v >= 0 ? "+" : ""}${v} h` }),
    rankedList(psRows, { labelKey: "offset_bucket", countKey: "count", title: TYPE_LABEL.PurseseineLogsheet, subtitle: `${d3.format(",")(d3.sum(psRows, d => d.count))} sets`, labelFormat: v => `${v >= 0 ? "+" : ""}${v} h` }),
  );
}));
```
