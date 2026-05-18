---
theme: air
title: Log Schema — system_source Distribution
toc: false
---

# Entities to migrate

## System source distribution in logsheets



```js
const data = await FileAttachment("data/log-system-source.csv").csv({ typed: true });

const entities = [...new Set(data.map(d => d.entity))];
const allSources = [...new Set(data.map(d => d.system_source))].sort();
```

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
    ${colEntities.map(e => html`<div style="${headerStyle()}">${e}</div>`)}
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
