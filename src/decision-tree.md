---
theme: air
title: Decision tree
toc: false
---

# Longline UTC offset — decision tree

## Method

The offset is predicted by a **decision tree** trained with
[scikit-learn](https://scikit-learn.org/)'s `DecisionTreeClassifier` — a well-known, fully
interpretable model whose splits read directly as `vessel_flag (× EEZ) → offset`.

- **Training examples:** one row per observer **fishing activity** (set), not per trip — tens of
  thousands of examples rather than a few thousand trips.
- **Features:** `vessel_flag` and `eez_code` (one-hot encoded). Logsheet instance was dropped — it
  did not improve the prediction.
- **Label:** the measured observer offset (`vessel-time − UTC`), the assumed ground truth.
- The trained tree is evaluated for every observed `flag × EEZ` combination to produce the rules
  below. `support` is the number of observer activities behind a rule; `confidence` is the share of
  those activities whose measured offset equals the predicted one.

The model is built by the `decision-tree-rules.csv.py` data loader; this page only renders and
exports its output. There are no tunable parameters.

```js
import * as d3 from "npm:d3";

const rules = await FileAttachment("data/decision-tree-rules.csv").csv({ typed: true });

const totalSupport = d3.sum(rules, d => d.support);
const weightedConf = d3.sum(rules, d => d.confidence * d.support) / totalSupport;
const byFlag = d3.group(rules, d => d.vessel_flag);
const flagTotals = new Map([...byFlag].map(([k, v]) => [k, d3.sum(v, d => d.support)]));
const flags = [...byFlag.keys()].sort((a, b) => flagTotals.get(b) - flagTotals.get(a));

const fmtOffset = v => `${v >= 0 ? "+" : ""}${v}`;
```

```js
const card = (label, value, sub) => html`<div style="flex:1;min-width:150px;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
  <div style="font-size:1.5rem;font-weight:700">${value}</div>
  <div style="font-size:0.85rem;color:#374151">${label}</div>
  ${sub ? html`<div style="font-size:0.78rem;color:#9ca3af">${sub}</div>` : ""}
</div>`;
display(html`<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
  ${card("flag × EEZ rules", d3.format(",")(rules.length))}
  ${card("Training activities", d3.format(",")(totalSupport))}
  ${card("Weighted confidence", d3.format(".1%")(weightedConf), "share of activities matching prediction")}
</div>`);
```

## Tree (flag → EEZ → offset)

```js
const offsetBadge = (v, conf) => html`<span style="
  display:inline-block;font-family:monospace;font-weight:700;
  background:${conf >= 0.9 ? "#dcfce7" : conf >= 0.7 ? "#fef9c3" : "#fee2e2"};color:#166534;
  padding:1px 7px;border-radius:4px">${fmtOffset(v)}</span>`;

display(html`<div style="font-size:0.9rem">
  ${flags.map(flag => {
    const eezRules = [...byFlag.get(flag)].sort((a, b) => b.support - a.support);
    return html`<div style="margin:0.4rem 0;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:8px">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <strong style="font-size:1rem">${flag}</strong>
        <span style="color:#9ca3af;font-size:0.8em">${d3.format(",")(flagTotals.get(flag))} activities · ${eezRules.length} EEZ</span>
      </div>
      <div style="margin-top:0.35rem;padding-left:1rem;border-left:2px solid #f3f4f6;display:flex;flex-wrap:wrap;gap:0.35rem 1rem">
        ${eezRules.map(r => html`<span style="white-space:nowrap">
          <span style="font-family:monospace;color:#374151">${r.eez_code}</span>
          → ${offsetBadge(r.offset, r.confidence)}
          <span style="color:#9ca3af;font-size:0.8em">${(r.confidence * 100).toFixed(0)}% · n=${d3.format(",")(r.support)}</span>
        </span>`)}
      </div>
    </div>`;
  })}
</div>`);
```

<div style="margin:0.5rem 0">
  <span style="background:#dcfce7;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> ≥90% confidence &nbsp;
  <span style="background:#fef9c3;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> 70–90% &nbsp;
  <span style="background:#fee2e2;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> &lt;70%
</div>

## Rules table

```js
{
  const sorted = [...rules].sort((a, b) => b.support - a.support);
  display(html`<table style="width:100%;border-collapse:collapse;font-size:0.85rem">
    <thead>
      <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
        <th style="padding:5px 10px">Flag</th>
        <th style="padding:5px 10px">EEZ</th>
        <th style="padding:5px 10px;text-align:right">Offset</th>
        <th style="padding:5px 10px;text-align:right">Confidence</th>
        <th style="padding:5px 10px;text-align:right">Activities</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map((r, i) => html`<tr style="background:${i % 2 ? "#f9fafb" : "transparent"};border-bottom:1px solid #f3f4f6">
        <td style="padding:4px 10px;font-weight:600">${r.vessel_flag}</td>
        <td style="padding:4px 10px;font-family:monospace">${r.eez_code}</td>
        <td style="padding:4px 10px;text-align:right;font-family:monospace">${fmtOffset(r.offset)}</td>
        <td style="padding:4px 10px;text-align:right">${(r.confidence * 100).toFixed(0)}%</td>
        <td style="padding:4px 10px;text-align:right">${d3.format(",")(r.support)}</td>
      </tr>`)}
    </tbody>
  </table>`);
}
```

## Download

```js
{
  const header = ["vessel_flag", "eez_code", "offset", "support", "confidence"];
  const lines = [header.join(",")];
  for (const r of [...rules].sort((a, b) => b.support - a.support)) {
    lines.push([r.vessel_flag, r.eez_code, r.offset, r.support, r.confidence.toFixed(4)].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  display(html`<a href=${url} download="ll-utc-offset-decision-tree.csv"
    style="display:inline-block;background:#2563eb;color:white;padding:0.5rem 1rem;border-radius:6px;text-decoration:none;font-weight:600">
    ⬇ Download decision tree (flag × eez → offset, ${rules.length} rules)</a>`);
}
```

---

> **Purse-seine** logsheets are not in this tree: their datetimes are already UTC, so every
> purse-seine offset is **0** (see [Purseseine set time](./ps-set-time-distribution)).
