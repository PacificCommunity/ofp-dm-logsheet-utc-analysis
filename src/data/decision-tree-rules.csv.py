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

== What confidence means ==
`confidence` is NOT a tree-internal probability. It is the share of the raw
observer activities at that (flag, eez) pair whose measured offset equals the
tree's prediction EXACTLY:

    confidence = (# activities with predicted offset) / (total activities)

The full offset distribution per flag×eez (visible on the decision-tree page as
inline mini-bars) comes from ll-observer-activity-offsets.csv, which is a separate
loader providing multiple rows per combo. Use that to see outliers and near-misses.

Example from the data:
  JP × FM  — 100% confidence, n=41  → every JP-flagged set in FM waters used
              the same clock. The tree is certain.
  JP × PG  —  72% confidence, n=57  → 57 sets, majority use one offset, but
              ~28% used a different one. The tree predicts the majority.

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
  confidence   -- exact-match share (measured offset == prediction)
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

    # ── Confidence (exact-match rate on raw training data) ───────────────────
    actual = df.groupby(["vessel_flag", "eez_code", "offset"]).size().rename("n").reset_index()
    merged = combos.merge(actual, on=["vessel_flag", "eez_code", "offset"], how="left")
    merged["n"] = merged["n"].fillna(0)
    merged["confidence"] = merged["n"] / merged["support"]

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
