---
theme: air
title: Ports
toc: false
---

# Ports and their civil UTC offset

Every Tufman port with known coordinates, resolved to its **civil IANA time zone**
and **standard (non-DST) UTC offset**. The offset is looked up from the port's
latitude/longitude with [`timezonefinder`](https://github.com/jannikmi/timezonefinder)
and read from Python's `zoneinfo` database (see `data/ports.csv.py`).

Why civil rather than nautical (`longitude / 15`)? A departure port matters
because a captain may keep the **departure-port clock** for the whole trip instead
of adjusting to local vessel time. The clock a port keeps is its civil time zone,
which does not always match the nautical estimate. This table is the reference
used by the [decision tree](./decision-tree), where departure port is a predictor.

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

const ports = await FileAttachment("data/ports.csv").csv({ typed: true });
const fmtOffset = v => v == null || v === "" ? "—" : `UTC${v >= 0 ? "+" : ""}${v}`;
```

```js
const card = (label, value, sub) => html`<div style="flex:1;min-width:150px;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
  <div style="font-size:1.5rem;font-weight:700">${value}</div>
  <div style="font-size:0.85rem;color:#374151">${label}</div>
  ${sub ? html`<div style="font-size:0.78rem;color:#9ca3af">${sub}</div>` : ""}
</div>`;

const nDst = ports.filter(p => p.has_dst === 1).length;
const nOffsets = new Set(ports.map(p => p.utc_offset)).size;
display(html`<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
  ${card("Ports with coordinates", d3.format(",")(ports.length))}
  ${card("Distinct UTC offsets", nOffsets)}
  ${card("Zones with DST", d3.format(",")(nDst), "offset shown is standard time")}
</div>`);
```

## Offset distribution

```js
{
  const byOffset = d3.rollups(ports, v => v.length, d => d.utc_offset)
    .map(([offset, count]) => ({ offset, count }))
    .sort((a, b) => a.offset - b.offset);
  display(Plot.plot({
    marginLeft: 55,
    height: 300,
    x: { label: "Ports", grid: true },
    y: { label: "UTC offset", tickFormat: v => `${v >= 0 ? "+" : ""}${v}`, reverse: true },
    marks: [
      Plot.barX(byOffset, { y: "offset", x: "count", fill: "#93c5fd", sort: { y: "y" } }),
      Plot.text(byOffset, { y: "offset", x: "count", text: "count", dx: 10, fontSize: 11 }),
      Plot.ruleX([0]),
    ],
  }));
}
```

## All ports

Search by name, country or zone; click a column header to sort.

```js
const search = view(Inputs.search(ports, { placeholder: "Search ports, country, zone…" }));
```

```js
display(Inputs.table(search, {
  columns: ["port_name", "country_code", "location_code", "lat", "lon", "iana_zone", "utc_offset", "has_dst"],
  header: {
    port_name: "Port",
    country_code: "Country",
    location_code: "Code",
    lat: "Lat",
    lon: "Lon",
    iana_zone: "IANA zone",
    utc_offset: "UTC offset",
    has_dst: "DST",
  },
  format: {
    lat: v => d3.format(".2f")(v),
    lon: v => d3.format(".2f")(v),
    utc_offset: v => fmtOffset(v),
    has_dst: v => v === 1 ? "yes" : "",
  },
  sort: "port_name",
  rows: 20,
  width: { port_name: 220, iana_zone: 180 },
}));
```

---

> Ports without coordinates in `ref.ports` are omitted — no position means no time
> zone can be resolved. `utc_offset` is the standard-time offset; ports flagged
> **DST** shift by an extra hour during their daylight-saving season.
