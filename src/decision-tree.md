---
theme: air
title: UTC offset decision tree
toc: false
---

# Longline UTC offset — decision tree

The decision tree estimates a UTC offset for every **Longline** logsheet datetime from observer
evidence (the source of truth). It is built **in-page** from one row per observer-linked Longline
trip: `vessel_flag`, `primary_eez_code`, `instance_source`, and the trip's **modal observer offset**.

**How it is built** — group trips by `vessel_flag`. If the dominant offset covers ≥ the purity
threshold (and the node has enough trips), emit a simple `flag → offset` rule. Otherwise split by
`primary_eez_code`, then by `instance_source`, only going deeper where purity is not yet reached.
Confidence is a Laplace-smoothed probability of the dominant offset (the "Bayesian" flavour).

```js
import { buildDecisionTree, renderTreeRules, renderRulesTable, renderCoverage, rulesToCSV } from "./components/decision-tree.js";

const trips = await FileAttachment("data/ll-decision-tree-features.csv").csv({ typed: true });
```

```js
const purity = view(Inputs.range([0.5, 1], { value: 0.9, step: 0.05, label: "Purity threshold" }));
```

```js
const minSupport = view(Inputs.range([1, 50], { value: 5, step: 1, label: "Min trips per node" }));
```

```js
const tree = buildDecisionTree(trips, { purity, minSupport, alpha: 0.5 });
```

## Coverage

```js
display(renderCoverage(tree));
```

`Resubstitution accuracy` is the share of observer trips whose modal offset is correctly predicted
by the tree's own rules — an upper bound on real-world accuracy.

## Decision tree

```js
display(renderTreeRules(tree));
```

<div style="margin:0.5rem 0">
  <span style="background:#dcfce7;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> confident leaf &nbsp;
  <span style="background:#fef9c3;padding:1px 7px;border-radius:4px;font-family:monospace">−10</span> low-confidence fallback
</div>

## Rules table

```js
display(renderRulesTable(tree));
```

## Download

```js
{
  const csv = rulesToCSV(tree);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  display(html`<a href=${url} download="ll-utc-offset-rules.csv"
    style="display:inline-block;background:#2563eb;color:white;padding:0.5rem 1rem;border-radius:6px;text-decoration:none;font-weight:600">
    ⬇ Download rules CSV (${tree.rules.length} rules)</a>`);
}
```

---

> **Purse-seine** logsheets are not in this tree: their datetimes are already UTC, so every
> purse-seine offset is **0** (see the Purseseine set time page).
