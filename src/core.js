/* floJAY: pure data logic. No DOM, no SheetJS.
 * Works in the browser (globalThis.FloJayCore) and node (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FloJayCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NA = 'NA';

  const DEFAULT_SETS = [
    { name: 'Cytokines', lines: [
      'CD4+/GMCSF+ | Freq. of Parent (%)',
      'CD4+/IFN-g+ | Freq. of Parent (%)',
      'CD4+/IL-17+ | Freq. of Parent (%)',
      'CD4+/TNF-a | Freq. of Parent (%)',
      'CD4+/Q2: IFN-g+ , TNF-a+ | Freq. of Parent (%)',
      'CD4+/Q10: GMCSF+ , TNF-a+ | Freq. of Parent (%)',
      'CD4+/Q14: IL-17+ , IFN-g+ | Freq. of Parent (%)',
      'CD4+/Q6: IL-17+ , TNF-a+ | Freq. of Parent (%)',
    ].join('\n') },
    { name: 'Phenotype-ALL', lines: [
      'CD4+/Naive | Freq. of Parent (%)',
      'CD4+/Naive/Q1: CD27- , CD95+ | Freq. of CD4+ (%)',
      'CD4+/Naive/T_Naive | Freq. of CD4+ (%)',
      'CD4+/Naive/TSCM | Freq. of CD4+ (%)',
      'CD4+/Naive/Q4: CD27- , CD95- | Freq. of CD4+ (%)',
      'CD4+/CM | Freq. of Parent (%)',
      'CD4+/EM | Freq. of Parent (%)',
      'CD4+/TEMRA | Freq. of Parent (%)',
      'CD4+/GMCSF+ | Freq. of Parent (%)',
      'CD4+/GMCSF+ | Count',
      'GMCSF+/Naive | Freq. of Parent (%)',
      'Naive/Q1: CD27- , CD95+ | Freq. of GMCSF+ (%)',
      'Naive/T_Naive | Freq. of GMCSF+ (%)',
      'Naive/TSCM | Freq. of GMCSF+ (%)',
      'Naive/Q4: CD27- , CD95- | Freq. of GMCSF+ (%)',
      'GMCSF+/CM | Freq. of Parent (%)',
      'GMCSF+/EM | Freq. of Parent (%)',
      'GMCSF+/TEMRA | Freq. of Parent (%)',
      'CD4+/IFN-g+ | Freq. of Parent (%)',
      'CD4+/IFN-g+ | Count',
      'IFN-g+/Naive | Freq. of Parent (%)',
      'Naive/Q1: CD27- , CD95+ | Freq. of IFN-g+ (%)',
      'Naive/T_Naive | Freq. of IFN-g+ (%)',
      'Naive/TSCM | Freq. of IFN-g+ (%)',
      'Naive/Q4: CD27- , CD95- | Freq. of IFN-g+ (%)',
      'IFN-g+/CM | Freq. of Parent (%)',
      'IFN-g+/EM | Freq. of Parent (%)',
      'IFN-g+/TEMRA | Freq. of Parent (%)',
      'CD4+/IL-17+ | Freq. of Parent (%)',
      'CD4+/IL-17+ | Count',
      'IL-17+/Naive | Freq. of Parent (%)',
      'Naive/Q1: CD27- , CD95+ | Freq. of IL-17+ (%)',
      'Naive/T_Naive | Freq. of IL-17+ (%)',
      'Naive/TSCM | Freq. of IL-17+ (%)',
      'Naive/Q4: CD27- , CD95- | Freq. of IL-17+ (%)',
      'IL-17+/CM | Freq. of Parent (%)',
      'IL-17+/EM | Freq. of Parent (%)',
      'IL-17+/TEMRA | Freq. of Parent (%)',
      'CD4+/TNF-a | Freq. of Parent (%)',
      'CD4+/TNF-a | Count',
      'TNF-a/Naive | Freq. of Parent (%)',
      'Naive/Q1: CD27- , CD95+ | Freq. of TNF-a (%)',
      'Naive/T_Naive | Freq. of TNF-a (%)',
      'Naive/TSCM | Freq. of TNF-a (%)',
      'Naive/Q4: CD27- , CD95- | Freq. of TNF-a (%)',
      'TNF-a/CM | Freq. of Parent (%)',
      'TNF-a/EM | Freq. of Parent (%)',
      'TNF-a/TEMRA | Freq. of Parent (%)',
    ].join('\n') },
  ];

  // Named presets: each is a full list of column sets.
  const PRESETS = {
    'Paul selection 1': DEFAULT_SETS,
    'Select all': [{ name: 'All columns', lines: '# every column found in the data\n*' }],
  };

  function defaultConfig() {
    return {
      template: '{PID} - {TIMEPOINT}_{ANTIGEN}',
      useRegex: false,
      regex: '^\\s*(?<PID>.+?)\\s*-\\s*(?<TIMEPOINT>.+?)_(?<ANTIGEN>.+?)\\s*$',
      sets: DEFAULT_SETS.map(s => ({ name: s.name, lines: s.lines })),
      baseline: { enabled: true, field: 'TIMEPOINT', value: 'BL', dropBaselineRows: true },
      statFilter: 'Freq.',
      floor: { enabled: true, threshold: 0.0001 },
      long: { allColumns: false },
    };
  }

  // ---------- sample-name parsing ----------

  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }

  // "{PID} - {TIMEPOINT}_{ANTIGEN}" -> regex with named groups; whitespace in literals is flexible.
  function compileTemplate(template) {
    const fields = [];
    let out = '^\\s*';
    const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
    let last = 0, m;
    while ((m = re.exec(template)) !== null) {
      out += literalToRegex(template.slice(last, m.index));
      if (fields.includes(m[1])) throw new Error('Placeholder {' + m[1] + '} used twice');
      fields.push(m[1]);
      out += '(?<' + m[1] + '>.+?)';
      last = re.lastIndex;
    }
    out += literalToRegex(template.slice(last)) + '\\s*$';
    if (!fields.length) throw new Error('Template needs at least one {PLACEHOLDER}');
    return { regex: new RegExp(out), fields, source: out };
  }

  function literalToRegex(lit) {
    return lit.split(/\s+/).map(escapeRegex).join('\\s*');
  }

  function compileRegex(str) {
    const regex = new RegExp(str);
    const fields = [];
    const g = /\(\?<([A-Za-z_][A-Za-z0-9_]*)>/g;
    let m;
    while ((m = g.exec(str)) !== null) fields.push(m[1]);
    if (!fields.length) throw new Error('Regex needs at least one named group like (?<PID>...)');
    return { regex, fields, source: str };
  }

  function compileNamePattern(config) {
    return config.useRegex ? compileRegex(config.regex) : compileTemplate(config.template);
  }

  function parseSampleName(name, compiled) {
    if (name === null || name === undefined) return { ok: false, fields: null };
    const s = String(name).trim();
    if (!s) return { ok: false, fields: null };
    const m = compiled.regex.exec(s);
    if (!m) return { ok: false, fields: null };
    const fields = {};
    for (const f of compiled.fields) fields[f] = (m.groups[f] || '').trim();
    return { ok: true, fields };
  }

  // ---------- headers and shorthand ----------

  function parseHeader(h) {
    const s = String(h);
    const i = s.lastIndexOf(' | ');
    const path = i >= 0 ? s.slice(0, i) : s;
    const stat = i >= 0 ? s.slice(i + 3) : '';
    const segments = path.split('/');
    return { header: s, path, segments, gate: segments[segments.length - 1], stat };
  }

  function globToRegex(glob) {
    return new RegExp('^' + glob.split('*').map(escapeRegex).join('.*') + '$', 'i');
  }

  // One selector line against parsed headers. Returns array of header indexes.
  function matchSelector(line, parsed) {
    const sel = line.trim();
    if (!sel || sel.startsWith('#')) return [];
    // exact full header
    const exact = parsed.map((p, i) => (p.header === sel ? i : -1)).filter(i => i >= 0);
    if (exact.length) return exact;

    const bar = sel.lastIndexOf(' | ');
    const gatePart = (bar >= 0 ? sel.slice(0, bar) : sel).trim();
    const statPart = bar >= 0 ? sel.slice(bar + 3).trim() : null;
    const gateSegs = gatePart.split('/').map(s => s.trim());
    const segRes = gateSegs.map(globToRegex);
    const statRe = statPart === null ? null
      : (statPart.includes('*') ? globToRegex(statPart) : new RegExp('^' + escapeRegex(statPart), 'i'));

    const out = [];
    parsed.forEach((p, i) => {
      if (gateSegs.length > p.segments.length) return;
      const tail = p.segments.slice(p.segments.length - gateSegs.length);
      for (let k = 0; k < gateSegs.length; k++) if (!segRes[k].test(tail[k])) return;
      if (statRe && !statRe.test(p.stat)) return;
      out.push(i);
    });
    return out;
  }

  function resolveSelectors(text, headers) {
    const parsed = headers.map(parseHeader);
    const lines = String(text || '').split(/\r?\n/);
    const seen = new Set();
    const columns = [];
    const perLine = lines.map(line => {
      const idx = matchSelector(line, parsed);
      const matches = idx.map(i => headers[i]);
      for (const i of idx) if (!seen.has(i)) { seen.add(i); columns.push(headers[i]); }
      const isComment = !line.trim() || line.trim().startsWith('#');
      return { line, matches, isComment };
    });
    return { columns, perLine };
  }

  // Shortest unique suffix (>= 2 segments when available) that identifies header among all headers.
  function shorthandFor(header, allHeaders) {
    const p = parseHeader(header);
    const all = allHeaders.map(parseHeader);
    const n = p.segments.length;
    for (let k = Math.min(2, n); k <= n; k++) {
      const suf = p.segments.slice(n - k);
      const hits = all.filter(q => q.stat === p.stat && q.segments.length >= k &&
        q.segments.slice(q.segments.length - k).every((s, j) => s === suf[j]));
      if (hits.length === 1) return suf.join('/') + (p.stat ? ' | ' + p.stat : '');
    }
    return header;
  }

  // Tick/untick columns in a shorthand list. Returns the new text.
  // on: append a shorthand line per newly ticked column ('*' when every column ends up ticked).
  // off: lines that hit an unticked column are replaced by explicit lines for their other matches.
  function toggleColumns(lines, hs, on, headers) {
    const want = new Set(hs);
    const parsed = headers.map(parseHeader);
    const current = new Set(resolveSelectors(lines, headers).columns);
    if (on) {
      const add = headers.filter(h => want.has(h) && !current.has(h));
      if (!add.length) return lines;
      const total = new Set([...current, ...add]);
      if (total.size === headers.length) return '*';
      const body = String(lines || '').replace(/\s+$/, '');
      return (body ? body + '\n' : '') + add.map(h => shorthandFor(h, headers)).join('\n');
    }
    const out = [];
    const emitted = new Set();
    for (const line of String(lines || '').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) { out.push(line); continue; }
      const idx = matchSelector(line, parsed);
      const hit = idx.map(i => headers[i]);
      if (!hit.some(h => want.has(h))) { out.push(line); hit.forEach(h => emitted.add(h)); continue; }
      for (const h of hit) {
        if (want.has(h) || emitted.has(h)) continue;
        emitted.add(h);
        out.push(shorthandFor(h, headers));
      }
    }
    return out.join('\n').replace(/^\n+|\n+$/g, '');
  }

  // ---------- reading tables ----------

  function pickSheet(sheetNames, preferred) {
    const want = (preferred || 'Table').toLowerCase();
    return sheetNames.find(n => n.toLowerCase() === want) || sheetNames[0];
  }

  function coerce(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return null;
    const s = String(v).trim();
    if (!s) return null;
    const cleaned = s.replace(/,/g, '').replace(/%$/, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(cleaned)) return null;
    return Number(cleaned);
  }

  // aoa: array of arrays from the sheet (row 0 = headers, col 0 = sample name).
  function loadTable({ filename, sheetName, aoa }, compiled) {
    const headerRow = (aoa[0] || []).slice(1).map(h => (h === null || h === undefined) ? '' : String(h).trim());
    const headers = headerRow.filter(h => h !== '');
    if (headers.length !== headerRow.length) {
      throw new Error(filename + ': empty header cell found in row 1');
    }
    const rows = [], dropped = [];
    for (let r = 1; r < aoa.length; r++) {
      const line = aoa[r] || [];
      const name = line[0];
      const allEmpty = line.every(c => c === null || c === undefined || String(c).trim() === '');
      if (allEmpty) continue;
      const parsed = parseSampleName(name, compiled);
      if (!parsed.ok) { dropped.push(name === null || name === undefined ? '(blank name)' : String(name)); continue; }
      const values = {};
      headers.forEach((h, j) => { values[h] = coerce(line[j + 1]); });
      rows.push({ sample_id: String(name).trim(), fields: parsed.fields, source_file: filename, values });
    }
    return { filename, sheetName, headers, rows, dropped };
  }

  // ---------- pipeline ----------

  function statMatches(stat, filter) {
    const f = (filter || '').trim();
    if (!f) return true;
    return stat.toLowerCase().startsWith(f.toLowerCase());
  }

  function run(tables, config) {
    const log = [];
    const warnings = [];
    const compiled = compileNamePattern(config);
    const fields = compiled.fields;
    log.push('Sample name pattern: ' + (config.useRegex ? config.regex : config.template) + '  (fields: ' + fields.join(', ') + ')');

    // union of headers, in order of first appearance
    const headers = [];
    const seen = new Set();
    for (const t of tables) for (const h of t.headers) if (!seen.has(h)) { seen.add(h); headers.push(h); }
    const ref = tables[0] ? tables[0].headers : [];
    for (const t of tables) {
      log.push('File "' + t.filename + '": sheet "' + t.sheetName + '", ' + t.rows.length + ' sample rows kept, ' +
        t.dropped.length + ' rows dropped' + (t.dropped.length ? ' (' + t.dropped.join(', ') + ')' : ''));
      if (t.headers.length !== ref.length || t.headers.some((h, i) => h !== ref[i])) {
        const missing = ref.filter(h => !t.headers.includes(h)).length;
        const extra = t.headers.filter(h => !ref.includes(h)).length;
        warnings.push('Column headers in "' + t.filename + '" differ from "' + tables[0].filename +
          '" (' + missing + ' missing, ' + extra + ' extra, or different order). Columns were aligned by name; missing cells are NA.');
      }
    }
    const rows = tables.flatMap(t => t.rows);
    const parsedHeaders = headers.map(parseHeader);
    const filtered = new Set(headers.filter((h, i) => statMatches(parsedHeaders[i].stat, config.statFilter)));
    log.push('Statistic filter for subtraction/floor: "' + (config.statFilter || '') + '" -> ' + filtered.size + ' of ' + headers.length + ' columns');

    // duplicate sample ids across files
    const idCount = {};
    for (const r of rows) idCount[r.sample_id] = (idCount[r.sample_id] || 0) + 1;
    const dups = Object.keys(idCount).filter(k => idCount[k] > 1);
    if (dups.length) warnings.push('Sample names present more than once across files: ' + dups.join(', '));

    // baseline subtraction
    const bl = config.baseline || {};
    const doSub = !!bl.enabled && fields.includes(bl.field);
    if (bl.enabled && !fields.includes(bl.field)) warnings.push('Baseline field "' + bl.field + '" is not one of the parsed fields; subtraction skipped.');
    for (const r of rows) { r.subtracted = null; r.isBaseline = false; }
    if (doSub) {
      const others = fields.filter(f => f !== bl.field);
      const key = r => others.map(f => r.fields[f]).join('\u0001');
      const baselines = {};
      for (const r of rows) {
        if (r.fields[bl.field] === bl.value) {
          r.isBaseline = true;
          (baselines[key(r)] = baselines[key(r)] || []).push(r);
        }
      }
      let nSub = 0, nNoBase = 0;
      for (const r of rows) {
        if (r.isBaseline) continue;
        const cands = baselines[key(r)];
        r.subtracted = {};
        if (!cands) { nNoBase++; for (const h of filtered) r.subtracted[h] = null; continue; }
        if (cands.length > 1) warnings.push('Multiple ' + bl.value + ' rows for ' + others.map(f => r.fields[f]).join(' / ') + '; used the one from "' + cands[0].source_file + '"');
        const b = cands[0];
        for (const h of filtered) {
          const a = r.values[h], c = b.values[h];
          r.subtracted[h] = (a === null || c === null) ? null : a - c;
        }
        nSub++;
      }
      log.push('Baseline subtraction: ' + bl.field + ' = "' + bl.value + '" subtracted from the other rows with the same ' +
        others.join(' + ') + '. ' + nSub + ' rows subtracted, ' + Object.values(baselines).flat().length + ' baseline rows' +
        (bl.dropBaselineRows ? ' (dropped from subtracted tables)' : ' (kept, values are 0)') + ', ' + nNoBase + ' rows with no baseline (NA).');
      if (nNoBase) warnings.push(nNoBase + ' row(s) had no matching ' + bl.value + ' baseline; their subtracted values are NA.');
    } else {
      log.push('Baseline subtraction: off');
    }

    // floor
    const fl = config.floor || {};
    const thr = Number(fl.threshold);
    const doFloor = !!fl.enabled && Number.isFinite(thr);
    const floorFn = h => v => (v === null ? null : (doFloor && filtered.has(h) && v < thr ? thr : v));
    log.push('Floor: ' + (doFloor ? 'values < ' + thr + ' set to ' + thr + ' (after subtraction)' : 'off'));
    log.push('Missing values written as ' + NA);

    // column sets
    const sets = (config.sets || []).map(s => {
      const res = resolveSelectors(s.lines, headers);
      const zero = res.perLine.filter(l => !l.isComment && !l.matches.length).map(l => l.line.trim());
      if (zero.length) warnings.push('Set "' + s.name + '": no column matched: ' + zero.join(' ; '));
      log.push('Set "' + s.name + '": ' + res.columns.length + ' columns');
      return { name: s.name, columns: res.columns };
    });

    // ---- build sheets ----
    const metaCols = ['sample_id', ...fields, 'source_file'];
    const metaOf = r => [r.sample_id, ...fields.map(f => r.fields[f]), r.source_file];
    const out = v => (v === null || v === undefined ? NA : v);

    const wide = (name, cols, rowsIn, getter) => ({
      name,
      header: [...metaCols, ...cols],
      rows: rowsIn.map(r => [...metaOf(r), ...cols.map(h => out(getter(r, h)))]),
    });
    const rawGet = (r, h) => floorFn(h)(r.values[h] === undefined ? null : r.values[h]);
    const subGet = (r, h) => (r.subtracted ? floorFn(h)(r.subtracted[h] === undefined ? null : r.subtracted[h])
      : (r.isBaseline && !bl.dropBaselineRows ? floorFn(h)(0) : null));

    const sheets = [];
    sheets.push(wide('Table', headers, rows, rawGet));
    for (const s of sets) sheets.push(wide(s.name, s.columns, rows, rawGet));
    if (doSub) {
      const subRows = bl.dropBaselineRows ? rows.filter(r => !r.isBaseline) : rows;
      for (const s of sets) {
        const cols = s.columns.filter(h => filtered.has(h));
        sheets.push(wide(s.name + '_minus' + bl.value, cols, subRows, subGet));
      }
    }

    // long
    const longHeader = ['sample_id', ...fields.map(snake), 'source_file', 'panel', 'population', 'gate', 'statistic', 'column', 'value',
      ...(doSub ? ['value_minus_' + snake(bl.value)] : [])];
    const longRows = [];
    const panels = (config.long && config.long.allColumns) ? [{ name: 'Table', columns: headers }] : sets;
    for (const p of panels) for (const r of rows) for (const h of p.columns) {
      const ph = parseHeader(h);
      const line = [...metaOf(r), p.name, ph.path, ph.gate, ph.stat, h, out(rawGet(r, h))];
      if (doSub) line.push(filtered.has(h) ? out(subGet(r, h)) : NA);
      longRows.push(line);
    }
    sheets.push({ name: 'Long', header: longHeader, rows: longRows });

    const logSheet = { name: 'Log', header: ['entry'], rows: [
      ['Generated ' + new Date().toISOString()],
      ...log.map(l => [l]),
      ...warnings.map(w => ['WARNING: ' + w]),
      ['Column sets (shorthand):'],
      ...(config.sets || []).flatMap(s => [['[' + s.name + ']'], ...String(s.lines).split(/\r?\n/).map(l => ['  ' + l])]),
    ] };
    sheets.push(logSheet);

    return { sheets, log, warnings, headers, fields, rows, sets };
  }

  function snake(s) {
    return String(s).trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'x';
  }

  function safeSheetName(name, used) {
    let base = String(name).replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31) || 'Sheet';
    let n = base, k = 2;
    while (used.has(n.toLowerCase())) { const suf = '_' + k++; n = base.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase());
    return n;
  }

  function toCsv(sheet) {
    const esc = v => {
      const s = v === null || v === undefined ? NA : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [sheet.header, ...sheet.rows].map(r => r.map(esc).join(',')).join('\n') + '\n';
  }

  return {
    NA, DEFAULT_SETS, PRESETS, defaultConfig, toggleColumns,
    compileTemplate, compileRegex, compileNamePattern, parseSampleName,
    parseHeader, matchSelector, resolveSelectors, shorthandFor,
    pickSheet, coerce, loadTable, run, snake, safeSheetName, toCsv,
  };
});
