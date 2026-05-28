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
import * as d3 from "npm:d3";
import { miniPlot, offsetColorKey, offsetGrid, offsetCard } from "./components/offset-charts.js";

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

const llByEez = d3.rollup(llRaw, rows => rows, d => d.eez_code);
const psByEez = d3.rollup(psRaw, rows => rows, d => d.eez_code);

// ── All EEZ codes sorted by total observer-matched LL sets desc ──────────────
const allEezCodes = [...new Set([...llByEez.keys(), ...psByEez.keys()])]
  .sort((a, b) => {
    const llA = d3.sum(llByEez.get(a) ?? [], d => d.count);
    const llB = d3.sum(llByEez.get(b) ?? [], d => d.count);
    return llB - llA;
  });

const plotW = Math.max(180, Math.floor((width - 80) / 2));

function eezSubtitle(summary) {
  if (!summary) return undefined;
  return `${d3.format(",")(summary.total_sets)} sets · ${d3.format(",")(summary.total_trips)} trips · ${d3.format(",")(summary.observer_trips)} with observer`;
}
```

```js
display(offsetGrid(allEezCodes, eez => {
  const llRows = llByEez.get(eez) ?? [];
  const psRows = psByEez.get(eez) ?? [];
  const noData = label => html`<div style="color:#9ca3af;font-size:0.85rem;padding:2rem 0">No ${label} observer data</div>`;
  return offsetCard(
    eez,
    llRows.length > 0
      ? miniPlot(llRows, { offsetKey: "observer_offset", title: "Longline",    subtitle: eezSubtitle(llSummary.get(eez)), plotW })
      : noData("longline"),
    psRows.length > 0
      ? miniPlot(psRows, { offsetKey: "observer_offset", title: "Purseseine", subtitle: eezSubtitle(psSummary.get(eez)), plotW })
      : noData("purseseine"),
  );
}));
```

### Colour key

```js
display(offsetColorKey());
```
