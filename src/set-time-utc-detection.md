---
theme: air
title: Set time — UTC or local?
toc: true
---

# PS set_time: UTC or local?

Purse-seine FAD sets (floating object / FAD-associated, `school_id` 3–5) are an operational requirement **before sunrise** — the net must be deployed in darkness so fish cannot see and escape. The SPC Observer Guide confirms observers must be present well before sunrise for these sets.

If `log.sets_ps.set_time` was entered as **local time**, FAD set hours should cluster at 02:00–06:00.  
If it was entered as **UTC**, the same events appear shifted: e.g. a 04:00 local set in UTC+11 waters would be stored as 17:00.

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
  [65536, "PW"],
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

// Enrich each row with the UTC-adjusted hour
// If set_time was entered as UTC: local_hour = (set_hour + nautical_offset + 24) % 24
const data = raw.map(d => ({
  ...d,
  set_hour_adjusted: ((d.set_hour + d.nautical_offset) % 24 + 24) % 24,
  before_sunrise_recorded: d.set_hour < SUNRISE,
  before_sunrise_adjusted: ((d.set_hour + d.nautical_offset) % 24 + 24) % 24 < SUNRISE,
}));

const fad  = data.filter(d => d.school_type === "FAD-associated");
const free = data.filter(d => d.school_type === "Free school");
```

---

## 1 — Aggregate: FAD set hour distribution

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

const fadRecorded = hourCounts(fad, "set_hour");
const fadAdjusted = hourCounts(fad, "set_hour_adjusted");

const pctBeforeRecorded = d3.format(".1%")(d3.sum(fadRecorded.filter(d => d.hour < SUNRISE), d => d.count) / fad.length);
const pctBeforeAdjusted = d3.format(".1%")(d3.sum(fadAdjusted.filter(d => d.hour < SUNRISE), d => d.count) / fad.length);
```

```js
display(html`<p><strong>${d3.format(",")(fad.length)}</strong> FAD sets (all PS trips with longitude).
  Before 06:00 <strong>as-recorded: ${pctBeforeRecorded}</strong> &nbsp;|&nbsp;
  Before 06:00 <strong>nautical-adjusted: ${pctBeforeAdjusted}</strong>.
</p>`);
```

```js
const sharedX = {
  label: "Hour of day",
  domain: d3.range(0, 24),
  tickFormat: h => `${String(h).padStart(2, "0")}:00`,
};
const sharedY = { label: "Sets (%)", grid: true, tickFormat: v => `${v}%` };

function fadHourChart(countsData, {title, fill}) {
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
      // Sunrise line
      Plot.ruleX([SUNRISE], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
      Plot.text([{ hour: SUNRISE, label: "sunrise" }], {
        x: "hour", y: () => yMax * 0.9,
        text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
      }),
      // Sunset line
      Plot.ruleX([SUNSET], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
      Plot.text([{ hour: SUNSET, label: "sunset" }], {
        x: "hour", y: () => yMax * 0.9,
        text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start"
      }),
      Plot.ruleY([0]),
    ],
  });
}
```

```js
display(html`<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
  ${fadHourChart(fadRecorded, { title: "FAD sets — as recorded (hypothesis: UTC)", fill: "#f59e0b" })}
  ${fadHourChart(fadAdjusted, { title: "FAD sets — nautical-adjusted to local (UTC + offset)", fill: "#34d399" })}
</div>`);
```

> The chart that shows ~94% of sets **before the red sunrise line** is the correct interpretation.

---

## 2 — Per-instance classification

For each instance source, we compare the % of FAD sets before 06:00 under both interpretations.
An instance where the **nautical-adjusted** % is far higher than the **recorded** % is almost certainly entering times as UTC.

```js
// Per instance_source summary
const byInstance = d3.rollup(fad, rows => {
  const total    = rows.length;
  const recBefore = rows.filter(d => d.before_sunrise_recorded).length;
  const adjBefore = rows.filter(d => d.before_sunrise_adjusted).length;
  return {
    instance_name:   instanceName(rows[0].instance_source),
    total_fad_sets:  total,
    pct_rec:  Math.round(recBefore / total * 1000) / 10,
    pct_adj:  Math.round(adjBefore / total * 1000) / 10,
    verdict:  (adjBefore / total) > 0.5 && (adjBefore / total) > (recBefore / total) * 1.5
              ? "UTC entered"
              : (recBefore / total) > 0.5
                ? "Local entered"
                : "Unclear",
  };
}, d => d.instance_source);

// Sort by total FAD sets desc
const instanceRows = [...byInstance.values()]
  .sort((a, b) => b.total_fad_sets - a.total_fad_sets);
```

