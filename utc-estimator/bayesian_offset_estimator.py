#!/usr/bin/env python3
"""
bayesian_offset_estimator.py

Predicts the UTC offset for Longline and Purseseine logsheet trips that
have no linked observer trip, using an empirical Bayesian approach trained
on observer-linked trips.

Input CSVs (relative to the Observable Framework src/data cache, or dist/):
  - ll-trip-training-features.csv   (observer-linked LL trips with known modal_offset)
  - ps-trip-training-features.csv   (same for PS)
  - ll-trip-prediction-targets.csv  (LL trips without observer coverage)
  - ps-trip-prediction-targets.csv  (same for PS)

Output CSVs (written to utc-estimator/output/):
  - ll-predicted-offsets.csv
  - ps-predicted-offsets.csv

Output columns:
  log_trip_id, vessel_flag, primary_eez_code, departure_month,
  predicted_offset, confidence, tier

Tiers:
  1 — flag × eez lookup (most specific)
  2 — flag-only lookup
  3 — eez-only lookup
  4 — global prior (fallback)

Usage:
  python bayesian_offset_estimator.py [--data-dir <path>] [--out-dir <path>]

  --data-dir  path to the folder containing the four input CSVs
              (default: src/.observablehq/cache/data relative to the project root)
  --out-dir   path for output CSVs (default: ./output)
"""

import argparse
import csv
import os
import sys
from collections import defaultdict
from pathlib import Path


# ── Laplace smoothing constant ────────────────────────────────────────────────
ALPHA = 0.5  # adds 0.5 pseudo-counts per offset value to avoid zero probabilities


def load_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def parse_float(v: str) -> float | None:
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def parse_int(v: str) -> int | None:
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


# ── Build frequency tables from training data ─────────────────────────────────

def build_lookup(training: list[dict]) -> tuple[dict, dict, dict, dict]:
    """
    Returns four lookup dicts, each mapping key → {offset → count}:
      flag_eez  : (vessel_flag, primary_eez_code) → counts
      flag      : vessel_flag → counts
      eez       : primary_eez_code → counts
      global    : "ALL" → counts
    """
    flag_eez: dict = defaultdict(lambda: defaultdict(float))
    flag:     dict = defaultdict(lambda: defaultdict(float))
    eez:      dict = defaultdict(lambda: defaultdict(float))
    global_:  dict = defaultdict(float)

    for row in training:
        offset = parse_float(row.get("modal_offset", ""))
        if offset is None:
            continue
        vf  = row.get("vessel_flag", "").strip()
        ez  = row.get("primary_eez_code", "").strip()

        if vf and ez:
            flag_eez[(vf, ez)][offset] += 1
        if vf:
            flag[vf][offset] += 1
        if ez:
            eez[ez][offset] += 1
        global_[offset] += 1

    return dict(flag_eez), dict(flag), dict(eez), dict(global_)


def best_offset(counts: dict, alpha: float = ALPHA) -> tuple[float, float]:
    """
    Applies Laplace smoothing and returns (modal_offset, confidence).
    confidence = smoothed probability of the modal offset.
    """
    all_keys = list(counts.keys())
    total = sum(counts.values()) + alpha * len(all_keys)
    best = max(all_keys, key=lambda k: counts[k] + alpha)
    confidence = (counts[best] + alpha) / total
    return best, round(confidence, 4)


def predict(
    targets: list[dict],
    flag_eez: dict,
    flag: dict,
    eez: dict,
    global_: dict,
) -> list[dict]:
    results = []
    for row in targets:
        vf = row.get("vessel_flag", "").strip()
        ez = row.get("primary_eez_code", "").strip()

        predicted_offset = None
        confidence = None
        tier = None

        # Tier 1 — flag × eez
        if vf and ez and (vf, ez) in flag_eez:
            predicted_offset, confidence = best_offset(flag_eez[(vf, ez)])
            tier = 1

        # Tier 2 — flag only
        elif vf and vf in flag:
            predicted_offset, confidence = best_offset(flag[vf])
            tier = 2

        # Tier 3 — eez only
        elif ez and ez in eez:
            predicted_offset, confidence = best_offset(eez[ez])
            tier = 3

        # Tier 4 — global prior
        elif global_:
            predicted_offset, confidence = best_offset(global_)
            tier = 4

        results.append({
            "log_trip_id":      row.get("log_trip_id", ""),
            "vessel_flag":      vf,
            "primary_eez_code": ez,
            "departure_month":  row.get("departure_month", ""),
            "predicted_offset": predicted_offset if predicted_offset is not None else "",
            "confidence":       confidence if confidence is not None else "",
            "tier":             tier if tier is not None else "",
        })

    return results


def write_csv(rows: list[dict], path: Path) -> None:
    if not rows:
        print(f"  [warn] No rows to write to {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Written {len(rows):,} rows → {path}")


def print_coverage(label: str, results: list[dict]) -> None:
    from collections import Counter
    tiers = Counter(r["tier"] for r in results)
    total = len(results)
    print(f"\n{label} — {total:,} trips")
    for t in [1, 2, 3, 4, ""]:
        n = tiers.get(t, 0)
        pct = n / total * 100 if total else 0
        name = {1: "flag×eez", 2: "flag only", 3: "eez only", 4: "global prior", "": "unresolved"}.get(t, str(t))
        if n:
            print(f"  Tier {t} ({name}): {n:,} ({pct:.1f}%)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Bayesian UTC offset estimator")
    script_dir = Path(__file__).parent
    default_data = script_dir.parent / "src" / ".observablehq" / "cache" / "data"
    parser.add_argument("--data-dir", type=Path, default=default_data,
                        help="Folder containing the four input CSVs")
    parser.add_argument("--out-dir",  type=Path, default=script_dir / "output",
                        help="Output folder for predicted-offsets CSVs")
    args = parser.parse_args()

    data_dir: Path = args.data_dir
    out_dir:  Path = args.out_dir

    print(f"Reading CSVs from: {data_dir}")

    # ── Load inputs ───────────────────────────────────────────────────────────
    ll_train   = load_csv(data_dir / "ll-trip-training-features.csv")
    ps_train   = load_csv(data_dir / "ps-trip-training-features.csv")
    ll_targets = load_csv(data_dir / "ll-trip-prediction-targets.csv")
    ps_targets = load_csv(data_dir / "ps-trip-prediction-targets.csv")

    print(f"  LL training trips:    {len(ll_train):,}")
    print(f"  PS training trips:    {len(ps_train):,}")
    print(f"  LL prediction targets:{len(ll_targets):,}")
    print(f"  PS prediction targets:{len(ps_targets):,}")

    # ── Build lookup tables ───────────────────────────────────────────────────
    ll_flag_eez, ll_flag, ll_eez, ll_global = build_lookup(ll_train)
    ps_flag_eez, ps_flag, ps_eez, ps_global = build_lookup(ps_train)

    # ── Predict ───────────────────────────────────────────────────────────────
    ll_results = predict(ll_targets, ll_flag_eez, ll_flag, ll_eez, ll_global)
    ps_results = predict(ps_targets, ps_flag_eez, ps_flag, ps_eez, ps_global)

    # ── Coverage summary ──────────────────────────────────────────────────────
    print_coverage("Longline", ll_results)
    print_coverage("Purseseine", ps_results)

    # ── Write outputs ─────────────────────────────────────────────────────────
    print(f"\nWriting outputs to: {out_dir}")
    write_csv(ll_results, out_dir / "ll-predicted-offsets.csv")
    write_csv(ps_results, out_dir / "ps-predicted-offsets.csv")

    print("\nDone.")


if __name__ == "__main__":
    main()
