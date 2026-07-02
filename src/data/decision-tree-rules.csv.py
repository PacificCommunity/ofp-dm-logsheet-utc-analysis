"""Data loader: decision-tree-rules.csv.py

Trains a scikit-learn DecisionTreeClassifier on observer Longline activities to
map (vessel_flag, eez_code) -> UTC offset, then refines the result with the
trip's DEPARTURE PORT, emitting the resolved decision-tree rules as CSV.

== Why a decision tree? ==
A DecisionTreeClassifier is a well-known, fully interpretable model. It recursively
partitions the feature space into rectangular regions and assigns each region a
single majority class — here, the UTC offset. Because we one-hot-encode the
categorical features (vessel_flag, eez_code), each leaf effectively represents a
specific (flag, eez) combination, so the baseline artefact reads as an auditable
`flag × eez → offset` lookup table.

== Three-level fallback hierarchy (flag × eez × port) ==
The departure port is added as a refinement on top of the flag × eez tree,
because a captain may keep the departure-port clock rather than local vessel
time. Each rule is resolved at the finest level that has enough observer data:

  1. port  -- (flag, eez, depart_port) with >= MIN_SAMPLES activities. A port
              override row is emitted with rule_level="port".
  2. eez   -- (flag, eez) with >= MIN_SAMPLES activities (the tree prediction).
              rule_level="eez"; depart_port is blank (applies to any port with no
              specific override).
  3. flag  -- sparse (flag, eez) cells fall back to the flag-level dominant
              offset. rule_level="flag_fallback"; depart_port blank.

Downstream resolution: match a (flag, eez, port) exact port override first; else
use the (flag, eez) rule; else the flag fallback.

== What confidence means ==
`confidence` is NOT a tree-internal probability. It is the share of the raw
observer activities at the rule's decision level whose measured offset equals the
assigned offset EXACTLY:

    confidence = (# activities with the assigned offset) / (activities at that level)

The full offset distribution per flag×eez (visible on the decision-tree page as
inline mini-bars) comes from ll-observer-activity-offsets.csv, which is a separate
loader providing multiple rows per combo. Use that to see outliers and near-misses.

Output columns:
  vessel_flag  -- vessel flag
  eez_code     -- EEZ code
  depart_port  -- departure port name (port rules only; blank for eez/flag rules)
  offset       -- assigned UTC offset (whole/half hours)
  support      -- observer activities behind this rule's decision level
  confidence   -- exact-match share (measured offset == assigned)
  rule_level   -- "port" | "eez" | "flag_fallback"
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
        tl.depart_port_id,
        p.port_name AS depart_port,
        ROUND(
            CAST(DATEDIFF(MINUTE, os.utc_set_dtime, os.set_dtime) AS FLOAT)
            / 60.0 * 2, 0
        ) / 2.0 AS observer_offset
    FROM log.sets_ll sl
    INNER JOIN log.trips_ll tl    ON tl.log_trip_id = sl.log_trip_id
    INNER JOIN LLWithObserver lo  ON lo.log_trip_id = tl.log_trip_id
    INNER JOIN vessel_flag vf     ON vf.vessel_id   = tl.vessel_id
    LEFT  JOIN ref.ports p        ON p.port_id      = tl.depart_port_id
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
    depart_port_id,
    depart_port,
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
    df["depart_port"] = df["depart_port"].fillna("").astype(str).str.strip()
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

    # ── Level 2: every observed (flag, eez) combination (tree prediction) ─────
    combos = (
        df.groupby(["vessel_flag", "eez_code"])
        .agg(support=("offset", "size"))
        .reset_index()
    )
    combo_features = pd.get_dummies(combos[["vessel_flag", "eez_code"]])
    combo_features = combo_features.reindex(columns=features.columns, fill_value=0)
    combos["offset"] = clf.predict(combo_features) / 2.0
    combos["rule_level"] = "eez"
    combos["depart_port"] = ""

    # ── Level 3: flag-level dominant offset (fallback for sparse cells) ───────
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

    # Confidence for eez/flag rules: exact-match rate at the (flag, eez) level.
    actual = df.groupby(["vessel_flag", "eez_code", "offset"]).size().rename("n").reset_index()
    combos = combos.merge(actual, on=["vessel_flag", "eez_code", "offset"], how="left")
    combos["n"] = combos["n"].fillna(0)
    combos["confidence"] = combos["n"] / combos["support"]
    combos = combos[
        ["vessel_flag", "eez_code", "depart_port", "offset", "support", "confidence", "rule_level"]
    ]

    # ── Level 1: departure-port overrides where a (flag, eez, port) cell has ──
    #    enough observer data. These take priority over the (flag, eez) rule.
    port_groups = (
        df[df["depart_port"] != ""]
        .groupby(["vessel_flag", "eez_code", "depart_port"])
        .agg(support=("offset", "size"), offset=("offset", majority_offset))
        .reset_index()
    )
    port_groups = port_groups[port_groups["support"] >= MIN_SAMPLES].copy()

    # Confidence at the (flag, eez, port) level.
    port_actual = (
        df.groupby(["vessel_flag", "eez_code", "depart_port", "offset"]).size().rename("n").reset_index()
    )
    port_groups = port_groups.merge(
        port_actual, on=["vessel_flag", "eez_code", "depart_port", "offset"], how="left"
    )
    port_groups["n"] = port_groups["n"].fillna(0)
    port_groups["confidence"] = port_groups["n"] / port_groups["support"]
    port_groups["rule_level"] = "port"
    port_groups = port_groups[
        ["vessel_flag", "eez_code", "depart_port", "offset", "support", "confidence", "rule_level"]
    ]

    print(f"Added {len(port_groups):,} port-override rules (support >= {MIN_SAMPLES})",
          file=sys.stderr)

    # ── Combine, order (port overrides first within a flag×eez), emit ─────────
    out = pd.concat([combos, port_groups], ignore_index=True)
    out["offset"] = out["offset"].astype(float)
    level_rank = {"port": 0, "eez": 1, "flag_fallback": 2}
    out["_lvl"] = out["rule_level"].map(level_rank)
    out = out.sort_values(["support", "_lvl"], ascending=[False, True]).drop(columns="_lvl")

    n_port = (out["rule_level"] == "port").sum()
    n_fallback = (out["rule_level"] == "flag_fallback").sum()
    n_eez = (out["rule_level"] == "eez").sum()
    print(
        f"Produced {len(out):,} rules "
        f"({n_port} port · {n_eez} eez · {n_fallback} flag-fallback), "
        f"weighted confidence {(out['confidence'] * out['support']).sum() / out['support'].sum():.1%}",
        file=sys.stderr,
    )

    out.to_csv(sys.stdout, index=False, lineterminator="\n")


if __name__ == "__main__":
    main()
