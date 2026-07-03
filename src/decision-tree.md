---
theme: air
title: Decision tree
toc: false
---

# Longline UTC offset — decision tree

## Method

The offset is predicted by a **decision tree** trained with
[scikit-learn](https://scikit-learn.org/)'s `DecisionTreeClassifier` — a well-known, fully
interpretable model whose splits read directly as `vessel_flag × EEZ → offset`, then refined by the
trip's **departure port**.

- **Training examples:** one row per observer **fishing activity** (set), not per trip — tens of
  thousands of examples rather than a few thousand trips.
- **Features:** `vessel_flag` and `eez_code` (one-hot encoded) for the base tree; `depart_port` adds
  a third, finer level. Logsheet instance was dropped — it did not improve the prediction.
- **Label:** the measured observer offset (`vessel-time − UTC`), the assumed ground truth.
- The trained tree is evaluated for every observed `flag × EEZ` combination; a departure-port
  breakdown is then layered on top. `support` is the number of observer activities behind a rule;
  `confidence` is the share of those activities whose measured offset equals the assigned one.

The model is built by the `decision-tree-rules.csv.py` data loader; this page only renders and
exports its output. Fixed constant in the loader: `MIN_SAMPLES = 30` (support floor).

## Three-level fallback hierarchy

A captain may keep the **departure-port clock** for the whole trip instead of adjusting to local
vessel time, so two trips in the same `flag × EEZ` can carry different offsets depending on where
they departed. To capture this, each rule is resolved at the **finest level that has enough observer
data**:

1. **`port`** — every observed `flag × EEZ × depart_port` cell (**no support floor**), so the full
   flag → EEZ → departure-port breakdown is visible. The most specific rule; it refines the
   EEZ-level rule for that exact port. Low-support port rows carry low confidence — read them
   alongside their activity count.
2. **`eez`** — the `flag × EEZ` tree prediction (≥ 30 activities). Applies to any port without its
   own row.
3. **`flag_fallback`** — sparse `flag × EEZ` cells fall back to the flag-level dominant offset.

To resolve a logsheet: look for a matching **port** row first, then the **eez** rule, then the
**flag** fallback. Port rows are shown indented under their EEZ below, and flag-fallbacks carry a
dashed border. See [Observer & nautical offsets](./observer-offsets) for the by-port distributions.

## How the classifier works

`DecisionTreeClassifier` is essentially a binary-split flowchart. It asks successive yes/no
questions about the input features and routes each training example to a *leaf* — an endpoint that
predicts a single offset value (the majority class in that bucket).

**How the features are encoded.** `vessel_flag` and `eez_code` are categorical values. scikit-learn
cannot work with raw strings, so they are first *one-hot encoded*: a column `flag_JP = 1 / 0`,
`flag_TW = 1 / 0`, `eez_FM = 1 / 0`, and so on. Each split in the tree is therefore a simple
binary question like *"is vessel_flag_JP = 1?"* or *"is eez_code_FM = 1?"*. Because exactly one
flag column and one EEZ column equal 1 for every training example, the tree converges to one
rule per observed `(flag, eez)` combination. The `depart_port` refinement is then computed as a
majority vote within each `(flag, eez, port)` cell that clears the support floor.

**How confidence is computed.** `confidence` is *not* an internal probability from the tree. It is
the share of the raw observer activities at the rule's decision level whose measured offset equals
the assigned offset exactly:

> **confidence** = (# activities with the assigned offset) ÷ (activities at that level)

A value of 100 % means every observer set recorded the same clock — the rule is rock-solid. A
lower value means the majority offset is assigned, but some sets used a different one. This reflects
genuine operational variation (e.g., different captains keeping departure-port time vs. local time),
not a model artefact.

**A concrete example of the port refinement.** For `FM × FM`, trips departing **POHNPEI** and
**KOSRAE** use different clocks (+11 vs +10) — the EEZ-level rule alone would blur them, but the
port breakdown separates them.

**Minimum-support floor.** The floor applies to the **flag × EEZ** tree only: any `flag × EEZ` cell
with fewer than 30 observer activities (`MIN_SAMPLES`) falls back to the **flag-level dominant
offset**, labelled `flag_fallback` and shown with a dashed border below. **Departure-port rows have
no floor** — every observed port is listed so the full breakdown is visible, with confidence
reflecting how consistent that port's clock is.

```js
import * as d3 from "npm:d3";

const rules = await FileAttachment("data/decision-tree-rules.csv").csv({ typed: true });

const allRules = rules;
const eezRules  = rules.filter(r => r.rule_level !== "port");
const portRules = rules.filter(r => r.rule_level === "port");

// Port breakdown rows grouped under their flag×eez baseline.
const portByFlagEez = d3.group(portRules, d => `${d.vessel_flag}|${d.eez_code}`);

// Base coverage = eez + flag_fallback rows (each activity counted once).
// Port rows are refinements whose support is a subset of their eez cell.
const totalSupport = d3.sum(eezRules, d => d.support);
const weightedConf = d3.sum(eezRules, d => d.confidence * d.support) / totalSupport;
const nFallback = eezRules.filter(r => r.rule_level === "flag_fallback").length;
const nPort = portRules.length;

const byFlag = d3.group(eezRules, d => d.vessel_flag);
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
  ${card("flag × EEZ rules", d3.format(",")(eezRules.length))}
  ${card("Port rows", d3.format(",")(nPort), "flag × EEZ × port")}
  ${card("Training activities", d3.format(",")(totalSupport))}
  ${card("Weighted confidence", d3.format(".1%")(weightedConf), "flag × EEZ level")}
  ${card("Flag-fallback rules", nFallback, "sparse → flag-level offset")}
</div>`);
```

## Tree (flag → EEZ → port → offset)

```js
const levelStyle = level => level === "flag_fallback"
  ? "border:1px dashed #9ca3af;"
  : "";

const offsetBadge = (v, conf, level) => html`<span style="
  display:inline-block;font-family:monospace;font-weight:700;
  background:${conf >= 0.9 ? "#dcfce7" : conf >= 0.7 ? "#fef9c3" : "#fee2e2"};
  color:#166534;
  padding:1px 7px;border-radius:4px;${levelStyle(level)}">${fmtOffset(v)}</span>`;

display(html`<div style="font-size:0.9rem">
  ${flags.map(flag => {
    const flagEezRules = [...byFlag.get(flag)].sort((a, b) => b.support - a.support);
    return html`<div style="margin:0.4rem 0;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:8px">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <strong style="font-size:1rem">${flag}</strong>
        <span style="color:#9ca3af;font-size:0.8em">${d3.format(",")(flagTotals.get(flag))} activities · ${flagEezRules.length} EEZ</span>
      </div>
      <div style="margin-top:0.35rem;padding-left:1rem;border-left:2px solid #f3f4f6">
        ${flagEezRules.map(r => {
          const ports = (portByFlagEez.get(`${flag}|${r.eez_code}`) ?? [])
            .sort((a, b) => b.support - a.support);
          return html`<div style="margin:0.25rem 0">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.25rem">
              <span style="font-family:monospace;color:#374151;min-width:3em">${r.eez_code}</span>
              → ${offsetBadge(r.offset, r.confidence, r.rule_level)}
              <span style="color:#9ca3af;font-size:0.8em">${(r.confidence * 100).toFixed(0)}% · n=${d3.format(",")(r.support)}</span>
            </div>
            ${ports.length ? html`<div style="margin-top:0.15rem;padding-left:1.5rem;border-left:2px solid #eff6ff">
              ${ports.map(p => html`<div style="margin:0.12rem 0;display:flex;align-items:center;flex-wrap:wrap;gap:0.25rem;font-size:0.85em">
                <span style="color:#2563eb">⤷ ${p.depart_port}</span>
                → ${offsetBadge(p.offset, p.confidence, p.rule_level)}
                <span style="color:#9ca3af;font-size:0.9em">${(p.confidence * 100).toFixed(0)}% · n=${d3.format(",")(p.support)}</span>
              </div>`)}
            </div>` : ""}
          </div>`;
        })}
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
  <span style="color:#2563eb">⤷</span> departure-port breakdown
</div>

## Rules table

```js
{
  const sorted = [...allRules].sort((a, b) => b.support - a.support);
  const levelMeta = {
    port: { label: "port", color: "#2563eb" },
    eez: { label: "activity", color: "#9ca3af" },
    flag_fallback: { label: "⚠ flag fallback", color: "#b45309" },
  };
  display(html`<table style="width:100%;border-collapse:collapse;font-size:0.85rem">
    <thead>
      <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
        <th style="padding:5px 10px">Flag</th>
        <th style="padding:5px 10px">EEZ</th>
        <th style="padding:5px 10px">Depart port</th>
        <th style="padding:5px 10px;text-align:right">Offset</th>
        <th style="padding:5px 10px;text-align:right">Confidence</th>
        <th style="padding:5px 10px;text-align:right">Activities</th>
        <th style="padding:5px 10px">Level</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map((r, i) => {
        const rowBg = r.rule_level === "flag_fallback" ? "#fafaf0"
          : r.rule_level === "port" ? "#eff6ff"
          : i % 2 ? "#f9fafb" : "transparent";
        const meta = levelMeta[r.rule_level] ?? { label: r.rule_level, color: "#9ca3af" };
        return html`<tr style="background:${rowBg};border-bottom:1px solid #f3f4f6">
          <td style="padding:4px 10px;font-weight:600">${r.vessel_flag}</td>
          <td style="padding:4px 10px;font-family:monospace">${r.eez_code}</td>
          <td style="padding:4px 10px">${r.depart_port || "—"}</td>
          <td style="padding:4px 10px;text-align:right;font-family:monospace">${fmtOffset(r.offset)}</td>
          <td style="padding:4px 10px;text-align:right">${r.confidence !== null ? (r.confidence * 100).toFixed(0) + "%" : "—"}</td>
          <td style="padding:4px 10px;text-align:right">${r.support > 0 ? d3.format(",")(r.support) : "—"}</td>
          <td style="padding:4px 10px;font-size:0.8em;color:${meta.color}">${meta.label}</td>
        </tr>`;
      })}
    </tbody>
  </table>`);
}
```

## Download

```js
{
  const header = ["vessel_flag", "eez_code", "depart_port", "offset", "support", "confidence", "rule_level"];
  const csvEsc = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const lines = [header.join(",")];
  for (const r of [...allRules].sort((a, b) => b.support - a.support)) {
    lines.push([
      r.vessel_flag, r.eez_code, csvEsc(r.depart_port ?? ""), r.offset,
      r.support > 0 ? r.support : "",
      r.confidence !== null ? r.confidence.toFixed(4) : "",
      r.rule_level,
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  display(html`<a href=${url} download="ll-utc-offset-decision-tree.csv"
    style="display:inline-block;background:#2563eb;color:white;padding:0.5rem 1rem;border-radius:6px;text-decoration:none;font-weight:600">
    ⬇ Download decision tree (flag × eez × port → offset, ${allRules.length} rules)</a>`);
}
```

---

> **Purse-seine** logsheets are not in this tree: their datetimes are already UTC, so every
> purse-seine offset is **0** (see [Purseseine set time](./ps-set-time-distribution)).
