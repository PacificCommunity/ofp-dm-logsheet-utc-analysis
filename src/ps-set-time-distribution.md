---
theme: air
title: Purseseine set time — UTC or local?
toc: false
---

# Purseseine set_time: UTC or local?

According to the paper [*Analysis of Purse Seine Set Times for Different School Associations: A Further Tool to Assist in Compliance with FAD Closures?*](https://meetings.wcpfc.int/node/6808):

> We found that 94% of sets on FADs occurred prior to local sunrise, while only 3% of unassociated school sets occurred before sunrise, with the remainder occurring at consistent rates during daylight hours.

If `log.sets_ps.set_time` is stored as **local time**:
- **Associated group** (`school_id` 3–5): sets should cluster **before 06:00**
- **Unassociated group** (`school_id` 1–2): sets should cluster **between 06:00 and 18:00**

If `set_time` is stored as **UTC**, both distributions will appear shifted by the UTC offset. For example, a 04:00 local set in UTC+11 waters would be recorded as 17:00.

The UTC offset for each set is approximated using the **nautical timezone formula**: `ROUND(lond / 15.0, 0)`. This covers all PS sets with a recorded longitude — not just observer-linked trips.

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

const raw = await FileAttachment("data/ps-fad-set-hour-classification.csv").csv({ typed: true });

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

// Sunrise / sunset thresholds — good approximations for tropical Pacific year-round
const SUNRISE = 6;
const SUNSET  = 18;

// Enrich each row with the nautical-adjusted hour and pre-computed flags
const data = raw.map(d => {
  const adj = ((d.set_hour + d.nautical_offset) % 24 + 24) % 24;
  return {
    ...d,
    set_hour_adjusted:    adj,
    before_sunrise_recorded: d.set_hour < SUNRISE,
    before_sunrise_adjusted: adj < SUNRISE,
    in_daylight_recorded:    d.set_hour >= SUNRISE && d.set_hour < SUNSET,
    in_daylight_adjusted:    adj >= SUNRISE && adj < SUNSET,
  };
});

const assoc   = data.filter(d => d.school_type === "associated group");
const unassoc = data.filter(d => d.school_type === "unassociated group");
```

```js
// Build hourly counts for both interpretations
function hourCounts(rows, hourKey) {
  const counts = d3.rollup(rows, v => v.length, d => d[hourKey]);
  const total  = rows.length;
  return d3.range(0, 24).map(h => ({
    hour:  h,
    count: counts.get(h) ?? 0,
    pct:   Math.round(((counts.get(h) ?? 0) / total) * 1000) / 10,
  }));
}

const sharedX = {
  label: "Hour of day",
  domain: d3.range(0, 24),
  tickFormat: h => `${String(h).padStart(2, "0")}:00`,
};
const sharedY = { label: "Sets (%)", grid: true, tickFormat: v => `${v}%` };

function hourChart(countsData, {title, fill}) {
  const yMax = Math.max(...countsData.map(d => d.pct));
  return Plot.plot({
    title,
    width,
    height: 300,
    marginLeft: 55,
    marginBottom: 48,
    x: sharedX,
    y: sharedY,
    marks: [
      Plot.rectY(countsData, { x1: d => d.hour, x2: d => d.hour + 1, y: "pct", fill, tip: true,
        title: d => `${String(d.hour).padStart(2,"0")}:00 — ${d3.format(",")(d.count)} sets (${d.pct}%)` }),
      Plot.ruleX([SUNRISE], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
      Plot.text([{ hour: SUNRISE, label: "sunrise" }], {
        x: "hour", y: () => yMax * 0.9,
        text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
      }),
      Plot.ruleX([SUNSET], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
      Plot.text([{ hour: SUNSET, label: "sunset" }], {
        x: "hour", y: () => yMax * 0.9,
        text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
      }),
      Plot.ruleY([0]),
    ],
  });
}

// Per-instance classification bar chart + table
function instanceClassification(rows, {metricRecorded, metricAdjusted, metricLabel, title}) {
  const byInstance = d3.rollup(rows, v => {
    const total   = v.length;
    const recOk   = v.filter(d => d[metricRecorded]).length;
    const adjOk   = v.filter(d => d[metricAdjusted]).length;
    return {
      instance_name:  instanceName(v[0].instance_source),
      total_sets:     total,
      pct_rec:  Math.round(recOk / total * 1000) / 10,
      pct_adj:  Math.round(adjOk / total * 1000) / 10,
      verdict:  (adjOk / total) > 0.5 && (adjOk / total) > (recOk / total) * 1.5
                ? "UTC entered"
                : "Unclear"
    };
  }, d => d.instance_source);

  const iRows = [...byInstance.values()].sort((a, b) => b.total_sets - a.total_sets);

  const barData = iRows.flatMap(r => [
    { instance: r.instance_name, interpretation: "As recorded",       pct: r.pct_rec },
    { instance: r.instance_name, interpretation: "Nautical-adjusted", pct: r.pct_adj },
  ]);

  const verdictColor = v =>
    v === "UTC entered"   ? "#dcfce7" :
    v === "Local entered" ? "#fef9c3" : "#f3f4f6";

  const barChart = Plot.plot({
    title,
    width,
    height: 40 + iRows.length * 28,
    marginLeft: 80,
    marginRight: 10,
    x: { label: `% ${metricLabel}`, grid: true, tickFormat: v => `${v}%` },
    y: { label: null },
    color: { legend: true, domain: ["As recorded", "Nautical-adjusted"], range: ["#f59e0b", "#34d399"] },
    marks: [
      Plot.barX(barData, Plot.groupY({ x: "sum" }, {
        x: "pct", y: "instance", fill: "interpretation",
        tip: true, title: d => `${d.instance} — ${d.interpretation}: ${d.pct}%`,
      })),
      Plot.ruleX([50], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
      Plot.ruleX([0]),
    ],
  });

  const table = html`<table style="border-collapse:collapse;width:100%;font-size:0.9rem;margin-top:1rem">
    <thead>
      <tr style="border-bottom:2px solid #e5e7eb">
        <th style="text-align:left;padding:6px 10px">Instance</th>
        <th style="text-align:right;padding:6px 10px">Sets</th>
        <th style="text-align:right;padding:6px 10px">% ${metricLabel} (recorded)</th>
        <th style="text-align:right;padding:6px 10px">% ${metricLabel} (nautical-adjusted)</th>
        <th style="text-align:center;padding:6px 10px">Verdict</th>
      </tr>
    </thead>
    <tbody>
      ${iRows.map(r => html`<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:5px 10px;font-weight:600">${r.instance_name}</td>
        <td style="text-align:right;padding:5px 10px">${d3.format(",")(r.total_sets)}</td>
        <td style="text-align:right;padding:5px 10px">${r.pct_rec}%</td>
        <td style="text-align:right;padding:5px 10px">${r.pct_adj}%</td>
        <td style="text-align:center;padding:5px 10px;background:${verdictColor(r.verdict)};border-radius:4px">${r.verdict}</td>
      </tr>`)}
    </tbody>
  </table>`;

  return html`<div>${barChart}${table}</div>`;
}
```

---

## Associated group (`school_id` 3–5)

**${d3.format(",")(assoc.length)} sets.** Expected pattern: before sunrise (06:00 local).

```js
const assocRecorded = hourCounts(assoc, "set_hour");
const assocAdjusted = hourCounts(assoc, "set_hour_adjusted");

const pctAssocRecorded = d3.format(".1%")(d3.sum(assocRecorded.filter(d => d.hour < SUNRISE), d => d.count) / assoc.length);
const pctAssocAdjusted = d3.format(".1%")(d3.sum(assocAdjusted.filter(d => d.hour < SUNRISE), d => d.count) / assoc.length);
```

```js
display(html`<p>Before 06:00 — <strong>as-recorded: ${pctAssocRecorded}</strong> &nbsp;|&nbsp; <strong>nautical-adjusted: ${pctAssocAdjusted}</strong></p>`);
display(html`<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
  ${hourChart(assocRecorded, { title: "Associated group — as recorded", fill: "#f59e0b" })}
  ${hourChart(assocAdjusted, { title: "Associated group — nautical-adjusted", fill: "#34d399" })}
</div>`);
```

> The chart that shows ~94% of sets **before the sunrise line** is the correct interpretation.

```js
display(instanceClassification(assoc, {
  metricRecorded: "before_sunrise_recorded",
  metricAdjusted: "before_sunrise_adjusted",
  metricLabel:    "before sunrise",
  title:          "Associated group — % before 06:00 by instance",
}));
```

---

## Unassociated group (`school_id` 1–2)

**${d3.format(",")(unassoc.length)} sets.** Expected pattern: in daylight (06:00–18:00 local).

```js
const unassocRecorded = hourCounts(unassoc, "set_hour");
const unassocAdjusted = hourCounts(unassoc, "set_hour_adjusted");

const pctUnassocRecorded = d3.format(".1%")(d3.sum(unassocRecorded.filter(d => d.hour >= SUNRISE && d.hour < SUNSET), d => d.count) / unassoc.length);
const pctUnassocAdjusted = d3.format(".1%")(d3.sum(unassocAdjusted.filter(d => d.hour >= SUNRISE && d.hour < SUNSET), d => d.count) / unassoc.length);
```

```js
display(html`<p>In daylight (06:00–18:00) — <strong>as-recorded: ${pctUnassocRecorded}</strong> &nbsp;|&nbsp; <strong>nautical-adjusted: ${pctUnassocAdjusted}</strong></p>`);
display(html`<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
  ${hourChart(unassocRecorded, { title: "Unassociated group — as recorded", fill: "#60a5fa" })}
  ${hourChart(unassocAdjusted, { title: "Unassociated group — nautical-adjusted", fill: "#818cf8" })}
</div>`);
```

> The chart that shows ~97% of sets **between the sunrise and sunset lines** is the correct interpretation.

```js
display(instanceClassification(unassoc, {
  metricRecorded: "in_daylight_recorded",
  metricAdjusted: "in_daylight_adjusted",
  metricLabel:    "in daylight",
  title:          "Unassociated group — % in daylight (06:00–18:00) by instance",
}));
```

