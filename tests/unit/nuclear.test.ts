// The nuclear weapons views: the FAS fetcher and adapter (OWID's grapher CSV and the hand-kept FAS table), the
// treaty and sharing facts files, the three layer files, which pages are live, and the Sources page count.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import fas, { checkSeries, checkStatus } from '../../pipeline/sources/fas.ts';
import { KINDS } from '../../pipeline/sources/imported.ts';
import { prepare, readInput } from '../../pipeline/lib/importer.ts';
import { columnsOf, parseForces, parseInventory, parseStatus, seriesMeasure, statusColumns } from '../../src/adapters/nuclear.ts';
import { LICENCES, WITHHELD } from '../../src/data/licences.ts';
import { blocs } from '../../src/lib/blocs.ts';
import { PLACES } from '../../src/lib/places.ts';
import { ctxFor, fakeHttp } from './pipeline/helpers.ts';

process.env.GT_DATA = 'sample';
type Nuclear = typeof import('../../src/lib/nuclear.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let N: Nuclear;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  N = await import('../../src/lib/nuclear.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

const fixture = (p: string) => readFileSync(new URL(`../fixtures/prototype/${p}`, import.meta.url), 'utf8');
const OWID = fixture('fas/nuclear-warhead-stockpiles.csv');
const STATUS = fixture('fas/nuclear-warhead-inventories.csv');
const FORCES = fixture('fas-forces/status-world-nuclear-forces.csv');
const now = new Date('2026-11-02T12:00:00Z');

describe('FAS fetcher', () => {
  const http = fakeHttp([[/nuclear-warhead-stockpiles/, () => OWID], [/nuclear-warhead-inventories/, () => STATUS]]);

  it('keeps both OWID grapher CSVs whole: the series since 1945 and the latest split', async () => {
    const log: string[] = [];
    const r = await fas.fetch({ ...ctxFor(http, {}, now), log: (...a: unknown[]) => log.push(a.join(' ')) });
    expect(r.files.map((f) => f.name)).toEqual(['nuclear-warhead-stockpiles.csv', 'nuclear-warhead-inventories.csv']);
    expect(r.files[0].body).toBe(OWID);
    expect(r.dataTo).toBe('2025');
    // What each file holds is logged before the checks, so a refused file still shows what came back.
    expect(log.join('\n')).toMatch(/nuclear-warhead-inventories\.csv: columns entity, code, year, .*figures in 1 years \(2026–2026\)/);
  });

  it('refuses a series that holds only the latest year (what the inventories chart gave on 2 Nov 2026)', () => {
    expect(() => checkSeries(STATUS, now)).toThrow(/no warhead column/);
    expect(() => checkSeries(STATUS.replace('deployed_strategic', 'number_of_warheads'), now)).toThrow(/starts in 2026, not 1945/);
    expect(() => checkSeries(OWID.split('\n').filter((l) => !l.startsWith('Israel')).join('\n'), now)).toThrow(/ISR/);
    expect(() => checkSeries(OWID, new Date('2030-01-01'))).toThrow(/stale/);
    expect(() => checkSeries('country,year,co2\nA,2024,1\n', now)).toThrow(/Entity, Code, Year/);
  });

  it('refuses a split without status columns', () => {
    expect(checkStatus(STATUS, now).last).toBe(2026);
    expect(() => checkStatus(OWID, now)).toThrow(/no status columns/);
  });
});

describe('FAS adapter', () => {
  it('reads each state’s inventory by year, leaving out aggregates and the years before its first weapon', () => {
    const s = parseInventory(OWID);
    expect(Object.keys(s).sort()).toEqual(['CHN', 'FRA', 'GBR', 'IND', 'ISR', 'PAK', 'PRK', 'RUS', 'USA']);
    expect(Object.keys(s.USA).map(Number)[0]).toBe(1945);
    expect(s.PRK[2000]).toBeUndefined();
    expect(s.CHN[2025]).toBe(600);
  });

  it('finds a total column by name, else adds up the status columns', () => {
    expect(columnsOf(['Entity', 'Code', 'Year', 'nuclear_weapons_inventory'])).toEqual({ total: 3, parts: [] });
    // OWID's real headers (live check, 2 Nov 2026).
    expect(columnsOf(['entity', 'code', 'year', 'number_of_warheads'])).toEqual({ total: 3, parts: [] });
    expect(statusColumns(['entity', 'code', 'year', 'deployed_strategic', 'deployed_nonstrategic', 'reserve_nondeployed', 'retired'])).toEqual({ ds: 3, dn: 4, reserve: 5, retired: 6 });
    const parts = 'Entity,Code,Year,warheads_deployed_strategic,warheads_reserve,warheads_retired\nRussia,RUS,2025,1718,2591,1150\n';
    expect(parseInventory(parts).RUS[2025]).toBe(5459);
  });

  it('reads OWID’s split for its latest year, telling reserve ("nondeployed") from deployed', () => {
    expect(statusColumns(['Entity', 'Code', 'Year', 'a_deployed_strategic', 'a_deployed_nonstrategic', 'a_reserve_nondeployed', 'a_retired']))
      .toEqual({ ds: 3, dn: 4, reserve: 5, retired: 6 });
    const f = parseStatus(STATUS)!;
    expect(f.year).toBe(2026);
    expect(Object.keys(f.rows)).toHaveLength(9);
    expect(f.rows.USA).toMatchObject({ deployed: 1770, reserve: 1930, stockpile: 3700, retired: 1477, inventory: 5177 });
    expect(parseStatus(OWID)).toBeNull();
  });

  it('tells which of FAS’s totals a series counts, and extends the series only with a newer split', () => {
    const forces = parseStatus(STATUS)!;
    expect(seriesMeasure({ USA: { 2025: 3700 }, RUS: { 2025: 4309 } }, forces)).toBe('stockpile');
    expect(seriesMeasure({ USA: { 2025: 5177 }, RUS: { 2025: 5459 } }, forces)).toBe('inventory');
  });

  it('reads the hand-kept FAS table: retired is the total less the military stockpile, the Total row is skipped', () => {
    const f = parseForces(FORCES);
    expect(f.year).toBe(2025);
    expect(Object.keys(f.rows)).toHaveLength(9);
    expect(f.rows.USA).toMatchObject({ deployed: 1770, reserve: 1930, stockpile: 3700, retired: 1477, inventory: 5177 });
    expect(() => parseForces(FORCES.replace('Russia,1718,0,2591,4309,5459', 'Russia,1718,0,2591,6000,5459'))).toThrow(/add up/);
  });

  it('imports the FAS table only when it is whole, adds up and links to FAS', async () => {
    const kind = KINDS['fas-forces'];
    const read = (t: string) => readInput('status-world-nuclear-forces.csv', new TextEncoder().encode(t));
    expect(prepare(kind, await read(FORCES), now).rows).toBe(10);
    await expect(read(FORCES.replace('Russia,1718,0,2591', 'Russia,1718,0,2500')).then((i) => prepare(kind, i, now))).rejects.toThrow(/do not add up/);
    await expect(read(FORCES.replace(/\nTotal,.*\n/, '\n')).then((i) => prepare(kind, i, now))).rejects.toThrow(/Total/);
    await expect(read(FORCES.replace('https://fas.org/initiative', 'https://example.org/initiative')).then((i) => prepare(kind, i, now))).rejects.toThrow(/fas\.org/);
  });
});

describe('warheads model', () => {
  it('runs from 1945 to FAS’s current figures, which are newer than the series, in the measure the series counts', () => {
    const m = N.warheadsModel()!;
    expect(m.years[0]).toBe(1945);
    // The sample series ends in 2025; OWID's split is for 2026, so 2026 comes from it.
    expect(m.extended).toBe(2026);
    expect(m.year).toBe(2026);
    // The sample series matches FAS's total inventory (retired included), so 2026 takes the split's total inventory.
    expect(m.measure).toBe('inventory');
    expect(m.byYear[2026].rows[0]).toEqual({ id: 'RUS', value: 5459 });
    expect(m.byYear[2026].world).toBe(12291);
    expect(m.states.slice(0, 2)).toEqual(['RUS', 'USA']);
    expect(N.warheadsLede()).toMatch(/^Russia has the most estimated warheads, 5,459, then the United States with 5,177; .* early 2026\.$/);
  });

  it('reports the real peak: the mid-1980s', () => {
    const p = N.peakOf(N.warheadsModel()!);
    expect(p.year).toBeGreaterThanOrEqual(1984);
    expect(p.year).toBeLessThanOrEqual(1988);
    expect(p.world).toBeGreaterThan(60000);
  });

  it('puts the split beside the totals only for the same year, where each state’s parts add up to its total', () => {
    const m = N.warheadsModel()!;
    const f = m.forces!;
    expect(m.splitIsLatest).toBe(f.year === m.year);
    for (const x of Object.values(f.rows)) {
      expect(x.deployed + x.reserve + x.retired, x.place).toBe(x.inventory);
      expect(x.deployed + x.reserve, x.place).toBe(x.stockpile);
      // The total beside it on the map is the series' figure for the same year, within FAS's rounding.
      const total = m.byYear[f.year]?.rows.find((r) => r.id === x.place)?.value;
      if (total !== undefined) expect(Math.abs(total - x[m.measure]), x.place).toBeLessThanOrEqual(Math.max(5, 0.005 * total));
    }
  });

  it('shades on one fixed scale for every year', () => {
    expect([50, 100, 299, 300, 999, 1000, 5000, 31000].map(N.warheadClass)).toEqual([1, 2, 2, 3, 3, 4, 5, 5]);
  });
});

describe('treaty facts', () => {
  it('has an NPT row for every sovereign state but Taiwan and Kosovo, each with a UNODA link', () => {
    const t = N.treaties();
    for (const p of PLACES.filter((x) => x.kind === 'country' && !['TWN', 'XKX'].includes(x.id))) expect(t.get(p.id)?.npt, p.id).toBeTruthy();
    for (const [, x] of t) for (const r of Object.values(x)) expect(r!.source).toMatch(/^https:\/\/treaties\.unoda\.org\//);
  });

  it('puts each place in one class: the four outside the NPT, North Korea apart', () => {
    const outside = PLACES.filter((p) => N.treatyClass(p.id) === 'outside').map((p) => p.id).sort();
    expect(outside).toEqual(['IND', 'ISR', 'PAK', 'SSD']);
    expect(N.treatyClass('PRK')).toBe('withdrew');
    expect(N.treatyClass('USA')).toBe('npt');
    expect(N.treatyClass('AUT')).toBe('both');
    expect(N.treatyClass('TWN')).toBeNull();
  });

  it('stays hidden on a real build until the file has been checked against UNODA', () => {
    expect(N.TREATIES_CHECKED).toBe('');
    expect(N.nuclearLive('treaties', false)).toBe(false);
    expect(N.nuclearLive('treaties', true)).toBe(true);
  });
});

describe('sharing facts', () => {
  it('dates and cites every arrangement, and states as fact only what a government or alliance said', () => {
    for (const r of N.sharingRows()) {
      expect(r.date, r.place).toMatch(/^\d{4}-\d{2}/);
      expect(r.source, r.place).toMatch(/^https?:\/\//);
      if (r.status === 'reported') expect(r.source, r.place).toMatch(/fas\.org/);
    }
  });

  it('covers every NATO member without its own weapons under the alliance’s guarantee', () => {
    const nato = blocs().get('nato')!.filter((x) => !['USA', 'GBR', 'FRA'].includes(x)).sort();
    const covered = N.sharingRows().filter((r) => r.provider === 'nato' && r.kind === 'umbrella').map((r) => r.place).sort();
    expect(covered).toEqual(nato);
  });

  it('classes a place by its strongest arrangement, a host FAS reports apart from a stated one', () => {
    expect(N.sharingClass('RUS')).toBe('armed');
    expect(N.sharingClass('BLR')).toBe('host');
    expect(N.sharingClass('DEU')).toBe('reported');
    expect(N.sharingClass('JPN')).toBe('umbrella');
    expect(N.sharingClass('BRA')).toBeNull();
  });
});

describe('nuclear layers and pages', () => {
  it('tags every warhead figure as an estimate', () => {
    const f = L.layerFile('nuclear-warheads');
    expect(f.data[0].year).toBe(1945);
    for (const y of f.data) {
      expect(y.status).toBe('estimate');
      // Every figure is an estimate; the wording of its year is tested below.
      for (const e of Object.values(y.v)) expect(e[3]).toBe('estimate');
    }
    expect(f.more?.USA?.[0].rows.map((r) => r.value)).toEqual(['1,770', '1,930', '3,700', '1,477', '5,177']);
  });

  it('draws treaty and sharing classes in the categorical colours, and a reported host as a pattern', () => {
    const t = L.layerFile('nuclear-treaties');
    const s = L.layerFile('nuclear-sharing');
    expect(t.palette).toBe('cat');
    expect(s.palette).toBe('cat');
    // A host only FAS reports: the hatch class, drawn in the stated hosts' colour.
    expect(s.data[0].v.DEU[0]).toBe(-2);
    expect(s.hatch).toEqual({ cls: s.data[0].v.BLR[0], label: expect.stringMatching(/reported by FAS/) });
    expect(s.missing.notyet).toBeUndefined();
  });

  it('counts each arrangement the same way in the answer and the world panel: a covered host counts in both', () => {
    const c = N.sharingCounts();
    const s = L.layerFile('nuclear-sharing');
    expect(s.tally!.map((t) => t.n)).toEqual([c.armed, c.host, c.reported, c.umbrella]);
    expect(N.sharingLede()).toContain(`${c.host + c.reported} countries host`);
    expect(N.sharingLede()).toContain(`and ${c.umbrella} are covered`);
    // Germany hosts (reported) and is covered by NATO's guarantee, so it is in the covered count too.
    const covered = new Set(N.sharingRows().filter((r) => r.kind === 'umbrella').map((r) => r.place));
    expect(covered.has('DEU')).toBe(true);
    expect(c.umbrella).toBe(covered.size);
  });

  it('names a provider with its article inside a sentence', () => {
    expect(N.providerName('USA')).toBe('the United States');
    expect(N.providerName('RUS')).toBe('Russia');
    const rows = L.layerFile('nuclear-sharing').more!.JPN[0].rows;
    expect(rows[0].name).toBe('Covered by the nuclear guarantee of the United States');
  });

  it('builds /nuclear, /nuclear/treaties and /nuclear/sharing in the power hub, and lists the family in the Atlas', () => {
    const paths = R.routes().filter((r) => r.key.startsWith('view:nuclear:')).map((r) => r.path);
    expect(paths).toEqual(['/nuclear', '/nuclear/treaties', '/nuclear/sharing']);
    expect(R.hubOf('nuclear')).toBe('power');
    expect(L.mapLayers().filter((d) => d.family === 'nuclear').map((d) => d.id)).toEqual(['nuclear-warheads', 'nuclear-treaties', 'nuclear-sharing']);
  });
});

describe('source count', () => {
  it('lists the sources with data on the site: none withheld, none waiting for its first check', async () => {
    const { sourceRows } = await import('../../src/lib/sources.ts');
    const ids = sourceRows().map((r) => r.id);
    // The sample snapshot has every licensed source, so only the withheld ones, the unchecked treaty list and PeeringDB
    // (licensed, but nothing fetches it yet) drop out.
    const out = [...WITHHELD, 'unoda', 'peeringdb'];
    expect(ids.sort()).toEqual(LICENCES.map((l) => l.source).filter((s) => !out.includes(s)).sort());
  });

  it('reads a fetched source as live from the snapshot, not from an API key in the build', async () => {
    const { sourceRows } = await import('../../src/lib/sources.ts');
    expect(process.env.COMTRADE_API_KEY).toBeUndefined();
    expect(sourceRows().find((r) => r.id === 'comtrade')?.state).toBe('live');
  });
});

describe('fact dates', () => {
  it('writes a date only as precisely as the row gives it', async () => {
    const { formatPartialDate } = await import('../../src/lib/format.ts');
    expect(formatPartialDate('2023')).toBe('2023');
    expect(formatPartialDate('2023-06')).toBe('Jun 2023');
    expect(formatPartialDate('2024-12-06')).toBe('6 Dec 2024');
    expect(L.layerFile('nuclear-sharing').more!.BLR[0].rows.map((r) => r.note?.split(' · ')[0])).toEqual(['16 Jun 2023', '6 Dec 2024']);
  });
});

describe('nuclear follow-ups', () => {
  it('names Russia’s figures to 1991 the Soviet Union, on Russia’s shape, without moving them', () => {
    expect(N.nameIn('RUS', 1986)).toBe('Soviet Union');
    expect(N.nameIn('RUS', 1992)).toBe('Russia');
    expect(N.codeIn('RUS', 1991)).toBe('SUN');
    expect(N.codeIn('RUS', 1992)).toBe('RUS');
    const f = L.layerFile('nuclear-warheads');
    const y1986 = f.data.find((d) => d.year === 1986)!;
    const y2000 = f.data.find((d) => d.year === 2000)!;
    // Same place id and figure, only the name changes.
    expect(y1986.v.RUS[1]).toBe('40,159');
    expect(y1986.names).toEqual({ RUS: 'Soviet Union' });
    expect(y2000.names).toBeUndefined();
    expect(f.notes.RUS).toMatch(/Figures to 1991 are the Soviet Union’s, shown on Russia’s shape; Russia from 1992\./);
  });

  it('says "FAS estimate, as of early {year}" only for the year of FAS’s current page', () => {
    const m = N.warheadsModel()!;
    const f = L.layerFile('nuclear-warheads');
    expect(m.current).toBe(m.forces!.year);
    for (const y of f.data) for (const e of Object.values(y.v)) expect(e[2]).toBe(y.year === m.current ? `FAS estimate, as of early ${y.year}` : String(y.year));
  });

  it('gives a change from under 100 warheads in warheads, not a percentage', async () => {
    const { NUCLEAR_TEXT: T } = await import('../../src/i18n/nuclear.en.ts');
    expect(T.changeAbs('up', 59, 1949)).toBe('Up 59 warheads from 1949');
    expect(T.changeAbs('down', 1, 1990)).toBe('Down 1 warhead from 1990');
  });

  it('stacks each arrangement in the sharing panel, saying "reported by FAS" once', async () => {
    const { blockHtml, countryPanelHtml } = await import('../../src/scripts/map/panel.ts');
    const s = L.layerFile('nuclear-sharing');
    const de = s.more!.DEU[0];
    expect(de.stack).toBe(true);
    expect(de.rows.map((r) => r.name)).toEqual(['Hosts weapons of the United States', 'Covered by the nuclear guarantee of NATO (the United States, the United Kingdom and France)']);
    expect(de.rows.map((r) => r.swatch?.hatch)).toEqual([true, false]);
    expect(blockHtml(de)).toMatch(/gt-prows--stack/);
    const html = countryPanelHtml(s, 0, 'DEU');
    expect(html.match(/reported by FAS/gi)).toHaveLength(1);
    // A guarantee only (Japan), and stated hosting (Belarus): solid keys, stated.
    expect(s.more!.JPN[0].rows).toEqual([expect.objectContaining({ value: 'Stated by a government or alliance', swatch: { color: 'var(--cat-3)', hatch: false } })]);
    expect(s.more!.BLR[0].rows[0]).toMatchObject({ name: 'Hosts weapons of Russia', swatch: { color: 'var(--cat-2)', hatch: false } });
  });
});
