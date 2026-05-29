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

import * as Plot from "../../_npm/@observablehq/plot@0.6.17/a96a6bbb.js";
import * as d3 from "../../_npm/d3@7.9.0/66d82917.js";
import { html } from "../../_npm/htl@1.0.0/87d6f6ef.js";

export const allOffsets = d3.range(-14, 14.5, 0.5);
export const PLOT_H = 155;

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

/** Blue (negative) / Red (zero) / Orange (positive) colour scale. */
export function offsetColor(offset) {
  if (offset === 0) return "#ef4444";
  if (offset < 0)   return d3.interpolateBlues(0.4 + Math.abs(offset) / 14 * 0.55);
  return d3.interpolateOranges(0.35 + offset / 14 * 0.55);
}

/**
 * Bar chart showing offset % distribution for one panel.
 *
 * @param {object[]} rows     - data rows, each with `count` and the offset field
 * @param {object}   options
 * @param {string}   options.offsetKey   - field name for the offset value (default: "offset")
 * @param {string}   options.title       - chart title (e.g. "Longline")
 * @param {string}   [options.subtitle]  - chart subtitle; defaults to "N sets"
 * @param {number}   options.plotW       - chart width in px
 */
export function miniPlot(rows, { offsetKey = "offset", title, subtitle, plotW }) {
  const total  = d3.sum(rows, d => d.count);
  const cMap   = new Map(rows.map(d => [d[offsetKey], d.count]));
  const series = allOffsets.map(o => ({
    o,
    count: cMap.get(o) ?? 0,
    pct: total > 0 ? (cMap.get(o) ?? 0) / total * 100 : 0,
  }));
  return Plot.plot({
    title,
    subtitle: subtitle ?? `${d3.format(",")(total)} sets`,
    width: plotW,
    height: PLOT_H,
    marginLeft: 32,
    marginBottom: 26,
    marginTop: 36,
    x: {
      label: null,
      domain: allOffsets,
      tickFormat: v => Number.isInteger(v) ? String(v) : "",
      tickSize: 3,
    },
    y: { label: "%", grid: true, tickFormat: v => `${v}%` },
    marks: [
      Plot.barY(series.filter(d => d.count > 0), {
        x: "o", y: "pct",
        fill: d => offsetColor(d.o),
        tip: true,
        title: d => `${d.o >= 0 ? "+" : ""}${d.o}h — ${d3.format(",")(d.count)} (${d.pct.toFixed(1)}%)`,
      }),
      Plot.ruleY([0]),
    ],
  });
}

/**
 * Colour legend for the offset charts.
 *
 * @param {object} [labels]
 * @param {string} [labels.neg]  - label for negative offsets
 * @param {string} [labels.pos]  - label for positive offsets
 * @param {string} [labels.zero] - label for zero offset
 */
export function offsetColorKey({
  neg  = "Negative offset (UTC−, eastern Pacific / Americas)",
  pos  = "Positive offset (UTC+, western Pacific / Asia)",
  zero = "Zero offset",
} = {}) {
  return html`<div style="display:flex;gap:1.5rem;align-items:center;font-size:0.85rem;margin-top:0.5rem;flex-wrap:wrap">
    <span style="display:flex;align-items:center;gap:6px">
      <span style="width:14px;height:14px;background:${d3.interpolateBlues(0.7)};display:inline-block;border-radius:2px"></span>
      ${neg}
    </span>
    <span style="display:flex;align-items:center;gap:6px">
      <span style="width:14px;height:14px;background:${d3.interpolateOranges(0.7)};display:inline-block;border-radius:2px"></span>
      ${pos}
    </span>
    <span style="display:flex;align-items:center;gap:6px">
      <span style="width:14px;height:14px;background:#ef4444;display:inline-block;border-radius:2px"></span>
      ${zero}
    </span>
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
