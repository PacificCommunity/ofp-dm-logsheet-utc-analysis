# Tufman2 database changelog — UTC offset migration

**Audience:** anyone using the Tufman2 Database

**Applies to:** The `log` and `vms` schemas

---

## 1. Read this first

Dates and times used to be stored as two columns: a `datetime` holding the date, with the time of day always midnight,
and a separate `char(4)` column holding the time as `HHmm`.

They are now stored as one `datetimeoffset(0)` column carrying the date, the time of day and the UTC offset together.

---

## 2. What changed

### 2.1 Trip tables

Applies to **`trips_ll`, `trips_pl`, `trips_ps`, `trips_hl`, `trips_ds`, `trips_vn`**:

| Column        | Was        | Now                  | Note                                   |
|---------------|------------|----------------------|----------------------------------------|
| `depart_date` | `datetime` | `datetimeoffset(0)`  | now carries time of day + offset       |
| `return_date` | `datetime` | `datetimeoffset(0)`  | now carries time of day + offset       |
| `depart_time` | `char(4)`  | **dropped**          | folded into `depart_date`              |
| `return_time` | `char(4)`  | **dropped**          | folded into `return_date`              |
| `utc_origin`  | –          | `smallint` **added** | see [§3](#3-the-new-utc_origin-column) |

### 2.2 Activity tables

Applies to **`sets_ll`, `sets_pl`, `sets_ps`, `sets_hl`, `sets_ds`, `sets_vn`**:

| Column     | Was        | Now                 | Note                                                    |
|------------|------------|---------------------|---------------------------------------------------------|
| `logdate`  | `datetime` | `datetimeoffset(0)` | now carries time of day + offset                        |
| `set_time` | `char(4)`  | **dropped**         | folded into `logdate`. `sets_pl` never had this column. |

`sets_ll` also drops `log_datetime_utc` (`datetime`) — replace with `SWITCHOFFSET(logdate, 0)`.

### 2.3 Purse-seine child tables

| Table                | Column         | Was        | Now                 |
|----------------------|----------------|------------|---------------------|
| `transshipments`     | `start_date`   | `datetime` | `datetimeoffset(0)` |
| `transshipments`     | `end_date`     | `datetime` | `datetimeoffset(0)` |
| `transshipments`     | `start_time`   | `char(4)`  | **dropped**         |
| `transshipments`     | `end_time`     | `char(4)`  | **dropped**         |
| `net_share_receives` | `receive_date` | `datetime` | `datetimeoffset(0)` |
| `net_share_receives` | `receive_time` | `char(4)`  | **dropped**         |

### 2.4 VMS tables

Applies to **`vms_trips`, `vms_non_fishing_period`, `vms_trips_import`** (all in the `vms` schema):

| Table                    | Column            | Was        | Now                 |
|--------------------------|-------------------|------------|---------------------|
| `vms_trips`              | `departure_date`  | `datetime` | `datetimeoffset(0)` |
| `vms_trips`              | `return_date`     | `datetime` | `datetimeoffset(0)` |
| `vms_non_fishing_period` | `start_date_time` | `datetime` | `datetimeoffset(0)` |
| `vms_non_fishing_period` | `end_date_time`   | `datetime` | `datetimeoffset(0)` |
| `vms_trips_import`       | `departure_date`  | `datetime` | `datetimeoffset(0)` |
| `vms_trips_import`       | `return_date`     | `datetime` | `datetimeoffset(0)` |

VMS data is inherently UTC, so every value carries a `+00:00` offset that is already correct.

---

## 3. The new `utc_origin` column

`utc_origin` records where the stored offset came from.

| Value | Name               | Meaning                                                               |
|-------|--------------------|-----------------------------------------------------------------------|
| `0`   | None               | Offset not calculated yet. Stored as `+00:00`. Do not convert to UTC. |
| `1`   | EReporting         | Offset supplied by the e-reporting source.                            |
| `2`   | LinkedObserverTrip | Offset queried from a linked observer trip.                           |
| `3`   | Coordinates        | Offset calculated from the activity's latitude/longitude.             |
| `4`   | OriginalValueInUtc | The original data was already recorded in UTC.                        |
| `5`   | DecisionTreeV1     | Offset queried from a decision tree, trained from observer data.      |

**The migration alone leaves almost everything at `0`.** Offsets will be populated afterward by separate backfill jobs,
or when the trip is saved trough Tufman2. Until those have run, rows sit at `utc_origin = 0`
with a `+00:00` placeholder.

---

## 4. Rewrite recipes

| What you want          | Old                       | New                                      |
|------------------------|---------------------------|------------------------------------------|
| Time of day as `HH:mm` | `a.set_time`              | `format(a.logdate, 'HH:mm')`             |
| Local calendar date    | `CONVERT(date, logdate)`  | `convert(date,sll.logdate)`              |
| Full local timestamp   | `logdate` + `set_time`    | `CONVERT(datetime, logdate)`             |
| The UTC instant        | `log_datetime_utc`        | `SWITCHOFFSET(logdate, 0)`               |
| Filter by local date   | `logdate >= '2024-01-01'` | `CONVERT(date, logdate) >= '2024-01-01'` |

### Query example

```sql
select top 1 sll.logdate,
             convert(date, sll.logdate)     date,
             convert(datetime, sll.logdate) datetime,
             format(sll.logdate, 'HH:mm')   time,
             switchoffset(sll.logdate, 0)   UTC
from log.trips_ll ll
       left join log.sets_ll sll on ll.log_trip_id = sll.log_trip_id
where ll.utc_origin > 0;
```

| logdate                    | date       | datetime                | time  | UTC                        |
|----------------------------|------------|-------------------------|-------|----------------------------|
| 2025-11-04 07:24:00 -10:00 | 2025-11-04 | 2025-11-04 07:24:00.000 | 07:24 | 2025-11-04 17:24:00 +00:00 |

### 4.1 The string-literal trap

Comparing a `datetimeoffset` column against a bare string literal makes SQL Server interpret the literal at **
`+00:00`**. Your filter is then evaluated against the UTC instant, not the local date that was actually written down:

```sql
-- these do not return the same rows once offsets are populated
SELECT COUNT(*)
FROM log.sets_ll
WHERE logdate >= '2024-01-01';
SELECT COUNT(*)
FROM log.sets_ll
WHERE CONVERT(date, logdate) >= '2024-01-01';
```

Use `CONVERT(date, logdate)` when you mean the local calendar date.
