/**
 * Shared component: UTC offset decision tree (computed in-page).
 *
 * Builds an auditable decision tree from observer-linked Longline trips, where each
 * trip carries a known modal observer offset (the source of truth). The tree splits
 * vessel_flag → primary_eez_code → instance_source, only going deeper when a node's
 * dominant offset fails to reach the purity threshold.
 *
 * Exports:
 *   INSTANCE_NAMES, instanceName  — TufmanInstance bitmask → short label
 *   fmtOffset                     — format an offset value (+11, -10, 0)
 *   buildDecisionTree(trips, opts) — { flagNodes, rules, coverage, globalStats, predict, params }
 *   renderTreeRules(result)       — nested, human-readable tree (HTML)
 *   renderRulesTable(result)      — flat sortable rules table (HTML)
 *   renderCoverage(result)        — coverage / accuracy summary (HTML)
 *   rulesToCSV(result)            — CSV string of the flat rules
 */

import * as d3 from "npm:d3";
import { html } from "npm:htl";

// ── TufmanInstance enum values → short name ──────────────────────────────────
export const INSTANCE_NAMES = new Map([
  [1,        "INDUSTRY"],
  [2,        "OFP"],
  [4,        "MH"],
  [8,        "FM"],
  [16,       "CK"],
  [32,       "UST"],
  [128,      "KI"],
  [256,      "TO"],
  [512,      "WS"],
  [1024,     "PF"],
  [2048,     "NR"],
  [4096,     "NU"],
  [8192,     "PG"],
  [16384,    "TV"],
  [32768,    "VU"],
  [65536,    "PW"],
  [131072,   "TK"],
  [262144,   "SB"],
  [524288,   "FJ"],
  [1048576,  "VN"],
  [2097152,  "PH"],
  [4194304,  "WCPFC"],
  [16777216, "WF"],
  [33554432, "DWFN"],
]);

export const instanceName = v => INSTANCE_NAMES.get(Number(v)) ?? String(v);

export const fmtOffset = v =>
  v == null || v === "" || Number.isNaN(+v) ? "—" : `${+v >= 0 ? "+" : ""}${+v}`;

// ── Offset distribution statistics for a set of trips ────────────────────────
function offsetStats(rows, alpha) {
  const counts = d3.rollup(rows, v => v.length, d => +d.modal_offset);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.length;
  const [dominant, domCount] = entries[0];
  const k = entries.length;
  return {
    dominant: +dominant,
    domCount,
    total,
    purity: domCount / total,
    confidence: (domCount + alpha) / (total + alpha * k),
    distinctOffsets: k,
    dist: entries.map(([offset, count]) => ({ offset: +offset, count })),
  };
}

function makeRule({ flag, eez, instance, offset, stats, level, fallback = false }) {
  return {
    flag,
    eez,
    instance,
    offset,
    confidence: stats.confidence,
    purity: stats.purity,
    support: stats.total,
    level,
    fallback,
  };
}

/**
 * Build the decision tree.
 * @param {object[]} trips - rows with vessel_flag, primary_eez_code, instance_source, modal_offset
 * @param {object}   opts  - { purity=0.9, minSupport=5, alpha=0.5 }
 */
