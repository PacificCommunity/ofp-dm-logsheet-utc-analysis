---
theme: air
title: Set time distribution
toc: false
---

# Set time distribution

```js
import * as Plot from "npm:@observablehq/plot";
import * as d3 from "npm:d3";

const sets = await FileAttachment("data/set-time-distribution.csv").csv({typed: true});

const byType = d3.group(sets, d => d.type);
const ll  = byType.get("LonglineLogsheet")   ?? [];
const ps  = byType.get("PurseseineLogsheet") ?? [];
const totalLL = d3.sum(ll, d => d.count);

const psBySchool = d3.group(ps, d => d.school_type);
const psFree = psBySchool.get("Free school")    ?? [];
const psFad  = psBySchool.get("FAD-associated") ?? [];
const totalPsFree = d3.sum(psFree, d => d.count);
const totalPsFad  = d3.sum(psFad,  d => d.count);
const totalPS = totalPsFree + totalPsFad;
```

```js

const SETTING_START_WINDOW_BEGIN = 4;
const SETTING_START_WINDOW_END  = 8;

function hourChart(data, {title, fill}) {
    const yMax = Math.max(...data.map(d => d.pct));
  return Plot.plot({
    title,
    width,
    height: 380,
    marginLeft: 55,
    marginBottom: 48,
    x: {
      label: "Hour of day (local time)",
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
        Plot.ruleX([SETTING_START_WINDOW_BEGIN], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
        Plot.text([{ hour: SETTING_START_WINDOW_BEGIN, label: "sunrise" }], {
            x: "hour", y: () => yMax * 0.9,
            text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
        }),
        Plot.ruleX([SETTING_START_WINDOW_END], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
        Plot.text([{ hour: SETTING_START_WINDOW_END, label: "sunset" }], {
            x: "hour", y: () => yMax * 0.9,
            text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
        }),
    ]
  });
}
```

## Longline logsheet

Fishing set start times across **${d3.format(",")(totalLL)} sets** (`log.sets_ll` where `l_activity_id = 1`).

This time distribution is consistent with the [Horizontal Longline Fishing Manual for Fishermen](https://www.pirfo.org/index.php/resources/downloads/category/33-manuals?download=115:horizontal-longline-fishing-manual-for-fishermen).

> In general, when fishing for tuna, the line is set in the morning sometime around first light (0400 to 0800 hours), and
hauled starting in the afternoon or early evening (1400 to 1800 hours)

```js
hourChart(ll, {
  title: "Longline set start time distribution",
  fill: "#60a5fa"
})
```