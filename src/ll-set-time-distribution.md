---
theme: air
title: Longline set time distribution
toc: false
---

# Longline set time distribution — local time → must compute offset

```js
import * as Plot from "npm:@observablehq/plot";
import * as d3 from "npm:d3";

const sets = await FileAttachment("data/set-time-distribution.csv").csv({typed: true});

const ll = sets.filter(d => d.type === "LonglineLogsheet");
const totalLL = d3.sum(ll, d => d.count);
```

```js
const TUNA_START = 4;
const TUNA_END  = 8;
const SWORDFISH_START = 18;
const SWORDFISH_END  = 21;

function hourChart(data, {title, fill}) {
    const yMax = Math.max(...data.map(d => d.pct));
  return Plot.plot({
    title,
    width,
    height: 380,
    marginLeft: 55,
    marginBottom: 48,
    x: {
      label: "Hour of day (as recorded)",
      domain: d3.range(0, 24),
      tickFormat: h => `${String(h).padStart(2, "0")}:00`
    },
    y: {
      label: "Sets (%)",
      grid: true,
      tickFormat: v => `${v}%`
    },
    marks: [
        Plot.barY(data, {
        x: "hour",
        y: "pct",
        fill,
        tip: true,
        title: d => `${String(d.hour).padStart(2, "0")}:00 — ${d3.format(",")(d.count)} sets (${d.pct}%)`
      }),
      Plot.text(data.filter(d => d.pct >= 4), {
        x: "hour",
        y: "pct",
        text: d => `${d.pct}%`,
        dy: -8,
        fontSize: 11,
        fontWeight: "600",
        fill: "#374151"
      }),
      Plot.ruleY([0]),
        Plot.ruleX([TUNA_START], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
        Plot.text([{ hour: TUNA_START, label: "tuna" }], {
            x: "hour", y: () => yMax * 0.9,
            text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
        }),
        Plot.ruleX([TUNA_END], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
        Plot.text([{ hour: TUNA_END, label: "tuna" }], {
            x: "hour", y: () => yMax * 0.9,
            text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
        }),
        Plot.ruleX([SWORDFISH_START], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
        Plot.text([{ hour: SWORDFISH_START, label: "swordfish" }], {
            x: "hour", y: () => yMax * 0.9,
            text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
        }),
        Plot.ruleX([SWORDFISH_END], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
        Plot.text([{ hour: SWORDFISH_END, label: "swordfish" }], {
            x: "hour", y: () => yMax * 0.9,
            text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
        }),
    ]
  });
}
```

Fishing set start times across **${d3.format(",")(totalLL)} sets** (`log.sets_ll` where `l_activity_id = 1`).

This time distribution is consistent with the [Horizontal Longline Fishing Manual for Fishermen](https://www.pirfo.org/index.php/resources/downloads/category/33-manuals?download=115:horizontal-longline-fishing-manual-for-fishermen).

> In general, when fishing for tuna, the line is set in the morning sometime around first light (0400 to 0800 hours), and
hauled starting in the afternoon or early evening (1400 to 1800 hours)

> When targeting swordfish, which are mainly night feeders,
the line is set starting in the evening (1800 to 2000 hours)

```js
hourChart(ll, {
  title: "Longline set start time distribution",
  fill: "#60a5fa"
})
```

---

## Conclusion

The recorded longline set times **already cluster at first light (04:00–08:00)** — the expected
*local-time* pattern from the fishing manual. Unlike purse-seine, this pattern appears **without
any UTC→local adjustment**, which means longline set times are stored as **local time**, not UTC.

Therefore longline logsheet datetimes **must be converted** to UTC. The remaining pages build the
per-trip offset evidence and the resulting decision tree used to estimate that offset.
