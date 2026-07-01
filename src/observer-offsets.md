---
theme: air
title: Observer & nautical offsets
toc: false
---

# Observer & nautical UTC offsets

Two independent estimates of each longline set's UTC offset, shown side by side so they can be
compared directly.

**Observer offset (measured truth).** Every **Longline** observer fishing activity (set) carries a
**measured** UTC offset: `vessel-time − UTC`. These are the examples the
[decision tree](./decision-tree) learns from — but they only exist for the small share of sets that
have a matched observer trip.

- Source: `obsv.l_set` matched to longline logsheet sets (since 2017)
- Offset rounded to the nearest 0.5 h, dateline-folded (>+12 h → −24), clipped to ±14 h
- Each value is weighted by the number of observer activities (`count`)

**Nautical offset (longitude/15 estimate).** The *nautical timezone offset* is a purely geographic
estimate computed from the longitude at the time of the fishing set:

> **nautical_offset = round(longitude / 15)**

A vessel at 150 °E sits 10 h ahead of UTC; a vessel at 150 °W is 10 h behind. This method needs no
observer data and covers **every** logsheet set with a recorded longitude — far more rows than the
observer-linked data.

- Source: `log.sets_ll` (all fishing sets, since 2017) with valid longitude and EEZ
- Longitude-based offset rounded to the nearest whole hour; clipped to ±14 h
- Counts are **logsheet activities** (not observer activities)

**Important caveat:** captains may keep the departure-port clock rather than adjusting to the local
time zone. In that case the nautical estimate diverges from the observer-measured offset. Comparing
the two columns below highlights exactly where that happens, and shows coverage for flags with
little or no observer data.

```js
import * as d3 from "npm:d3";
import { rankedList, offsetGrid, offsetCard } from "./components/offset-charts.js";

const obsRaw  = await FileAttachment("data/ll-observer-activity-offsets.csv").csv({ typed: true });
const nautRaw = await FileAttachment("data/ll-nautical-activity-offsets.csv").csv({ typed: true });

const fmtOffset = v => `${v >= 0 ? "+" : ""}${v} h`;

// Aggregate offset counts within an arbitrary grouping key.
// `offsetKey` is the column holding the offset value (differs between datasets).
function offsetRows(rows, offsetKey) {
  return d3.rollups(rows, v => d3.sum(v, d => d.count), d => d[offsetKey])
    .map(([offset, count]) => ({ offset, count }))
    .sort((a, b) => b.count - a.count);
}

const obsByFlag  = d3.group(obsRaw,  d => d.vessel_flag);
const obsByEez   = d3.group(obsRaw,  d => d.eez_code);
const nautByFlag = d3.group(nautRaw, d => d.vessel_flag);
const nautByEez  = d3.group(nautRaw, d => d.eez_code);

const total = m => new Map([...m].map(([k, v]) => [k, d3.sum(v, d => d.count)]));
const obsFlagTot  = total(obsByFlag),  obsEezTot  = total(obsByEez);
const nautFlagTot = total(nautByFlag), nautEezTot = total(nautByEez);

// Union of keys, sorted by observer total (desc), then nautical total.
function unionKeys(mapA, totA, totB) {
  const keys = new Set([...mapA.keys()]);
  for (const k of totB.keys()) keys.add(k);
  return [...keys].sort((a, b) =>
    (totA.get(b) ?? 0) - (totA.get(a) ?? 0) || (totB.get(b) ?? 0) - (totB.get(a) ?? 0));
}
const flags = unionKeys(obsByFlag, obsFlagTot, nautFlagTot);
const eezs  = unionKeys(obsByEez,  obsEezTot,  nautEezTot);
```

```js
const totalNautSets = d3.sum(nautRaw, d => d.count);
const totalObsSets  = d3.sum(obsRaw,  d => d.count);
display(html`<div style="padding:0.75rem 1rem;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:0.9rem">
  <strong>${d3.format(",")(totalObsSets)}</strong> observer-matched activities vs
  <strong>${d3.format(",")(totalNautSets)}</strong> longitude-estimated logsheet sets, across
  <strong>${flags.length}</strong> vessel flags and <strong>${eezs.length}</strong> EEZs.
</div>`);
```

## By vessel flag

Observer offsets (measured) on the **left**, nautical longitude/15 offsets on the **right**.

