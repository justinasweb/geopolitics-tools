import { beforeAll, describe, expect, it } from 'vitest';
import { bandOf, DEFAULTS, parseState, queryOf, rowsOf, spofs, type Grid } from '../../src/lib/dependencies/model.ts';
import { cellText, gridCsv, phoneHtml, spofHtml, tableHtml } from '../../src/lib/dependencies/render.ts';

// The Dependencies tool: the bands, the settings in the address, the sort, reliance on one supplier and the
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
    // 100% and the shares above it up to 110% (Martinique's oil, 101%) read as on the country pages.
    expect(cellText(grid, 'oil', { v: 1.013, t: ['FRA', 0.9] })).toEqual(['Imports all', 'FRA 90%']);
    expect(cellText(grid, 'oil', { v: 1 })).toEqual(['Imports all', '']);
    expect(cellText(grid, 'oil', { v: 0.99 })).toEqual(['99%', '']);
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

  it('finds reliance on one supplier: half of use imported, half of that from one supplier', () => {
    expect(spofs(grid.rows).map((x) => `${x.id} ${x.r}`)).toEqual(['HUN oil', 'EGY wheat']);
    const html = spofHtml(DEFAULTS, grid);
    expect(html).toContain('Imports 84% of the oil it uses; Russia supplies 86% of those imports.');
    expect(html).toContain('2 found in this table.');
  });

  it('shows an old balance with its year, out of the sort, the phone ranking and reliance on one supplier', async () => {
    // The United Arab Emirates' wheat: a 2008 balance, partners from 2023.
    const old = { v: 1, t: ['RUS', 0.6] as [string, number], y: '2008', ty: '2023', o: 1 as const };
    const g: Grid = { ...grid, rows: [...grid.rows, { id: 'ARE', cells: cells(old, old, { why: 'i' }) }], places: { ...grid.places, ARE: { n: 'United Arab Emirates', c: 'ARE' } } };
    expect(cellText(g, 'oil', old)).toEqual(['Imports all', '2008, no recent data']);
    expect(rowsOf(parseState(new URLSearchParams(''), g), g).map((r) => r.id)).toEqual(['HUN', 'EGY', 'NOR', 'ARE']);
    expect(spofs(g.rows).map((x) => x.id)).not.toContain('ARE');
    expect(phoneHtml({ ...DEFAULTS, show: 'commodity', sort: 'oil' }, g)).not.toContain('United Arab Emirates');
    const html = tableHtml(DEFAULTS, g);
    expect(html).toContain('No recent data: the latest balance is from 2008; Main partners are from 2023, 15 years after the balance');
    const { leadImports, oldNotes } = await import('../../src/lib/dependence.ts');
    const row = { resource: 'wheat', state: 'ok', source: 'faostat', year: 2008, reliance: 1, tag: 'most', partners: ['RUS'], partnersFrom: { source: 'faostat', period: '2023' }, old: true } as const;
    expect(oldNotes({ ...row, partners: [...row.partners] })).toEqual(['No recent data: the latest balance is from 2008', 'Main partners are from 2023, 15 years after the balance']);
    expect(leadImports([{ ...row, partners: [...row.partners] }])).toEqual([]);
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

describe('the phone card', () => {
  it('opens on the country named by find= (the home page links ?sort=gas&find=Hungary), at every width', () => {
    // Sorted by wheat, Egypt is the first row; Hungary is further down.
    const s = parseState(new URLSearchParams('sort=wheat&find=Hungary'), grid);
    expect(phoneHtml(s, grid)).toMatch(/<article class="gt-dgcard"><h3 class="gt-h3">Hungary<\/h3>/);
    // c= still wins when both are given, and without either the card opens on the first row.
    expect(phoneHtml(parseState(new URLSearchParams('find=Hungary&c=NOR'), grid), grid)).toMatch(/<h3 class="gt-h3">Norway<\/h3>/);
    expect(phoneHtml(parseState(new URLSearchParams('find=Atlantis'), grid), grid)).toMatch(/<article class="gt-dgcard">/);
  });
});

describe('years and sources by row', () => {
  it('dates use and imports apart when they differ, and says when a source gives no partners', async () => {
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(DEP_TEXT.dated('EIA', '2024', 'UN Comtrade', '2025')).toBe('EIA, use 2024 · UN Comtrade, imports 2025');
    expect(DEP_TEXT.dated('FAOSTAT', '2023', 'FAOSTAT', '2023')).toBe('FAOSTAT, 2023');
    // An exporter's partners are its buyers.
    expect(DEP_TEXT.dated('FAOSTAT', '2024', 'UN Comtrade', '2025', true)).toBe('FAOSTAT, use 2024 · UN Comtrade, exports 2025');
    expect(DEP_TEXT.dated('SIPRI', '2021–2025')).toBe('SIPRI, 2021–2025');
    expect(DEP_TEXT.noPartners).toBe('No partner data from the source');
  });

  it('puts both years in the grid cell’s tooltip', () => {
    const g: Grid = { ...grid, rows: grid.rows.map((r) => (r.id === 'HUN' ? { ...r, cells: r.cells.map((c, i) => (i === 1 ? { ...c, y: '2024', ty: '2025' } : c)) } : r)) };
    const html = tableHtml({ ...DEFAULTS, sort: 'gas' }, g);
    const row = html.slice(html.indexOf('Hungary'), html.indexOf('</tr>', html.indexOf('Hungary')));
    expect(row).toMatch(/title="[^"]*use 2024 · [^"]*imports 2025"/);
  });
});

describe('which imports a country page names first', () => {
  it('leads with the largest by share of use and adds the largest fuel it imports most of', async () => {
    const { leadImports } = await import('../../src/lib/dependence.ts');
    const row = (resource: string, reliance: number, tag = 'most') => ({ resource, state: 'ok', source: 'x', partners: [], reliance, tag }) as never;
    // Germany: rice 100%, soybeans 97%, phosphate 96%, gas 95%, oil 91%.
    const de = [row('oil', 0.91), row('gas', 0.95), row('rice', 1), row('soy', 0.97), row('phosphate', 0.96), row('wheat', -0.05, 'self')];
    expect(leadImports(de).map((r: { resource: string }) => r.resource)).toEqual(['rice', 'gas']);
    // A fuel that leads is named once.
    expect(leadImports([row('oil', 1), row('rice', 0.6)]).map((r: { resource: string }) => r.resource)).toEqual(['oil']);
    // No fuel imported mostly: the largest alone.
    expect(leadImports([row('oil', 0.2, 'some'), row('rice', 0.8)]).map((r: { resource: string }) => r.resource)).toEqual(['rice']);
    expect(leadImports([row('wheat', -0.5, 'exp')])).toEqual([]);
  });
});

describe('net imports far above recorded use', () => {
  it('give no share, no tag and no lead import beyond 10% over use; the grid writes the words instead', async () => {
    const { fromBalance, leadImports } = await import('../../src/lib/dependence.ts');
    const one = (v: number) => ({ DJI: { 2024: v } });
    const balance = (production: number, imports: number, exports: number, use: number) => ({
      production: one(production), imports: one(imports), exports: one(exports), use: one(use), world: { production: {} },
      estimated: { production: {}, imports: {}, exports: {}, use: {} },
    }) as never;
    // On the source's own use figure: imports 200 times use (Djibouti's potash against FAOSTAT's farm use).
    const dji = fromBalance('potash', balance(0, 6011, 0, 30), 'DJI');
    expect(dji).toMatchObject({ state: 'ok', year: 2024, excess: 'imports' });
    expect(dji.reliance).toBeUndefined();
    expect(dji.tag).toBeUndefined();
    expect(leadImports([dji])).toEqual([]);
    // Within 10%: still a share, read as imports all.
    expect(fromBalance('potash', balance(0, 108, 0, 100), 'DJI')).toMatchObject({ reliance: 1.08, tag: 'most' });
    expect(fromBalance('potash', balance(0, 111, 0, 100), 'DJI').excess).toBe('imports');
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(DEP_TEXT.exceedsNote('FAOSTAT')).toBe('Likely transit trade or stock changes; FAOSTAT’s figures do not separate them');
    expect(cellText(grid, 'potash', { why: 'e', y: '2024' })).toEqual(['Imports exceed', 'recorded use']);
    const g: Grid = { ...grid, rows: grid.rows.map((r) => (r.id === 'HUN' ? { ...r, cells: r.cells.map((c, i) => (i === 6 ? { why: 'e' as const, y: '2024' } : c)) } : r)) };
    const html = tableHtml({ ...DEFAULTS, sort: 'potash' }, g);
    const tr = html.slice(html.indexOf('Hungary'), html.indexOf('</tr>', html.indexOf('Hungary')));
    expect(tr).toMatch(/title="FAOSTAT, 2024; Likely transit trade or stock changes; FAOSTAT’s figures do not separate them"/);
    // Out of the phone's ranking.
    expect(phoneHtml({ ...DEFAULTS, show: 'commodity', sort: 'potash' }, g)).not.toContain('Hungary');
  });
});

describe('fertilisers on supply', () => {
  type B = Parameters<typeof import('../../src/lib/dependence.ts').fromBalance>[1];
  const balance = (production: number, imports: number, exports: number, use: number, est: string[] = []): B => ({
    production: { X: { 2024: production } }, imports: { X: { 2024: imports } }, exports: { X: { 2024: exports } }, use: { X: { 2024: use } },
    world: { production: {} }, estimated: { production: {}, imports: {}, exports: {}, use: {}, ...Object.fromEntries(est.map((k) => [k, { X: { 2024: 1 } }])) },
  }) as B;

  it('divide net imports by production plus net imports, not by FAOSTAT’s farm use, and carry its estimate flags', async () => {
    const { fromBalance } = await import('../../src/lib/dependence.ts');
    // United States potash 2024, Mt K2O: 133% of farm use; 94% of supply.
    const us = balance(0.339358, 8.551944, 2.873663, 4.270921, ['production', 'imports', 'exports', 'use']);
    expect(fromBalance('potash', us, 'X').excess).toBe('imports');
    const r = fromBalance('potash', us, 'X', undefined, true);
    expect(r.reliance).toBeCloseTo(5.678281 / (0.339358 + 5.678281), 4);
    expect(r).toMatchObject({ tag: 'most', estimated: true });
    // An estimated farm use alone does not make a supply row an estimate.
    expect(fromBalance('potash', balance(0, 5, 1, 3, ['use']), 'X', undefined, true).estimated).toBeUndefined();
  });

  it('say exports exceed recorded supply when they pass production plus imports at all', async () => {
    const { fromBalance, leadImports } = await import('../../src/lib/dependence.ts');
    // Morocco phosphate 2024: exports 1.7 times production plus imports.
    const ma = fromBalance('phosphate', balance(6.2, 0.0023, 10.5511, 1), 'X', undefined, true);
    // Still a net exporter, with buyers, but no share of output.
    expect(ma).toMatchObject({ excess: 'exports', tag: 'exp' });
    expect(ma.reliance).toBeUndefined();
    expect(ma.exportShare).toBeUndefined();
    expect(leadImports([ma])).toEqual([]);
    // Canada's potash, 1% over: no margin, so no share either, not "exports all its output".
    const ca = fromBalance('potash', balance(13.55, 0.04, 13.75, 1), 'X', undefined, true);
    expect(ca).toMatchObject({ excess: 'exports', tag: 'exp' });
    expect(ca.exportShare).toBeUndefined();
    expect(cellText(grid, 'phosphate', { why: 'x', y: '2024' })).toEqual(['Exports exceed', 'recorded supply']);
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    expect(DEP_TEXT.imports('94%', 'potash')).toBe('Imports 94% of its potash supply');
    expect(DEP_TEXT.imports('84%', 'soybeans')).toBe('Imports 84% of the soybeans it uses');
  });

  it('say a crop’s exports exceed recorded supply when they pass production plus imports at all, too', async () => {
    const { fromBalance } = await import('../../src/lib/dependence.ts');
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    // Ukraine maize 2024: 29.6 Mt exported from 26.9 Mt grown and imported, an earlier harvest. No use, no share.
    const ua = fromBalance('maize', { ...balance(26.864, 0.010, 29.624, 0), use: {} } as B, 'X');
    expect(ua).toMatchObject({ excess: 'exports', tag: 'exp' });
    expect(ua.exportShare).toBeUndefined();
    // Paraguay's rice, 3% over: a crop has no margin.
    expect(fromBalance('rice', { ...balance(0.705, 0.001, 0.728, 0), use: {} } as B, 'X').excess).toBe('exports');
    expect(DEP_TEXT.exportsNote('FAOSTAT')).toBe('Exports can come from an earlier harvest or stocks; FAOSTAT’s yearly figures do not separate them');
  });

  it('use USGS’s potash output where FAOSTAT’s own estimate is more than twice from it, world total too', async () => {
    const { fromBalance, rowSource } = await import('../../src/lib/dependence.ts');
    const { usgsPotash } = await import('../../src/adapters/faostat.ts');
    const { potashOutput } = await import('../../src/adapters/minerals.ts');
    // China 2024, Mt K2O: FAOSTAT estimates 1.12 produced; USGS 6.3, its own estimate.
    const cn = { ...balance(1.115391, 7.7, 0.04, 9, ['production'])!, world: { production: { 2024: 44.3 } } };
    const usgs = (v: number, y = 2024, est = true): { output: Record<string, Record<number, number>>; estimated: Record<string, Record<number, number>> } =>
      ({ output: { X: { [y]: v } }, estimated: est ? { X: { [y]: 1 } } : {} });
    const u = usgsPotash(cn, usgs(6.3));
    expect(u.production.X[2024]).toBe(6.3);
    expect(u.usgs).toEqual({ X: { 2024: 1 } });
    expect(u.world.production[2024]).toBeCloseTo(44.3 - 1.115391 + 6.3, 6);
    expect(u.estimated.production.X[2024]).toBe(1);
    expect(usgsPotash(cn, usgs(6.3, 2024, false)).estimated.production.X?.[2024]).toBeUndefined();
    const row = { ...fromBalance('potash', u, 'X', undefined, true), usgsProduction: true as const };
    expect(row.reliance).toBeCloseTo(7.66 / (6.3 + 7.66), 4);
    expect(rowSource(row)).toBe('FAOSTAT, 2024. Production: USGS, as FAOSTAT’s figure is an estimate far from it');
    // Within 2×, FAOSTAT's own figure (not an estimate), or another year: FAOSTAT's stays.
    expect(usgsPotash(balance(1.62, 0, 1.5, 0, ['production'])!, usgs(2.4)).usgs).toEqual({});
    expect(usgsPotash(balance(1.1, 7.7, 0, 9)!, usgs(6.3)).usgs).toEqual({});
    expect(usgsPotash(cn, usgs(6.3, 2023)).production.X[2024]).toBe(1.115391);
    // USGS's world table, thousand tonnes of K2O equivalent.
    const csv = 'MCS chapter,Section,Commodity,Country,Statistics,Statistics_detail,Unit,Year,Value,Notes,Is critical mineral 2025,Other notes\n'
      + 'POTASH,World Mine Production and Reserves,Potash,China,Production,Mine production,thousand metric tons,2024,"6,300",Estimated.,Yes,"(Data in thousand metric tons, potassium oxide (K2O) equivalent, unless otherwise specified)"\n'
      + 'POTASH,World Mine Production and Reserves,Potash,World total,Production,Mine production,thousand metric tons,2024,"46,700",,Yes,"(Data in thousand metric tons, potassium oxide (K2O) equivalent, unless otherwise specified)"\n';
    const raw = { has: () => true, list: () => ['MCS2026_Commodities_Data.csv'], text: () => csv, json: () => ({}) } as never;
    expect(potashOutput(raw)).toEqual({ output: { CHN: { 2024: 6.3 } }, estimated: { CHN: { 2024: 1 } } });
    const { FOOD_TEXT } = await import('../../src/i18n/food.en.ts');
    expect(FOOD_TEXT.usgsNote([2024], true)).toBe('Production in 2024: USGS, as FAOSTAT’s figure is an estimate far from it; the world total uses USGS’s figure.');
  });

  it('label an estimated cell in the grid', () => {
    const g: Grid = { ...grid, rows: grid.rows.map((r) => (r.id === 'HUN' ? { ...r, cells: r.cells.map((c, i) => (i === 6 ? { v: 0.94, y: '2024', est: 1 as const } : c)) } : r)) };
    const html = tableHtml({ ...DEFAULTS, sort: 'potash' }, g);
    const tr = html.slice(html.indexOf('Hungary'), html.indexOf('</tr>', html.indexOf('Hungary')));
    expect(tr).toContain('gt-tag--estimate');
  });
});

describe('the dependencies section’s finding', () => {
  it('names the lead imports under one verb, and an export after a semicolon', async () => {
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    const imports = DEP_TEXT.findImports([DEP_TEXT.findImportPart(null, 'rice'), DEP_TEXT.findImportPart('95%', 'gas')]);
    expect(DEP_TEXT.find('Germany', [imports, DEP_TEXT.findExport('potash')])).toBe('Germany imports all of the rice it uses and 95% of the gas it uses; it exports potash.');
  });
});

describe('flows from the exporter’s report (mirror data)', () => {
  it('are named in the row’s source line and the grid’s tooltip', async () => {
    const { rowSource } = await import('../../src/lib/dependence.ts');
    const { sumPairs } = await import('../../src/data/flows.ts');
    const row = { resource: 'gas', state: 'ok', source: 'eia', year: 2024, partners: ['USA'], top: { id: 'USA', share: 0.99 }, reliance: 0.7, tag: 'most', partnersFrom: { source: 'comtrade', period: '2025', mirror: ['United States → Mexico'] } } as never;
    expect(rowSource(row)).toBe('EIA, use 2024 · UN Comtrade, imports 2025, United States → Mexico as reported by the exporter');
    const g: Grid = { ...grid, rows: grid.rows.map((r) => (r.id === 'HUN' ? { ...r, cells: r.cells.map((c, i) => (i === 1 ? { ...c, y: '2024', tm: 1 } : c)) } : r)) };
    const html = tableHtml({ ...DEFAULTS, sort: 'gas' }, g);
    const tr = html.slice(html.indexOf('Hungary'), html.indexOf('</tr>', html.indexOf('Hungary')));
    expect(tr).toMatch(/title="[^"]*main supplier as reported by the exporter"/);
    // Summing a pair's rows keeps the mark.
    expect(sumPairs([{ from: 'USA', to: 'MEX', amount: 50, mirror: true }, { from: 'USA', to: 'MEX', amount: 20 }], (r) => r.amount)).toEqual([{ from: 'USA', to: 'MEX', amount: 70, mirror: true }]);
  });
});

describe('a fertiliser row’s source line', () => {
  it('dates supply, not use', async () => {
    const { rowSource } = await import('../../src/lib/dependence.ts');
    const row = { resource: 'potash', state: 'ok', source: 'faostat', year: 2024, partners: [], reliance: 0.94, tag: 'most', partnersFrom: { source: 'comtrade', period: '2025' } } as never;
    expect(rowSource(row)).toBe('FAOSTAT, supply 2024 · UN Comtrade, imports 2025');
  });
});

describe('the grid and the country pages', () => {
  it('write every share alike: the grid keeps enough digits not to round twice', async () => {
    const { dependencyGrid } = await import('../../src/lib/dependencies.ts');
    const { dependencies } = await import('../../src/lib/dependence.ts');
    const { formatShare } = await import('../../src/lib/format.ts');
    const g = dependencyGrid();
    for (const row of g.rows) {
      const deps = dependencies(row.id);
      g.resources.forEach((r, i) => {
        const d = deps.find((x) => x.resource === r.id);
        const c = row.cells[i];
        if (d?.reliance !== undefined && c.v !== undefined) expect(formatShare(c.v), `${row.id} ${r.id}`).toBe(formatShare(d.reliance));
        if (d?.exportShare !== undefined && c.x !== undefined) expect(formatShare(c.x), `${row.id} ${r.id}`).toBe(formatShare(d.exportShare));
      });
    }
  }, 30000);
});
