---
theme: air
title: PS Set Time — Sunrise-Relative Distribution
toc: false
---

# Purseseine Set Time — Sunrise-Relative Distribution

According to the paper [*Analysis of Purse Seine Set Times for Different School Associations*](https://meetings.wcpfc.int/node/6808):

> We found that 94% of sets on FADs occurred prior to local sunrise, while only 3% of unassociated school sets occurred before sunrise, with the remainder occurring at consistent rates during daylight hours.

This page presents set times **relative to sunrise** (t=0), matching the WCPFC paper format. Sunrise is calculated precisely for each set's location and date using the [Ed Williams algorithm](https://edwilliams.org/sunrise_sunset_algorithm.htm), accounting for latitude, solar declination, and the equation of time.

Time is binned into **15-minute intervals** for finer detail than the hourly distribution.

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

const raw = await FileAttachment("data/ps-set-time-sunrise-relative.csv").csv({ typed: true });

// TufmanInstance enum values → short name
const INSTANCE_NAMES = new Map([
  [1,        "INDUSTRY"],
  [2,        "OFP"],
  [4,        "MH"],
  [8,        "FM"],
  [16,       "CK"],
  [32,       "UST"],
  [128,      "KI"],
  [256,      "TO"],
  [512,      "WS"],
  [1024,     "PF"],
  [2048,     "NR"],
  [4096,     "NU"],
  [8192,     "PG"],
  [16384,    "TV"],
  [32768,    "VU"],
  [65536,    "PW"],
  [131072,   "TK"],
  [262144,   "SB"],
  [524288,   "FJ"],
  [1048576,  "VN"],
  [2097152,  "PH"],
  [4194304,  "WCPFC"],
  [16777216, "WF"],
  [33554432, "DWFN"],
]);

const instanceName = v => INSTANCE_NAMES.get(v) ?? String(v);

const assoc   = raw.filter(d => d.school_type === "associated group");
const unassoc = raw.filter(d => d.school_type === "unassociated group");
```

```js
// Build histogram counts by 15-min bin
function binCounts(rows) {
  const counts = d3.rollup(rows, v => v.length, d => d.minutes_from_sunrise);
  const total = rows.length;
  
  // Create bins from -360 to +720 in 15-min steps
  const bins = [];
  for (let min = -360; min <= 720; min += 15) {
    const count = counts.get(min) ?? 0;
    bins.push({
      minutes: min,
      count,
      pct: Math.round((count / total) * 1000) / 10,
    });
  }
  
  return bins;
}

// Format time relative to sunrise (e.g., -60 → "-1h00", 90 → "+1h30")
function formatRelativeTime(minutes) {
  const sign = minutes >= 0 ? "+" : "-";
  const absMin = Math.abs(minutes);
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  return `${sign}${hours}h${String(mins).padStart(2, '0')}`;
}

function sunriseRelativeChart(data, {title, fill}) {
  return Plot.plot({
    title,
    width,
    height: 400,
    marginLeft: 60,
    marginBottom: 60,
    x: {
      label: "Time relative to sunrise (minutes)",
      grid: true,
      tickFormat: formatRelativeTime,
    },
    y: {
      label: "Sets (%)",
      grid: true,
      tickFormat: v => `${v}%`,
    },
    color: {
      legend: true,
      domain: ["Before sunrise", "After sunrise"],
      range: ["#3b82f6", "#fbbf24"],
    },
    marks: [
      Plot.rectY(data, {
        x1: d => d.minutes,
        x2: d => d.minutes + 15,
        y: "pct",
        fill: d => d.minutes < 0 ? "Before sunrise" : "After sunrise",
        tip: true,
        title: d => `${formatRelativeTime(d.minutes)}: ${d3.format(",")(d.count)} sets (${d.pct}%)`,
      }),
      Plot.ruleX([0], { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "6,4" }),
      Plot.text([{ x: 0, label: "SUNRISE" }], {
        x: "x",
        y: () => d3.max(data, d => d.pct) * 0.95,
        text: "label",
        fill: "#ef4444",
        fontSize: 12,
        fontWeight: "bold",
        dy: -5,
      }),
      Plot.ruleY([0]),
    ],
  });
}
```

---

## Associated Group (FAD Sets)

**${d3.format(",")(assoc.length)} sets** with school association types 3–5.

Expected pattern: **94% before sunrise** (negative time bins).

```js
const assocBins = binCounts(assoc);
const assocBeforeSunrise = d3.sum(assocBins.filter(d => d.minutes < 0), d => d.count);
const assocPctBeforeSunrise = d3.format(".1%")(assocBeforeSunrise / assoc.length);
```

<div style="background:#dcfce7;padding:1rem;border-radius:8px;margin:1rem 0">
  <strong>${assocPctBeforeSunrise}</strong> of associated group sets occur before sunrise.
</div>

```js
sunriseRelativeChart(assocBins, {
  title: "Associated Group — Time Relative to Sunrise",
  fill: "#3b82f6",
})
```

> Peak activity occurs **-60 to -90 minutes** before sunrise (1–1.5 hours), consistent with operational practice of setting nets in darkness.

---

## Unassociated Group (Free School Sets)

**${d3.format(",")(unassoc.length)} sets** with school association types 1–2.

Expected pattern: **~97% after sunrise** (positive time bins).

```js
const unassocBins = binCounts(unassoc);
const unassocAfterSunrise = d3.sum(unassocBins.filter(d => d.minutes >= 0), d => d.count);
const unassocPctAfterSunrise = d3.format(".1%")(unassocAfterSunrise / unassoc.length);
```

<div style="background:#fef9c3;padding:1rem;border-radius:8px;margin:1rem 0">
  <strong>${unassocPctAfterSunrise}</strong> of unassociated group sets occur after sunrise.
</div>

```js
sunriseRelativeChart(unassocBins, {
  title: "Unassociated Group — Time Relative to Sunrise",
  fill: "#8b5cf6",
})
```

> Activity is distributed throughout daylight hours, with peak around **+180 to +300 minutes** (3–5 hours after sunrise).
