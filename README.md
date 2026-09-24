# floJAY

A single HTML file that combines FlowJo table exports, rebuilds the panel tabs
(Cytokines, Phenotype-ALL, or any set you define), subtracts a baseline, floors
tiny values, and writes a tidy long-format table. Everything runs inside the
browser; no data leaves your computer and no internet is needed.

## Use it

1. Open https://semiquant.github.io/floJAY/ or double-click `floJAY.html` (Chrome, Edge, Firefox or Safari).
2. Drop your FlowJo `.xlsx` exports onto the page. Only the `Table` sheet of
   each file is read. `Mean`, `SD` and blank rows are dropped.
3. Check the sample-name template. Default: `{PID} - {TIMEPOINT}_{ANTIGEN}`.
   Each `{NAME}` becomes a column in the output.
4. Pick the column sets. Each set is a tickable list of the columns found in
   your files (filter it, tick or untick all shown, or show ticked only).
   Presets: **Paul selection 1** (Cytokines + Phenotype-ALL, the default) and
   **Select all** (every column as one sheet). Under *Advanced* each set can
   also be edited as text, one selector per line: `gate/path | Statistic`.
   The gate part only needs the end of the gating path (e.g. `CD4+/GMCSF+`),
   the statistic only its start (`Freq. of Parent`). `*` is a wildcard; leave
   out `| Statistic` to take every statistic; `#` starts a comment.
5. Set the processing options (baseline subtraction, floor, NA).
6. Download the combined `.xlsx` or a single sheet as `.csv`.

Settings are remembered in the browser. Use *Export settings* to share them.

## Output sheets

| Sheet | Content |
|---|---|
| `Table` | All samples from all files, all columns, plus `sample_id`, the template fields and `source_file`. |
| one per set (e.g. `Cytokines`) | The columns matched by that set. |
| `<set>_minus<baseline>` | Same columns minus the baseline row (only statistics matching the filter, default `Freq.`; baseline rows dropped). |
| `Long` | One row per sample x column: `sample_id`, `pid`, `timepoint`, `antigen`, `source_file`, `panel`, `population`, `gate`, `statistic`, `column`, `value`, `value_minus_bl`. |
| `Log` | What was done: files, rows dropped, selectors, settings, warnings. |

Missing values are written as `NA`. Values below the floor (default 0.0001)
are set to the floor after subtraction, so negative differences become 0.0001.

## Develop

```
python3 build.py          # inlines vendor/xlsx.full.min.js + src/core.js into floJAY.html
node test/test_core.mjs   # runs the tests against the two example workbooks (not in the repo; place them in the project root)
```

`src/core.js` holds all data logic (no DOM) and `src/app.html` the UI. Styling comes from `assets/report-extras.css` (SemiQuant palette) and the logo `assets/sq.png`; both are inlined by `build.py`.
