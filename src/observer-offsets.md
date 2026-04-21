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
import * as Plot from "npm:@observablehq/plot";
import * as d3 from "npm:d3";

const raw = await FileAttachment("data/observer-fishing-activities-offset-per-vessel-flag.csv").csv({typed: true});

const TYPES = ["LonglineLogsheet", "PurseseineLogsheet"];
const TYPE_LABEL = {LonglineLogsheet: "Longline", PurseseineLogsheet: "Purseseine"};

// Group by (flag, type); collect all flags that appear in any type
const byFlagType = d3.rollup(raw, rows => rows, d => d.vessel_flag, d => d.type);
const allFlags   = [...byFlagType.keys()]
  .sort((a, b) => {
    const tot = f => d3.sum(TYPES.flatMap(t => byFlagType.get(f)?.get(t) ?? []), d => d.count);
    return tot(b) - tot(a);
  });

const offsetColor = offset => {
  if (offset === 0) return "#ef4444";
  if (offset < 0)  return d3.interpolateBlues(0.4 + Math.abs(offset) / 14 * 0.55);
  return d3.interpolateOranges(0.35 + offset / 14 * 0.55);
};

const allOffsets = d3.range(-14, 14.5, 0.5);
const plotW = Math.max(200, Math.floor((width - 80) / 2));
const plotH = 155;
```

```js
function miniPlot(rows, type) {
  const key    = "offset_bucket";
  const total  = d3.sum(rows, d => d.count);
  const cMap   = new Map(rows.map(d => [d[key], d.count]));
  const series = allOffsets.map(o => ({
    o, count: cMap.get(o) ?? 0,
    pct: total > 0 ? (cMap.get(o) ?? 0) / total * 100 : 0,
  }));
  return Plot.plot({
    title: TYPE_LABEL[type],
    subtitle: `${d3.format(",")(total)} sets`,
    width: plotW,
    height: plotH,
    marginLeft: 32,
    marginBottom: 26,
    marginTop: 26,
    x: {
      label: null,
      domain: allOffsets,
      tickFormat: v => Number.isInteger(v) ? String(v) : "",
      tickSize: 3,
    },
    y: { label: "%", grid: true, tickFormat: v => `${v}%` },
    marks: [
      Plot.barY(series.filter(d => d.count > 0), {
        x: "o", y: "pct",
        fill: d => offsetColor(d.o),
        tip: true,
        title: d => `${d.o >= 0 ? "+" : ""}${d.o}h — ${d3.format(",")(d.count)} (${d.pct.toFixed(1)}%)`,
      }),
      Plot.ruleY([0]),
    ],
  });
}

display(html`
  <div style="display:grid;grid-template-columns:1fr;gap:1.25rem 1.5rem;margin-top:1.5rem">
    ${allFlags.map(flag => {
      const byType = byFlagType.get(flag) ?? new Map();
      return html`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem">${flag}</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          ${TYPES.map(t => {
            const rows = byType.get(t) ?? [];
            return html`<div style="flex:1;min-width:0">${miniPlot(rows, t)}</div>`;
          })}
        </div>
      </div>`;
    })}
  </div>`);
```

### Colour key

```js
display(html`<div style="display:flex;gap:1.5rem;align-items:center;font-size:0.85rem;margin-top:0.5rem;flex-wrap:wrap">
  <span style="display:flex;align-items:center;gap:6px">
    <span style="width:14px;height:14px;background:${d3.interpolateBlues(0.7)};display:inline-block;border-radius:2px"></span>
    Negative offset (UTC−)
  </span>
  <span style="display:flex;align-items:center;gap:6px">
    <span style="width:14px;height:14px;background:${d3.interpolateOranges(0.7)};display:inline-block;border-radius:2px"></span>
    Positive offset (UTC+)
  </span>
  <span style="display:flex;align-items:center;gap:6px">
    <span style="width:14px;height:14px;background:#ef4444;display:inline-block;border-radius:2px"></span>
    Zero offset (UTC entered as local)
  </span>
</div>`);
```
