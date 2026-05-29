/**
 * Shared components for UTC offset distribution charts.
 *
 * Exports:
 *   allOffsets     — full offset domain [-14 … +14] in 0.5 h steps
 *   PLOT_H         — standard chart height (px)
 *   offsetColor    — colour scale for an offset value
 *   miniPlot       — bar chart of offset % distribution
 *   rankedList     — label|bar|%|count distribution table
 *   offsetColorKey — colour legend HTML element
 *   offsetGrid     — card grid HTML element
 */

import * as d3 from "../../_npm/d3@7.9.0/66d82917.js";
import { html } from "../../_npm/htl@1.0.0/87d6f6ef.js";

export const TYPES = ["LonglineLogsheet", "PurseseineLogsheet"];
export const TYPE_LABEL = { LonglineLogsheet: "Longline", PurseseineLogsheet: "Purseseine" };

/**
 * Groups raw CSV rows (with `vessel_flag` and `type` columns) into a nested
 * rollup and returns sorted flag list (descending total count).
 */
export function groupByFlagType(raw) {
  const byFlagType = d3.rollup(raw, rows => rows, d => d.vessel_flag, d => d.type);
  const allFlags = [...byFlagType.keys()].sort((a, b) => {
    const tot = f => d3.sum(TYPES.flatMap(t => byFlagType.get(f)?.get(t) ?? []), d => d.count);
    return tot(b) - tot(a);
  });
  return { byFlagType, allFlags };
}

/**
 * Ranked distribution list — label | bar | % | count.
 *
 * @param {object[]} rows
 * @param {object}   opts
 * @param {string}   opts.labelKey       - field name for the label column
 * @param {string}   opts.countKey       - field name for the count
 * @param {string}   [opts.title]        - section heading
 * @param {string}   [opts.subtitle]     - shown after " — " in heading
 * @param {number}   [opts.total]        - % denominator; defaults to sum of counts
 * @param {string}   [opts.barColor]     - bar fill colour (default "#bfdbfe")
 * @param {string}   [opts.noDataText]   - shown when rows is null/empty
 * @param {function} [opts.labelFormat]  - formatter for label values (default String)
 */
export function rankedList(rows, {
  labelKey,
  countKey,
  title,
  subtitle,
  total,
  barColor = "#bfdbfe",
  noDataText,
  labelFormat = String,
} = {}) {
  if (!rows || rows.length === 0) {
    const msg = noDataText ?? (title ? `No ${title.toLowerCase()} data` : "No data");
    return html`<div style="color:#9ca3af;font-size:0.85rem;padding:0.5rem 0">${msg}</div>`;
  }
  const sorted = [...rows].sort((a, b) => b[countKey] - a[countKey]);
  const denominator = total ?? d3.sum(sorted, d => d[countKey]);
  const maxCount = sorted[0][countKey];
  const heading = title
    ? html`<div style="font-weight:600;font-size:0.8rem;color:#6b7280;margin-bottom:0.3rem">${title}${subtitle ? html` — ${subtitle}` : ""}</div>`
    : "";
  return html`<div style="margin-bottom:0.75rem">
    ${heading}
    <table style="width:100%;font-size:0.82rem;border-collapse:collapse">
      ${sorted.map(r => html`<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:2px 6px 2px 0;font-family:monospace;white-space:nowrap">${labelFormat(r[labelKey])}</td>
        <td style="padding:2px 6px;width:100%">
          <div style="background:${barColor};height:10px;width:${Math.max(2, r[countKey] / maxCount * 100)}%;border-radius:2px"></div>
        </td>
        <td style="padding:2px 0 2px 6px;text-align:right;white-space:nowrap;color:#374151">${(r[countKey] / denominator * 100).toFixed(1)}%</td>
        <td style="padding:2px 0 2px 8px;text-align:right;white-space:nowrap;color:#9ca3af">${d3.format(",")(r[countKey])}</td>
      </tr>`)}
    </table>
  </div>`;
}


/**
 * Card grid wrapping multiple groups (flags, EEZ codes, …).
 *
 * @param {string[]}             keys       - ordered list of group keys
 * @param {function(string): *}  renderCard - returns an HTML element for each key
 */
export function offsetGrid(keys, renderCard) {
  return html`<div style="display:grid;grid-template-columns:1fr;gap:1.25rem 1.5rem;margin-top:1.5rem">
    ${keys.map(k => renderCard(k))}
  </div>`;
}

/**
 * Single card shell: labelled header + two side-by-side plot slots.
 *
 * @param {string} label   - card heading text
 * @param {*}      left    - HTML/Plot for the left panel
 * @param {*}      right   - HTML/Plot for the right panel
 */
export function offsetCard(label, left, right) {
  return html`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
    <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem">${label}</div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <div style="flex:1;min-width:0">${left}</div>
      <div style="flex:1;min-width:0">${right}</div>
    </div>
  </div>`;
}
