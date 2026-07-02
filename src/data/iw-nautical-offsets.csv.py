"""Data loader: iw-nautical-offsets.csv.py

Observed nautical-timezone footprint of each *international-waters* EEZ code.

For every Longline logsheet fishing set that resolved to one of the 12
international-waters codes (H4, H5, IW, I1-I9), this loader computes the nautical
timezone offset from the set's own longitude:

    nautical_offset = round(longitude / 15)

and counts how many sets fall in each (eez_code, nautical_offset) bucket. Unlike
the polygon extent (iw-eez-extent), this reflects where vessels *actually* fished,
so it shows the real spread of timezones inside each international-waters code.

The key finding this surfaces: `IW` is a global catch-all covering ~19 distinct
nautical timezones, so a single fallback offset for it (or for the dateline-
straddling pockets H4/H5/I4/I6/I7) is meaningless.

Output columns:
  eez_code         -- international-waters code
  ez_desc          -- description from ref.eez_definitions
  nautical_offset  -- round(longitude / 15), clipped to +-14 h
  count            -- number of longline logsheet sets
"""

import sys

import pandas as pd
import pyodbc

from db import ANALYSIS_START_DATE, CONNECTION_STRING

IW_CODES = ["H4", "H5", "IW", "I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9"]

SQL = f"""
SELECT
    sl.eez_code,
    d.ez_desc,
    ROUND(CAST(sl.lond AS FLOAT) / 15.0, 0) AS nautical_offset,
    COUNT(*) AS [count]
FROM log.sets_ll sl
INNER JOIN ref.eez_definitions d
        ON d.eez_code = sl.eez_code AND d.eez_source_no = 2
WHERE sl.l_activity_id = 1
  AND sl.eez_code IN ({",".join("'" + c + "'" for c in IW_CODES)})
  AND sl.lond IS NOT NULL
  AND sl.lond BETWEEN -180 AND 180
  AND sl.logdate >= '{ANALYSIS_START_DATE}'
GROUP BY sl.eez_code, d.ez_desc, ROUND(CAST(sl.lond AS FLOAT) / 15.0, 0)
ORDER BY sl.eez_code, ROUND(CAST(sl.lond AS FLOAT) / 15.0, 0)
"""


def main() -> None:
    conn = pyodbc.connect(CONNECTION_STRING)
    df = pd.read_sql(SQL, conn)
    conn.close()

    df["eez_code"] = df["eez_code"].astype(str).str.strip()
    df["ez_desc"] = df["ez_desc"].astype(str).str.strip()
    df["nautical_offset"] = df["nautical_offset"].astype(int)
    df["count"] = df["count"].astype(int)
    df = df[df["nautical_offset"].abs() <= 14]

    print(
        f"{df['count'].sum():,} IW logsheet sets across "
        f"{df['eez_code'].nunique()} codes and "
        f"{df['nautical_offset'].nunique()} distinct timezones",
        file=sys.stderr,
    )

    df.to_csv(sys.stdout, index=False, lineterminator="\n")


if __name__ == "__main__":
    main()