export function buildDecisionTree(trips, { purity = 0.9, minSupport = 5, alpha = 0.5 } = {}) {
  const clean = trips.filter(
    t => t.modal_offset !== "" && t.modal_offset != null && !Number.isNaN(+t.modal_offset)
  );

  const globalStats = offsetStats(clean, alpha);

  // Lookup maps used for prediction / coverage
  const flagLeaf = new Map();   // flag           → offset
  const flagDom  = new Map();   // flag           → dominant offset (always)
  const eezLeaf  = new Map();   // flag|eez       → offset
  const eezDom   = new Map();   // flag|eez       → dominant offset
  const instLeaf = new Map();   // flag|eez|inst  → offset
  const kEez  = (f, e) => `${f}|||${e}`;
  const kInst = (f, e, i) => `${f}|||${e}|||${i}`;

  const flagNodes = [];
  const rules = [];

  const byFlag = d3.group(clean, d => d.vessel_flag);

  for (const [flag, flagRows] of byFlag) {
    const fstats = offsetStats(flagRows, alpha);
    flagDom.set(flag, fstats.dominant);
    const node = { kind: "flag", flag, ...fstats, leaf: false, children: [] };

    if (fstats.purity >= purity || fstats.total < minSupport) {
      node.leaf = true;
      node.offset = fstats.dominant;
      flagLeaf.set(flag, fstats.dominant);
      rules.push(makeRule({ flag, eez: "*", instance: "*", offset: fstats.dominant, stats: fstats, level: "flag" }));
    } else {
      const byEez = d3.group(flagRows, d => d.primary_eez_code || "(none)");
      for (const [eez, eezRows] of [...byEez.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const estats = offsetStats(eezRows, alpha);
        eezDom.set(kEez(flag, eez), estats.dominant);
        const enode = { kind: "eez", eez, ...estats, leaf: false, children: [] };

        if (estats.total < minSupport) {
          // too small to trust → fall back to flag dominant
          enode.leaf = true;
          enode.fallback = true;
          enode.offset = fstats.dominant;
          rules.push(makeRule({ flag, eez, instance: "*", offset: fstats.dominant, stats: estats, level: "flag-fallback", fallback: true }));
        } else if (estats.purity >= purity) {
          enode.leaf = true;
          enode.offset = estats.dominant;
          eezLeaf.set(kEez(flag, eez), estats.dominant);
          rules.push(makeRule({ flag, eez, instance: "*", offset: estats.dominant, stats: estats, level: "eez" }));
        } else {
          // split by instance_source
          const byInst = d3.group(eezRows, d => String(d.instance_source));
          for (const [inst, instRows] of [...byInst.entries()].sort((a, b) => b[1].length - a[1].length)) {
            const istats = offsetStats(instRows, alpha);
            if (istats.total >= minSupport && istats.purity >= purity) {
              instLeaf.set(kInst(flag, eez, inst), istats.dominant);
              enode.children.push({ kind: "instance", instance: inst, ...istats, leaf: true, offset: istats.dominant });
              rules.push(makeRule({ flag, eez, instance: instanceName(inst), offset: istats.dominant, stats: istats, level: "instance" }));
            }
          }
          // EEZ fallback for the remaining instances
          enode.offset = estats.dominant;
          enode.fallback = true;
          enode.leaf = enode.children.length === 0;
          eezDom.set(kEez(flag, eez), estats.dominant);
          rules.push(makeRule({ flag, eez, instance: enode.children.length ? "(other)" : "*", offset: estats.dominant, stats: estats, level: "eez-fallback", fallback: true }));
        }
        node.children.push(enode);
      }
    }
    flagNodes.push(node);
  }

  flagNodes.sort((a, b) => b.total - a.total);
  rules.sort((a, b) => b.support - a.support);

  // ── Prediction (used for resubstitution coverage and per-set application) ──
  const predict = (trip) => {
    const flag = trip.vessel_flag;
    const eez = trip.primary_eez_code || "(none)";
    const inst = String(trip.instance_source);
    if (flagLeaf.has(flag)) return flagLeaf.get(flag);
    if (instLeaf.has(kInst(flag, eez, inst))) return instLeaf.get(kInst(flag, eez, inst));
    if (eezLeaf.has(kEez(flag, eez))) return eezLeaf.get(kEez(flag, eez));
    if (eezDom.has(kEez(flag, eez))) return eezDom.get(kEez(flag, eez));
    if (flagDom.has(flag)) return flagDom.get(flag);
    return globalStats.dominant;
  };

  // ── Coverage (resubstitution accuracy) ──
  let correct = 0;
  for (const t of clean) if (predict(t) === +t.modal_offset) correct++;
  const nSimpleFlags = flagNodes.filter(n => n.leaf).length;
  const coverage = {
    n: clean.length,
    correct,
    accuracy: clean.length ? correct / clean.length : 0,
    nFlags: flagNodes.length,
    nSimpleFlags,
    nSplitFlags: flagNodes.length - nSimpleFlags,
    nRules: rules.length,
  };

  return { flagNodes, rules, coverage, globalStats, predict, params: { purity, minSupport, alpha } };
}

// ── Renderers ────────────────────────────────────────────────────────────────

const offsetBadge = (v, { fallback = false } = {}) => html`<span style="
  display:inline-block;font-family:monospace;font-weight:700;
  background:${fallback ? "#fef9c3" : "#dcfce7"};color:#166534;
  padding:1px 7px;border-radius:4px">${fmtOffset(v)}</span>`;

const meta = (stats) => html`<span style="color:#9ca3af;font-size:0.8em">
  ${(stats.purity * 100).toFixed(0)}% · n=${d3.format(",")(stats.total)} · conf ${(stats.confidence * 100).toFixed(0)}%</span>`;

/** Nested, human-readable tree of rules. */
export function renderTreeRules(result) {
  const { flagNodes } = result;
  return html`<div style="font-size:0.9rem">
    ${flagNodes.map(fn => html`<div style="margin:0.4rem 0;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:8px">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <strong style="font-size:1rem">${fn.flag}</strong>
        ${fn.leaf
          ? html`<span>→ ${offsetBadge(fn.offset)} ${meta(fn)}</span>`
          : html`<span style="color:#6b7280">splits by EEZ ${meta(fn)}</span>`}
      </div>
      ${fn.leaf ? "" : html`<div style="margin-top:0.35rem;padding-left:1rem;border-left:2px solid #f3f4f6">
        ${fn.children.map(en => html`<div style="margin:0.2rem 0">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
            <span style="font-family:monospace;color:#374151">EEZ ${en.eez}</span>
            ${en.leaf
              ? html`<span>→ ${offsetBadge(en.offset, { fallback: en.fallback })}${en.fallback ? html` <em style="color:#b45309;font-size:0.8em">(flag fallback)</em>` : ""} ${meta(en)}</span>`
              : html`<span style="color:#6b7280">splits by instance ${meta(en)}</span>`}
          </div>
          ${en.children && en.children.length ? html`<div style="padding-left:1.25rem">
            ${en.children.map(inode => html`<div>
              <span style="font-family:monospace;color:#6b7280">instance ${instanceName(inode.instance)}</span>
              → ${offsetBadge(inode.offset)} ${meta(inode)}
            </div>`)}
            <div style="color:#b45309;font-size:0.85em">other instances → ${offsetBadge(en.offset, { fallback: true })} (EEZ fallback)</div>
          </div>` : ""}
        </div>`)}
      </div>`}
    </div>`)}
  </div>`;
}

/** Flat rules table. */
export function renderRulesTable(result) {
  const { rules } = result;
  const levelLabel = {
    "flag": "flag", "eez": "flag×eez", "instance": "flag×eez×instance",
    "flag-fallback": "flag fallback", "eez-fallback": "EEZ fallback",
  };
  return html`<table style="width:100%;border-collapse:collapse;font-size:0.85rem">
    <thead>
      <tr style="border-bottom:2px solid #e5e7eb;text-align:left">
        <th style="padding:5px 10px">Flag</th>
        <th style="padding:5px 10px">EEZ</th>
        <th style="padding:5px 10px">Instance</th>
        <th style="padding:5px 10px;text-align:right">Offset</th>
        <th style="padding:5px 10px;text-align:right">Purity</th>
        <th style="padding:5px 10px;text-align:right">Confidence</th>
        <th style="padding:5px 10px;text-align:right">Trips</th>
        <th style="padding:5px 10px">Rule level</th>
      </tr>
    </thead>
    <tbody>
      ${rules.map((r, i) => html`<tr style="background:${i % 2 ? "#f9fafb" : "transparent"};border-bottom:1px solid #f3f4f6">
        <td style="padding:4px 10px;font-weight:600">${r.flag}</td>
        <td style="padding:4px 10px;font-family:monospace">${r.eez}</td>
        <td style="padding:4px 10px;font-family:monospace">${r.instance}</td>
        <td style="padding:4px 10px;text-align:right">${offsetBadge(r.offset, { fallback: r.fallback })}</td>
        <td style="padding:4px 10px;text-align:right">${(r.purity * 100).toFixed(0)}%</td>
        <td style="padding:4px 10px;text-align:right">${(r.confidence * 100).toFixed(0)}%</td>
        <td style="padding:4px 10px;text-align:right">${d3.format(",")(r.support)}</td>
        <td style="padding:4px 10px;color:#6b7280">${levelLabel[r.level] ?? r.level}</td>
      </tr>`)}
    </tbody>
  </table>`;
}

/** Coverage / accuracy summary cards. */
export function renderCoverage(result) {
  const { coverage: c, params } = result;
  const card = (label, value, sub) => html`<div style="flex:1;min-width:150px;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem 1rem">
    <div style="font-size:1.5rem;font-weight:700">${value}</div>
    <div style="font-size:0.85rem;color:#374151">${label}</div>
    ${sub ? html`<div style="font-size:0.78rem;color:#9ca3af">${sub}</div>` : ""}
  </div>`;
  return html`<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
    ${card("Resubstitution accuracy", `${(c.accuracy * 100).toFixed(1)}%`, `${d3.format(",")(c.correct)} / ${d3.format(",")(c.n)} observer trips`)}
    ${card("Vessel flags", d3.format(",")(c.nFlags), `${c.nSimpleFlags} simple · ${c.nSplitFlags} split`)}
    ${card("Decision rules", d3.format(",")(c.nRules), `purity ≥ ${(params.purity * 100).toFixed(0)}%, min ${params.minSupport} trips`)}
  </div>`;
}

/** CSV string of the flat rules. */
export function rulesToCSV(result) {
  const header = ["flag", "eez", "instance", "offset", "purity", "confidence", "support", "level", "fallback"];
  const lines = [header.join(",")];
  for (const r of result.rules) {
    lines.push([
      r.flag, r.eez, r.instance, r.offset,
      r.purity.toFixed(4), r.confidence.toFixed(4), r.support, r.level, r.fallback,
    ].join(","));
  }
  return lines.join("\n");
}
