import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_YEARS, PRESETS, correlation, isPreset, parseState, presetState, queryOf, ticks, valueAt, wantsLog, type MeasureMeta, type Meta } from '../../src/lib/explorer/model.ts';
import { linesChart, scatterModel, tableCsv, tableHtml, tableRows, type Data } from '../../src/lib/explorer/render.ts';

process.env.GT_DATA = 'sample';

const m = (id: string, extra: Partial<MeasureMeta> = {}): MeasureMeta => ({
  id, label: id.toUpperCase(), unit: 'US$', group: 'economy', format: { kind: 'money' }, year: 2022, from: 2018, to: 2023, credit: 'Test', csv: true, ...extra,
});
const meta: Meta = {
  measures: [m('a'), m('b', { csv: false }), m('s', { static: true, year: 2020 })],
  groups: [['economy', 'Economy']],
  places: { AAA: { n: 'Aland', c: 'AAA' }, BBB: { n: 'Borduria', c: 'BBB' }, CCC: { n: 'Carpania', c: 'CCC' } },
  blocs: [{ id: 'g7', name: 'G7', members: ['AAA', 'BBB'] }],
  base: '/explorer/data/',
  retrieved: { a: '2026-10-26' },
};
const data: Data = {
  a: { from: 2018, v: { AAA: [1, 2, 3, 4, 5], BBB: [10, 20, 30, null, null], CCC: [100, 200, 300, 400, 500, 600] } },
  b: { from: 2018, v: { AAA: [5, 5, 5, 5, 5], BBB: [1, 1, 1, 1, 1], CCC: [3, 3, 3, 3, 3] } },
  s: { from: 2015, v: { AAA: [null, null, null, null, null, 7], CCC: [9] } },
};

describe('Explorer settings in the address', () => {
  it('round-trips each view and drops what it does not know', () => {
    const s = parseState('table', new URLSearchParams('m=a,zz,b&sort=b&dir=asc&bloc=g7&year=2021&find=bor'), meta);
    expect(s.m).toEqual(['a', 'b']);
    expect([s.sort, s.dir, s.bloc, s.year, s.find]).toEqual(['b', 'asc', 'g7', 2021, 'bor']);
    expect(queryOf(s)).toBe('m=a,b&sort=b&dir=asc&bloc=g7&year=2021&find=bor');
    const l = parseState('lines', new URLSearchParams('m=a&c=aaa,XXX,CCC&index=2019&log=0'), meta);
    expect([l.m, l.c, l.index, l.log]).toEqual([['a'], ['AAA', 'CCC'], 2019, false]);
    expect(parseState('lines', new URLSearchParams(queryOf({ ...l, c: [] })), meta).c).toEqual([]);
    const sc = parseState('scatter', new URLSearchParams('x=a&y=b&size=&pin=bbb&bloc=nope'), meta);
    expect([sc.x, sc.y, sc.size, sc.pin, sc.bloc]).toEqual(['a', 'b', '', ['BBB'], '']);
  });

  it('falls back to measures that exist when the defaults are missing', () => {
    const s = parseState('table', new URLSearchParams(), meta);
    expect(s.m.length).toBeGreaterThan(0);
    expect(s.m.every((id) => meta.measures.some((x) => x.id === id))).toBe(true);
  });

  it('marks a preset pressed only on its own settings', () => {
    const real = { ...meta, measures: ['gdppc', 'co2pc', 'population'].map((id) => m(id)) };
    const p = PRESETS.find((x) => x.id === 'richer')!;
    const s = presetState(p, real);
    expect(isPreset({ ...s, year: 2020, pin: ['AAA'] }, p, real)).toBe(true);
    expect(isPreset({ ...s, size: '' }, p, real)).toBe(false);
  });
});

