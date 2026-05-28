---
theme: air
title: Observer offset distribution by EEZ
toc: false
---

# Observer offset distribution by EEZ

UTC offset recorded by observers, grouped by **EEZ code** where the fishing sets occurred.

- **Longline** — offset from `obsv.l_set.set_dtime − utc_set_dtime`, matched by observer trip + date
- **Purseseine** — offset from `obsv.s_day.start_dtime − utc_start_dtime`, one daily record matched by date
- Only sets since 2017 where `eez_code IS NOT NULL` are included
- Offsets outside ±14 h and dateline-shifted values (>+12 h folded by −24) are normalised

```js
import * as Plot from "npm:@observablehq/plot";
import * as d3 from "npm:d3";

const llRaw = await FileAttachment("data/ll-observer-offset-per-eez.csv").csv({typed: true});
const psRaw = await FileAttachment("data/ps-observer-offset-per-eez.csv").csv({typed: true});

// ── Summary per EEZ (from first row of each group) ──────────────────────────
const llSummary = d3.rollup(
  llRaw,
  rows => ({ total_sets: rows[0].total_sets, total_trips: rows[0].total_trips, observer_trips: rows[0].observer_trips }),
  d => d.eez_code
);
const psSummary = d3.rollup(
  psRaw,
  rows => ({ total_sets: rows[0].total_sets, total_trips: rows[0].total_trips, observer_trips: rows[0].observer_trips }),
  d => d.eez_code
);

// ── Offset distribution per EEZ ─────────────────────────────────────────────
const llByEez = d3.rollup(llRaw, rows => rows, d => d.eez_code);
const psByEez = d3.rollup(psRaw, rows => rows, d => d.eez_code);

// ── All EEZ codes sorted by total observer-matched LL sets desc ──────────────
const allEezCodes = [...new Set([...llByEez.keys(), ...psByEez.keys()])]
  .sort((a, b) => {
    const llA = d3.sum(llByEez.get(a) ?? [], d => d.count);
    const llB = d3.sum(llByEez.get(b) ?? [], d => d.count);
    return llB - llA;
  });

const allOffsets = d3.range(-14, 14.5, 0.5);
const plotW = Math.max(180, Math.floor((width - 80) / 2));
const plotH = 155;

const offsetColor = offset => {
  if (offset === 0) return "#ef4444";
  if (offset < 0)   return d3.interpolateBlues(0.4 + Math.abs(offset) / 14 * 0.55);
  return d3.interpolateOranges(0.35 + offset / 14 * 0.55);
};
```

```js
function miniPlot(rows, label, summary) {
  const total  = d3.sum(rows, d => d.count);
  const cMap   = new Map(rows.map(d => [d.observer_offset, d.count]));
  const series = allOffsets.map(o => ({
    o,
    count: cMap.get(o) ?? 0,
    pct: total > 0 ? (cMap.get(o) ?? 0) / total * 100 : 0,
  }));
  const subtitleParts = summary
    ? `${d3.format(",")(summary.total_sets)} sets · ${d3.format(",")(summary.total_trips)} trips · ${d3.format(",")(summary.observer_trips)} with observer`
    : `${d3.format(",")(total)} observer-matched sets`;
  return Plot.plot({
    title: label,
    subtitle: subtitleParts,
    width: plotW,
    height: plotH,
    marginLeft: 32,
    marginBottom: 26,
    marginTop: 36,
    x: {
      label: null,
      domain: allOffsets,
      tickFormat: v => Number.isInteger(v) ? String(v) : "",
      tickSize: 3,
    },
    y: { label: "%", grid: true, tickFormat: v => `${v}%` },
    marks: [
      Plot.barY(series.filter(d => d.count > 0), {
        x: "o", y: "pct",
        fill: d => offsetColor(d.o),
        tip: true,
        title: d => `${d.o >= 0 ? "+" : ""}${d.o}h — ${d3.format(",")(d.count)} (${d.pct.toFixed(1)}%)`,
      }),
      Plot.ruleY([0]),
    ],
  });
}

display(html`
  <div style="display:grid;grid-template-columns:1fr;gap:1.25rem 1.5rem;margin-top:1.5rem">
    ${allEezCodes.map(eez => {
      const llRows = llByEez.get(eez) ?? [];
      const psRows = psByEez.get(eez) ?? [];
      const llSum  = llSummary.get(eez);
      const psSum  = psSummary.get(eez);
      return html`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem">${eez}</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            ${llRows.length > 0
              ? miniPlot(llRows, "Longline", llSum)
              : html`<div style="color:#9ca3af;font-size:0.85rem;padding:2rem 0">No longline observer data</div>`}
          </div>
          <div style="flex:1;min-width:0">
            ${psRows.length > 0
              ? miniPlot(psRows, "Purseseine", psSum)
              : html`<div style="color:#9ca3af;font-size:0.85rem;padding:2rem 0">No purseseine observer data</div>`}
          </div>
        </div>
      </div>`;
    })}
  </div>`);
```

### Colour key

```js
display(html`<div style="display:flex;gap:1.5rem;align-items:center;font-size:0.85rem;margin-top:0.5rem;flex-wrap:wrap">
  <span style="display:flex;align-items:center;gap:6px">
    <span style="width:14px;height:14px;background:${d3.interpolateBlues(0.7)};display:inline-block;border-radius:2px"></span>
    Negative offset (UTC−, eastern Pacific / Americas)
  </span>
  <span style="display:flex;align-items:center;gap:6px">
    <span style="width:14px;height:14px;background:${d3.interpolateOranges(0.7)};display:inline-block;border-radius:2px"></span>
    Positive offset (UTC+, western Pacific / Asia)
  </span>
  <span style="display:flex;align-items:center;gap:6px">
    <span style="width:14px;height:14px;background:#ef4444;display:inline-block;border-radius:2px"></span>
    Zero offset
  </span>
</div>`);
```
