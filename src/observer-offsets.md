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

## By departure port

A trip may keep the **departure-port clock** rather than adjusting to local vessel time. Here the
observer-measured offset distribution for trips leaving each port (**left**) is shown against that
port's **civil UTC offset** (**right**, from [Ports](./ports)). Where the dominant observer offset
matches the port's civil offset, the captain was likely keeping port time.

```js
const portRaw  = await FileAttachment("data/ll-observer-port-offsets.csv").csv({ typed: true });
const portsRef = await FileAttachment("data/ports.csv").csv({ typed: true });

const portCivil = new Map(portsRef.map(p => [p.port_id, p]));
const obsByPort = d3.group(portRaw, d => d.depart_port_id);
const portName  = new Map(portRaw.map(d => [d.depart_port_id, d.depart_port_name]));
const portTot   = new Map([...obsByPort].map(([k, v]) => [k, d3.sum(v, d => d.count)]));
const ports     = [...obsByPort.keys()].sort((a, b) => portTot.get(b) - portTot.get(a));

// Reference panel: the port's civil UTC offset, and whether it matches the
// dominant observer offset for that port.
function civilPanel(pid) {
  const civil = portCivil.get(pid);
  const dom = offsetRows(obsByPort.get(pid) ?? [], "offset")[0]?.offset;
  if (!civil || civil.utc_offset === "" || civil.utc_offset == null) {
    return html`<div style="font-size:0.82rem;color:#9ca3af;padding:0.5rem 0">No civil offset (port has no coordinates)</div>`;
  }
  const off = Number(civil.utc_offset);
  const match = dom !== undefined && Math.abs(dom - off) < 0.01;
  return html`<div style="font-size:0.82rem;color:#475569;padding:0.25rem 0">
    <div style="font-weight:600;font-size:0.8rem;color:#6b7280;margin-bottom:0.3rem">Civil UTC offset</div>
    <div style="font-family:monospace;font-size:1.4rem;font-weight:700;color:${match ? "#166534" : "#b45309"}">
      ${fmtOffset(off)}
    </div>
    <div style="margin-top:0.25rem">${civil.iana_zone}${civil.has_dst === 1 ? html` <span style="color:#9ca3af">(+DST)</span>` : ""}</div>
    <div style="margin-top:0.35rem;color:${match ? "#166534" : "#b45309"}">
      ${dom === undefined ? "" : match ? "✓ matches dominant observer offset" : `✗ dominant observer offset is ${fmtOffset(dom)}`}
    </div>
  </div>`;
}

display(offsetGrid(ports, pid => offsetCard(
  `${portName.get(pid) || pid} — ${d3.format(",")(portTot.get(pid) ?? 0)} activities`,
  rankedList(offsetRows(obsByPort.get(pid) ?? [], "offset"), {
    labelKey: "offset", countKey: "count", title: "Observer",
    subtitle: `${d3.format(",")(portTot.get(pid) ?? 0)} activities`,
    total: portTot.get(pid), labelFormat: fmtOffset,
    noDataText: "No observer data",
  }),
  civilPanel(pid),
)));
```

## Combined: flag × EEZ

The dominant offset per flag × EEZ combination. Each cell is split in two — **observer** on the
left, **nautical** on the right. Where the two disagree, the cell is shown in bold. A dash (`—`)
means no data for that source. **Hover any cell** to highlight its flag (row) and EEZ (column)
headers. Only the most-sampled EEZ columns are shown.

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

  const style = html`<style>
    table.cmb { border-collapse:collapse; font-size:0.78rem; font-family:monospace; }
    table.cmb th, table.cmb td { border:1px solid #cbd5e1; }
    table.cmb th { background:#f8fafc; }
    table.cmb .cmb-corner, table.cmb .cmb-rowhead {
      position:sticky; left:0; z-index:1; text-align:left; padding:4px 8px; background:#f8fafc; font-weight:700;
    }
    table.cmb .cmb-colhead { padding:4px 0; text-align:center; }
    table.cmb .cmb-cell { padding:0; }
    table.cmb .half { display:flex; align-items:stretch; }
    table.cmb .half > span { flex:1; text-align:center; padding:2px 6px; }
    table.cmb .half > span + span { border-left:1px solid #e2e8f0; }
    table.cmb .diverge { font-weight:700; }
    table.cmb .hl-head { background:#bfdbfe !important; }
    table.cmb .hl-cell { background:#dbeafe; }
  </style>`;

  const cellInner = (o, n) => html`<div class="half">
    <span>${fmt(o)}</span><span>${fmt(n)}</span>
  </div>`;

  const table = html`<table class="cmb">
    <thead>
      <tr>
        <th class="cmb-corner">Flag</th>
        ${topEez.map((eez, ci) => html`<th class="cmb-colhead" data-col=${ci}>
          <div>${eez}</div>
          <div class="half" style="font-size:0.7em;color:#9ca3af;font-weight:400">
            <span>obs</span><span>naut</span>
          </div>
        </th>`)}
      </tr>
    </thead>
    <tbody>
      ${flags.map(flag => html`<tr>
        <th class="cmb-rowhead">${flag}</th>
        ${topEez.map((eez, ci) => {
          const o = obsDom.get(`${flag}|${eez}`);
          const n = nautDom.get(`${flag}|${eez}`);
          if (o === undefined && n === undefined)
            return html`<td class="cmb-cell" data-col=${ci}><div style="text-align:center;color:#cbd5e1;padding:2px 6px">·</div></td>`;
          const diverge = o !== undefined && n !== undefined && o !== n;
          return html`<td class="cmb-cell ${diverge ? "diverge" : ""}" data-col=${ci}>${cellInner(o, n)}</td>`;
        })}
      </tr>`)}
    </tbody>
  </table>`;

  // Hover: highlight the cell plus its row (flag) and column (EEZ) headers.
  table.querySelectorAll("tbody tr").forEach(tr => {
    const rowhead = tr.querySelector(".cmb-rowhead");
    tr.querySelectorAll(".cmb-cell").forEach(td => {
      const colhead = table.querySelector(`.cmb-colhead[data-col="${td.dataset.col}"]`);
      td.addEventListener("mouseenter", () => {
        td.classList.add("hl-cell");
        rowhead.classList.add("hl-head");
        colhead?.classList.add("hl-head");
      });
      td.addEventListener("mouseleave", () => {
        td.classList.remove("hl-cell");
        rowhead.classList.remove("hl-head");
        colhead?.classList.remove("hl-head");
      });
    });
  });

  display(style);
  display(html`<div style="overflow-x:auto">${table}</div>`);
  if (eezs.length > topEez.length) {
    display(html`<p style="color:#9ca3af;font-size:0.85rem">Showing the ${topEez.length} most-sampled EEZ columns of ${eezs.length}. Each cell is <strong>observer / nautical</strong>; bold cells are where the two disagree.</p>`);
  }
}
```
