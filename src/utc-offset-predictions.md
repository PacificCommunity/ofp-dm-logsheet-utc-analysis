---
theme: air
title: UTC offset predictions
toc: false
---

# Bayesian UTC offset predictions

Predicted UTC offset for logsheet trips **without** observer coverage, using an empirical
Bayesian estimator trained on observer-linked trips.

Prediction uses a 4-tier fallback:
- **Tier 1** — `vessel_flag × primary_eez_code` lookup (most specific)
- **Tier 2** — `vessel_flag` only
- **Tier 3** — `primary_eez_code` only
- **Tier 4** — global prior (most common offset overall)

> **How to run the estimator:**
> ```
> cd utc-estimator
> python bayesian_offset_estimator.py
> ```
> Reads from `dist/_file/data/`. Writes `utc-estimator/output/ll-predicted-offsets.csv` and `ps-predicted-offsets.csv`.

```js
import * as d3 from "npm:d3";
import { rankedList, offsetGrid, offsetCard, TYPE_LABEL } from "./components/offset-charts.js";

const llRaw = await FileAttachment("data/ll-trip-training-features.csv").csv({ typed: true });
const psRaw = await FileAttachment("data/ps-trip-training-features.csv").csv({ typed: true });
const llTargets = await FileAttachment("data/ll-trip-prediction-targets.csv").csv({ typed: true });
const psTargets = await FileAttachment("data/ps-trip-prediction-targets.csv").csv({ typed: true });
```

## Training data coverage

How many trips are in the training set (observer-linked)?

```js
{
  const llFlags  = new Set(llRaw.map(d => d.vessel_flag));
  const psFlags  = new Set(psRaw.map(d => d.vessel_flag));
  const llEezs   = new Set(llRaw.map(d => d.primary_eez_code).filter(Boolean));
  const psEezs   = new Set(psRaw.map(d => d.primary_eez_code).filter(Boolean));

  display(html`<div style="display:flex;gap:2rem;flex-wrap:wrap">
    <div>
      <strong>Longline training trips:</strong> ${d3.format(",")(llRaw.length)}<br>
      Distinct flags: ${llFlags.size} &nbsp;|&nbsp; Distinct EEZs: ${llEezs.size}
    </div>
    <div>
      <strong>Purseseine training trips:</strong> ${d3.format(",")(psRaw.length)}<br>
      Distinct flags: ${psFlags.size} &nbsp;|&nbsp; Distinct EEZs: ${psEezs.size}
    </div>
  </div>`);
}
```

## Prediction targets

Trips without observer coverage, for which the estimator will infer an offset.

```js
{
  const llFlagCoverage = new Set(llRaw.map(d => d.vessel_flag));
  const psFlagCoverage = new Set(psRaw.map(d => d.vessel_flag));

  const llKnownFlag = llTargets.filter(d => llFlagCoverage.has(d.vessel_flag)).length;
  const psKnownFlag = psTargets.filter(d => psFlagCoverage.has(d.vessel_flag)).length;

  display(html`<div style="display:flex;gap:2rem;flex-wrap:wrap">
    <div>
      <strong>LL trips to predict:</strong> ${d3.format(",")(llTargets.length)}<br>
      Flag in training set: ${d3.format(",")(llKnownFlag)} (${d3.format(".1%")(llKnownFlag / llTargets.length)})
    </div>
    <div>
      <strong>PS trips to predict:</strong> ${d3.format(",")(psTargets.length)}<br>
      Flag in training set: ${d3.format(",")(psKnownFlag)} (${d3.format(".1%")(psKnownFlag / psTargets.length)})
    </div>
  </div>`);
}
```

## Modal offset distribution — training set

The offsets the estimator will use as its priors, grouped by vessel flag.

```js
// Build ranked offset rows per flag from training data
function buildFlagOffsetRows(training) {
  const byFlag = d3.rollup(training, rows => rows, d => d.vessel_flag);
  const allFlags = [...byFlag.keys()].sort((a, b) => (byFlag.get(b)?.length ?? 0) - (byFlag.get(a)?.length ?? 0));
  return { byFlag, allFlags };
}

const { byFlag: llByFlag, allFlags: llAllFlags } = buildFlagOffsetRows(llRaw);
const { byFlag: psAllByFlag, allFlags: psAllFlags } = buildFlagOffsetRows(psRaw);
```

```js
display(html`<h3>Longline</h3>`);
display(offsetGrid(llAllFlags, flag => {
  const rows = llByFlag.get(flag) ?? [];
  const offsetCounts = d3.rollup(rows, v => v.length, d => d.modal_offset);
  const ranked = [...offsetCounts.entries()]
    .map(([offset_bucket, count]) => ({ offset_bucket, count }))
    .sort((a, b) => b.count - a.count);
  return offsetCard(
    flag,
    rankedList(ranked, {
      labelKey: "offset_bucket", countKey: "count",
      title: TYPE_LABEL.LonglineLogsheet,
      subtitle: `${d3.format(",")(rows.length)} trips`,
      labelFormat: v => `${v >= 0 ? "+" : ""}${v} h`,
    }),
  );
}));
```

```js
display(html`<h3>Purseseine</h3>`);
display(offsetGrid(psAllFlags, flag => {
  const rows = psAllByFlag.get(flag) ?? [];
  const offsetCounts = d3.rollup(rows, v => v.length, d => d.modal_offset);
  const ranked = [...offsetCounts.entries()]
    .map(([offset_bucket, count]) => ({ offset_bucket, count }))
    .sort((a, b) => b.count - a.count);
  return offsetCard(
    flag,
    rankedList(ranked, {
      labelKey: "offset_bucket", countKey: "count",
      title: TYPE_LABEL.PurseseineLogsheet,
      subtitle: `${d3.format(",")(rows.length)} trips`,
      labelFormat: v => `${v >= 0 ? "+" : ""}${v} h`,
    }),
  );
}));
```
