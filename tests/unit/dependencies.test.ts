import { beforeAll, describe, expect, it } from 'vitest';
import { bandOf, DEFAULTS, parseState, queryOf, rowsOf, spofs, type Grid } from '../../src/lib/dependencies/model.ts';
import { cellText, gridCsv, spofHtml, tableHtml } from '../../src/lib/dependencies/render.ts';

// The Dependencies tool: the bands, the settings in the address, the sort, the single points of failure and the
// download, on a small grid; then the grid the build makes from the sample files.
process.env.GT_DATA = 'sample';

const empty = { why: 'n' as const };
const cells = (oil: object, wheat: object, arms: object) => [oil, empty, wheat, empty, empty, empty, empty, empty, arms, empty];
const grid: Grid = {
  resources: ['oil', 'gas', 'wheat', 'maize', 'rice', 'soy', 'potash', 'phosphate', 'arms', 'chips'].map((id) => ({
    id: id as never, label: id[0].toUpperCase() + id.slice(1), noun: id, credit: id === 'arms' ? 'SIPRI' : 'FAOSTAT',
    flowCredit: ['wheat'].includes(id) ? 'FAOSTAT' : id === 'arms' ? 'SIPRI' : 'UN Comtrade', csv: id !== 'arms' && id !== 'chips', csvTop: id === 'wheat',
  })),
  rows: [
    { id: 'EGY', cells: cells({ v: 0.2, t: ['SAU', 0.4], y: '2023' }, { v: 0.6, t: ['RUS', 0.7], y: '2023' }, { t: ['RUS', 0.4], y: '2020–2024' }) },
    { id: 'HUN', cells: cells({ v: 0.84, t: ['RUS', 0.86], y: '2023' }, { v: -1.5, x: 0.6, y: '2023' }, { why: 'i' }) },
    { id: 'NOR', cells: cells({ v: -4, x: 0.9, y: '2023' }, { v: 0.4, y: '2023' }, { t: ['USA', 0.9], y: '2020–2024' }) },
  ],
  places: { EGY: { n: 'Egypt', c: 'EGY', h: '/countries/egypt' }, HUN: { n: 'Hungary', c: 'HUN' }, NOR: { n: 'Norway', c: 'NOR' }, RUS: { n: 'Russia', c: 'RUS' }, SAU: { n: 'Saudi Arabia', c: 'SAU' }, USA: { n: 'United States', c: 'USA' } },
  blocs: [{ id: 'eu', name: 'EU', members: ['HUN'] }],
  credits: 'FAOSTAT; SIPRI', years: '2020–2024', updated: '2026-10-22', retrieved: '2026-10-22',
};

