---
theme: air
title: Purseseine set time — entered as UTC
toc: false
---

# Purseseine set time — entered as UTC → offset = 0

According to the paper [*Analysis of Purse Seine Set Times for Different School Associations: A Further Tool to Assist in Compliance with FAD Closures?*](https://meetings.wcpfc.int/node/6808):

> We found that 94% of sets on FADs occurred prior to local sunrise, while only 3% of unassociated school sets occurred before sunrise, with the remainder occurring at consistent rates during daylight hours.

We use this known biological/operational signal as a **clock check**. If `log.sets_ps.set_time`
were stored as **local time**, the as-recorded hours would already match the paper. If instead it
is stored as **UTC**, we must shift by the local offset to recover the paper's pattern.

Two independent views below both show the same result: **the recorded purse-seine set times are UTC.**

<div style="background:#dcfce7;padding:1rem 1.25rem;border-radius:8px;margin:1.5rem 0;border:1px solid #86efac">
  <strong>Decision:</strong> Purse-seine logsheet datetimes are entered as UTC. No estimation is
  needed — <strong>all purse-seine logsheet UTC offsets = 0</strong>.
</div>

---

## View 1 — Hour of day: as-recorded vs nautical-adjusted

The UTC offset for each set is approximated using the **nautical timezone formula**
`ROUND(lond / 15.0, 0)`, which covers every PS set with a recorded longitude (not just
observer-linked trips). "Nautical-adjusted" = recorded hour **+ nautical offset** (UTC → local).

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

const raw = await FileAttachment("data/ps-fad-set-hour-classification.csv").csv({ typed: true });

// Sunrise / sunset thresholds — good approximations for tropical Pacific year-round
const SUNRISE = 6;
const SUNSET  = 18;

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
    title, width, height: 300, marginLeft: 55, marginBottom: 48,
    x: sharedX, y: sharedY,
    marks: [
      Plot.rectY(countsData, { x1: d => d.hour, x2: d => d.hour + 1, y: "pct", fill, tip: true,
        title: d => `${String(d.hour).padStart(2,"0")}:00 — ${d3.format(",")(d.count)} sets (${d.pct}%)` }),
      Plot.ruleX([SUNRISE], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
      Plot.text([{ hour: SUNRISE, label: "sunrise" }], { x: "hour", y: () => yMax * 0.9, text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start" }),
      Plot.ruleX([SUNSET], { stroke: "#ef4444", strokeDasharray: "4,3", strokeWidth: 1.5 }),
      Plot.text([{ hour: SUNSET, label: "sunset" }], { x: "hour", y: () => yMax * 0.9, text: "label", dx: 4, fontSize: 11, fill: "#ef4444", textAnchor: "start" }),
      Plot.ruleY([0]),
    ],
  });
}
```

### Associated group (`school_id` 3–5) — expected before sunrise

```js
const assocRecorded = hourCounts(assoc, "set_hour");
const assocAdjusted = hourCounts(assoc, "set_hour_adjusted");
const pctAssocRecorded = d3.format(".1%")(d3.sum(assocRecorded.filter(d => d.hour < SUNRISE), d => d.count) / assoc.length);
const pctAssocAdjusted = d3.format(".1%")(d3.sum(assocAdjusted.filter(d => d.hour < SUNRISE), d => d.count) / assoc.length);
```

```js
display(html`<p><strong>${d3.format(",")(assoc.length)} sets.</strong> Before 06:00 — as-recorded: <strong>${pctAssocRecorded}</strong> &nbsp;|&nbsp; nautical-adjusted: <strong>${pctAssocAdjusted}</strong></p>`);
display(html`<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
  ${hourChart(assocRecorded, { title: "Associated group — as recorded", fill: "#f59e0b" })}
  ${hourChart(assocAdjusted, { title: "Associated group — nautical-adjusted (UTC→local)", fill: "#34d399" })}
</div>`);
```

> The **nautical-adjusted** chart matches the paper (~94% before sunrise). The as-recorded chart
> does not. Recorded times must therefore be **UTC**.

### Unassociated group (`school_id` 1–2) — expected in daylight

```js
const unassocRecorded = hourCounts(unassoc, "set_hour");
const unassocAdjusted = hourCounts(unassoc, "set_hour_adjusted");
const pctUnassocRecorded = d3.format(".1%")(d3.sum(unassocRecorded.filter(d => d.hour >= SUNRISE && d.hour < SUNSET), d => d.count) / unassoc.length);
const pctUnassocAdjusted = d3.format(".1%")(d3.sum(unassocAdjusted.filter(d => d.hour >= SUNRISE && d.hour < SUNSET), d => d.count) / unassoc.length);
```

```js
display(html`<p><strong>${d3.format(",")(unassoc.length)} sets.</strong> In daylight (06:00–18:00) — as-recorded: <strong>${pctUnassocRecorded}</strong> &nbsp;|&nbsp; nautical-adjusted: <strong>${pctUnassocAdjusted}</strong></p>`);
display(html`<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
  ${hourChart(unassocRecorded, { title: "Unassociated group — as recorded", fill: "#60a5fa" })}
  ${hourChart(unassocAdjusted, { title: "Unassociated group — nautical-adjusted (UTC→local)", fill: "#818cf8" })}
</div>`);
```

---

## View 2 — Sunrise-relative distribution (15-min bins)

This view presents set times **relative to sunrise** (t=0), matching the WCPFC paper format.
Sunrise is computed precisely for each set's location and date using the
[Ed Williams algorithm](https://edwilliams.org/sunrise_sunset_algorithm.htm). The calculator works
in **UTC**, so this view treats the recorded set time as UTC directly — if that assumption is
correct, the paper's pattern emerges with no further adjustment.

```js
const sunriseRaw = await FileAttachment("data/ps-set-time-sunrise-relative.csv").csv({ typed: true });
const assocSr   = sunriseRaw.filter(d => d.school_type === "associated group");
const unassocSr = sunriseRaw.filter(d => d.school_type === "unassociated group");

function binCounts(rows) {
  const counts = d3.rollup(rows, v => v.length, d => d.minutes_from_sunrise);
  const total = rows.length;
  const bins = [];
  for (let min = -360; min <= 720; min += 15) {
    const count = counts.get(min) ?? 0;
    bins.push({ minutes: min, count, pct: Math.round((count / total) * 1000) / 10 });
  }
  return bins;
}

function formatRelativeTime(minutes) {
  const sign = minutes >= 0 ? "+" : "-";
  const absMin = Math.abs(minutes);
  return `${sign}${Math.floor(absMin / 60)}h${String(absMin % 60).padStart(2, "0")}`;
}

function sunriseRelativeChart(binData, {title}) {
  return Plot.plot({
    title, width, height: 400, marginLeft: 60, marginBottom: 60,
    x: { label: "Time relative to sunrise", grid: true, tickFormat: formatRelativeTime },
    y: { label: "Sets (%)", grid: true, tickFormat: v => `${v}%` },
    color: { legend: true, domain: ["Before sunrise", "After sunrise"], range: ["#3b82f6", "#fbbf24"] },
    marks: [
      Plot.rectY(binData, { x1: d => d.minutes, x2: d => d.minutes + 15, y: "pct",
        fill: d => d.minutes < 0 ? "Before sunrise" : "After sunrise", tip: true,
        title: d => `${formatRelativeTime(d.minutes)}: ${d3.format(",")(d.count)} sets (${d.pct}%)` }),
      Plot.ruleX([0], { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "6,4" }),
      Plot.text([{ x: 0, label: "SUNRISE" }], { x: "x", y: () => d3.max(binData, d => d.pct) * 0.95, text: "label", fill: "#ef4444", fontSize: 12, fontWeight: "bold", dy: -5 }),
      Plot.ruleY([0]),
    ],
  });
}

const assocBins = binCounts(assocSr);
const unassocBins = binCounts(unassocSr);
const assocPctBefore = d3.format(".1%")(d3.sum(assocBins.filter(d => d.minutes < 0), d => d.count) / assocSr.length);
const unassocPctAfter = d3.format(".1%")(d3.sum(unassocBins.filter(d => d.minutes >= 0), d => d.count) / unassocSr.length);
```

<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
  <div style="background:#dcfce7;padding:1rem;border-radius:8px;flex:1;min-width:240px">
    Associated group: <strong>${assocPctBefore}</strong> of sets occur <strong>before sunrise</strong> (paper: 94%).
  </div>
  <div style="background:#fef9c3;padding:1rem;border-radius:8px;flex:1;min-width:240px">
    Unassociated group: <strong>${unassocPctAfter}</strong> of sets occur <strong>after sunrise</strong> (paper: ~97%).
  </div>
</div>

```js
display(html`<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
  ${sunriseRelativeChart(assocBins, { title: "Associated group — relative to sunrise (UTC clock)" })}
  ${sunriseRelativeChart(unassocBins, { title: "Unassociated group — relative to sunrise (UTC clock)" })}
</div>`);
```

---

## Conclusion

Both views agree with the WCPFC paper **only when the recorded set time is read as UTC**:

- Associated (FAD) sets cluster **before sunrise** on the UTC clock.
- Unassociated (free-school) sets fall **in daylight** on the UTC clock.

Therefore purse-seine logsheet datetimes are **already UTC**, and the migration sets
**every purse-seine logsheet UTC offset to 0** — no estimation required.
