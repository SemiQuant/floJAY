// Run: node test/test_core.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = require(path.join(root, 'vendor/xlsx.full.min.js'));
const C = require(path.join(root, 'src/core.js'));

const FILES = [
  'PO_AT WK40 21A-B 08102021 T-Diff copy.xlsx',
  'PO_AT WK42 21A 21102021 T-Diff copy.xlsx',
];
const readWb = f => XLSX.read(fs.readFileSync(path.join(root, f)), { type: 'buffer' });
const aoaOf = ws => XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const config = C.defaultConfig();
const compiled = C.compileNamePattern(config);
const wbs = FILES.map(readWb);
const tables = wbs.map((wb, i) => {
  const sheetName = C.pickSheet(wb.SheetNames);
  return C.loadTable({ filename: FILES[i], sheetName, aoa: aoaOf(wb.Sheets[sheetName]) }, compiled);
});

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

test('sheet pick and row counts', () => {
  assert.equal(tables[0].sheetName, 'Table');
  assert.equal(tables[0].rows.length, 56);
  assert.equal(tables[1].rows.length, 40);
  assert.deepEqual(tables[0].dropped, ['Mean', 'SD']);
  assert.deepEqual(tables[1].dropped, ['(blank name)', '(blank name)']);
  assert.equal(tables[0].headers.length, 280);
});

const res = C.run(tables, config);
const sheet = n => res.sheets.find(s => s.name === n);

test('default sets reproduce the original tabs exactly', () => {
  for (const [setName, tabName] of [['Cytokines', 'Cytokines'], ['Phenotype-ALL', 'Phenotype- ALL']]) {
    const wb = wbs[0];
    const orig = aoaOf(wb.Sheets[tabName]);
    const origHeaders = orig[0].slice(1);
    const got = sheet(setName);
    const nMeta = res.fields.length + 2;
    assert.deepEqual(got.header.slice(nMeta), origHeaders, setName + ' headers');
    // the hand-made tabs are sorted differently from Table, so compare by sample name
    const byName = new Map(got.rows.map(r => [r[0], r]));
    let compared = 0;
    for (const origRow of orig.slice(1)) {
      const name = origRow[0] === null ? '' : String(origRow[0]).trim();
      if (!byName.has(name)) { assert.ok(['Mean', 'SD', ''].includes(name), 'unexpected row ' + name); continue; }
      const origVals = origRow.slice(1).map(v => (v === null ? 'NA' : (config.floor.enabled && v < config.floor.threshold ? config.floor.threshold : v)));
      assert.deepEqual(byName.get(name).slice(nMeta), origVals, setName + ' row ' + name);
      compared++;
    }
    assert.equal(compared, 56);
  }
});

test('Table sheet has all columns and 96 rows', () => {
  const t = sheet('Table');
  assert.equal(t.rows.length, 96);
  assert.equal(t.header.length, 5 + 280);
  assert.deepEqual(t.header.slice(0, 5), ['sample_id', 'PID', 'TIMEPOINT', 'ANTIGEN', 'source_file']);
});

test('baseline subtraction (BL from FU1) for 71002 / RimJ', () => {
  const cy = sheet('Cytokines');
  const sub = sheet('Cytokines_minusBL');
  const col = 'Lymphocytes/Single Cells/Live cells/CD3+/CD4+/GMCSF+ | Freq. of Parent (%)';
  const j = cy.header.indexOf(col);
  const bl = cy.rows.find(r => r[0] === '71002 - BL_RimJ')[j];
  const fu1 = cy.rows.find(r => r[0] === '71002 - FU1_RimJ')[j];
  assert.equal(bl, 0.72); assert.equal(fu1, 0.75);
  const got = sub.rows.find(r => r[0] === '71002 - FU1_RimJ')[sub.header.indexOf(col)];
  assert.ok(Math.abs(got - 0.03) < 1e-9, 'got ' + got);
  // negative difference is floored
  const fu2 = cy.rows.find(r => r[0] === '71002 - FU2_RimJ')[j]; // 0.51? whichever, compute
  const expect = fu2 - bl < 0.0001 ? 0.0001 : fu2 - bl;
  const got2 = sub.rows.find(r => r[0] === '71002 - FU2_RimJ')[sub.header.indexOf(col)];
  assert.ok(Math.abs(got2 - expect) < 1e-9);
  // baseline rows dropped
  assert.ok(!sub.rows.some(r => r[2] === 'BL'));
  assert.equal(sub.rows.length, 96 - res.rows.filter(r => r.isBaseline).length);
});

test('Count columns excluded from subtracted tables, present in raw', () => {
  const ph = sheet('Phenotype-ALL'), sub = sheet('Phenotype-ALL_minusBL');
  assert.equal(ph.header.filter(h => h.endsWith('| Count')).length, 4);
  assert.equal(sub.header.filter(h => h.endsWith('| Count')).length, 0);
  assert.equal(sub.header.length, 5 + 44);
});

test('missing baseline -> NA', () => {
  // 71002 - FU2_LldD2 has no 71002 - BL_LldD2
  const sub = sheet('Cytokines_minusBL');
  const row = sub.rows.find(r => r[0] === '71002 - FU2_LldD2');
  assert.ok(row);
  assert.ok(row.slice(5).every(v => v === 'NA'));
  assert.ok(res.warnings.some(w => /no matching BL baseline/.test(w)));
});

