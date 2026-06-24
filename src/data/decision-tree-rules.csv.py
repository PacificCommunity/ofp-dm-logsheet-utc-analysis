"""Data loader: decision-tree-rules.csv.py

Trains a scikit-learn DecisionTreeClassifier on observer Longline activities to
map (vessel_flag, eez_code) -> UTC offset, then emits the resolved decision-tree
rules as CSV.

== Why a decision tree? ==
A DecisionTreeClassifier is a well-known, fully interpretable model. It recursively
partitions the feature space into rectangular regions and assigns each region a
single majority class — here, the UTC offset. Because we one-hot-encode the two
categorical features (vessel_flag, eez_code), each leaf effectively represents a
specific (flag, eez) combination, so the final artefact reads as an auditable
`flag × eez → offset` lookup table.

== What confidence means (with tolerance) ==
`confidence` is NOT a tree-internal probability. It is computed empirically on the
raw observer activities AFTER the tree makes its predictions.

`DecisionTreeClassifier` has no built-in tolerance parameter: it treats offset
labels as unordered categories and doesn't know that 10, 11, 12 are adjacent. The
tolerance is therefore applied as a post-processing step:

    confidence = (# activities where |measured_offset − predicted_offset| ≤ TOLERANCE)
                 / (total activities for that flag × eez)

With CONFIDENCE_TOLERANCE_H = 1.0, any activity within ±1 h of the predicted offset
is counted as "agreeing". This correctly absorbs near-identical timezone choices
(e.g., a skipper switching between +11 and +12 when fishing near a zone boundary)
while still penalising clear data-entry errors far from the prediction.

Example from the data:
  CN × VU — predicted +11, n≈200.  Without tolerance: ~67% (because some sets were
             recorded as +10 or +12).  With 1h tolerance: ~95% (those ±1h offsets
             count as the same timezone choice; only outliers like -11/-12 remain
             excluded).
  JP × FM — 100% (all 41 sets at the same offset, within or without tolerance).
  JP × PG —  72% strict; slightly higher with tolerance depending on the split.

== Minimum-support floor and fallback ==
Setting min_samples_leaf on the tree prevents creating overfit leaves for tiny
groups. Additionally, any (flag, eez) combination with fewer than MIN_SAMPLES
observer activities is replaced by the flag-level dominant offset (majority
across all EEZs for that flag). These rows are labelled rule_level="flag_fallback"
in the output so downstream users can distinguish them.

Output columns:
  vessel_flag  -- vessel flag
  eez_code     -- EEZ code
  offset       -- predicted UTC offset (whole/half hours)
  support      -- number of observer activities behind this flag x eez
  confidence   -- share within ±CONFIDENCE_TOLERANCE_H of the predicted offset
  rule_level   -- "activity" (direct) | "flag_fallback" (sparse, coarsened)
"""

import sys

import pandas as pd
import pyodbc
from sklearn.tree import DecisionTreeClassifier

from db import ANALYSIS_START_DATE, CONNECTION_STRING

# Flag×eez cells with fewer than this many activities fall back to the
# flag-level dominant offset. This prevents noisy rules from sparse data.
MIN_SAMPLES = 30

# Offsets within this many hours of the prediction count as "agreeing" when
# computing confidence. This absorbs near-identical timezone choices (e.g., a
# skipper alternating between +11 and +12 near a zone boundary) while still
# penalising clear data-entry errors far from the prediction.
CONFIDENCE_TOLERANCE_H = 1.0

SQL = f"""
WITH

vessel_flag AS (
    SELECT DISTINCT
        vi.vessel_id,
        FIRST_VALUE(vi.flag_id) OVER (
            PARTITION BY vi.vessel_id
            ORDER BY vi.start_date DESC
        ) AS flag_id
    FROM ref.vessel_instances vi
    WHERE vi.flag_id IS NOT NULL
),

LLWithObserver AS (
    SELECT el.dto_guid_left  AS log_trip_id,
           el.dto_guid_right AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_left  = 'LonglineLogsheetDTO'
      AND el.dto_type_right = 'ObserverTripDTO'
    UNION
    SELECT el.dto_guid_right AS log_trip_id,
           el.dto_guid_left  AS obstrip_id
    FROM tufman2.entity_links el
    WHERE el.dto_type_right = 'LonglineLogsheetDTO'
      AND el.dto_type_left  = 'ObserverTripDTO'
),

raw_activities AS (
    SELECT
        vf.flag_id AS vessel_flag,
        sl.eez_code,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl    ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN LLWithObserver lo  ON lo.log_trip_id = tl.log_trip_id
    INNER JOIN vessel_flag vf     ON vf.vessel_id   = tl.vessel_id
    INNER JOIN obsv.l_set os
        ON  os.obstrip_id = lo.obstrip_id
        AND CAST(os.set_date AS DATE) = CAST(sl.logdate AS DATE)
    WHERE sl.l_activity_id  = 1
      AND sl.eez_code        IS NOT NULL
      AND sl.logdate         >= '{ANALYSIS_START_DATE}'
      AND os.utc_set_dtime   IS NOT NULL
      AND os.set_dtime        IS NOT NULL
)

SELECT
    vessel_flag,
    eez_code,
    CASE WHEN observer_offset > 12 THEN observer_offset - 24 ELSE observer_offset END AS offset
FROM raw_activities
WHERE ABS(observer_offset) <= 14
"""


