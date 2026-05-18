---
title: Log Schema — system_source Distribution
---

# Log Schema — system_source Distribution

The `log` schema contains **25 entities** (6 logsheet tables + 19 activity/catch child tables).
Only the **6 logsheet (trip-level)** tables carry a `system_source` column.
Activity and catch tables do not — they inherit context from their parent logsheet.

## Entities with system_source

| Entity | Table | Role |
|--------|-------|------|
| HandlineLogsheet | log.trips_hl | Trip |
| LonglineLogsheet | log.trips_ll | Trip |
| PoleAndLineLogsheet | log.trips_pl | Trip |
| PurseseineLogsheet | log.trips_ps | Trip |
| SnapperLogsheet | log.trips_ds | Trip |
| VietnamLogsheet | log.trips_vn | Trip |

## Entities without system_source (child tables)

HandlineActivity, HandlineCatch, LonglineActivity, LonglineCatch,
PoleAndLineActivity, PoleAndLineCatch, PurseseineActivity, PurseseineCatch,
SnapperActivity, SnapperCatch, VietnamActivity, VietnamCatch,
Encirclement, WellTransfer, NetShareReceive, NetShareReceiveDetail,
NetShareCatch, TransshipmentTransfer, Transshipment

---

```js
const data = await FileAttachment("data/log-system-source.csv").csv({ typed: true });

const entities = [...new Set(data.map(d => d.entity))];
const allSources = [...new Set(data.map(d => d.system_source))].sort();
```

## Per-entity breakdown

```js
import * as Plot from "@observablehq/plot";

// One bar chart per entity
for (const entity of entities) {
  const rows = data.filter(d => d.entity === entity);
  const total = rows.reduce((s, d) => s + d.row_count, 0);

  display(html`<h3>${entity} <small style="font-weight:normal;color:#666;">(${total.toLocaleString()} records)</small></h3>`);

  display(Plot.plot({
    marginLeft: 120,
    marginRight: 80,
    width: 700,
    height: Math.max(60, rows.length * 32 + 30),
    x: { label: "Records", grid: true },
    y: { label: null },
    marks: [
      Plot.barX(rows, {
        x: "row_count",
        y: "system_source",
        sort: { y: "-x" },
        fill: "steelblue",
        tip: true,
      }),
      Plot.text(rows, {
        x: "row_count",
        y: "system_source",
        text: d => d.row_count.toLocaleString(),
        dx: 5,
        textAnchor: "start",
        fontSize: 12,
        sort: { y: "-x" },
      }),
    ],
  }));
}
```

## Cross-entity pivot

Rows = system_source values, Columns = entities. Blank = source not present in that entity.

```js
import { html } from "htl";

const colEntities = entities;

// Build pivot map: source → { entity → count }
const pivot = new Map();
for (const row of data) {
  if (!pivot.has(row.system_source)) pivot.set(row.system_source, {});
  pivot.get(row.system_source)[row.entity] = row.row_count;
}

// Sort sources by total descending
const sourceTotals = [...pivot.entries()].map(([src, byEntity]) => ({
  source: src,
  total: Object.values(byEntity).reduce((s, v) => s + v, 0),
  byEntity,
})).sort((a, b) => b.total - a.total);

display(html`
  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr>
        <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">system_source</th>
        ${colEntities.map(e => html`<th style="padding:4px 8px;border-bottom:2px solid #ccc;text-align:right;">${e.replace("Logsheet","<br>Logsheet")}</th>`)}
        <th style="padding:4px 8px;border-bottom:2px solid #ccc;text-align:right;font-weight:bold;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${sourceTotals.map(({ source, total, byEntity }) => html`
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-family:monospace;">${source}</td>
          ${colEntities.map(e => html`<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:${byEntity[e] ? "#333" : "#ccc"};">
            ${byEntity[e] ? byEntity[e].toLocaleString() : "—"}
          </td>`)}
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${total.toLocaleString()}</td>
        </tr>
      `)}
    </tbody>
    <tfoot>
      <tr>
        <td style="padding:4px 8px;border-top:2px solid #ccc;font-weight:bold;">Total</td>
        ${colEntities.map(e => {
          const colTotal = data.filter(d => d.entity === e).reduce((s, d) => s + d.row_count, 0);
          return html`<td style="padding:4px 8px;border-top:2px solid #ccc;text-align:right;font-weight:bold;">${colTotal.toLocaleString()}</td>`;
        })}
        <td style="padding:4px 8px;border-top:2px solid #ccc;text-align:right;font-weight:bold;">${data.reduce((s,d)=>s+d.row_count,0).toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>
`);
```
