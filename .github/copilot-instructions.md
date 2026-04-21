# Copilot Instructions

## Project overview

This is an [Observable Framework](https://observablehq.com/framework/) data app for analysing logsheet UTC data. It produces a static site from Markdown pages with embedded JavaScript.

## Commands

```bash
npm run dev       # Start local preview server at http://localhost:3000
npm run build     # Build static site to ./dist
npm run clean     # Clear the data loader cache (src/.observablehq/cache)
npm run deploy    # Deploy to Observable
```

There is no test or lint command.

## Architecture

Observable Framework uses **file-based routing**: each `.md` file under `src/` becomes a page. The home page is `src/index.md`.

- **`src/*.md`** — pages; embed JavaScript in fenced `js` code blocks; reactive cells re-run automatically when dependencies change
- **`src/components/`** — shared ES modules imported by pages via `import { … } from "./components/foo.js"`
- **`src/data/`** — data loaders (e.g. `foo.csv.js`) and static data files; loaders are run at build/preview time and their stdout is served as the data file
- **`observablehq.config.js`** — app title, sidebar navigation, theme, head HTML
- **`src/.observablehq/cache/`** — generated cache, not committed (listed in `src/.gitignore`)

## Key conventions

- Pages use YAML front matter for per-page settings (`theme`, `title`, `toc`). The home page uses `theme: air`.
- Data loaders are named `<filename>.<extension>.js` (or `.py`, `.sh`, etc.) and must write their output to stdout.
- JavaScript inside Markdown pages runs in Observable's reactive runtime — cells are not plain scripts; top-level `const`/`let` declarations are reactive cells.
- Import Observable Plot and D3 directly from npm inside pages: `import * as Plot from "npm:@observablehq/plot"`, `import * as d3 from "npm:d3"`.
- Node.js ≥ 18 is required.
