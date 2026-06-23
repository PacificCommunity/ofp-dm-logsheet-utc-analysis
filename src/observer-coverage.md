---
theme: air
title: Observer coverage
toc: false
---

# Longline observer coverage by vessel flag

Before estimating UTC offsets we need to know **how much observer data we actually have to learn
from**. The model is trained only on logsheets that have matched observer data, so coverage sets
the ceiling on what we can verify.

For each vessel flag (longline logsheets since 2017):

- **Logsheets** — number of longline logsheet trips
- **Observer trips** — logsheet trips that have a linked observer trip
- **Coverage** — observer trips ÷ logsheets
- **Observer sets** — total fishing sets reported on those observer trips (the training examples)

```js
import * as d3 from "npm:d3";
import * as Plot from "npm:@observablehq/plot";

const cov = await FileAttachment("data/ll-observer-coverage.csv").csv({ typed: true });

const totals = {
  logsheets: d3.sum(cov, d => d.n_logsheets),
  trips:     d3.sum(cov, d => d.n_observer_trips),
  sets:      d3.sum(cov, d => d.n_observer_sets),
};
totals.coverage = totals.logsheets ? totals.trips / totals.logsheets : 0;

const rows = [...cov].sort((a, b) => b.n_logsheets - a.n_logsheets);
```

<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
  <div style="flex:1;min-width:150px;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
    <div style="font-size:1.5rem;font-weight:700">${d3.format(",")(totals.logsheets)}</div>
    <div style="font-size:0.85rem;color:#374151">Longline logsheets</div>
  </div>
  <div style="flex:1;min-width:150px;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
    <div style="font-size:1.5rem;font-weight:700">${d3.format(",")(totals.trips)}</div>
    <div style="font-size:0.85rem;color:#374151">With observer (${d3.format(".1%")(totals.coverage)})</div>
  </div>
  <div style="flex:1;min-width:150px;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
    <div style="font-size:1.5rem;font-weight:700">${d3.format(",")(totals.sets)}</div>
    <div style="font-size:0.85rem;color:#374151">Observer fishing sets</div>
  </div>
</div>

```js
{
  const barColor = p => p >= 0.1 ? "#86efac" : p >= 0.05 ? "#fde68a" : "#fca5a5";
  display(html`<table style="width:100%;max-width:820px;border-collapse:collapse;font-size:0.9rem">
    <thead>
      <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
        <th style="padding:6px 10px">Flag</th>
        <th style="padding:6px 10px;text-align:right">Logsheets</th>
        <th style="padding:6px 10px;text-align:right">Observer trips</th>
        <th style="padding:6px 10px;text-align:right">Observer sets</th>
        <th style="padding:6px 10px;width:34%">Coverage</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, i) => html`<tr style="background:${i % 2 ? "#f9fafb" : "transparent"};border-bottom:1px solid #f3f4f6">
        <td style="padding:5px 10px;font-weight:600">${r.vessel_flag}</td>
        <td style="padding:5px 10px;text-align:right;color:#6b7280">${d3.format(",")(r.n_logsheets)}</td>
        <td style="padding:5px 10px;text-align:right">${d3.format(",")(r.n_observer_trips)}</td>
        <td style="padding:5px 10px;text-align:right">${d3.format(",")(r.n_observer_sets)}</td>
        <td style="padding:5px 10px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;background:#f3f4f6;border-radius:3px;overflow:hidden">
              <div style="background:${barColor(r.coverage_pct)};height:12px;width:${Math.min(100, r.coverage_pct * 100).toFixed(1)}%"></div>
            </div>
            <span style="font-variant-numeric:tabular-nums;color:#374151">${d3.format(".1%")(r.coverage_pct)}</span>
          </div>
        </td>
      </tr>`)}
    </tbody>
  </table>`);
}
```

## Is there enough data to train a model?

```js
{
  const flagsWithSets = rows.filter(r => r.n_observer_sets > 0);
  const strong = rows.filter(r => r.n_observer_sets >= 500);
  const weak   = rows.filter(r => r.n_observer_sets > 0 && r.n_observer_sets < 100);
  display(html`<p>
    Across <strong>${d3.format(",")(totals.sets)}</strong> observer fishing sets, the offset is
    <em>measured</em> rather than guessed. Even though trip-level coverage averages only
    <strong>${d3.format(".1%")(totals.coverage)}</strong>, each observer trip contributes many
    sets, so the training set is large enough to be useful:
    <strong>${strong.length}</strong> flags have ≥ 500 observer sets, while
    <strong>${weak.length}</strong> flags have fewer than 100 (where predictions will be weak and
    should fall back to a coarser rule or the nautical estimate).
  </p>`);
}
```

**Recommendation.** There is enough observer data to train a model for the well-covered flags, and
the offset is highly consistent within a flag (and usually within a flag's EEZ). The natural
grouping for training is therefore:

- **vessel flag** — the strongest single predictor (a flag's home fleet tends to keep one clock);
- **EEZ** — refines flags whose vessels operate across more than one timezone.

Logsheet **instance source** was evaluated and dropped: it does not improve the offset prediction
and only fragments the groups. The [decision tree](./decision-tree) is trained on
`vessel_flag × EEZ → offset`. Flags with little or no observer data inherit the broader pattern or
fall back to the nautical (`longitude / 15`) estimate.
