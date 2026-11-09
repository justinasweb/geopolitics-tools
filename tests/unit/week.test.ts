import { describe, expect, it } from 'vitest';
import type { Raw } from '../../src/adapters/core.ts';
import { entries, changes } from '../../src/adapters/sanctions.ts';
import { computeWeek, hasFigures, alertCount, type WeekInput } from '../../src/lib/week/model.ts';
import { addDays, rollingWeek, isWeekId, isoWeek, lastClosedWeek, prevWeek, weekId, weekRange } from '../../src/lib/week/period.ts';
import { day, months, pct, range, WEEK_TEXT } from '../../src/i18n/week.en.ts';

// This week: the live page's last 7 days and the closed ISO weeks of the archive, the cards worked out
// from raw files in the sources' own formats, new and still-active alerts, the no-new-data rule, sanctions entries
// added and removed, every range on a page naming the same days, and the words.
process.env.GT_DATA = 'sample';

/** A snapshot's raw files in memory: { 'gdacs/events.json': … }. */
function memRaw(files: Record<string, unknown>): Raw {
  const text = (s: string, f: string) => {
    const v = files[`${s}/${f}`];
    if (v === undefined) throw new Error(`${s}/${f} is not in the snapshot at memory`);
    return typeof v === 'string' ? v : JSON.stringify(v);
  };
  return {
    has: (s, f) => `${s}/${f}` in files,
    list: (s) => Object.keys(files).filter((k) => k.startsWith(`${s}/`)).map((k) => k.slice(s.length + 1)).sort(),
    text,
    json: <T>(s: string, f: string) => JSON.parse(text(s, f)) as T,
  };
}

const gdacs = (id: number, level: string, type: string, iso3: string, from: string, to: string, name = `${type} ${id}`, current = false) => ({
  geometry: { coordinates: [120, 15] },
  properties: { eventtype: type, eventid: id, name, alertlevel: level, iso3, fromdate: from, todate: to, iscurrent: String(current), affectedcountries: [{ iso3 }] },
});
const ged = (id: number, date: string, gw: number) => ({ id, date_start: date, latitude: 1, longitude: 1, type_of_violence: 1, country_id: gw, adm_1: '', best: 1 });
const pink = (cols: Record<string, string>, rows: Record<string, unknown>[]) => ({ columns: cols, data: rows });
const csl = (ids: [string, string][]) => ({ results: ids.map(([id, c]) => ({ id, source: 'Specially Designated Nationals (SDN) - Treasury Department', type: 'Entity', addresses: [{ country: c }] })) });

