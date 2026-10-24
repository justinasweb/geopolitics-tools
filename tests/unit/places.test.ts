import { describe, expect, it } from 'vitest';
import M49_ISO3 from '../../pipeline/reference/m49-iso3.json';
import { CODES, Matcher, NOTES, PLACES, normName, notesFor, parentName, place, type CodeRow } from '../../src/lib/places.ts';

describe('places table', () => {
  it('has unique ids, slugs and codes, and every reference points at a place', () => {
    const unique = (xs: string[]) => expect(new Set(xs).size).toBe(xs.length);
    unique(PLACES.map((p) => p.id));
    unique(PLACES.map((p) => p.slug));
    unique(PLACES.filter((p) => p.iso3).map((p) => p.iso3));
    unique(PLACES.filter((p) => p.iso2).map((p) => p.iso2));
    unique(PLACES.filter((p) => p.m49).map((p) => p.m49));
    for (const p of PLACES) {
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      if (p.parent) expect(place(p.parent)?.kind).toBe('country');
      for (const s of p.splitInto) expect(place(s), `${p.id} → ${s}`).toBeDefined();
      if (p.kind === 'historical') expect(p.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const r of CODES) if (r.place) expect(place(r.place), `${r.source} ${r.code}`).toBeDefined();
    for (const n of NOTES) expect(place(n.place), n.note).toBeDefined();
  });

  it('covers ISO 3166-1, Kosovo and the former states in the policy', () => {
    expect(PLACES.filter((p) => p.iso3 && p.kind !== 'historical')).toHaveLength(249);
    expect(PLACES.filter((p) => p.kind === 'country')).toHaveLength(197);
    expect(PLACES.filter((p) => p.kind === 'historical').map((p) => p.name)).toEqual(expect.arrayContaining(['Soviet Union', 'Yugoslavia', 'Czechoslovakia', 'Serbia and Montenegro', 'Sudan (before 2011)', 'East Germany', 'West Germany']));
  });

  it('uses the approved display names', () => {
    const names = Object.fromEntries(PLACES.map((p) => [p.id, p.name]));
    expect(names).toMatchObject({ TWN: 'Taiwan', PSE: 'Palestine', XKX: 'Kosovo', TUR: 'Türkiye', MMR: 'Myanmar', RUS: 'Russia', IRN: 'Iran', SYR: 'Syria', KOR: 'South Korea', VNM: 'Vietnam', CZE: 'Czechia', CIV: "Côte d'Ivoire" });
    expect(place('TWN')?.isoName).toBe('Taiwan, Province of China');
    expect(place('HKG')).toMatchObject({ kind: 'territory', status: 'Special administrative region of China' });
    expect(parentName('GRL')).toBe('Denmark');
    expect(place('USA')?.slug).toBe('united-states');
  });

  it('agrees with the M49 table the FAOSTAT fetcher uses', () => {
    const m = new Matcher('test', 'm49');
    for (const [code, iso3] of Object.entries(M49_ISO3 as Record<string, string>)) expect(m.match(code)).toBe(iso3);
  });
});

describe('Matcher', () => {
  it('matches ISO, M49 and names, and reports what it could not match', () => {
    const m = new Matcher('worldbank', 'iso3');
    expect(m.match('deu')).toBe('DEU');
    expect(m.match('XKX')).toBe('XKX');
    expect(m.match('WLD')).toBeNull();
    expect(m.match('WLD')).toBeNull();
    expect(m.match('EAS')).toBeNull();
    expect(m.unmatched()).toEqual([['WLD', 2], ['EAS', 1]]);
    expect(m.report()).toBe('worldbank: 2 unmatched iso3 code(s): WLD (2), EAS (1)');
    expect(new Matcher('x', 'm49').match('076')).toBe('BRA');
    const n = new Matcher('uk-sanctions', 'name');
    for (const [name, id] of [['Russian Federation', 'RUS'], ['Korea, North', 'PRK'], ['St. Kitts & Nevis', 'KNA'], ['The Gambia', 'GMB'], ['TURKIYE', 'TUR'], ['Cote d’Ivoire', 'CIV'], ['Congo (Kinshasa)', 'COD']]) expect(n.match(name), name).toBe(id);
    expect(normName('  São Tomé & Príncipe ')).toBe('sao tome and principe');
  });

  it('applies a source’s own rows before the shared ones, skips aggregates without reporting them, and honours dates', () => {
    expect(new Matcher('owid', 'iso3').match('OWID_KOS')).toBe('XKX');
    const c = new Matcher('comtrade', 'm49');
    expect(c.match('490')).toBe('TWN');
    expect(c.match('0')).toBeNull();
    expect(c.isAggregate('0')).toBe(true);
    expect(c.unmatched()).toEqual([]);
    const f = new Matcher('faostat', 'm49');
    expect(f.match('159')).toBeNull();
    expect(f.match('156')).toBe('CHN');
    expect(f.unmatched()).toEqual([]);
    const rows: CodeRow[] = [
      { source: 'ucdp', system: 'iso3', code: 'SDN', place: 'XSD', start: '', end: '2011-07-09', note: '' },
      { source: 'other', system: 'iso3', code: 'SDN', place: 'SSD', start: '', end: '', note: '' },
    ];
    const u = new Matcher('ucdp', 'iso3', rows);
    expect(u.match('SDN', '2010')).toBe('XSD');
    expect(u.match('SDN', '2011-07-08')).toBe('XSD');
    expect(u.match('SDN', '2012')).toBe('SDN');
    expect(u.match('SDN')).toBe('XSD');
  });

  it('gives a source’s coverage notes', () => {
    expect(notesFor('worldbank', 'MAR').map((n) => n.note)).toEqual(['World Bank figures for Morocco include Western Sahara']);
    expect(notesFor('owid', 'MAR')).toEqual([]);
    expect(notesFor('owid', 'XKX')).toHaveLength(1);
  });
});
