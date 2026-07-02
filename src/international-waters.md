---
theme: air
title: International waters
toc: false
---

# International waters EEZ codes

When Tufman stamps an activity with an EEZ, it calls the SQL function
`tufman2.GetEezCodeFromLatAndLon(lat, lon)` (wrapped by
`DatabaseFunctionHelper.GetEezByLatAndLon`). That function builds a `GEOGRAPHY`
point and returns the `eez_code` of the first `ref.eez_definitions` polygon
(`eez_source_no = 2`) it intersects — **defaulting to `IW` when the point falls
inside no polygon at all**.

Twelve of these codes are *international waters* (`CommonGlobals.InternationalWatersEezs`):
**H4, H5, IW, I1–I9**. This page asks a simple question that matters for the
[nautical fallback](./observer-offsets): **how many distinct nautical timezones
does each international-waters code actually span?** If a single code stretches
across many `round(longitude / 15)` bands, then assigning it one fallback UTC
offset is indefensible.

```js
import * as d3 from "npm:d3";
import { rankedList, offsetGrid, offsetCard } from "./components/offset-charts.js";

const extentRaw   = await FileAttachment("data/iw-eez-extent.csv").csv({ typed: true });
const observedRaw = await FileAttachment("data/iw-nautical-offsets.csv").csv({ typed: true });

const fmtOffset = v => `${v >= 0 ? "+" : ""}${v} h`;

// Observed sets grouped by IW code.
const obsByCode = d3.group(observedRaw, d => d.eez_code);
const codeTotal = new Map([...obsByCode].map(([k, v]) => [k, d3.sum(v, d => d.count)]));

// Geographic-definition lookup, keyed by code.
const extentByCode = new Map(extentRaw.map(d => [d.eez_code, d]));

// Codes ordered by observed set count (desc).
const codes = [...new Set([...extentRaw.map(d => d.eez_code), ...obsByCode.keys()])]
  .sort((a, b) => (codeTotal.get(b) ?? 0) - (codeTotal.get(a) ?? 0));

function observedRows(code) {
  return (obsByCode.get(code) ?? [])
    .map(d => ({ offset: d.nautical_offset, count: d.count }))
    .sort((a, b) => b.count - a.count);
}
```

```js
const totalSets = d3.sum(observedRaw, d => d.count);
const iwRow = obsByCode.get("IW") ?? [];
const iwTz = new Set(iwRow.map(d => d.nautical_offset)).size;
display(html`<div style="padding:0.75rem 1rem;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:0.9rem">
  <strong>${d3.format(",")(totalSets)}</strong> longline logsheet sets resolved to an
  international-waters code, across <strong>${codes.length}</strong> codes. The catch-all
  <strong>IW</strong> alone spans <strong>${iwTz}</strong> distinct nautical timezones —
  a single fallback offset for it would be meaningless.
</div>`);
```

## Geographic definition

The longitude extent of each code's polygon and the nautical timezones
(`round(longitude / 15)`) it covers. Longitudes are shown Pacific-centred, so a
value above 180° means "east of the dateline" and a strip like 179.5 → 184.4
reads as one continuous span across 180°. Timezone bands are computed on the
folded longitude (−180…180), so the numbers are physically meaningful.

`IW` has **no polygon** — it is the default returned for any point outside every
other EEZ, so its footprint is effectively global.

```js
display(html`<table style="border-collapse:collapse;font-size:0.85rem">
  <thead>
    <tr style="border-bottom:2px solid #cbd5e1;text-align:left">
      <th style="padding:4px 10px">Code</th>
      <th style="padding:4px 10px">Description</th>
      <th style="padding:4px 10px;text-align:right">Lon extent (°, Pacific-centred)</th>
      <th style="padding:4px 10px;text-align:right"># TZ</th>
      <th style="padding:4px 10px">Nautical timezone bands</th>
    </tr>
  </thead>
  <tbody>
    ${extentRaw.map(d => html`<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:3px 10px;font-family:monospace;font-weight:700">${d.eez_code}</td>
      <td style="padding:3px 10px;color:#475569">${d.ez_desc}</td>
      <td style="padding:3px 10px;text-align:right;font-family:monospace">
        ${d.min_lon === "" || d.min_lon == null ? "—" : `${d3.format(".1f")(d.min_lon)} → ${d3.format(".1f")(d.max_lon)}`}
      </td>
      <td style="padding:3px 10px;text-align:right;font-family:monospace">${d.n_timezones === "" || d.n_timezones == null ? "—" : d.n_timezones}</td>
      <td style="padding:3px 10px;font-family:monospace;color:#334155">
        ${String(d.tz_bands).startsWith("global")
          ? d.tz_bands
          : String(d.tz_bands).split("|").map(t => `UTC${Number(t) >= 0 ? "+" : ""}${t}`).join(", ")}
      </td>
    </tr>`)}
  </tbody>
</table>`);
```

## Observed fishing footprint

Where vessels **actually** fished inside each code, as the distribution of the
per-set nautical offset `round(longitude / 15)`. This reflects reality (not just
the polygon shape): the more timezones a code spreads across, the less any single
fallback offset can represent it. Each card shows the observed distribution on
the **left** and the polygon definition on the **right**.

```js
display(offsetGrid(codes, code => {
  const ext = extentByCode.get(code);
  const defPanel = html`<div style="font-size:0.82rem;color:#475569;padding:0.25rem 0">
    <div style="font-weight:600;font-size:0.8rem;color:#6b7280;margin-bottom:0.3rem">Definition</div>
    <div>${ext?.ez_desc ?? ""}</div>
    <div style="margin-top:0.4rem;font-family:monospace">
      ${ext && ext.min_lon !== "" && ext.min_lon != null
        ? html`Lon ${d3.format(".1f")(ext.min_lon)} → ${d3.format(".1f")(ext.max_lon)}<br>${ext.n_timezones} timezone band(s)`
        : html`No polygon — global default`}
    </div>
  </div>`;
  return offsetCard(
    `${code} — ${d3.format(",")(codeTotal.get(code) ?? 0)} sets`,
    rankedList(observedRows(code), {
      labelKey: "offset", countKey: "count", title: "Observed nautical offset",
      subtitle: `${new Set(observedRows(code).map(r => r.offset)).size} timezones`,
      labelFormat: fmtOffset, noDataText: "No logsheet sets",
    }),
    defPanel,
  );
}));
```

## Why this matters

**The dateline breaks the sign, not the clock.** At the 180° meridian
`round(longitude / 15)` flips between **+12** and **−12** for two points a few
kilometres apart. Codes that straddle the dateline — **H4, H5, I4, I6, I7** —
therefore show *both* signs even though the physical time is the same. Any
fallback that keys on the code alone inherits this instability.

**`IW` is a global catch-all.** Because it is the default for every point outside
all other polygons, it collects sets from right across the Pacific — roughly a
dozen-and-a-half nautical timezones. Collapsing it to one offset is meaningless.

**Conclusion.** For international-waters codes the nautical offset must be taken
**per activity, from that activity's own longitude** — never as a single
per-code fallback. `IW` in particular should never resolve to one offset.
```