const files = {
  'gdacs/events.json': {
    features: [
      gdacs(1, 'Red', 'TC', 'PHL', '2026-10-21T04:10:00', '2026-10-23T00:00:00'), // began in the week
      gdacs(2, 'Orange', 'FL', 'NGA', '2026-10-10T00:00:00', '2026-10-23T00:00:00'), // orange before the week: still active
      gdacs(5, 'Orange', 'FL', 'IND', '2026-10-15T00:00:00', '2026-10-22T00:00:00'), // green on Monday: rose in the week
      // One storm as two GDACS events, the second from the day the first ended: merged, still active.
      gdacs(6, 'Red', 'TC', 'IND', '2026-10-14T00:00:00', '2026-10-20T00:00:00', 'MONTHA-26'),
      gdacs(7, 'Red', 'TC', 'BGD', '2026-10-20T00:00:00', '2026-10-22T00:00:00', 'MONTHA-26'),
      gdacs(3, 'Orange', 'EQ', 'PER', '2026-09-01T00:00:00', '2026-09-02T00:00:00'), // ended before the period
      // A drought GDACS last updated weeks ago but lists as current: still active.
      gdacs(20, 'Orange', 'DR', 'SOM', '2025-12-21T00:00:00', '2026-10-01T00:00:00', 'Drought in Somalia', true),
      gdacs(21, 'Orange', 'DR', 'ETH', '2026-04-21T00:00:00', '2026-09-30T00:00:00', 'Drought in Ethiopia', false), // over
      gdacs(4, 'Green', 'TC', 'VNM', '2026-10-20T00:00:00', '2026-10-21T00:00:00'), // not counted
    ],
  },
  'ioda/outage_events.json': { data: [{ location: 'country/CU', start: Date.UTC(2026, 9, 20, 22, 45) / 1000, duration: 9 * 3600, score: 1 }, { location: 'country/IQ', start: Date.UTC(2026, 8, 1) / 1000, duration: 3600, score: 1 }] },
  'ucdp/gedevents_26.0.9.json': { Result: [ged(1, '2026-08-03', 369), ged(2, '2026-08-04', 369), ged(3, '2026-09-01', 369), ged(4, '2026-09-02', 625), ged(5, '2026-09-03', 625), ged(6, '2026-08-05', 625)] },
  'pinksheet/cmo_food_prices.json': pink({ MAIZE: 'Maize' }, [{ period: '2025M09', MAIZE: 200 }, { period: '2026M08', MAIZE: 190 }, { period: '2026M09', MAIZE: 199.5 }]),
  'pinksheet/cmo_metals_prices.json': pink({ GOLD: 'Gold ($/troy oz)' }, [{ period: '2026M08', GOLD: 4000 }, { period: '2026M09', GOLD: 3800 }]),
  'pinksheet/cmo_gas_prices.json': pink({ NGAS_EUR: 'Natural gas, Europe' }, [{ period: '2026M09', NGAS_EUR: 11 }]),
  'csl/consolidated.json': csl([['a', 'RU'], ['b', 'RU'], ['c', 'IR']]),
};
/** The last 7 days to Thursday 22 October 2026: 16–22 October. */
const period = rollingWeek('2026-10-22');
const fresh = { fetched: '2026-10-22T06:00:00Z', changed: '2026-10-21T06:00:00Z' };
const input = (over: Partial<WeekInput> = {}): WeekInput => ({
  raw: memRaw(files), period, made: '2026-10-22T06:00:00Z',
  sources: { gdacs: fresh, ioda: fresh, ucdp: fresh, pinksheet: fresh, csl: fresh },
  baseline: {
    date: '2026-10-16',
    raw: memRaw({
      'csl/consolidated.json': csl([['a', 'RU'], ['z', 'CN']]),
      'gdacs/events.json': { features: [
        gdacs(2, 'Orange', 'FL', 'NGA', '2026-10-10T00:00:00', '2026-10-18T00:00:00'),
        gdacs(5, 'Green', 'FL', 'IND', '2026-10-15T00:00:00', '2026-10-18T00:00:00'),
        gdacs(6, 'Red', 'TC', 'IND', '2026-10-14T00:00:00', '2026-10-18T00:00:00', 'MONTHA-26'),
        gdacs(20, 'Orange', 'DR', 'SOM', '2025-12-21T00:00:00', '2026-10-01T00:00:00', 'Drought in Somalia', true),
      ] },
    }),
  },
  ...over,
});

