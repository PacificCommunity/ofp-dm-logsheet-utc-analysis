---
theme: air
title: Entities to Migrate — Date + Time fields
toc: false
---

# Entities to Migrate — Date + Time fields

These entities have both `*Date` (DateTime) and `*Time` (char 4, HHMM) fields and are candidates for a `DateTimeOffset` migration.
Properties inherited from abstract base classes are included.

```js
const data = await FileAttachment("data/entities-to-migrate.csv").csv({ typed: true });
const total = data.reduce((s, d) => s + d.row_count, 0);
```

**${data.length} entities · ${total.toLocaleString()} total records**

---

## Entity catalogue

```js
import { html } from "htl";

// Static definition of all Date+Time field pairs per entity.
// base: abstract base class name if properties are inherited.
const catalogue = [
  // ── LogsheetDomainBase ──────────────────────────────────────────────────────
  { entity: "HandlineLogsheet",    schema: "log",     base: "LogsheetDomainBase",  dateFields: ["DepartureDate","ReturnDate","FirstLogDate","LastLogDate","ReceivedDate"], timeFields: ["DepartureTime","ReturnTime"] },
  { entity: "LonglineLogsheet",    schema: "log",     base: "LogsheetDomainBase",  dateFields: ["DepartureDate","ReturnDate","FirstLogDate","LastLogDate","ReceivedDate"], timeFields: ["DepartureTime","ReturnTime"] },
  { entity: "PoleAndLineLogsheet", schema: "log",     base: "LogsheetDomainBase",  dateFields: ["DepartureDate","ReturnDate","FirstLogDate","LastLogDate","ReceivedDate"], timeFields: ["DepartureTime","ReturnTime"] },
  { entity: "PurseseineLogsheet",  schema: "log",     base: "LogsheetDomainBase",  dateFields: ["DepartureDate","ReturnDate","FirstLogDate","LastLogDate","ReceivedDate"], timeFields: ["DepartureTime","ReturnTime"] },
  { entity: "SnapperLogsheet",     schema: "log",     base: "LogsheetDomainBase",  dateFields: ["DepartureDate","ReturnDate","FirstLogDate","LastLogDate","ReceivedDate"], timeFields: ["DepartureTime","ReturnTime"] },

  // ── ActivityDomainBase ──────────────────────────────────────────────────────
  { entity: "HandlineActivity",    schema: "log",     base: "ActivityDomainBase",  dateFields: ["LogDate"], timeFields: ["ActivityTime"] },
  { entity: "LonglineActivity",    schema: "log",     base: "ActivityDomainBase",  dateFields: ["LogDate"], timeFields: ["ActivityTime"] },
  { entity: "PoleAndLineActivity", schema: "log",     base: "ActivityDomainBase",  dateFields: ["LogDate"], timeFields: ["ActivityTime"] },
  { entity: "PurseseineActivity",  schema: "log",     base: "ActivityDomainBase",  dateFields: ["LogDate"], timeFields: ["ActivityTime"] },
  { entity: "SnapperActivity",     schema: "log",     base: "ActivityDomainBase",  dateFields: ["LogDate"], timeFields: ["ActivityTime"] },

  // ── log misc ────────────────────────────────────────────────────────────────
  { entity: "NetShareReceive", schema: "log",     base: null, dateFields: ["TransferDate"], timeFields: ["TransferTime"] },
  { entity: "Transshipment",   schema: "log",     base: null, dateFields: ["TransferStartDate","TransferEndDate"], timeFields: ["TransferStartTime","TransferEndTime"] },

  // ── ObserverDaylogBase ──────────────────────────────────────────────────────
  { entity: "ObserverPurseseineDaylog",  schema: "obsv", base: "ObserverDaylogBase", dateFields: ["ActivityDate"], timeFields: ["ActivityTime"] },
  { entity: "ObserverPoleAndLineDaylog", schema: "obsv", base: "ObserverDaylogBase", dateFields: ["ActivityDate"], timeFields: ["ActivityTime"] },

  // ── Observer concrete ───────────────────────────────────────────────────────
  { entity: "ObserverTrip",                         schema: "obsv", base: null, dateFields: ["DepartureDate","UtcDepartureDate","ReturnDate"], timeFields: ["DepartureTime","UtcDepartureTime","ReturnTime"] },
  { entity: "CarrierObserverTrip",                  schema: "obsv", base: null, dateFields: ["CarrierDepartureDate","CarrierReturnDate","DepartureDate","ReturnDate"], timeFields: ["CarrierDepartureTime","CarrierReturnTime","DepartureTime","ReturnTime"] },
  { entity: "CarrierObserverTransshipmentActivity", schema: "obsv", base: null, dateFields: ["TransshipmentStartDate","TransshipmentEndDate"], timeFields: ["TransshipmentStartTime","TransshipmentEndTime"] },
  { entity: "ObserverLonglineSet",                  schema: "obsv", base: null, dateFields: ["LocalDate","UtcDate"], timeFields: ["LocalTime","UtcTime"] },
  { entity: "ObserverLonglineSetCatch",             schema: "obsv", base: null, dateFields: ["CatchDate"], timeFields: ["CatchTime"] },

  // ── Tagging ──────────────────────────────────────────────────────────────────
  { entity: "TaggingBaitCaptureSet", schema: "tagging", base: null, dateFields: ["SetDate"], timeFields: ["SetTime"] },
];

const countMap = new Map(data.map(d => [d.entity, d.row_count]));
const rows = catalogue.map(e => ({ ...e, row_count: countMap.get(e.entity) ?? null }));

const schemaColors = {
  log:     "#4e79a7",
  obsv:    "#f28e2b",
  art2:    "#59a14f",
  unload2: "#b07aa1",
  tagging: "#9c755f",
};

const cell = (align = "left", bold = false, mono = false, color = null) =>
  `padding:5px 10px;text-align:${align};font-weight:${bold?"600":"normal"};` +
  `font-family:${mono?"monospace":"inherit"};border-bottom:1px solid #eee;` +
  `${color ? `color:${color};` : ""}white-space:nowrap;`;