def majority_offset(series: "pd.Series") -> float:
    """Return the most frequent value in a series."""
    return series.value_counts().idxmax()


def main() -> None:
    conn = pyodbc.connect(CONNECTION_STRING)
    df = pd.read_sql(SQL, conn)
    conn.close()

    df["vessel_flag"] = df["vessel_flag"].astype(str).str.strip()
    df["eez_code"] = df["eez_code"].astype(str).str.strip()
    df["offset"] = df["offset"].astype(float)
    # The classifier needs discrete labels: encode half-hour offsets as integers.
    df["offset_units"] = (df["offset"] * 2).round().astype(int)

    print(f"Training on {len(df):,} observer activities", file=sys.stderr)

    # ── One-hot encode categorical features ────────────────────────────────────
    features = pd.get_dummies(df[["vessel_flag", "eez_code"]])
    target = df["offset_units"]

    # min_samples_leaf prevents the tree from creating unstable leaves for tiny
    # flag×eez groups during training.
    clf = DecisionTreeClassifier(
        criterion="gini",
        min_samples_leaf=MIN_SAMPLES,
        random_state=0,
    )
    clf.fit(features, target)

    # ── Enumerate every observed (flag, eez) combination ──────────────────────
    combos = (
        df.groupby(["vessel_flag", "eez_code"])
        .agg(support=("offset", "size"))
        .reset_index()
    )
    combo_features = pd.get_dummies(combos[["vessel_flag", "eez_code"]])
    combo_features = combo_features.reindex(columns=features.columns, fill_value=0)
    combos["offset"] = clf.predict(combo_features) / 2.0
    combos["rule_level"] = "activity"

    # ── Flag-level dominant offset (fallback for sparse cells) ────────────────
    flag_dominant: dict[str, float] = (
        df.groupby("vessel_flag")["offset"].agg(majority_offset).to_dict()
    )

    sparse_mask = combos["support"] < MIN_SAMPLES
    for flag, dom_offset in flag_dominant.items():
        flag_sparse = sparse_mask & (combos["vessel_flag"] == flag)
        combos.loc[flag_sparse, "offset"] = dom_offset
        combos.loc[flag_sparse, "rule_level"] = "flag_fallback"

    n_sparse = sparse_mask.sum()
    print(
        f"Applied flag fallback to {n_sparse} sparse flag×eez cells "
        f"(support < {MIN_SAMPLES})",
        file=sys.stderr,
    )

    # ── Confidence (tolerance-based empirical match rate) ────────────────────
    # Join every raw activity with the predicted offset for its flag×eez combo,
    # then count those within CONFIDENCE_TOLERANCE_H as "agreeing".
    tol_df = df.merge(
        combos[["vessel_flag", "eez_code", "offset"]].rename(columns={"offset": "predicted"}),
        on=["vessel_flag", "eez_code"],
        how="left",
    )
    tol_df["within_tol"] = tol_df["offset"].sub(tol_df["predicted"]).abs() <= CONFIDENCE_TOLERANCE_H
    n_within = (
        tol_df.groupby(["vessel_flag", "eez_code"])["within_tol"]
        .sum()
        .rename("n_within")
        .reset_index()
    )
    merged = combos.merge(n_within, on=["vessel_flag", "eez_code"], how="left")
    merged["n_within"] = merged["n_within"].fillna(0)
    merged["confidence"] = merged["n_within"] / merged["support"]

    out = merged[["vessel_flag", "eez_code", "offset", "support", "confidence", "rule_level"]].copy()
    out["offset"] = out["offset"].astype(float)
    out = out.sort_values(["support"], ascending=False)

    n_fallback = (out["rule_level"] == "flag_fallback").sum()
    print(
        f"Produced {len(out):,} rules "
        f"({len(out) - n_fallback} direct · {n_fallback} flag-fallback), "
        f"weighted confidence {(out['confidence'] * out['support']).sum() / out['support'].sum():.1%}",
        file=sys.stderr,
    )

    out.to_csv(sys.stdout, index=False, lineterminator="\n")


if __name__ == "__main__":
    main()
