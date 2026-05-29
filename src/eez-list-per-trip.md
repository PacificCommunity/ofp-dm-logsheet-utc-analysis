---
theme: air
title: EEZ combinations fished per trip
toc: false
---

# EEZ combinations fished per trip

For each **trip** with at least one set with a known EEZ code (since 2017), shows the
distribution of unique sorted EEZ combinations — how many trips fished exclusively in
one EEZ, how many spanned two or more, and which multi-EEZ combinations are most common.

- **Longline** — sets from `log.sets_ll` (`l_activity_id = 1`)
- **Purseseine** — sets from `log.sets_ps` (`s_activity_id = 1`)
- EEZ codes are sorted alphabetically within each combination
- Covers **all trips** (not just observer-linked); sets with `eez_code IS NULL` are excluded

```js
const llEezList = await FileAttachment("data/ll-eez-list-per-trip.csv").csv({typed: true});
const psEezList = await FileAttachment("data/ps-eez-list-per-trip.csv").csv({typed: true});

function eezListSection(rows, label) {
  const total = rows[0]?.total_trips ?? 0;
  const pct = n => (n / total * 100).toFixed(1);
  const maxCount = rows[0]?.trip_count ?? 1;
  return html`<div style="flex:1;min-width:280px">
    <div style="font-weight:600;font-size:0.9rem;color:#374151;margin-bottom:0.5rem">
      ${label} — ${d3.format(",")(total)} trips
    </div>
    <table style="width:100%;font-size:0.83rem;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
          <th style="padding:4px 6px 4px 0;font-weight:500;color:#6b7280">EEZ list</th>
          <th style="padding:4px 6px"></th>
          <th style="padding:4px 0 4px 6px;text-align:right;font-weight:500;color:#6b7280">%</th>
          <th style="padding:4px 0 4px 8px;text-align:right;font-weight:500;color:#6b7280">trips</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => html`<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:3px 6px 3px 0;font-family:monospace;white-space:nowrap">${r.eez_list}</td>
          <td style="padding:3px 6px;width:100%">
            <div style="background:#bfdbfe;height:10px;width:${Math.max(2, r.trip_count / maxCount * 100)}%;border-radius:2px"></div>
          </td>
          <td style="padding:3px 0 3px 6px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${pct(r.trip_count)}%</td>
          <td style="padding:3px 0 3px 8px;text-align:right;white-space:nowrap;color:#9ca3af">${d3.format(",")(r.trip_count)}</td>
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}
```

```js
display(html`<div style="display:flex;gap:2.5rem;flex-wrap:wrap;align-items:flex-start">
  ${eezListSection(llEezList, "Longline")}
  ${eezListSection(psEezList, "Purseseine")}
</div>`);
```