test('floor and NA on synthetic data', () => {
  const aoa = [
    [null, 'A/B | Freq. of Parent (%)', 'A/B | Count'],
    ['1 - BL_NS', 0.00001, 0],
    ['1 - FU1_NS', 'n/a', ''],
    ['1 - FU1_X', -3, 5],
    ['Mean', 1, 1],
  ];
  const t = C.loadTable({ filename: 'x.xlsx', sheetName: 'Table', aoa }, compiled);
  assert.equal(t.rows.length, 3);
  const r = C.run([t], config);
  const tab = r.sheets.find(s => s.name === 'Table');
  assert.deepEqual(tab.rows[0].slice(5), [0.0001, 0]);       // freq floored, count untouched
  assert.deepEqual(tab.rows[1].slice(5), ['NA', 'NA']);
  assert.deepEqual(tab.rows[2].slice(5), [0.0001, 5]);
  const cfg2 = { ...config, floor: { enabled: false } };
  const r2 = C.run([t], cfg2);
  assert.deepEqual(r2.sheets.find(s => s.name === 'Table').rows[2].slice(5), [-3, 5]);
});

test('long format shape and round trip', () => {
  const L = sheet('Long');
  assert.deepEqual(L.header, ['sample_id', 'pid', 'timepoint', 'antigen', 'source_file', 'panel', 'population', 'gate', 'statistic', 'column', 'value', 'value_minus_bl']);
  assert.equal(L.rows.length, 96 * (8 + 48));
  const cy = sheet('Cytokines');
  const col = cy.header[5];
  const wideVal = cy.rows[3][5];
  const longRow = L.rows.find(r => r[0] === cy.rows[3][0] && r[9] === col && r[5] === 'Cytokines');
  assert.equal(longRow[10], wideVal);
  assert.equal(longRow[6], col.split(' | ')[0]);
  assert.equal(longRow[7], 'GMCSF+');
  assert.equal(longRow[8], 'Freq. of Parent (%)');
  // baseline rows: NA in the subtracted column when dropped, 0 (floored) when kept
  const blRow = L.rows.find(r => r[0] === '71002 - BL_NS' && r[9] === col);
  assert.equal(blRow[11], 'NA');
  const keep = C.run(tables, { ...config, baseline: { ...config.baseline, dropBaselineRows: false } });
  const L2 = keep.sheets.find(s => s.name === 'Long');
  assert.equal(L2.rows.find(r => r[0] === '71002 - BL_NS' && r[9] === col)[11], 0.0001);
  assert.equal(keep.sheets.find(s => s.name === 'Cytokines_minusBL').rows.length, 96);
  const all = C.run(tables, { ...config, long: { allColumns: true } });
  assert.equal(all.sheets.find(s => s.name === 'Long').rows.length, 96 * 280);
});

test('shorthand grammar', () => {
  const H = res.headers;
  assert.equal(C.resolveSelectors('CD4+/GMCSF+ | Count', H).columns.length, 1);
  assert.equal(C.resolveSelectors('CD4+/GMCSF+', H).columns.length, 3);           // all stats
  assert.equal(C.resolveSelectors('*/TEMRA | Freq. of Parent', H).columns.length, 6);
  assert.equal(C.resolveSelectors('CD4+/*/TEMRA | Freq. of Parent', H).columns.length, 4);
  assert.equal(C.resolveSelectors('# comment\n\nCD4+/GMCSF+ | count', H).columns.length, 1);
  assert.equal(C.resolveSelectors('nothing/here', H).columns.length, 0);
  assert.equal(C.resolveSelectors(H[0], H).columns[0], H[0]);
  assert.equal(C.shorthandFor(H[12], H), 'CD4+/GMCSF+ | Freq. of Parent (%)');
});

test('presets and toggleColumns', () => {
  const H = res.headers;
  assert.deepEqual(Object.keys(C.PRESETS), ['Paul selection 1', 'Select all']);
  assert.equal(C.resolveSelectors(C.PRESETS['Select all'][0].lines, H).columns.length, 280);
  assert.equal(C.PRESETS['Paul selection 1'][0].name, 'Cytokines');
  // tick two columns onto an empty set
  let lines = C.toggleColumns('', [H[0], H[1]], true, H);
  assert.deepEqual(C.resolveSelectors(lines, H).columns, [H[0], H[1]]);
  // untick one
  lines = C.toggleColumns(lines, [H[0]], false, H);
  assert.deepEqual(C.resolveSelectors(lines, H).columns, [H[1]]);
  // ticking everything collapses to '*'
  assert.equal(C.toggleColumns('', H, true, H), '*');
  // unticking one column out of '*' expands to explicit lines for the other 279
  const l2 = C.toggleColumns('# all\n*', [H[5]], false, H);
  const cols = C.resolveSelectors(l2, H).columns;
  assert.equal(cols.length, 279); assert.ok(!cols.includes(H[5]));
  assert.ok(l2.startsWith('# all'));
  // unticking a column covered by a wildcard keeps the wildcard's other matches
  const l3 = C.toggleColumns('*/TEMRA | Freq. of Parent', ['Lymphocytes/Single Cells/Live cells/CD3+/CD8+/TEMRA | Freq. of Parent (%)'], false, H);
  assert.equal(C.resolveSelectors(l3, H).columns.length, 5);
  // no-op when already ticked
  assert.equal(C.toggleColumns('CD4+/GMCSF+ | Count', [C.resolveSelectors('CD4+/GMCSF+ | Count', H).columns[0]], true, H), 'CD4+/GMCSF+ | Count');
});

test('regex mode and csv', () => {
  const cfg = { ...config, useRegex: true };
  const r = C.run(tables, cfg);
  assert.equal(r.sheets.find(s => s.name === 'Table').rows.length, 96);
  const csv = C.toCsv({ header: ['a', 'b'], rows: [[1, 'x,y'], [null, 'q"']] });
  assert.equal(csv, 'a,b\n1,"x,y"\nNA,"q"""\n');
});

console.log('\n' + passed + ' tests passed');
