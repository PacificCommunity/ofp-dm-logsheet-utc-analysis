---
theme: air
title: Longline offset complexity per flag
toc: false
---

# Longline offset complexity per vessel flag

*Intermediate analysis — how hard is it to assign one UTC offset per Longline trip?*

This is the same observer data as "Observer offset by vessel flag", but resolved **per trip**:
for each observer-linked Longline trip we collect the sorted list of distinct UTC offsets seen
across its sets, then group those lists by vessel flag.

- Offset from `obsv.l_set.set_dtime − utc_set_dtime`, normalised and deduplicated per trip
- A trip with a single offset (e.g. `-10`) is easy; a trip with several (e.g. `-10,-11`) spans
  more than one timezone and is harder to migrate with one offset.

```js
import * as d3 from "npm:d3";
import { offsetGrid, offsetCard, rankedList } from "./components/offset-charts.js";

const llRaw = await FileAttachment("data/ll-trip-offset-list-per-flag.csv").csv({typed: true});

const llByFlag = d3.rollup(llRaw, rows => rows, d => d.vessel_flag);
const llTotals = d3.rollup(llRaw, rows => rows[0].observer_trips, d => d.vessel_flag);

// distinct offsets in an offset_list string ("-10" → 1, "-10,-11" → 2)
const nOffsets = s => String(s).split(",").length;

const allFlags = [...llByFlag.keys()].sort((a, b) => (llTotals.get(b) ?? 0) - (llTotals.get(a) ?? 0));
```

## Single- vs multi-offset trips per flag

For each vessel flag, the share of observer trips that resolve to exactly **one** offset (easy)
versus **two or more** (span a timezone boundary).

```js
{
  const rows = allFlags.map(flag => {
    const list = llByFlag.get(flag) ?? [];
    const total = d3.sum(list, d => d.count);
    const single = d3.sum(list.filter(d => nOffsets(d.offset_list) === 1), d => d.count);
    const multi = total - single;
    return { flag, total, single, multi, pctSingle: total ? single / total : 0 };
  }).sort((a, b) => b.total - a.total);

  const barColor = p => p >= 0.9 ? "#86efac" : p >= 0.7 ? "#fde68a" : "#fca5a5";

  display(html`<table style="width:100%;max-width:720px;border-collapse:collapse;font-size:0.9rem">
    <thead>
      <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
        <th style="padding:6px 10px">Flag</th>
        <th style="padding:6px 10px;text-align:right">Observer trips</th>
        <th style="padding:6px 10px;text-align:right">Single offset</th>
        <th style="padding:6px 10px;text-align:right">2+ offsets</th>
        <th style="padding:6px 10px;width:40%">% single offset</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, i) => html`<tr style="background:${i % 2 ? "#f9fafb" : "transparent"};border-bottom:1px solid #f3f4f6">
        <td style="padding:5px 10px;font-weight:600">${r.flag}</td>
        <td style="padding:5px 10px;text-align:right;color:#6b7280">${d3.format(",")(r.total)}</td>
        <td style="padding:5px 10px;text-align:right">${d3.format(",")(r.single)}</td>
        <td style="padding:5px 10px;text-align:right">${d3.format(",")(r.multi)}</td>
        <td style="padding:5px 10px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;background:#f3f4f6;border-radius:3px;overflow:hidden">
              <div style="background:${barColor(r.pctSingle)};height:12px;width:${(r.pctSingle * 100).toFixed(1)}%"></div>
            </div>
            <span style="font-variant-numeric:tabular-nums;color:#374151">${(r.pctSingle * 100).toFixed(1)}%</span>
          </div>
        </td>
      </tr>`)}
    </tbody>
  </table>`);
}
```

> Flags with a high "single offset" share are well-suited to a simple `flag → offset` rule.
> Where the share is lower, the decision tree splits deeper (by EEZ) to recover precision.

## Full offset-list distribution per flag

```js
display(offsetGrid(allFlags, flag => {
  const llRows = llByFlag.get(flag);
  return offsetCard(
    flag,
    rankedList(llRows, { labelKey: "offset_list", countKey: "count", title: "Longline", subtitle: `${d3.format(",")(llTotals.get(flag) ?? 0)} observer trips`, total: llTotals.get(flag), noDataText: "No longline observer data" }),
    html``,
  );
}));
```