const hdr = (align = "left") =>
  `padding:5px 10px;text-align:${align};font-weight:600;font-size:11px;` +
  `border-bottom:2px solid #ccc;background:#f7f7f7;white-space:nowrap;`;

display(html`
  <div style="overflow-x:auto;">
  <div style="display:grid;grid-template-columns:repeat(6,auto);font-size:12px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;width:max-content;">
    <div style="${hdr()}">Entity</div>
    <div style="${hdr()}">Schema</div>
    <div style="${hdr()}">Base class</div>
    <div style="${hdr()}">Date fields</div>
    <div style="${hdr()}">Time fields</div>
    <div style="${hdr("right")}">Records</div>
    ${rows.flatMap(r => [
      html`<div style="${cell("left",true)}">${r.entity}</div>`,
      html`<div style="${cell("left",false,true,schemaColors[r.schema]??'#888')}">${r.schema}</div>`,
      html`<div style="${cell("left",false,false,"#aaa")}">${r.base ?? "—"}</div>`,
      html`<div style="${cell()}" title="${r.dateFields.join(', ')}">${r.dateFields.join(", ")}</div>`,
      html`<div style="${cell()}" title="${r.timeFields.join(', ')}">${r.timeFields.join(", ")}</div>`,
      html`<div style="${cell("right")}">${r.row_count != null ? r.row_count.toLocaleString() : "—"}</div>`,
    ])}
    <div style="padding:5px 10px;font-weight:bold;border-top:2px solid #ccc;background:#f7f7f7;grid-column:span 5;">Total</div>
    <div style="padding:5px 10px;text-align:right;font-weight:bold;border-top:2px solid #ccc;background:#f7f7f7;">${total.toLocaleString()}</div>
  </div>
  </div>
`);
```

---

## Records by system_source

```js
const ssByEntity = await FileAttachment("data/entities-system-source.csv").csv({ typed: true });

// Collect ordered unique system_source values (sorted by total desc)
const sourceTotal = new Map();
for (const r of ssByEntity) {
  sourceTotal.set(r.system_source, (sourceTotal.get(r.system_source) ?? 0) + r.row_count);
}
const sources = [...sourceTotal.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);

// Collect ordered unique entities (preserve schema grouping, then alpha)
const entityMeta = new Map();
for (const r of ssByEntity) {
  if (!entityMeta.has(r.entity)) entityMeta.set(r.entity, { schema: r.schema });
}
const entities = [...entityMeta.keys()];

// Build lookup: entity → Map(source → count)
const pivot = new Map(entities.map(e => [e, new Map()]));
for (const r of ssByEntity) pivot.get(r.entity).set(r.system_source, r.row_count);

const colCount = 1 + 1 + sources.length + 1; // schema + entity + sources + total

const hdr2 = () => `padding:5px 10px;font-weight:600;font-size:11px;border-bottom:2px solid #ccc;background:#f7f7f7;white-space:nowrap;`;
const cell2 = (align = "left", bold = false, color = null) =>
  `padding:5px 10px;text-align:${align};font-weight:${bold ? "600" : "normal"};` +
  `border-bottom:1px solid #eee;white-space:nowrap;${color ? `color:${color};` : ""}`;

display(html`
  <div style="overflow-x:auto;">
  <div style="display:grid;grid-template-columns:repeat(${colCount},auto);font-size:12px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;width:max-content;">
    <div style="${hdr2()}">Schema</div>
    <div style="${hdr2()}">Entity</div>
    ${sources.map(s => html`<div style="${hdr2("right")}">${s}</div>`)}
    <div style="${hdr2("right")}">Total</div>
    ${entities.flatMap(e => {
      const meta  = entityMeta.get(e);
      const srcMap = pivot.get(e);
      const rowTotal = [...srcMap.values()].reduce((s, v) => s + v, 0);
      return [
        html`<div style="${cell2("left",false,schemaColors[meta.schema]??'#888')}">${meta.schema}</div>`,
        html`<div style="${cell2("left",true)}">${e}</div>`,
        ...sources.map(s => {
          const v = srcMap.get(s);
          return html`<div style="${cell2("right")}">${v != null ? v.toLocaleString() : html`<span style="color:#ccc">—</span>`}</div>`;
        }),
        html`<div style="${cell2("right",true)}">${rowTotal.toLocaleString()}</div>`,
      ];
    })}
    <div style="padding:5px 10px;font-weight:bold;border-top:2px solid #ccc;background:#f7f7f7;grid-column:span ${1+1+sources.length};">Total</div>
    <div style="padding:5px 10px;text-align:right;font-weight:bold;border-top:2px solid #ccc;background:#f7f7f7;">${[...sourceTotal.values()].reduce((s,v)=>s+v,0).toLocaleString()}</div>
  </div>
  </div>
`);
```
