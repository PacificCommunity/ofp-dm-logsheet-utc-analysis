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
exports its output. Fixed constant in the loader: `MIN_SAMPLES = 30` (support floor).

## How the classifier works

`DecisionTreeClassifier` is essentially a binary-split flowchart. It asks successive yes/no
questions about the input features and routes each training example to a *leaf* — an endpoint that
predicts a single offset value (the majority class in that bucket).

**How the features are encoded.** `vessel_flag` and `eez_code` are categorical values. scikit-learn
cannot work with raw strings, so they are first *one-hot encoded*: a column `flag_JP = 1 / 0`,
`flag_TW = 1 / 0`, `eez_FM = 1 / 0`, and so on. Each split in the tree is therefore a simple
binary question like *"is vessel_flag_JP = 1?"* or *"is eez_code_FM = 1?"*. Because exactly one
flag column and one EEZ column equal 1 for every training example, the tree converges to one
rule per observed `(flag, eez)` combination — which is exactly what we want.

**How confidence is computed.** `confidence` is *not* an internal probability from the tree. It is
the share of the raw observer activities at that `(flag, eez)` pair whose measured offset equals
the tree's prediction **exactly**:

> **confidence** = (# activities with predicted offset) ÷ (total activities for that flag × EEZ)

The rules CSV always has **one row per flag × EEZ**. To understand *why* confidence is below 100%
— and distinguish genuine operational variation from data-entry errors — the distribution bars in
the tree view below show every observed offset for each combination. Bars are coloured by how far
they sit from the prediction: **exact match** (green), **within ±1 h** (amber — likely same
timezone), **beyond ±1 h** (red — likely data-entry error or genuinely different clock choice).

**Two concrete examples from the data:**

| Combination | Confidence | n | Interpretation |
|-------------|-----------|---|----------------|
| JP × FM | 100 % | 41 | All 41 sets at exactly the same offset — pure leaf, no ambiguity. |
| JP × PG | ~72 % | 57 | ~28 % used a different clock. The distribution bars reveal whether those are near-miss (±1 h) or far outliers. |

**Minimum-support floor.** Any `(flag, eez)` combination with fewer than 30 observer activities
(the `MIN_SAMPLES` constant in the Python loader) is considered too sparse to trust. These cells
fall back to the **flag-level dominant offset** — the most common offset across all EEZs for that
flag. They are labelled `flag_fallback` in the `rule_level` column and shown with a dashed
border below. Flags with no observer data at all are not represented in this table; for those,
use the [nautical (longitude/15) baseline](./observer-offsets) as a fallback.

```js
import * as d3 from "npm:d3";

const rules = await FileAttachment("data/decision-tree-rules.csv").csv({ typed: true });
// Full offset distribution per flag×eez (multiple rows per combo)
const distRaw = await FileAttachment("data/ll-observer-activity-offsets.csv").csv({ typed: true });

// Index distribution by "flag|eez" for fast lookup
const distIndex = d3.group(distRaw, d => `${d.vessel_flag}|${d.eez_code}`);

const totalSupport = d3.sum(rules, d => d.support);
const weightedConf = d3.sum(rules, d => d.confidence * d.support) / totalSupport;
const nFallback = rules.filter(r => r.rule_level === "flag_fallback").length;
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
  ${card("Weighted confidence", d3.format(".1%")(weightedConf), "exact-match share")}
  ${card("Flag-fallback rules", nFallback, "sparse cells coarsened to flag level")}
</div>`);
```

## Tree (flag → EEZ → offset)

Each rule shows the **predicted offset** and its exact-match confidence, followed by the full
**offset distribution** for that flag × EEZ: 🟢 exact match · 🟡 within ±1 h (same timezone) · 🔴 beyond ±1 h (likely error).

```js
const TOLERANCE_H = 1.0;

