# CLAUDE.md

## What this is

An **Observable Framework** data app that analyses fisheries **logsheet datetimes** to resolve
their UTC ambiguity: a recorded date/time may be in **vessel (local) time** or **UTC**, and the
value alone can't tell you which. The app (1) decides the clock per gear type (purse-seine times
are already UTC → offset 0; longline times are vessel time) and (2) estimates the longline UTC
offset by training a scikit-learn decision tree on observer records (where both clocks are known)
keyed on `vessel_flag × EEZ × departure_port`. Output is a set of Markdown pages + a downloadable
`flag × eez → offset` rules table. See `src/index.md` for the full method.

## Setup / run / build

This is a Node/Observable app **plus** Python data loaders — you need both toolchains.

```bash
npm install                          # JS deps (Observable Framework, odbc, d3-dsv, suncalc, geo-tz)
pip install -r requirements.txt      # Python deps for .py data loaders (pandas, pyodbc, scikit-learn, timezonefinder)

npm run dev      # local preview at http://localhost:3000 (runs data loaders live)
npm run build    # build static site to ./dist
npm run clean    # clear data-loader cache (src/.observablehq/cache)
npm run http     # serve the built ./dist locally
```

There are **no tests and no lint** commands.

The root `package.json` is the real project manifest (Observable app); it is not just tooling.
`node >= 18` required. Python must be **3.12 with pandas/pyodbc/scikit-learn installed** — the
`.py` interpreter is pinned to `python` in `observablehq.config.js` (`interpreters` block), so make
sure the `python` on PATH is that interpreter.

## Architecture (file-based routing)

- `src/*.md` — pages (one per nav entry in `observablehq.config.js`); embed reactive JS in fenced
  `js` blocks, load data with `FileAttachment(...)`, plot with `npm:@observablehq/plot` / `npm:d3`.
- `src/data/*.csv.js` and `src/data/*.csv.py` — **data loaders**. Each runs at build/preview time
  and writes CSV to **stdout**, which becomes the served data file. JS loaders use the `odbc`
  package; Python loaders use `pyodbc`.
- `src/data/db.js` / `src/data/db.py` — the **shared connection string** (mirrored in both langs)
  and `ANALYSIS_START_DATE = "2017-01-01"` (earliest date in every query). Loaders import from these.
- `src/components/offset-charts.js` — shared ES module imported by pages.
- `decision-tree-rules.csv.py` is the modelling core: SQL → pandas → `DecisionTreeClassifier` →
  three-level fallback (`port` override → `eez` tree rule → `flag_fallback`), min 30 samples/cell.

## Data source & gotchas

- Loaders query a **local SQL Server** (`Server=.`, database `tufman2`) over the **ODBC Driver 17**
  via Windows auth (`Trusted_Connection`), read-only. This is the SPC network — **loaders only run
  on a machine with that ODBC/DB access**, so builds cannot run in CI.
- Because of that, deployment ships the **pre-built `./dist`**: run `npm run build` locally, commit
  the changed `./dist`, push to `master`; `.github/workflows/deploy.yml` publishes `dist` to GitHub
  Pages. `./dist` is intentionally versioned (not gitignored).
- All analyses are scoped to `logdate >= ANALYSIS_START_DATE`; change it in **both** `db.js` and
  `db.py` to keep JS and Python loaders consistent.