describe('weeks and periods', () => {
  it('numbers ISO weeks, including the ones that straddle a new year', () => {
    expect(isoWeek('2026-11-02')).toEqual({ year: 2026, week: 45 });
    expect(weekId('2026-01-01')).toBe('2026-01');
    expect(weekId('2027-01-01')).toBe('2026-53');
    expect(weekId('2024-12-30')).toBe('2025-01');
    expect(weekRange('2026-45')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(weekRange('2025-01')).toEqual({ from: '2024-12-30', to: '2025-01-05' });
    expect(prevWeek('2026-01')).toBe('2025-52');
    expect(isWeekId('2026-45')).toBe(true);
    expect(isWeekId('2025-53')).toBe(false);
    expect(isWeekId('2026-5')).toBe(false);
  });

  it('closes a week on the Monday after it; the live page covers the last 7 days to the data day', () => {
    expect(lastClosedWeek('2026-11-02T00:23:00Z')).toBe('2026-44');
    expect(lastClosedWeek('2026-11-08')).toBe('2026-44');
    expect(lastClosedWeek('2026-11-09')).toBe('2026-45');
    expect(rollingWeek('2026-10-22')).toEqual({ from: '2026-10-16', to: '2026-10-22' });
    expect(rollingWeek('2026-11-02T00:23:00Z')).toEqual({ from: '2026-10-27', to: '2026-11-02' });
    expect(rollingWeek('2026-01-02')).toEqual({ from: '2025-12-27', to: '2026-01-02' });
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('This week cards', () => {
  const w = computeWeek(input());
  const card = <K extends string>(k: K) => w.cards.find((c) => c.kind === k) as Extract<(typeof w.cards)[number], { kind: K }>;

  it('has a card per source in the snapshot, in the design order, and none for hidden ones', () => {
    expect(w.cards.map((c) => c.kind)).toEqual(['disaster', 'conflict', 'prices', 'outage', 'sanctions']);
    const without = computeWeek(input({ sources: { gdacs: fresh } }));
    expect(without.cards.map((c) => c.kind)).toEqual(['disaster']);
  });

  it('counts alerts that began, or rose to orange or red, in the week, and lists the earlier ones still active apart', () => {
    const d = card('disaster');
    expect(d.alerts.map((a) => [a.id, a.level, a.places, a.rose ?? false])).toEqual([['TC1', 'red', ['PHL'], false], ['FL5', 'orange', ['IND'], true]]);
    expect(alertCount(w)).toBe(2);
    expect(d.active.map((a) => [a.id, a.from])).toEqual([['TC6', '2026-10-14'], ['FL2', '2026-10-10'], ['DR20', '2025-12-21']]);
    expect(d.compared).toBe(true);
  });

  it('merges one named storm GDACS keeps as two events, but never generic names of other kinds', () => {
    const tc = card('disaster').active.find((a) => a.type === 'TC')!;
    expect(tc).toMatchObject({ id: 'TC6', level: 'red', from: '2026-10-14', places: ['IND', 'BGD'], merged: ['TC6', 'TC7'] });
    const floods = computeWeek(input({ raw: memRaw({ ...files, 'gdacs/events.json': { features: [
      gdacs(8, 'Orange', 'FL', 'IND', '2026-10-20T00:00:00', '2026-10-21T00:00:00', 'Flood in India'),
      gdacs(9, 'Orange', 'FL', 'IND', '2026-10-21T00:00:00', '2026-10-22T00:00:00', 'Flood in India'),
    ] } }) })).cards.find((c) => c.kind === 'disaster');
    expect(alertCount({ ...w, cards: [floods!] })).toBe(2);
  });

  it('without a GDACS copy from Monday, counts only alerts that began in the week', () => {
    const d = computeWeek(input({ baseline: null })).cards.find((c) => c.kind === 'disaster')!;
    expect(d).toMatchObject({ compared: false });
    expect((d as { alerts: { id: string }[] }).alerts.map((a) => a.id)).toEqual(['TC1']);
  });

  it('compares the latest conflict month with the one before', () => {
    const c = card('conflict');
    expect([c.prev, c.month, c.preliminary]).toEqual(['2026-08', '2026-09', true]);
    expect(c.rows).toEqual([{ place: 'SDN', a: 1, b: 2 }, { place: 'UKR', a: 2, b: 1 }]);
  });

  it('gives each price its month and year change, and leaves out a change it cannot work out', () => {
    const p = card('prices');
    expect(p.month).toBe('2026-09');
    const by = Object.fromEntries(p.rows.map((r) => [r.code, r]));
    expect(by.MAIZE.month).toBeCloseTo(0.05);
    expect(by.MAIZE.year).toBeCloseTo(-0.0025);
    expect(by.GOLD.month).toBeCloseTo(-0.05);
    expect(by.NGAS_EUR).toMatchObject({ month: null, year: null });
  });

  it('lists outages that began in the period, with no cause', () => {
    expect(card('outage').rows).toEqual([{ place: 'CUB', start: '2026-10-20T22:45:00.000Z', hours: 9 }]);
  });

  it('counts sanctions entries added and removed against the earlier copy, and where the added ones are', () => {
    expect(card('sanctions')).toMatchObject({ since: '2026-10-16', lists: [{ list: 'US', added: 2, removed: 1 }], places: [{ place: 'IRN', n: 1 }, { place: 'RUS', n: 1 }] });
    const none = computeWeek(input({ baseline: null })).cards.find((c) => c.kind === 'sanctions')!;
    expect(none).toMatchObject({ since: null, lists: [] });
    expect(hasFigures(none)).toBe(false);
  });

  it('shows no new data, and no figures, for a source that has not changed since the period began', () => {
    const old = { fetched: '2026-10-22T06:00:00Z', changed: '2026-10-02T06:00:00Z' };
    const q = computeWeek(input({ sources: { gdacs: fresh, ioda: fresh, ucdp: old, pinksheet: old, csl: old } }));
    for (const k of ['conflict', 'prices', 'sanctions']) {
      const c = q.cards.find((x) => x.kind === k)!;
      expect(c.quiet, k).toBe(true);
      expect(hasFigures(c)).toBe(false);
    }
    expect(q.cards.find((x) => x.kind === 'prices')).toMatchObject({ rows: [] });
    expect(q.cards.find((x) => x.kind === 'conflict')).toMatchObject({ rows: [], month: '2026-09' });
  });

  it('mixes alerts, outages and releases in the feed, newest first; an archived week keeps its own days', () => {
    expect(w.feed.map((f) => [f.kind, f.date])).toEqual([
      ['disaster', '2026-10-21'], ['conflict', '2026-10-21'], ['prices', '2026-10-21'], ['outage', '2026-10-20'], ['disaster', '2026-10-15'],
      ['disaster', '2026-10-14'], ['disaster', '2026-10-10'],
    ]);
    expect(w.feed[0]).toMatchObject({ time: '04:10' });
    const week = computeWeek(input({ week: '2026-43', period: weekRange('2026-43'), feedFrom: weekRange('2026-43').from }));
    expect(week.week).toBe('2026-43');
    expect(week.feed.every((f) => f.date >= '2026-10-19')).toBe(true);
  });
});

describe('sanctions entries', () => {
  it('reads every list by its own id, US from the SDN list and the Entity List only', () => {
    const e = entries(memRaw({
      'csl/consolidated.json': { results: [{ id: 'x', source: 'Entity List (EL) - Bureau of Industry and Security', addresses: [{ country: 'CN' }] }, { id: 'y', source: 'Denied Persons List (DPL) - Bureau of Industry and Security' }] },
      'uk-sanctions/sanctions.csv': 'Unique ID,Designation Type,Regime Name,Date Designated,Address Country,Nationality(/ies)\nUK1,Entity,Russia,2023-01-01,Russia,\nUK1,Entity,Russia,2023-01-01,Russia,\nUK2,Individual,Iran,2023-01-01,,Iran\n',
    }));
    expect([...e.US!]).toEqual([['x', 'CHN']]);
    expect([...e.UK!]).toEqual([['UK1', 'RUS'], ['UK2', 'IRN']]);
    expect(e.EU).toBeUndefined();
    expect(changes({ UK: new Map([['UK1', 'RUS']]) }, e)).toEqual([{ list: 'UK', added: ['UK2'], removed: [], places: ['IRN'] }]);
  });
});

describe('This week words', () => {
  it('writes dates, ranges and changes as the designs do', () => {
    expect(day('2026-10-21')).toBe('21 Oct');
    expect(day('2026-10-21', { long: true })).toBe('21 October 2026');
    expect(range('2026-10-15', '2026-10-21')).toBe('15–21 Oct 2026');
    expect(range('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct 2026');
    expect(range('2025-12-29', '2026-01-04')).toBe('29 Dec 2025 – 4 Jan 2026');
    expect(range('2026-10-15', '2026-10-21', { long: true })).toBe('15–21 October 2026');
    expect(range('2026-10-15', '2026-10-21', { year: false })).toBe('15–21 Oct');
    expect(months('2026-08', '2026-09')).toBe('Aug–Sep 2026');
    expect(pct(0.05)).toBe('+5.0%');
    expect(pct(-0.031)).toBe('−3.1%');
  });

  it('states findings as directions and counts, never as verdicts', () => {
    const W = WEEK_TEXT;
    expect(W.alertsHead(7, 1)).toBe('7 new orange and red alerts, one of them red');
    expect(W.alertsHead(0, 0)).toBe('No new orange or red alerts');
    expect(W.alertsHead(2, 2)).toBe('2 new red alerts');
    expect(W.conflictHead('Ukraine', ['Sudan', 'Syria'], 'August', 'September 2026')).toBe('Most events in Ukraine; Sudan and Syria up on August');
    expect(W.pricesHead({ name: 'Gold', c: 0.05 }, { name: 'Natural gas, Europe', c: -0.03 }, 'September 2026')).toBe('Gold up 5% on the month, natural gas, Europe down 3%');
    expect(W.sanctionsHead(61, 7, ['US', 'EU', 'UK'])).toBe('61 entries added to US, EU and UK sanctions lists');
    expect(W.outagesHead(1)).toBe('1 national-scale internet outage');
    const all = JSON.stringify(Object.values(W).map(String)).toLowerCase();
    expect(all).not.toMatch(/famine|dominant|vulnerable|cause:/);
  });
});

describe('This week pages name one range everywhere', () => {
  /** A week's files with one alert, one outage and the lists, dated inside the given week. */
  const weekFiles = (d: string) => ({
    'gdacs/events.json': { features: [
      gdacs(11, 'Red', 'TC', 'PHL', `${d}T04:00:00`, `${d}T08:00:00`),
      // Fourteen countries: three shown, the rest behind "+ 11 more".
      { ...gdacs(12, 'Orange', 'DR', 'ETH', `${d}T00:00:00`, `${d}T00:00:00`), properties: { ...gdacs(12, 'Orange', 'DR', 'ETH', `${d}T00:00:00`, `${d}T00:00:00`).properties,
        affectedcountries: ['ETH', 'KEN', 'SOM', 'SDN', 'SSD', 'UGA', 'TZA', 'RWA', 'BDI', 'ERI', 'DJI', 'YEM', 'OMN', 'SAU'].map((iso3) => ({ iso3 })) } },
    ] },
    'ioda/outage_events.json': { data: [{ location: 'country/CU', start: Date.parse(`${d}T10:00:00Z`) / 1000, duration: 3600, score: 1 }] },
    'csl/consolidated.json': csl([['a', 'RU']]),
  });
  const pageFor = async (made: string, week?: string) => {
    const { weekPageFor } = await import('../../src/lib/week.ts');
    const p = week ? weekRange(week) : rollingWeek(made);
    const src = { fetched: `${made}T06:00:00Z`, changed: `${made}T06:00:00Z` };
    const w = computeWeek({
      raw: memRaw(weekFiles(made)), period: p, made: `${made}T06:00:00Z`, week, feedFrom: week ? p.from : undefined,
      sources: { gdacs: src, ioda: src, csl: src },
      baseline: { date: p.from, raw: memRaw({ 'csl/consolidated.json': csl([]) }) },
    });
    return weekPageFor(w, week ?? null);
  };
  it('an archived week without the earlier copies says so in the past, promising nothing; the live page says what comes', async () => {
    const { weekPageFor } = await import('../../src/lib/week.ts');
    const made = '2026-11-03';
    const page = (week?: string) => {
      const p = week ? weekRange(week) : rollingWeek(made);
      const src = { fetched: `${made}T06:00:00Z`, changed: `${made}T06:00:00Z` };
      return weekPageFor(computeWeek({ raw: memRaw(weekFiles(made)), period: p, made: `${made}T06:00:00Z`, week, feedFrom: week ? p.from : undefined, sources: { gdacs: src, ioda: src, csl: src }, baseline: null }), week ?? null);
    };
    const words = (m: ReturnType<typeof page>) => JSON.stringify(m.cards);
    expect(words(page('2026-44'))).not.toMatch(/from now on|compare yet/);
    expect(words(page('2026-44'))).toMatch(/no copy from that day was kept/);
    expect(words(page())).toMatch(/one is kept every day from now on/);
  });

  const check = (m: Awaited<ReturnType<typeof pageFor>>, long: string, short: string, id?: string) => {
    expect(m.title).toBe(id ? `Week ${Number(id.slice(5))}: ${long}` : `Last 7 days: ${long}`);
    expect(m.rangeText).toBe(long);
    expect(m.counts.map((c) => c.source)).toEqual([`GDACS · ${short}`]);
    for (const c of m.cards) expect(c.period, c.kind).toBe(short);
    // The live page links to the last four closed weeks by name (the sample build has week 42); an archived week does not.
    expect(m.nav.recent).toEqual(id ? [] : [{ href: '/this-week/2026-42', label: 'Week 42, 12–18 Oct' }]);
  };

  it('across two months: the last 7 days, and the closed ISO week Monday to Sunday', { timeout: 30_000 }, async () => {
    check(await pageFor('2026-11-02'), '27 October – 2 November 2026', '27 Oct – 2 Nov 2026');
    check(await pageFor('2026-10-31'), '25–31 October 2026', '25–31 Oct 2026');
    check(await pageFor('2026-10-31', '2026-44'), '26 October – 1 November 2026', '26 Oct – 1 Nov 2026', '2026-44');
  });

  it('ISO week 1 across a new year', async () => {
    check(await pageFor('2026-01-02'), '27 December 2025 – 2 January 2026', '27 Dec 2025 – 2 Jan 2026');
    check(await pageFor('2026-01-02', '2026-01'), '29 December 2025 – 4 January 2026', '29 Dec 2025 – 4 Jan 2026', '2026-01');
  });

  it('folds a long country list after three: "+ 11 more"', async () => {
    const m = await pageFor('2026-10-31');
    const body = m.cards.find((c) => c.kind === 'disaster')!.body as { rows: { what: string; places: string[]; more: { text: string; places: string } | null }[] };
    const dr = body.rows.find((r) => r.what === 'Drought')!;
    expect(dr.places).toEqual(['Ethiopia', 'Kenya', 'Somalia']);
    expect(dr.more?.text).toBe('+ 11 more');
    expect(dr.more?.places.split(', ')).toHaveLength(11);
    expect(m.feed.find((f) => f.text.startsWith('Orange alert: drought'))?.text).toBe('Orange alert: drought, Ethiopia, Kenya, Somalia and 11 more');
  });
});
