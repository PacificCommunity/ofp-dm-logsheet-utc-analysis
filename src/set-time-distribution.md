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
const totalPS = d3.sum(ps, d => d.count);
```

## Longline logsheet

Fishing set start times across **${d3.format(",")(totalLL)} sets** (`log.sets_ll`).

```js
Plot.plot({
  title: "Longline set start time distribution",
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
    Plot.barY(ll, {
      x: "hour",
      y: "pct",
      fill: "#60a5fa",
      tip: true,
      title: d => `${String(d.hour).padStart(2, "0")}:00 — ${d3.format(",")(d.count)} sets (${d.pct}%)`
    }),
    Plot.text(ll.filter(d => d.pct >= 4), {
      x: "hour",
      y: "pct",
      text: d => `${d.pct}%`,
      dy: -8,
      fontSize: 11,
      fontWeight: "600",
      fill: "#374151"
    }),
    Plot.ruleY([0])
  ]
})
```

## Purseseine logsheet

Fishing set start times across **${d3.format(",")(totalPS)} sets** (`log.sets_ps`).

```js
Plot.plot({
  title: "Purseseine set start time distribution",
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
    Plot.barY(ps, {
      x: "hour",
      y: "pct",
      fill:  "#34d399",
      tip: true,
      title: d => `${String(d.hour).padStart(2, "0")}:00 — ${d3.format(",")(d.count)} sets (${d.pct}%)`
    }),
    Plot.text(ps.filter(d => d.pct >= 4), {
      x: "hour",
      y: "pct",
      text: d => `${d.pct}%`,
      dy: -8,
      fontSize: 11,
      fontWeight: "600",
      fill: "#374151"
    }),
    Plot.ruleY([0])
  ]
})
```