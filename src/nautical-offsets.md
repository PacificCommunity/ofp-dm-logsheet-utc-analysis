---
theme: air
title: Nautical offsets
toc: false
---

# Nautical (longitude/15) offsets — all longline logsheets

The *nautical timezone offset* is a purely geographic estimate computed from the longitude at the
time of the fishing set:

> **nautical_offset = round(longitude / 15)**

A vessel at 150 °E sits 10 h ahead of UTC; a vessel at 150 °W is 10 h behind. This method needs
no observer data and covers **every** logsheet set with a recorded longitude — far more rows than
the observer-linked data on the [Observer offsets](./observer-offsets) page.

**Important caveat:** captains may keep the departure-port clock rather than adjusting to the
local time zone. In that case the nautical estimate diverges from the observer-measured offset. Use
this page to cross-check the observer offsets and to assess coverage for flags with little or no
observer data.

- Source: `log.sets_ll` (all fishing sets, since 2017) with valid longitude and EEZ
- Longitude-based offset rounded to the nearest whole hour; clipped to ±14 h
- Counts are **logsheet activities** (not observer activities)

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";
import { rankedList, offsetGrid, offsetCard } from "./components/offset-charts.js";

const raw = await FileAttachment("data/ll-nautical-activity-offsets.csv").csv({ typed: true });

const fmtOffset = v => `${v >= 0 ? "+" : ""}${v} h`;

// Aggregate offset counts within an arbitrary grouping key.
function offsetRows(rows) {
  return d3.rollups(rows, v => d3.sum(v, d => d.count), d => d.nautical_offset)
    .map(([offset, count]) => ({ offset, count }))
    .sort((a, b) => b.count - a.count);
}

const byFlag = d3.group(raw, d => d.vessel_flag);
const byEez  = d3.group(raw, d => d.eez_code);

const flagTotals = new Map([...byFlag].map(([k, v]) => [k, d3.sum(v, d => d.count)]));
const eezTotals  = new Map([...byEez].map(([k, v]) => [k, d3.sum(v, d => d.count)]));

const flags = [...byFlag.keys()].sort((a, b) => flagTotals.get(b) - flagTotals.get(a));
const eezs  = [...byEez.keys()].sort((a, b) => eezTotals.get(b) - eezTotals.get(a));
```

```js
const totalSets = d3.sum(raw, d => d.count);
display(html`<div style="padding:0.75rem 1rem;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:0.9rem">
  <strong>${d3.format(",")(totalSets)}</strong> logsheet fishing sets across
  <strong>${flags.length}</strong> vessel flags and
  <strong>${eezs.length}</strong> EEZs have a valid longitude.
</div>`);
```

## By vessel flag

```js
display(offsetGrid(flags, flag => offsetCard(
  flag,
  rankedList(offsetRows(byFlag.get(flag)), {
    labelKey: "offset", countKey: "count", title: "Longline",
    subtitle: `${d3.format(",")(flagTotals.get(flag))} sets`,
    total: flagTotals.get(flag), labelFormat: fmtOffset,
  }),
  html``,
)));
```

## By EEZ

```js
display(offsetGrid(eezs, eez => offsetCard(
  eez,
  rankedList(offsetRows(byEez.get(eez)), {
    labelKey: "offset", countKey: "count", title: "Longline",
    subtitle: `${d3.format(",")(eezTotals.get(eez))} sets`,
    total: eezTotals.get(eez), labelFormat: fmtOffset,
  }),
  html``,
)));
```

## Combined: flag × EEZ

The dominant nautical offset per flag/EEZ combination. Compare with the
[Observer offsets](./observer-offsets) heatmap to spot flags where captains consistently choose a
different clock than the local zone suggests.

```js
{
  const cells = [];
  for (const [flag, fv] of byFlag) {
    const perEez = d3.group(fv, d => d.eez_code);
    for (const [eez, ev] of perEez) {
      const offs = offsetRows(ev);
      cells.push({ flag, eez, modal: offs[0].offset, total: d3.sum(ev, d => d.count) });
    }
  }

  // Keep the most-sampled EEZ columns so the grid stays readable.
  const topEez = eezs.slice(0, 28);
  const shown = cells.filter(c => topEez.includes(c.eez));

  display(Plot.plot({
    width: Math.max(width, 900),
    height: 28 * flags.length + 90,
    marginLeft: 50,
    marginBottom: 70,
    x: { domain: topEez, label: "EEZ", tickRotate: -45 },
    y: { domain: flags, label: "Flag" },
    color: {
      type: "diverging", scheme: "BuRd", legend: true, label: "Dominant nautical offset (h)",
      domain: [-13, 13],
    },
    marks: [
      Plot.cell(shown, { x: "eez", y: "flag", fill: "modal", inset: 0.5,
        tip: true, title: d => `${d.flag} × ${d.eez}\n${fmtOffset(d.modal)} · ${d3.format(",")(d.total)} sets` }),
      Plot.text(shown, { x: "eez", y: "flag", text: d => fmtOffset(d.modal),
        fill: "black", fontSize: 9 }),
    ],
  }));
  if (eezs.length > topEez.length) {
    display(html`<p style="color:#9ca3af;font-size:0.85rem">Showing the ${topEez.length} most-sampled EEZ columns of ${eezs.length}.</p>`);
  }
}
```
