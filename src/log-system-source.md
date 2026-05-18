---
theme: air
title: Log Schema — system_source Distribution
toc: false
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
import * as Plot from "npm:@observablehq/plot";

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

const cols = colEntities.length + 2; // source + entities + total
const cellStyle = (align = "right", bold = false, muted = false, mono = false) =>
  `padding:5px 10px;text-align:${align};font-weight:${bold?"bold":"normal"};` +
  `color:${muted?"#bbb":"inherit"};font-family:${mono?"monospace":"inherit"};` +
  `border-bottom:1px solid #e8e8e8;`;

const headerStyle = (align = "right") =>
  `padding:5px 10px;text-align:${align};font-weight:600;` +
  `border-bottom:2px solid #ccc;background:#f7f7f7;font-size:11px;line-height:1.3;`;

display(html`
  <div style="
    display:grid;
    grid-template-columns: 160px ${colEntities.map(() => "1fr").join(" ")} 90px;
    font-size:13px;
    border:1px solid #e0e0e0;
    border-radius:6px;
    overflow:hidden;
    width:fit-content;
    max-width:100%;
  ">
    <!-- Header row -->
    <div style="${headerStyle("left")}">system_source</div>
    ${colEntities.map(e => html`<div style="${headerStyle()}">${e.replace("Logsheet", " L'sheet")}</div>`)}
    <div style="${headerStyle()}">Total</div>

    <!-- Data rows -->
    ${sourceTotals.flatMap(({ source, total, byEntity }) => [
      html`<div style="${cellStyle("left", false, false, true)}">${source}</div>`,
      ...colEntities.map(e => html`<div style="${cellStyle("right", false, !byEntity[e])}">${byEntity[e] ? byEntity[e].toLocaleString() : "—"}</div>`),
      html`<div style="${cellStyle("right", true)}">${total.toLocaleString()}</div>`,
    ])}

    <!-- Footer row -->
    <div style="padding:5px 10px;font-weight:bold;border-top:2px solid #ccc;background:#f7f7f7;">Total</div>
    ${colEntities.map(e => {
      const colTotal = data.filter(d => d.entity === e).reduce((s, d) => s + d.row_count, 0);
      return html`<div style="padding:5px 10px;text-align:right;font-weight:bold;border-top:2px solid #ccc;background:#f7f7f7;">${colTotal.toLocaleString()}</div>`;
    })}
    <div style="padding:5px 10px;text-align:right;font-weight:bold;border-top:2px solid #ccc;background:#f7f7f7;">${data.reduce((s,d)=>s+d.row_count,0).toLocaleString()}</div>
  </div>
`);
```
