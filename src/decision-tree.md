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
the tree's prediction exactly:

> **confidence** = (# activities with predicted offset) ÷ (total activities for that flag × EEZ)

A value of 100 % means every observer set recorded the same clock — the rule is rock-solid. A
lower value means the tree predicts the *majority* offset, but some sets used a different one.
This reflects genuine operational variation (e.g., different captains keeping departure-port time
vs. local time), not a model artefact.

**Two concrete examples from the data:**

| Combination | Confidence | n | Interpretation |
|-------------|-----------|---|----------------|
| JP × FM | 100 % | 41 | All 41 sets at exactly the same offset — pure leaf, no ambiguity. |
| JP × PG | ~72 % | 57 | ~28 % used a different clock. The majority offset is still the best prediction. |

**Minimum-support floor.** Any `(flag, eez)` combination with fewer than 30 observer activities
(`MIN_SAMPLES`) is considered too sparse to trust. These cells fall back to the **flag-level
dominant offset** — the most common offset across all EEZs for that flag. They are labelled
`flag_fallback` and shown with a dashed border below.

**Nautical fallback.** Flag × EEZ combinations that have **no observer data at all** are not
in the training set. For these, the page falls back to the **dominant nautical offset**
(`round(longitude / 15)`) from all logsheet sets in that combination. These rows are labelled
`nautical_fallback`. See [Observer & nautical offsets](./observer-offsets) for a comparison of the
two estimates.

```js
import * as d3 from "npm:d3";

const rules   = await FileAttachment("data/decision-tree-rules.csv").csv({ typed: true });
const nautRaw = await FileAttachment("data/ll-nautical-activity-offsets.csv").csv({ typed: true });

// Dominant nautical offset per flag×eez (used as fallback when no observer data).
const nautDom = new Map();
for (const [key, rows] of d3.group(nautRaw, d => `${d.vessel_flag}|${d.eez_code}`)) {
  const best = [...rows].sort((a, b) => b.count - a.count)[0];
  nautDom.set(key, best.nautical_offset);
}

// Observer-based rules (one row per flag×eez).
const ruleKeys = new Set(rules.map(r => `${r.vessel_flag}|${r.eez_code}`));

// Synthesise nautical-fallback rows for combos absent from the observer rules.
const nautFallbacks = [];
for (const [key, offset] of nautDom) {
  if (!ruleKeys.has(key)) {
    const [vessel_flag, eez_code] = key.split("|");
    nautFallbacks.push({ vessel_flag, eez_code, offset: Number(offset),
      support: 0, confidence: null, rule_level: "nautical_fallback" });
  }
}

// Combined: observer rules first, then nautical fallbacks.
const allRules = [...rules, ...nautFallbacks];

const totalSupport = d3.sum(rules, d => d.support);
const weightedConf = d3.sum(rules, d => d.confidence * d.support) / totalSupport;
const nFallback = rules.filter(r => r.rule_level === "flag_fallback").length;
const nNautFallback = nautFallbacks.length;

const byFlag = d3.group(allRules, d => d.vessel_flag);
// Sort: flags with observer data first (by total activities), then nautical-only flags.
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
  ${card("flag × EEZ rules", d3.format(",")(allRules.length))}
  ${card("Training activities", d3.format(",")(totalSupport))}
  ${card("Weighted confidence", d3.format(".1%")(weightedConf), "observer rules only")}
  ${card("Flag-fallback rules", nFallback, "sparse → flag-level offset")}
  ${card("Nautical-fallback rules", nNautFallback, "no observer data → longitude/15")}
</div>`);
```

## Tree (flag → EEZ → offset)

```js
const levelStyle = level => level === "flag_fallback"
  ? "border:1px dashed #9ca3af;"
  : level === "nautical_fallback"
    ? "border:1px dashed #60a5fa;background:#eff6ff;"
    : "";

const offsetBadge = (v, conf, level) => html`<span style="
  display:inline-block;font-family:monospace;font-weight:700;
  background:${level === "nautical_fallback" ? "#dbeafe" : conf >= 0.9 ? "#dcfce7" : conf >= 0.7 ? "#fef9c3" : "#fee2e2"};
  color:${level === "nautical_fallback" ? "#1e40af" : "#166534"};
  padding:1px 7px;border-radius:4px;${levelStyle(level)}">${fmtOffset(v)}</span>`;

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
          <span style="color:#9ca3af;font-size:0.8em">${
            r.rule_level === "nautical_fallback"
              ? "nautical fallback"
              : `${(r.confidence * 100).toFixed(0)}% · n=${d3.format(",")(r.support)}`
          }</span>
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
  <span style="background:#fef9c3;border:1px dashed #9ca3af;padding:1px 7px;border-radius:4px;font-family:monospace">+11</span> flag-level fallback &nbsp;
  <span style="background:#dbeafe;border:1px dashed #60a5fa;padding:1px 7px;border-radius:4px;font-family:monospace;color:#1e40af">+11</span> nautical fallback
</div>

## Rules table

```js
{
  const sorted = [...allRules].sort((a, b) => b.support - a.support);
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
      ${sorted.map((r, i) => {
        const rowBg = r.rule_level === "nautical_fallback" ? "#eff6ff"
          : r.rule_level === "flag_fallback" ? "#fafaf0"
          : i % 2 ? "#f9fafb" : "transparent";
        const levelLabel = r.rule_level === "nautical_fallback" ? "🌐 nautical fallback"
          : r.rule_level === "flag_fallback" ? "⚠ flag fallback"
          : "activity";
        const levelColor = r.rule_level === "nautical_fallback" ? "#1e40af"
          : r.rule_level === "flag_fallback" ? "#b45309"
          : "#9ca3af";
        return html`<tr style="background:${rowBg};border-bottom:1px solid #f3f4f6">
          <td style="padding:4px 10px;font-weight:600">${r.vessel_flag}</td>
          <td style="padding:4px 10px;font-family:monospace">${r.eez_code}</td>
          <td style="padding:4px 10px;text-align:right;font-family:monospace">${fmtOffset(r.offset)}</td>
          <td style="padding:4px 10px;text-align:right">${r.confidence !== null ? (r.confidence * 100).toFixed(0) + "%" : "—"}</td>
          <td style="padding:4px 10px;text-align:right">${r.support > 0 ? d3.format(",")(r.support) : "—"}</td>
          <td style="padding:4px 10px;font-size:0.8em;color:${levelColor}">${levelLabel}</td>
        </tr>`;
      })}
    </tbody>
  </table>`);
}
```

## Download

```js
{
  const header = ["vessel_flag", "eez_code", "offset", "support", "confidence", "rule_level"];
  const lines = [header.join(",")];
  for (const r of [...allRules].sort((a, b) => b.support - a.support)) {
    lines.push([
      r.vessel_flag, r.eez_code, r.offset,
      r.support > 0 ? r.support : "",
      r.confidence !== null ? r.confidence.toFixed(4) : "",
      r.rule_level,
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  display(html`<a href=${url} download="ll-utc-offset-decision-tree.csv"
    style="display:inline-block;background:#2563eb;color:white;padding:0.5rem 1rem;border-radius:6px;text-decoration:none;font-weight:600">
    ⬇ Download decision tree (flag × eez → offset, ${allRules.length} rules)</a>`);
}
```

---

> **Purse-seine** logsheets are not in this tree: their datetimes are already UTC, so every
> purse-seine offset is **0** (see [Purseseine set time](./ps-set-time-distribution)).