```js
display(offsetGrid(flags, flag => offsetCard(
  flag,
  rankedList(offsetRows(obsByFlag.get(flag) ?? [], "offset"), {
    labelKey: "offset", countKey: "count", title: "Observer",
    subtitle: `${d3.format(",")(obsFlagTot.get(flag) ?? 0)} activities`,
    total: obsFlagTot.get(flag), labelFormat: fmtOffset,
    noDataText: "No observer data",
  }),
  rankedList(offsetRows(nautByFlag.get(flag) ?? [], "nautical_offset"), {
    labelKey: "offset", countKey: "count", title: "Nautical", barColor: "#bbf7d0",
    subtitle: `${d3.format(",")(nautFlagTot.get(flag) ?? 0)} sets`,
    total: nautFlagTot.get(flag), labelFormat: fmtOffset,
    noDataText: "No nautical data",
  }),
)));
```

## By EEZ

Observer offsets on the **left**, nautical offsets on the **right**.

```js
display(offsetGrid(eezs, eez => offsetCard(
  eez,
  rankedList(offsetRows(obsByEez.get(eez) ?? [], "offset"), {
    labelKey: "offset", countKey: "count", title: "Observer",
    subtitle: `${d3.format(",")(obsEezTot.get(eez) ?? 0)} activities`,
    total: obsEezTot.get(eez), labelFormat: fmtOffset,
    noDataText: "No observer data",
  }),
  rankedList(offsetRows(nautByEez.get(eez) ?? [], "nautical_offset"), {
    labelKey: "offset", countKey: "count", title: "Nautical", barColor: "#bbf7d0",
    subtitle: `${d3.format(",")(nautEezTot.get(eez) ?? 0)} sets`,
    total: nautEezTot.get(eez), labelFormat: fmtOffset,
    noDataText: "No nautical data",
  }),
)));
```

## Combined: flag × EEZ

The dominant offset per flag × EEZ combination, shown as **observer / nautical**. Where the two
disagree, the captain's clock differs from the geographic time zone (those cells are shown in
bold). A dash (`—`) means no data for that source. Only the most-sampled EEZ columns are shown.

```js
{
  // Dominant offset per (flag, eez) for each dataset.
  function dominantMap(byFlag, offsetKey) {
    const m = new Map(); // "flag|eez" -> dominant offset
    for (const [flag, fv] of byFlag) {
      for (const [eez, ev] of d3.group(fv, d => d.eez_code)) {
        m.set(`${flag}|${eez}`, offsetRows(ev, offsetKey)[0].offset);
      }
    }
    return m;
  }
  const obsDom  = dominantMap(obsByFlag,  "offset");
  const nautDom = dominantMap(nautByFlag, "nautical_offset");

  const topEez = eezs.slice(0, 20);
  const fmt = v => v === undefined ? "—" : (v >= 0 ? `+${v}` : `${v}`);

  display(html`<div style="overflow-x:auto">
    <table style="border-collapse:collapse;font-size:0.78rem;font-family:monospace">
      <thead>
        <tr>
          <th style="position:sticky;left:0;background:#fff;text-align:left;padding:4px 8px;border-bottom:2px solid #e5e7eb">Flag</th>
          ${topEez.map(eez => html`<th style="padding:4px 6px;border-bottom:2px solid #e5e7eb;text-align:center">${eez}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${flags.map(flag => html`<tr style="border-bottom:1px solid #f3f4f6">
          <td style="position:sticky;left:0;background:#fff;font-weight:700;padding:3px 8px">${flag}</td>
          ${topEez.map(eez => {
            const o = obsDom.get(`${flag}|${eez}`);
            const n = nautDom.get(`${flag}|${eez}`);
            if (o === undefined && n === undefined)
              return html`<td style="padding:3px 6px;text-align:center;color:#e5e7eb">·</td>`;
            const diverge = o !== undefined && n !== undefined && o !== n;
            return html`<td style="padding:3px 6px;text-align:center;${diverge ? "font-weight:700" : ""}">${fmt(o)}&thinsp;/&thinsp;${fmt(n)}</td>`;
          })}
        </tr>`)}
      </tbody>
    </table>
  </div>`);
  if (eezs.length > topEez.length) {
    display(html`<p style="color:#9ca3af;font-size:0.85rem">Showing the ${topEez.length} most-sampled EEZ columns of ${eezs.length}. Each cell is <strong>observer / nautical</strong>; bold cells are where the two disagree.</p>`);
  }
}
```
