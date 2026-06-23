---
theme: air
title: Observer offsets
toc: false
---

# Observer UTC offsets — the training data

Every **Longline** observer fishing activity (set) carries a **measured** UTC offset:
`vessel-time − UTC`. These are the examples the [decision tree](./decision-tree) learns from. This
page shows the offsets per **vessel flag** and per **EEZ**, and finally the combined
**flag × EEZ** view — the exact grouping used for training.

- Source: `obsv.l_set` matched to longline logsheet sets (since 2017)
- Offset rounded to the nearest 0.5 h, dateline-folded (>+12 h → −24), clipped to ±14 h
- Each value is weighted by the number of observer activities (`count`)

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";
import { rankedList, offsetGrid, offsetCard } from "./components/offset-charts.js";

const raw = await FileAttachment("data/ll-observer-activity-offsets.csv").csv({ typed: true });

const fmtOffset = v => `${v >= 0 ? "+" : ""}${v} h`;

// Aggregate offset counts within an arbitrary grouping key.
function offsetRows(rows) {
  return d3.rollups(rows, v => d3.sum(v, d => d.count), d => d.offset)
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

## By vessel flag

```js
display(offsetGrid(flags, flag => offsetCard(
  flag,
  rankedList(offsetRows(byFlag.get(flag)), {
    labelKey: "offset", countKey: "count", title: "Longline",
    subtitle: `${d3.format(",")(flagTotals.get(flag))} activities`,
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
    subtitle: `${d3.format(",")(eezTotals.get(eez))} activities`,
    total: eezTotals.get(eez), labelFormat: fmtOffset,
  }),
  html``,
)));
```

## Combined: flag × EEZ

The cell colour is the **dominant offset** for that flag/EEZ combination; the number is how many
observer activities support it. Empty cells have no observer data. This is the feature grid the
decision tree partitions.

```js
{
  // Dominant offset + support per (flag, eez)
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
      type: "diverging", scheme: "BuRd", legend: true, label: "Dominant offset (h)",
      domain: [-13, 13],
    },
    marks: [
      Plot.cell(shown, { x: "eez", y: "flag", fill: "modal", inset: 0.5,
        tip: true, title: d => `${d.flag} × ${d.eez}\n${fmtOffset(d.modal)} · ${d3.format(",")(d.total)} activities` }),
      Plot.text(shown, { x: "eez", y: "flag", text: d => fmtOffset(d.modal),
        fill: "black", fontSize: 9 }),
    ],
  }));
  if (eezs.length > topEez.length) {
    display(html`<p style="color:#9ca3af;font-size:0.85rem">Showing the ${topEez.length} most-sampled EEZ columns of ${eezs.length}.</p>`);
  }
}
```