describe('Dependencies model', () => {
  it('puts each cell in a band, with arms on supplier concentration', () => {
    expect(bandOf('oil', { v: 0.84 })).toBe(1);
    expect(bandOf('oil', { v: 0.6 })).toBe(2);
    expect(bandOf('oil', { v: 0.2 })).toBe(3);
    expect(bandOf('oil', { v: -0.1 })).toBe(4);
    expect(bandOf('oil', { v: -0.5, x: 0.3 })).toBe(5);
    expect(bandOf('oil', { v: -4, x: 0.9 })).toBe(6);
    expect(bandOf('arms', { t: ['USA', 0.9] })).toBe('c');
    expect(bandOf('oil', { why: 'p' })).toBe(0);
  });

  it('writes every value: share and supplier, exports, net exporter, top supplier', () => {
    expect(cellText(grid, 'oil', { v: 0.84, t: ['RUS', 0.86] })).toEqual(['84%', 'RUS 86%']);
    expect(cellText(grid, 'oil', { v: -4, x: 0.9 })).toEqual(['Exports', '90% of output']);
    expect(cellText(grid, 'oil', { v: -0.08 })).toEqual(['−8%', 'net exporter']);
    expect(cellText(grid, 'arms', { t: ['USA', 0.9] })).toEqual(['USA 90%', 'top supplier']);
    expect(cellText(grid, 'arms', { why: 'i' })).toEqual(['–', 'no imports']);
  });

  it('keeps the settings in the address, leaving defaults out', () => {
    const s = parseState(new URLSearchParams('bloc=eu&sort=wheat&dir=asc&show=commodity&c=HUN&all=1&bloc2=x'), grid);
    expect(s).toMatchObject({ bloc: 'eu', sort: 'wheat', dir: 'asc', show: 'commodity', c: 'HUN', all: true });
    expect(queryOf(s, grid)).toBe('bloc=eu&sort=wheat&dir=asc&show=commodity&c=HUN&all=1');
    expect(parseState(new URLSearchParams('bloc=nato&sort=coal&c=XXX'), grid)).toEqual({ ...DEFAULTS, sort: 'oil' });
    expect(queryOf({ ...DEFAULTS }, grid)).toBe('');
  });

  it('sorts on the column, missing figures last; filters to a bloc', () => {
    const ids = (q: string) => rowsOf(parseState(new URLSearchParams(q), grid), grid).map((r) => r.id);
    expect(ids('')).toEqual(['HUN', 'EGY', 'NOR']);
    expect(ids('sort=wheat&dir=asc')).toEqual(['HUN', 'NOR', 'EGY']);
    expect(ids('sort=arms')).toEqual(['NOR', 'EGY', 'HUN']);
    expect(ids('sort=country&dir=desc')).toEqual(['NOR', 'HUN', 'EGY']);
    expect(ids('bloc=eu')).toEqual(['HUN']);
  });

  it('finds single points of failure: half of use imported, half of that from one supplier', () => {
    expect(spofs(grid.rows).map((x) => `${x.id} ${x.r}`)).toEqual(['HUN oil', 'EGY wheat']);
    const html = spofHtml(DEFAULTS, grid);
    expect(html).toContain('Imports 84% of the oil it uses; Russia supplies 86% of those imports.');
    expect(html).toContain('2 found in this table.');
  });

  it('marks the found row and the sorted column', () => {
    const html = tableHtml({ ...DEFAULTS, find: 'nor' }, grid);
    expect(html).toContain('<tr data-id="NOR" class="is-found">');
    expect(html).toMatch(/aria-sort="descending"><button type="button" data-d-sort="oil">/);
    expect(html).toContain('Sorted by oil.');
  });

  it('downloads only what the sources allow, and says what it left out', () => {
    const { csv, note } = gridCsv(DEFAULTS, grid);
    const [head, first] = csv.split('\n');
    expect(head).toContain('"Wheat main supplier share of imports [FAOSTAT, retrieved 2026-10-22]"');
    expect(head).not.toContain('Arms');
    expect(head).not.toContain('Oil main supplier');
    expect(first.startsWith('Hungary,HUN,0.84,,2023,')).toBe(true);
    expect(note).toContain('the main oil supplier (UN Comtrade)');
    expect(note).toContain('arms (SIPRI)');
  });
});

describe('Dependencies grid from the sample files', () => {
  type D = typeof import('../../src/lib/dependencies.ts');
  let D: D;
  beforeAll(async () => { D = await import('../../src/lib/dependencies.ts'); });

  it('has a row per country with a share of use, suppliers named, and a live route', async () => {
    const g = D.dependencyGrid();
    expect(g.rows.length).toBeGreaterThan(20);
    for (const r of g.rows) expect(r.cells).toHaveLength(10);
    for (const r of g.rows) for (const c of r.cells) if (c.t) expect(g.places[c.t[0]]?.c).toBeTruthy();
    const chn = g.rows.find((r) => r.id === 'CHN')!;
    expect(chn.cells[0].v).toBeGreaterThan(0.5);
    expect(chn.cells[0].t?.[0]).toBe('RUS');
    expect(g.credits).toContain('FAOSTAT');
    const R = await import('../../src/lib/routes.ts');
    expect(R.live('tool:dependencies')?.path).toBe('/dependencies');
  });
});
