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

| Column     | Was        | Now                 | Note                             |
|------------|------------|---------------------|----------------------------------|
| `logdate`  | `datetime` | `datetimeoffset(0)` | now carries time of day + offset |
| `set_time` | `char(4)`  | **dropped**         | folded into `logdate`.           |

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

## 4. Database migration and logsheet backfilling

- A database migration will be executed first, it will update the existing tables with the new columns and delete the
  old ones. A default UTC offset of 0 will be attributed.
- The logsheet backfilling will be done through a Tufman2 scheduled task ran overnight. Each existing logsheet will have
  utc offsets calculated from different strategies, described in the utc_origin section.
- Any logsheet saved through the Tufman2 API will have its UTC offset calculated, if not already done via the
  backfilling job.

---

## 5. Conversions

How to rewrite existing queries, using `log.sets_ll` as the example. All the snippets below use the same sample row —
before the migration it was stored as `logdate = 2025-11-04 00:00:00` plus `set_time = '0724'`, and it is now stored as:

```
logdate = 2025-11-04 07:24:00 -10:00
```

### Quick reference

| You need             | Before the migration   | Now                          | Result for the sample row    |
|----------------------|------------------------|------------------------------|------------------------------|
| Time of day (`HHmm`) | `set_time`             | `format(logdate, 'HHmm')`    | `0724`                       |
| Local calendar date  | `logdate`              | `convert(date, logdate)`     | `2025-11-04`                 |
| Local date and time  | `logdate` + `set_time` | `convert(datetime, logdate)` | `2025-11-04 07:24:00`        |
| UTC instant          | `log_datetime_utc`     | `switchoffset(logdate, 0)`   | `2025-11-04 17:24:00 +00:00` |

---

## 6. The string-literal trap

Comparing a `datetimeoffset` column against a bare string literal makes SQL Server interpret the literal at **`+00:00`**,
and `datetimeoffset` values compare as **UTC instants**. Your filter is then evaluated against the UTC instant, not the
local date that was actually written down.

Take two logsheets on either side of new year 2024:

```sql
declare @sets table (set_id int, logdate datetimeoffset(0));
insert @sets values
    (1, '2023-12-31 21:00:00 -11:00'),  -- a 2023 logsheet
    (2, '2024-01-01 06:30:00 +13:00');  -- a 2024 logsheet
```

Filtering with a bare literal returns the **2023** logsheet (its UTC instant is `2024-01-01 08:00`):

```sql
  select set_id from @sets where logdate >= '2024-01-01';
-- returns: 1
```

Filtering on the local calendar date returns the **2024** logsheet:

```sql
select set_id from @sets where convert(date, logdate) >= '2024-01-01';
-- returns: 2
```

Use `convert(date, logdate)` whenever you mean the local calendar date.
