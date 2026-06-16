---
theme: air
title: Bayesian estimator — how it works
toc: true
---

# Bayesian UTC offset estimator — how it works

This page explains the empirical Bayesian approach used to predict the UTC offset for logsheet trips that have no linked observer trip.

---

## Problem statement

Every logsheet trip in the database stores its activity timestamps in **local time** — the vessel's clock, without any UTC conversion. To migrate those timestamps to UTC we need the UTC offset that was in effect for that trip.

For trips that were **covered by an observer**, the offset is directly measurable: the observer records the same fishing event (a set) in both local time and UTC, so the difference gives the offset unambiguously.

For trips with **no observer coverage** — the majority of trips — we have no direct measurement. The goal of this estimator is to make a principled, auditable guess for each of those trips.

---

## Data sources

### Training set (known offsets)

For each observer-linked trip we extract:

| Column | Source | Meaning |
|---|---|---|
| `log_trip_id` | `log.trips_ll` / `log.trips_ps` | Trip identifier |
| `vessel_flag` | `ref.vessel_instances` | Most recent flag for the vessel |
| `primary_eez_code` | `log.sets_ll/ps` | EEZ where the most fishing sets occurred |
| `departure_month` | `log.trips_ll/ps.depart_date` | Month of departure (1–12) |
| `modal_offset` | `obsv.l_set` | See below |

**How `modal_offset` is computed:**

For each set on an observer-linked trip, the offset is:

```
offset = ROUND( DATEDIFF(MINUTE, utc_set_dtime, set_dtime) / 60.0 * 2, 0 ) / 2.0
```

This rounds to the nearest half-hour. An offset of `10.0` means the vessel's clock was UTC+10.

Values outside `[-14, +14]` are discarded as outliers.

The **modal offset** for a trip is the offset that appears most frequently across all its sets. If a trip has 20 sets and 18 record `+10.0`, the modal offset is `+10.0`.

### Prediction targets (unknown offsets)

The same features — `vessel_flag`, `primary_eez_code`, `departure_month` — are extracted for every trip that has **no** observer link. The estimator uses these features to predict the most likely offset.

---

## The model: empirical Bayes with frequency tables

This is not a "black box" machine-learning model. It is a transparent frequency-table lookup with Laplace smoothing — a classical approach from Bayesian statistics.

### Step 1 — Build frequency tables from the training set

From the training trips, four tables are built:

```
flag_eez[(vessel_flag, eez_code)][offset]  → count
flag    [vessel_flag             ][offset]  → count
eez     [eez_code                ][offset]  → count
global  [offset]                           → count
```

**Example — `flag_eez[("PF", "PF")][+10.0] = 312`**
means: among PF-flagged trips whose primary EEZ was PF, the offset `+10.0` was observed 312 times.

### Step 2 — Apply Laplace smoothing

Raw counts can reach zero for rare combinations. Laplace smoothing adds a small pseudo-count `α = 0.5` to every offset bucket before computing probabilities:

```
P(offset | context) = (count(offset) + α) / (Σ count + α × K)
```

where `K` is the number of distinct offset values observed in that context.

This prevents any offset from having a probability of exactly 0, and shrinks overconfident estimates when the sample is small.

### Step 3 — 4-tier fallback prediction

For each target trip, the estimator tries the most specific context first and falls back to broader ones if that combination was never seen in training:

| Tier | Context used | Example |
|---|---|---|
| **1** | `vessel_flag × primary_eez_code` | PF flag + PF waters |
| **2** | `vessel_flag` only | PF flag, EEZ unknown |
| **3** | `primary_eez_code` only | Unknown flag, FJ waters |
| **4** | Global prior | Nothing is known |

The predicted offset is the **mode** (most probable value) under the smoothed distribution for whichever tier fires first.

The `confidence` output column is the smoothed probability of that modal offset — a value between 0 and 1. A confidence of `0.95` means the offset was overwhelmingly consistent across all training trips in that context.

---

## Example walkthrough

**Target trip:** `vessel_flag = "PF"`, `primary_eez_code = "PF"`

Training data for `(PF, PF)`:
```
+10.0 → 312 observations
-10.0 → 5 observations   ← these are errors or outliers in training
```

With Laplace `α = 0.5`, smoothed probabilities:
```
P(+10.0) = (312 + 0.5) / (317 + 0.5×2) = 312.5 / 318 ≈ 0.983
P(-10.0) = (5   + 0.5) / 318            =   5.5 / 318 ≈ 0.017
```

**Prediction: `+10.0` with confidence `0.983` at Tier 1.**

---

## Running the estimator

The estimator is a standalone Python 3.10+ script. It reads the data loader output cached by Observable Framework and writes CSV files.

```bash
# 1. Build the Observable app to populate the cache
npm run build

# 2. Run the estimator
cd utc-estimator
python bayesian_offset_estimator.py
```

**Default paths:**
- Input: `src/.observablehq/cache/data/` (Observable Framework cache)
- Output: `utc-estimator/output/ll-predicted-offsets.csv` and `ps-predicted-offsets.csv`

**Override paths:**
```bash
python bayesian_offset_estimator.py --data-dir /path/to/csvs --out-dir /path/to/output
```

### Output columns

| Column | Description |
|---|---|
| `log_trip_id` | Trip identifier |
| `vessel_flag` | Flag used for prediction |
| `primary_eez_code` | EEZ used for prediction |
| `departure_month` | Month of departure |
| `predicted_offset` | Best-guess UTC offset (e.g. `10.0` = UTC+10) |
| `confidence` | Smoothed probability of the predicted offset (0–1) |
| `tier` | Which fallback tier was used (1 = most specific, 4 = global prior) |

---

## Known limitations

**Modal offset ties.** If two offsets appear equally often across a trip's sets (e.g. 5 sets at `+10.0` and 5 sets at `+11.0`), the SQL correlated subquery may return both as `modal_offset`, causing the trip to appear twice in training. The `DISTINCT` in the final select mitigates this but does not resolve the tie — one row is arbitrarily kept. This affects a small minority of trips.

**Primary EEZ ties.** Similarly, if a trip has equal set counts in two EEZs, both may appear as `primary_eez_code`. Again, only one row survives the `DISTINCT`.

**Departure month is extracted but not used.** The feature is present in both training and target datasets, but the current model does not stratify by season. Some Pacific fisheries are seasonal (e.g. albacore migrations shift the typical offset in austral summer vs winter). A future improvement could add a `flag × eez × month` tier.

**Observer-linked trips may themselves have errors.** If an observer recorded times incorrectly, the training signal for that flag/EEZ combination is polluted. The `|offset| ≤ 14` outlier filter removes the most obvious cases, but systematic observer errors (e.g. consistently confusing local midnight with UTC midnight) would not be detected.

**No uncertainty propagation.** `confidence` reflects consistency within the training set for that context — not overall model uncertainty. A trip predicted at Tier 4 (global prior) could have low confidence even if the global distribution is highly concentrated.
