"""Data loader: decision-tree-rules.csv.py

Trains a scikit-learn DecisionTreeClassifier on observer Longline activities to
map (vessel_flag, eez_code) -> UTC offset, then emits the resolved decision-tree
rules as CSV.

Why a decision tree: it is a well-known, fully interpretable model whose splits
read directly as `vessel_flag (x eez_code) -> offset`, which is exactly the
artefact we want to ship. We train on individual observer *activities* (each
fishing set is one training example) using the observer offset as the label.
EEZ and flag are the only features (logsheet instance dropped). The observer
offset is treated as the ground truth.

Output columns:
  vessel_flag    -- vessel flag
  eez_code       -- EEZ code
  offset         -- predicted UTC offset (whole/half hours)
  support        -- number of observer activities behind this flag x eez
  confidence     -- share of those activities whose observed offset == prediction
"""

import sys

import pandas as pd
import pyodbc
from sklearn.tree import DecisionTreeClassifier

from db import ANALYSIS_START_DATE, CONNECTION_STRING

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

    # One-hot encode the two categorical features.
    features = pd.get_dummies(df[["vessel_flag", "eez_code"]])
    target = df["offset_units"]

    clf = DecisionTreeClassifier(criterion="gini", random_state=0)
    clf.fit(features, target)

    # Enumerate every observed (flag, eez) combination and predict its offset.
    combos = (
        df.groupby(["vessel_flag", "eez_code"])
        .agg(support=("offset", "size"))
        .reset_index()
    )
    combo_features = pd.get_dummies(combos[["vessel_flag", "eez_code"]])
    combo_features = combo_features.reindex(columns=features.columns, fill_value=0)
    combos["offset"] = clf.predict(combo_features) / 2.0

    # Confidence = share of activities at this flag x eez whose observed offset
    # equals the predicted offset.
    actual = df.groupby(["vessel_flag", "eez_code", "offset"]).size().rename("n").reset_index()
    merged = combos.merge(actual, on=["vessel_flag", "eez_code", "offset"], how="left")
    merged["n"] = merged["n"].fillna(0)
    merged["confidence"] = merged["n"] / merged["support"]

    out = merged[["vessel_flag", "eez_code", "offset", "support", "confidence"]].copy()
    out["offset"] = out["offset"].astype(float)
    out = out.sort_values(["support"], ascending=False)

    print(
        f"Produced {len(out):,} flag x eez rules, "
        f"mean confidence {out['confidence'].mean():.1%}",
        file=sys.stderr,
    )

    out.to_csv(sys.stdout, index=False, lineterminator="\n")


if __name__ == "__main__":
    main()