function distBar(flag, eez, predicted) {
  const key = `${flag}|${eez}`;
  const rows = distIndex.get(key);
  if (!rows || rows.length <= 1) return html``; // nothing to show beyond the dominant
  const total = d3.sum(rows, d => d.count);
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  return html`<span style="display:inline-flex;gap:3px;align-items:center;flex-wrap:wrap;margin-left:4px">
    ${sorted.map(r => {
      const pct = (r.count / total * 100).toFixed(0);
      const diff = Math.abs(r.offset - predicted);
      const isExact = diff < 0.01;
      const isNear  = !isExact && diff <= TOLERANCE_H;
      const bg = isExact ? "#dcfce7" : isNear ? "#fef9c3" : "#fee2e2";
      const dot = isExact ? "🟢" : isNear ? "🟡" : "🔴";
      return html`<span title="${fmtOffset(r.offset)}: ${r.count} activities (${pct}%)" style="
        font-family:monospace;font-size:0.75em;background:${bg};
        padding:0 5px;border-radius:3px;white-space:nowrap">${dot}${fmtOffset(r.offset)} ${pct}%</span>`;
    })}
  </span>`;
}

const offsetBadge = (v, conf, level) => html`<span style="
  display:inline-block;font-family:monospace;font-weight:700;
  background:${conf >= 0.9 ? "#dcfce7" : conf >= 0.7 ? "#fef9c3" : "#fee2e2"};color:#166534;
  padding:1px 7px;border-radius:4px;
  ${level === "flag_fallback" ? "border:1px dashed #9ca3af;" : ""}">${fmtOffset(v)}</span>`;

display(html`<div style="font-size:0.9rem">
  ${flags.map(flag => {
    const eezRules = [...byFlag.get(flag)].sort((a, b) => b.support - a.support);
    return html`<div style="margin:0.4rem 0;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:8px">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <strong style="font-size:1rem">${flag}</strong>
        <span style="color:#9ca3af;font-size:0.8em">${d3.format(",")(flagTotals.get(flag))} activities · ${eezRules.length} EEZ</span>
      </div>
      <div style="margin-top:0.35rem;padding-left:1rem;border-left:2px solid #f3f4f6">
        ${eezRules.map(r => html`<div style="margin:0.25rem 0;display:flex;align-items:center;flex-wrap:wrap;gap:0.25rem">
          <span style="font-family:monospace;color:#374151;min-width:3em">${r.eez_code}</span>
          → ${offsetBadge(r.offset, r.confidence, r.rule_level)}
          <span style="color:#9ca3af;font-size:0.8em">${(r.confidence * 100).toFixed(0)}% · n=${d3.format(",")(r.support)}</span>
          ${distBar(r.vessel_flag, r.eez_code, r.offset)}
        </div>`)}
      </div>
    </div>`;
  })}
</div>`);
```

<div style="margin:0.5rem 0;font-size:0.85rem">
  <span style="background:#dcfce7;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> ≥90% confidence &nbsp;
  <span style="background:#fef9c3;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> 70–90% &nbsp;
  <span style="background:#fee2e2;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> &lt;70% &nbsp;
  <span style="background:#fef9c3;border:1px dashed #9ca3af;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> flag-level fallback (sparse, n&lt;30)
  &nbsp;·&nbsp; distribution: 🟢 exact · 🟡 within ±1 h · 🔴 outlier (&gt;±1 h)
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
        <th style="padding:5px 10px">Level</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map((r, i) => html`<tr style="background:${r.rule_level === "flag_fallback" ? "#fafaf0" : i % 2 ? "#f9fafb" : "transparent"};border-bottom:1px solid #f3f4f6">
        <td style="padding:4px 10px;font-weight:600">${r.vessel_flag}</td>
        <td style="padding:4px 10px;font-family:monospace">${r.eez_code}</td>
        <td style="padding:4px 10px;text-align:right;font-family:monospace">${fmtOffset(r.offset)}</td>
        <td style="padding:4px 10px;text-align:right">${(r.confidence * 100).toFixed(0)}%</td>
        <td style="padding:4px 10px;text-align:right">${d3.format(",")(r.support)}</td>
        <td style="padding:4px 10px;font-size:0.8em;color:${r.rule_level === "flag_fallback" ? "#b45309" : "#9ca3af"}">${r.rule_level === "flag_fallback" ? "⚠ flag fallback" : "activity"}</td>
      </tr>`)}
    </tbody>
  </table>`);
}
```

## Download

```js
{
  const header = ["vessel_flag", "eez_code", "offset", "support", "confidence", "rule_level"];
  const lines = [header.join(",")];
  for (const r of [...rules].sort((a, b) => b.support - a.support)) {
    lines.push([r.vessel_flag, r.eez_code, r.offset, r.support, r.confidence.toFixed(4), r.rule_level].join(","));
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