describe('Explorer sums', () => {
  it('falls back up to two years, and reads a static measure’s only value', () => {
    expect(FALLBACK_YEARS).toBe(2);
    expect(valueAt(data.a, meta.measures[0], 'BBB', 2022)).toEqual({ value: 30, year: 2020 });
    expect(valueAt(data.a, meta.measures[0], 'BBB', 2023)).toBeNull();
    expect(valueAt(data.s, meta.measures[2], 'AAA', 1999)).toEqual({ value: 7, year: 2020 });
  });

  it('turns the log scale on past 30 times, never with zero or below', () => {
    expect(wantsLog([1, 31])).toBe(true);
    expect(wantsLog([1, 30])).toBe(false);
    expect(wantsLog([0, 100])).toBe(false);
  });

  it('works out the correlation', () => {
    expect(correlation([[1, 2], [2, 4], [3, 6]])).toBeCloseTo(1);
    expect(correlation([[1, 3], [2, 2], [3, 1]])).toBeCloseTo(-1);
    expect(correlation([[1, 1], [2, 1], [3, 1]])).toBeNull();
  });

  it('makes tidy ticks on both scales', () => {
    expect(ticks(3, 97, false).ticks).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks(3, 970, true).ticks).toEqual([1, 10, 100, 1000]);
  });
});

describe('Explorer views', () => {
  it('sorts the table with blanks last, filters to a bloc and marks fallback years', () => {
    const s = parseState('table', new URLSearchParams('m=a,b&sort=a'), meta);
    expect(tableRows(s, meta, data).rows.map((r) => r.id)).toEqual(['CCC', 'BBB', 'AAA']);
    expect(tableRows({ ...s, bloc: 'g7' }, meta, data).rows.map((r) => r.id)).toEqual(['BBB', 'AAA']);
    expect(tableHtml(s, meta, data)).toContain('<span class="gt-oldyr"');
  });

  it('leaves measures out of the CSV whose licence does not allow it', () => {
    const { csv, left } = tableCsv(parseState('table', new URLSearchParams('m=a,b'), meta), meta, data);
    expect(left.map((x) => x.id)).toEqual(['b']);
    expect(csv.split('\n')[0]).toBe('country,iso3,"A (US$) [Test, retrieved 2026-10-26]",A year');
    expect(csv).toContain('Carpania,CCC,500,2022');
  });

  it('indexes lines to 100 and starts the log scale on a wide spread', () => {
    const s = parseState('lines', new URLSearchParams('m=a&c=AAA,CCC&index=2019'), meta);
    const c = linesChart(s, meta, data);
    expect(c.lines[0].values[1]).toBe(100);
    expect(c.lines[1].values[2]).toBe(150);
    expect(linesChart({ ...s, index: null }, meta, data).log).toBe(true);
    expect(linesChart({ ...s, index: null, log: false }, meta, data).log).toBe(false);
  });

  it('picks a scatter year both measures cover', () => {
    const sc = scatterModel(parseState('scatter', new URLSearchParams('x=a&y=b&size='), meta), meta, { ...data });
    // Fewer than 20 places in this fixture, so no year qualifies and the common year is used.
    expect(sc.year).toBe(2022);
    expect(sc.points.map((p) => p.id).sort()).toEqual(['AAA', 'CCC']);
  });
});

describe('Explorer pages', () => {
  let R: typeof import('../../src/lib/routes.ts');
  beforeAll(async () => { R = await import('../../src/lib/routes.ts'); });
  it('builds the three views at their addresses, with a data file per measure', async () => {
    const paths = R.routes().filter((r) => r.key.startsWith('tool:explorer')).map((r) => r.path);
    expect(paths).toEqual(['/explorer', '/explorer/over-time', '/explorer/scatter']);
    const E = await import('../../src/lib/explorer.ts');
    const meta2 = E.explorerMeta();
    expect(meta2.measures.length).toBe(E.explorerMeasures().length);
    const gdp = E.explorerData('gdp');
    expect(Object.keys(gdp.v).length).toBeGreaterThan(20);
    expect(Object.keys(gdp.v).every((id) => meta2.places[id])).toBe(true);
  });
});