```js
// Bar chart: side-by-side recorded vs adjusted per instance
const instanceBarData = instanceRows.flatMap(r => [
  { instance: r.instance_name, interpretation: "As recorded",       pct: r.pct_rec },
  { instance: r.instance_name, interpretation: "Nautical-adjusted", pct: r.pct_adj },
]);

display(Plot.plot({
  title: "% FAD sets before 06:00 — as recorded vs nautical-adjusted, by instance",
  width,
  height: 40 + instanceRows.length * 28,
  marginLeft: 80,
  marginRight: 10,
  x: { label: "% before 06:00", grid: true, tickFormat: v => `${v}%` },
  y: { label: null },
  color: { legend: true, domain: ["As recorded", "Nautical-adjusted"], range: ["#f59e0b", "#34d399"] },
  marks: [
    Plot.barX(instanceBarData, Plot.groupY({ x: "sum" }, {
      x: "pct", y: "instance", fill: "interpretation",
      tip: true, title: d => `${d.instance} — ${d.interpretation}: ${d.pct}%`,
    })),
    Plot.ruleX([50], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
    Plot.ruleX([0]),
  ],
}));
```

```js
// Summary table
const verdictColor = v =>
  v === "UTC entered"   ? "#dcfce7" :
  v === "Local entered" ? "#fef9c3" : "#f3f4f6";

display(html`<table style="border-collapse:collapse;width:100%;font-size:0.9rem">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb">
      <th style="text-align:left;padding:6px 10px">Instance</th>
      <th style="text-align:right;padding:6px 10px">FAD sets</th>
      <th style="text-align:right;padding:6px 10px">% before 06:00 (recorded)</th>
      <th style="text-align:right;padding:6px 10px">% before 06:00 (nautical-adjusted)</th>
      <th style="text-align:center;padding:6px 10px">Verdict</th>
    </tr>
  </thead>
  <tbody>
    ${instanceRows.map(r => html`<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:5px 10px;font-weight:600">${r.instance_name}</td>
      <td style="text-align:right;padding:5px 10px">${d3.format(",")(r.total_fad_sets)}</td>
      <td style="text-align:right;padding:5px 10px">${r.pct_rec}%</td>
      <td style="text-align:right;padding:5px 10px">${r.pct_adj}%</td>
      <td style="text-align:center;padding:5px 10px;background:${verdictColor(r.verdict)};border-radius:4px">${r.verdict}</td>
    </tr>`)}
  </tbody>
</table>`);
```

---

## 3 — Free school sanity check

Free school sets (school_id 1–2) occur in **daylight hours** (06:00–18:00 local). This is the opposite pattern and provides an independent cross-validation.

```js
const freeRecorded = hourCounts(free, "set_hour");
const freeAdjusted = hourCounts(free, "set_hour_adjusted");

const pctDayRecorded = d3.format(".1%")(d3.sum(freeRecorded.filter(d => d.hour >= SUNRISE && d.hour < 18), d => d.count) / free.length);
const pctDayAdjusted = d3.format(".1%")(d3.sum(freeAdjusted.filter(d => d.hour >= SUNRISE && d.hour < 18), d => d.count) / free.length);
```

```js
display(html`<p><strong>${d3.format(",")(free.length)}</strong> free school sets (all PS trips with longitude).
  In daylight (06:00–18:00) <strong>as-recorded: ${pctDayRecorded}</strong> &nbsp;|&nbsp;
  In daylight <strong>nautical-adjusted: ${pctDayAdjusted}</strong>.
</p>`);

display(html`<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
  ${fadHourChart(freeRecorded, { title: "Free school sets — as recorded", fill: "#60a5fa" })}
  ${fadHourChart(freeAdjusted, { title: "Free school sets — nautical-adjusted", fill: "#818cf8" })}
</div>`);
```

> For free school sets, the correct interpretation should show the **majority of sets between the sunrise line and 18:00**.

---

## 4 — Implications for migration

```js
const utcInstances   = instanceRows.filter(r => r.verdict === "UTC entered").map(r => r.instance_name);
const localInstances = instanceRows.filter(r => r.verdict === "Local entered").map(r => r.instance_name);
const unclearInstances = instanceRows.filter(r => r.verdict === "Unclear").map(r => r.instance_name);
```

```js
display(html`<dl style="line-height:2">
  <dt><strong>UTC entered</strong> — set_time must be shifted by +UTC_offset during migration:</dt>
  <dd>${utcInstances.length ? utcInstances.join(", ") : "none detected"}</dd>
  <dt><strong>Local entered</strong> — set_time can be combined directly with the UTC offset:</dt>
  <dd>${localInstances.length ? localInstances.join(", ") : "none detected"}</dd>
  <dt><strong>Unclear</strong> — insufficient FAD sets or ambiguous pattern:</dt>
  <dd>${unclearInstances.length ? unclearInstances.join(", ") : "none"}</dd>
</dl>
<p style="color:#6b7280;font-size:0.875rem">
  Note: classification is based on all PS sets with a valid longitude. The nautical offset (lond / 15) is an approximation —
  it may differ from the actual UTC offset for vessels operating near timezone boundaries.
  Instances with fewer than ~50 FAD sets should be treated with caution.
</p>`);
```
