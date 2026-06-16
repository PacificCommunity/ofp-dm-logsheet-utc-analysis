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
function hourChart(data, {title, fill}) {
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
      Plot.ruleY([0])
    ]
  });
}
```

## Longline logsheet

Fishing set start times across **${d3.format(",")(totalLL)} sets** (`log.sets_ll` where `l_activity_id = 1`).

This time distribution is consistent with the [Horizontal Longline Fishing Manual for Fishermen](https://www.pirfo.org/index.php/resources/downloads/category/33-manuals?download=115:horizontal-longline-fishing-manual-for-fishermen).

```js
hourChart(ll, {
  title: "Longline set start time distribution",
  fill: "#60a5fa"
})
```

## Purseseine logsheet

Fishing set start times across **${d3.format(",")(totalPS)} sets** (`log.sets_ps` where `s_activity_id = 1`)

According to the paper [Analysis of Purse Seine Set Times for Different School Associations: A Further Tool to Assist in Compliance with FAD Closures?](https://meetings.wcpfc.int/node/6808)


> We found that 94% of sets on FADs occurred prior to local sunrise, while only 3% of unassociated school sets
occurred before sunrise, with the remainder occurring at consistent rates during daylight hours.

### Free school 
(`school_id` 1–2) - ${d3.format(",")(totalPsFree)} sets

The time distribution here shows a high distribution before sunrise, and after sunset, confirming most of the data is entered as UTC.

```js
hourChart(psFree, {
  title: "Free school set start time distribution",
  fill: "#34d399"
})
```

### Floating object / FAD-associated

(`school_id` 3–5) ${d3.format(",")(totalPsFad)} sets

The time distribution here shows a peak at the end of the day, confirming most of the data is entered as UTC.

```js
hourChart(psFad, {
  title: "FAD-associated set start time distribution",
  fill: "#f59e0b"
})
```
