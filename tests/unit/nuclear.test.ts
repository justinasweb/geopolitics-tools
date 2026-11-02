// The nuclear weapons views: the FAS fetcher and adapter (OWID's grapher CSV and the hand-kept FAS table), the
// treaty and sharing facts files, the three layer files, which pages are live, and the Sources page count.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import fas, { checkFas } from '../../pipeline/sources/fas.ts';
import { KINDS } from '../../pipeline/sources/imported.ts';
import { prepare, readInput } from '../../pipeline/lib/importer.ts';
import { columnsOf, parseForces, parseInventory } from '../../src/adapters/nuclear.ts';
import { LICENCES } from '../../src/data/licences.ts';
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
const OWID = fixture('fas/nuclear-warhead-inventories.csv');
const FORCES = fixture('fas-forces/status-world-nuclear-forces.csv');
const now = new Date('2026-11-02T12:00:00Z');

describe('FAS fetcher', () => {
  it('keeps OWID’s grapher CSV whole, with the nine states from 1945', async () => {
    const r = await fas.fetch(ctxFor(fakeHttp([[/nuclear-warhead-inventories/, () => OWID]]), {}, now));
    expect(r.files[0].name).toBe('nuclear-warhead-inventories.csv');
    expect(r.files[0].body).toBe(OWID);
    expect(r.dataTo).toBe('2025');
  });

  it('refuses a file missing a state, a stale file or another format', () => {
    expect(() => checkFas(OWID.split('\n').filter((l) => !l.startsWith('Israel')).join('\n'), now)).toThrow(/ISR/);
    expect(() => checkFas(OWID, new Date('2030-01-01'))).toThrow(/stale/);
    expect(() => checkFas('country,year,co2\nA,2024,1\n', now)).toThrow(/Entity, Code, Year/);
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
    const parts = 'Entity,Code,Year,warheads_deployed_strategic,warheads_reserve,warheads_retired\nRussia,RUS,2025,1718,2591,1150\n';
    expect(parseInventory(parts).RUS[2025]).toBe(5459);
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
  it('takes the FAS table’s year over OWID’s, with the world total as the sum of the states', () => {
    const m = N.warheadsModel()!;
    expect(m.year).toBe(2025);
    expect(m.byYear[2025].rows[0]).toEqual({ id: 'RUS', value: 5459 });
    expect(m.byYear[2025].world).toBe(12241);
    expect(m.states.slice(0, 2)).toEqual(['RUS', 'USA']);
    expect(N.warheadsLede()).toMatch(/^Russia has the largest estimated inventory, 5,459 warheads, then the United States with 5,177; .* early 2025\.$/);
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
  it('tags every warhead figure as an FAS estimate', () => {
    const f = L.layerFile('nuclear-warheads');
    expect(f.data[0].year).toBe(1945);
    for (const y of f.data) {
      expect(y.status).toBe('estimate');
      for (const e of Object.values(y.v)) expect(e.slice(2, 4)).toEqual([`FAS estimate, as of early ${y.year}`, 'estimate']);
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
  it('lists one Sources page row per licence, so every count reads the licence table', async () => {
    const { sourceRows } = await import('../../src/lib/sources.ts');
    const rows = sourceRows();
    expect(LICENCES.map((l) => l.source)).toEqual(expect.arrayContaining(['fas', 'unoda']));
    expect(rows.map((r) => r.id).sort()).toEqual(LICENCES.map((l) => l.source).sort());
  });
});

describe('fact dates', () => {
  it('writes a date only as precisely as the row gives it', async () => {
    const { formatPartialDate } = await import('../../src/lib/format.ts');
    expect(formatPartialDate('2023')).toBe('2023');
    expect(formatPartialDate('2023-06')).toBe('Jun 2023');
    expect(formatPartialDate('2024-12-06')).toBe('6 Dec 2024');
    expect(L.layerFile('nuclear-sharing').more!.BLR[0].rows.map((r) => r.note?.split(' · ')[0])).toEqual(['Jun 2023', '6 Dec 2024']);
  });
});
