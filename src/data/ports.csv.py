"""Data loader: ports.csv.py

Every Tufman port with known coordinates, resolved to its civil IANA time zone
and *standard* (non-DST) UTC offset.

== Why civil, not nautical? ==
A departure port matters because a captain may keep the departure-port clock for
the whole trip instead of adjusting to local (vessel) time. The clock a port
keeps is its **civil** time zone (e.g. Pacific/Auckland), which is not always the
nautical longitude/15 value. We therefore look up the IANA zone from the port's
latitude/longitude (`timezonefinder`) and read its base offset from `zoneinfo`.

The reported `utc_offset` is the STANDARD-time offset (`utcoffset − dst`), so it
is stable year-round; `has_dst` flags zones that also observe daylight saving.

Coordinates come from the decimal `latd`/`lond` columns when present, otherwise
they are parsed from the Tufman-format `port_lat`/`port_lon` strings
(e.g. `4047N`, `12412W`).

Output columns:
  port_id, port_name, country_code, location_code,
  lat, lon,                 -- decimal degrees actually used
  iana_zone,                -- IANA time-zone name (blank if unresolved)
  utc_offset,               -- standard civil offset in hours (blank if unresolved)
  has_dst                   -- 1 if the zone observes DST, else 0
"""

import csv
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import pyodbc
from timezonefinder import TimezoneFinder

from db import CONNECTION_STRING

# Two probe dates six months apart to detect DST regardless of hemisphere.
PROBE_DATES = [datetime(2024, 1, 15), datetime(2024, 7, 15)]

SQL = """
SELECT port_id, port_name, country_code, location_code,
       port_lat, port_lon, latd, lond
FROM ref.ports
WHERE active = 1
   OR (port_lat IS NOT NULL AND port_lon IS NOT NULL)
   OR (latd IS NOT NULL AND lond IS NOT NULL)
"""


def parse_tufman(value: str, is_lat: bool) -> "float | None":
    """Parse a Tufman coordinate string like '4047N' / '12412W' to decimal.

    The last character is a hemisphere letter; the two digits before it are
    minutes; everything before that is degrees.
    """
    if not value:
        return None
    v = value.strip().upper()
    if not v:
        return None
    hemi = v[-1]
    digits = v[:-1].strip()
    if hemi not in "NSEW" or not digits.isdigit():
        return None
    if len(digits) < 3:
        return None
    degrees = int(digits[:-2])
    minutes = int(digits[-2:])
    dec = degrees + minutes / 60.0
    if hemi in ("S", "W"):
        dec = -dec
    return dec


def coordinates(row) -> "tuple[float, float] | None":
    """Return (lat, lon) decimal degrees for a port row, or None if unavailable."""
    if row.latd is not None and row.lond is not None:
        lat, lon = float(row.latd), float(row.lond)
    else:
        lat = parse_tufman(row.port_lat, is_lat=True)
        lon = parse_tufman(row.port_lon, is_lat=False)
        if lat is None or lon is None:
            return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


def zone_offset(zone: str) -> "tuple[float, bool]":
    """Return (standard_offset_hours, has_dst) for an IANA zone name."""
    tz = ZoneInfo(zone)
    std_offset = None
    has_dst = False
    for probe in PROBE_DATES:
        dt = probe.replace(tzinfo=tz)
        off = dt.utcoffset()
        dst = dt.dst()
        if dst and dst.total_seconds() != 0:
            has_dst = True
        std = (off - dst).total_seconds() / 3600.0
        std_offset = std  # std is identical across probes for a given zone
    return std_offset, has_dst


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", newline="")
    conn = pyodbc.connect(CONNECTION_STRING)
    cur = conn.cursor()
    cur.execute(SQL)
    rows = cur.fetchall()
    conn.close()

    tf = TimezoneFinder()
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(
        ["port_id", "port_name", "country_code", "location_code",
         "lat", "lon", "iana_zone", "utc_offset", "has_dst"]
    )

    n_written = n_zoned = 0
    for row in rows:
        coords = coordinates(row)
        if coords is None:
            continue
        lat, lon = coords
        zone = tf.timezone_at(lat=lat, lng=lon)
        iana = zone or ""
        offset_str, dst_flag = "", ""
        if zone:
            try:
                offset, has_dst = zone_offset(zone)
                offset_str = f"{offset:g}"
                dst_flag = "1" if has_dst else "0"
                n_zoned += 1
            except Exception as exc:  # pragma: no cover - defensive
                print(f"zone error for {zone}: {exc}", file=sys.stderr)
        writer.writerow([
            str(row.port_id).strip(),
            (row.port_name or "").strip(),
            (row.country_code or "").strip(),
            (row.location_code or "").strip(),
            f"{lat:.4f}", f"{lon:.4f}", iana, offset_str, dst_flag,
        ])
        n_written += 1

    print(f"{n_written} ports with coordinates, {n_zoned} resolved to a time zone",
          file=sys.stderr)


if __name__ == "__main__":
    main()
