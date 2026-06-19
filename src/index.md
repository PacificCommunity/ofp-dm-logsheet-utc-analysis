---
theme: air
title: UTC offset — summary
toc: false
---

# Estimating the UTC offset of logsheet datetimes

Every analysis in this app serves one goal: **estimate the UTC offset for each datetime** of all
Longline (LL) and Purseseine (PS) logsheets, expressed as an **auditable decision tree** — not a
trip-by-trip migration plan.

<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1.5rem 0">
  <div style="flex:1;min-width:280px;background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:1.25rem">
    <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.4rem">Purseseine → offset 0</div>
    Set times are entered as <strong>UTC</strong>. Confirmed by the sunrise analysis: associated
    (FAD) sets cluster before sunrise and free-school sets in daylight <em>only on the UTC clock</em>.
    No estimation needed.
    <div style="margin-top:0.5rem"><a href="./ps-set-time-distribution">See the evidence →</a></div>
  </div>
  <div style="flex:1;min-width:280px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:1.25rem">
    <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.4rem">Longline → decision tree</div>
    Set times are entered as <strong>local time</strong> (they already cluster at first light).
    We estimate the offset from observer evidence via a <strong>flag → EEZ → instance</strong>
    decision tree.
    <div style="margin-top:0.5rem"><a href="./decision-tree">Full decision tree →</a></div>
  </div>
</div>

## Longline decision tree — headline

```js
import { buildDecisionTree, renderTreeRules, renderCoverage } from "./components/decision-tree.js";

const trips = await FileAttachment("data/ll-decision-tree-features.csv").csv({ typed: true });
const tree = buildDecisionTree(trips, { purity: 0.9, minSupport: 5, alpha: 0.5 });
```

```js
display(renderCoverage(tree));
```

```js
display(renderTreeRules(tree));
```

The [decision tree page](./decision-tree) lets you tune the purity threshold, inspect the flat
rules table, and download the rules as CSV.

## How the evidence is built

| Page | Purpose |
|---|---|
| [Purseseine set time](./ps-set-time-distribution) | Proves PS times are UTC → offset 0 |
| [Longline set time distribution](./ll-set-time-distribution) | Shows LL times are local → must compute offset |
| [Longline offset complexity per flag](./observer-offset-per-flag) | Per-trip offsets; single vs multi-offset frequency |
| [EEZ combinations per trip](./eez-list-per-trip) | How often LL trips span multiple EEZs |
| [Observer offset by vessel flag](./observer-offsets) | Per-set observer offsets grouped by flag |
| [Observer offset by EEZ](./observer-offset-per-eez) | Per-trip observer offsets grouped by EEZ |
| [Decision tree](./decision-tree) | Final tree + Bayesian confidence + CSV export |

> **Source of truth:** observer datetimes (`obsv.l_set`), not the nautical longitude/15 offset.
> A trip can show several offsets, but most use a single one, so a single offset per branch is
> acceptable.
