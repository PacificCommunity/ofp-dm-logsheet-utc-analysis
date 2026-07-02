"""Data loader: iw-eez-extent.csv.py

Geographic extent of each *international-waters* EEZ polygon, plus the distinct
nautical timezones (round(longitude / 15)) its area spans.

== Context ==
Tufman resolves an activity's EEZ with the SQL function
`tufman2.GetEezCodeFromLatAndLon`, which intersects a GEOGRAPHY point against the
`ref.eez_definitions` polygons (`eez_source_no = 2`) and defaults to `'IW'` when
no polygon matches. The 12 "international waters" codes
(`CommonGlobals.InternationalWatersEezs`) are H4, H5, IW and I1-I9.

This loader dumps every ring vertex of each IW polygon and reports:
  - the longitude extent (Pacific-centred, i.e. continuous across the 180deg
    dateline, so a strip like 179.5-184.4 reads as one span rather than wrapping)
  - the distinct nautical timezone bands the polygon covers, computed on the
    *normalised* longitude (-180..180) so the timezone numbers are physically
    meaningful.

`IW` itself is a multipolygon, handled via STGeometryN.

Output columns:
  eez_code      -- international-waters code
  ez_desc       -- description from ref.eez_definitions
  n_vertices    -- ring vertices sampled
  min_lon       -- min longitude (Pacific-centred degrees)
  max_lon       -- max longitude (Pacific-centred degrees)
  n_timezones   -- count of distinct nautical timezones spanned
  tz_bands      -- pipe-separated list of nautical timezones (e.g. "-11|-10|-9")
"""

import csv
import sys

import pyodbc

from db import CONNECTION_STRING

IW_CODES = ["H4", "H5", "IW", "I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9"]


def normalise_lon(lon: float) -> float:
    """Fold a Pacific-centred longitude back into the -180..180 range."""
    return ((lon + 180.0) % 360.0) - 180.0


def nautical_tz(lon: float) -> int:
    """Nautical timezone offset from a longitude: round(normalised_lon / 15)."""
    return round(normalise_lon(lon) / 15.0)


def polygon_longitudes(cur: "pyodbc.Cursor", code: str) -> list[float]:
    """Return every ring-vertex longitude of an IW polygon (multipolygon aware).

    `IW` has a NULL geometry (it is the default "outside WCPFC area" fallback,
    not a real polygon), so this returns an empty list for it.
    """
    cur.execute(
        "SELECT ez_area.STNumPoints() AS np, ez_area.STNumGeometries() AS ng "
        "FROM ref.eez_definitions WHERE eez_source_no = 2 AND eez_code = ?",
        code,
    )
    row = cur.fetchone()
    np_total, ng = row.np, row.ng

    # A numbers source large enough for polygons with tens of thousands of
    # vertices (sys.all_objects alone caps at a few thousand rows).
    numbers = "sys.all_objects a CROSS JOIN sys.all_objects b"

    if np_total:  # single polygon
        cur.execute(
            f"""
            WITH n AS (
                SELECT TOP ({np_total}) ROW_NUMBER() OVER (ORDER BY (SELECT 1)) AS i
                FROM {numbers}
            )
            SELECT e.ez_area.STPointN(n.i).Long AS lon
            FROM ref.eez_definitions e CROSS JOIN n
            WHERE e.eez_source_no = 2 AND e.eez_code = ?
            """,
            code,
        )
        return [r.lon for r in cur.fetchall() if r.lon is not None]

    # multipolygon: walk each sub-geometry
    lons: list[float] = []
    for gi in range(1, (ng or 0) + 1):
        cur.execute(
            "SELECT ez_area.STGeometryN(?).STNumPoints() AS np "
            "FROM ref.eez_definitions WHERE eez_source_no = 2 AND eez_code = ?",
            gi,
            code,
        )
        gnp = cur.fetchone().np or 0
        if not gnp:
            continue
        cur.execute(
            f"""
            WITH n AS (
                SELECT TOP ({gnp}) ROW_NUMBER() OVER (ORDER BY (SELECT 1)) AS i
                FROM {numbers}
            )
            SELECT e.ez_area.STGeometryN(?).STPointN(n.i).Long AS lon
            FROM ref.eez_definitions e CROSS JOIN n
            WHERE e.eez_source_no = 2 AND e.eez_code = ?
            """,
            gi,
            code,
        )
        lons += [r.lon for r in cur.fetchall() if r.lon is not None]
    return lons


def main() -> None:
    conn = pyodbc.connect(CONNECTION_STRING)
    cur = conn.cursor()

    descriptions: dict[str, str] = {}
    cur.execute(
        "SELECT eez_code, ez_desc FROM ref.eez_definitions "
        "WHERE eez_source_no = 2 AND eez_code IN ({})".format(
            ",".join("?" for _ in IW_CODES)
        ),
        *IW_CODES,
    )
    for r in cur.fetchall():
        descriptions[r.eez_code.strip()] = (r.ez_desc or "").strip()

    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(
        ["eez_code", "ez_desc", "n_vertices", "min_lon", "max_lon", "n_timezones", "tz_bands"]
    )

    for code in IW_CODES:
        lons = polygon_longitudes(cur, code)
        if not lons:
            # IW has no polygon: it is the default for any point outside every
            # other EEZ, so its footprint is effectively global.
            writer.writerow(
                [code, descriptions.get(code, ""), 0, "", "", "", "global (no polygon - default fallback)"]
            )
            print(f"{code}: no polygon (global default)", file=sys.stderr)
            continue
        tz = sorted({nautical_tz(l) for l in lons})
        writer.writerow(
            [
                code,
                descriptions.get(code, ""),
                len(lons),
                f"{min(lons):.2f}",
                f"{max(lons):.2f}",
                len(tz),
                "|".join(str(t) for t in tz),
            ]
        )
        print(f"{code}: {len(lons)} vertices, {len(tz)} timezones", file=sys.stderr)

    conn.close()


if __name__ == "__main__":
    main()
