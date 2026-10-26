// Each fetcher against a stub of its source: the format it saves, the checks that refuse bad
// answers, and the traps the prototype found. No network.
import { describe, expect, it } from 'vitest';
import { toCsv } from '../../../pipeline/lib/csv.ts';
import type { FetchResult } from '../../../pipeline/lib/source.ts';
import celestrak, { COLUMNS as SATCAT_COLUMNS } from '../../../pipeline/sources/celestrak.ts';
import csl from '../../../pipeline/sources/csl.ts';
import epoch from '../../../pipeline/sources/epoch.ts';
import euSanctions, { COLUMNS as EU_COLUMNS, isoDate } from '../../../pipeline/sources/eu-sanctions.ts';
import gdacs from '../../../pipeline/sources/gdacs.ts';
import { SOURCES } from '../../../pipeline/sources/index.ts';
import ioda from '../../../pipeline/sources/ioda.ts';
import owid, { COLUMNS as OWID_COLUMNS } from '../../../pipeline/sources/owid.ts';
import treasury, { newestMonth } from '../../../pipeline/sources/treasury.ts';
import unhcr, { foldPairs, num } from '../../../pipeline/sources/unhcr.ts';
import usgsQuakes from '../../../pipeline/sources/usgs-quakes.ts';
import worldbank, { INDICATORS } from '../../../pipeline/sources/worldbank.ts';
import comtrade, { plan, trim } from '../../../pipeline/sources/comtrade.ts';
import eia, { SERIES as EIA_SERIES } from '../../../pipeline/sources/eia.ts';
import ember, { SERIES as EMBER_SERIES } from '../../../pipeline/sources/ember.ts';
import ucdp from '../../../pipeline/sources/ucdp.ts';
import ipc from '../../../pipeline/sources/ipc.ts';
import { createHttp } from '../../../pipeline/lib/http.ts';
import { ctxFor, fakeHttp, type Route } from './helpers.ts';

const iso = (i: number) => String.fromCharCode(65 + (i % 26), 65 + (Math.floor(i / 26) % 26), 65 + Math.floor(i / 676));
const body = (r: FetchResult, name: string) => {
  const f = r.files.find((x) => x.name === name)!;
  return typeof f.body === 'string' ? f.body : new TextDecoder().decode(f.body);
};

it('every source has an id, schedule, credit and licence, and ids are unique', () => {
  const ids = SOURCES.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const s of SOURCES) {
    expect(s.id).toMatch(/^[a-z0-9-]+$/);
    expect(s.every).toBeGreaterThan(0);
    expect(s.staleAfter).toBeGreaterThan(s.every);
    expect(s.attribution && s.licence).toBeTruthy();
  }
});

describe('worldbank', () => {
  const countries = Array.from({ length: 250 }, (_, i) => ({ id: iso(i), region: { value: 'Europe' } }));
  const routes = (mode: 'ok' | 'error' | 'small'): Route[] => [
    [/\/v2\/country\?/, () => [{ page: 1, pages: 1, total: 201 }, [...countries, { id: 'WLD', region: { value: 'Aggregates' } }]]],
    [/indicator/, () => {
      if (mode === 'error') return [{ message: [{ id: '120', value: 'Invalid value' }] }];
      const n = mode === 'small' ? 110 : 250;
      const rows = [...countries.slice(0, n).map((c) => ({ countryiso3code: c.id, date: '2024', value: 1 })), { countryiso3code: 'WLD', date: '2024', value: 99 }];
      return [{ page: 1, pages: 1, total: rows.length }, rows];
    }],
  ];

  it('saves each indicator in the API format with aggregates dropped', async () => {
    const r = await worldbank.fetch(ctxFor(fakeHttp(routes('ok'))));
    expect(r.files).toHaveLength(Object.keys(INDICATORS).length);
    const saved = JSON.parse(body(r, 'SP.POP.TOTL.json'));
    expect(saved[1]).toHaveLength(250);
    expect(saved[1].some((x: { countryiso3code: string }) => x.countryiso3code === 'WLD')).toBe(false);
    expect(r.dataTo).toBe('2024');
  });

  it('fails on an error answered with HTTP 200', async () => {
    await expect(worldbank.fetch(ctxFor(fakeHttp(routes('error'))))).rejects.toThrow(/Invalid value/);
  });

  it('refuses a sharp shrink against the last good copy', async () => {
    const good = await worldbank.fetch(ctxFor(fakeHttp(routes('ok'))));
    const prev = { 'NY.GDP.MKTP.CD.json': body(good, 'NY.GDP.MKTP.CD.json') };
    await expect(worldbank.fetch(ctxFor(fakeHttp(routes('small')), prev))).rejects.toThrow(/110 values now against 250.*kept the old file/);
  });
});

describe('owid', () => {
  const header = ['country', 'year', 'iso_code', 'extra', ...OWID_COLUMNS.slice(3)];
  const row = (country: string, year: number, code: string) => header.map((h) => (h === 'country' ? country : h === 'year' ? String(year) : h === 'iso_code' ? code : '1.5'));
  const file = toCsv([header, row('World', 1980, ''), row('World', 2024, ''), ...Array.from({ length: 190 }, (_, i) => row(`C${i}`, 2024, iso(i))), row('Kosovo', 2024, '')]);

  it('trims to the site columns from 1990 and keeps rows without an ISO code (World, Kosovo)', async () => {
    const r = await owid.fetch(ctxFor(fakeHttp([[/co2/, () => file]])));
    const out = body(r, 'owid-co2-data.csv');
    expect(out.split('\n')[0]).toBe(OWID_COLUMNS.join(','));
    expect(out).not.toMatch(/World,1980/);
    expect(out).toMatch(/World,2024,,/);
    expect(out).toMatch(/Kosovo,2024,,/);
    expect(r.dataTo).toBe('2024');
  });

  it('names the missing column when the file changes', async () => {
    await expect(owid.fetch(ctxFor(fakeHttp([[/co2/, () => 'country,year\nA,2024\n']])))).rejects.toThrow(/iso_code.*missing/);
  });
});

describe('gdacs', () => {
  const feature = (id: number, level: string) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { eventtype: 'EQ', eventid: id, alertlevel: level, fromdate: '2026-10-01T00:00:00', todate: '2026-10-02T00:00:00', htmldescription: '<p>big</p>' } });

  it('pages through orange/red and green alerts, de-duplicates and drops bulky fields', async () => {
    const calls: string[] = [];
    const http = fakeHttp([[/alertlevel=orange;red.*pagenumber=1$/, () => ({ features: Array.from({ length: 100 }, (_, i) => feature(i, 'Orange')) })],
      [/alertlevel=orange;red.*pagenumber=2$/, () => ({ features: [feature(100, 'Red'), feature(5, 'Orange')] })],
      [/alertlevel=green.*pagenumber=1$/, () => ({ features: [feature(500, 'Green')] })]], calls);
    const r = await gdacs.fetch(ctxFor(http));
    expect(r.rows).toBe(102);
    expect(calls).toHaveLength(3);
    const saved = JSON.parse(body(r, 'events.json'));
    expect(saved.type).toBe('FeatureCollection');
    expect(saved.features[0].properties.htmldescription).toBeUndefined();
  });

  it('stops when the API ignores paging and repeats a page', async () => {
    const calls: string[] = [];
    const page = { features: Array.from({ length: 100 }, (_, i) => feature(i, 'Orange')) };
    const r = await gdacs.fetch(ctxFor(fakeHttp([[/orange/, () => page], [/green/, () => ({ features: [] })]], calls)));
    expect(r.rows).toBe(100);
    expect(calls.filter((c) => /orange/.test(c))).toHaveLength(2);
  });

  it('waits and retries when GDACS says its connection pool is busy', async () => {
    let n = 0;
    const busy = () => (++n < 3 ? new Response('{"message":"Timeout expired. The timeout period elapsed prior to obtaining a connection from the pool."}', { status: 400 }) : { features: [feature(1, 'Red')] });
    const http = fakeHttp([[/orange.*pagenumber=1$/, busy], [/green/, () => ({ features: [] })]]);
    await expect(gdacs.fetch(ctxFor(http))).rejects.toThrow(/only 1 orange and red alerts/);
    expect(n).toBe(3);
  });

  it('treats a 404 for a page past the end as the end', async () => {
    const r = await gdacs.fetch(ctxFor(fakeHttp([[/orange.*pagenumber=1$/, () => ({ features: Array.from({ length: 100 }, (_, i) => feature(i, 'Red')) })], [/green.*pagenumber=1$/, () => ({ features: [] })]])));
    expect(r.rows).toBe(100);
  });
});

describe('usgs-quakes', () => {
  const quakes = (n: number) => ({ type: 'FeatureCollection', metadata: { generated: Date.now(), title: 'USGS Earthquakes', api: '1.14' }, features: Array.from({ length: n }, (_, i) => ({ type: 'Feature', id: `us${i}`, geometry: { type: 'Point', coordinates: [1, 2, 10] }, properties: { mag: 5.6, place: 'x', time: Date.UTC(2026, 9, 1) + i, type: 'earthquake', felt: 3, cdi: 2 } })) });

  it('keeps earthquakes with trimmed properties and no per-request timestamp', async () => {
    const r = await usgsQuakes.fetch(ctxFor(fakeHttp([[/fdsnws/, () => quakes(450)]])));
    const saved = JSON.parse(body(r, 'earthquakes.json'));
    expect(saved.features).toHaveLength(450);
    expect(saved.features[0].properties.felt).toBeUndefined();
    expect(saved.metadata.generated).toBeUndefined();
    expect(r.dataTo).toBe('2026-10-01');
  });

  it('refuses a year with implausibly few earthquakes', async () => {
    await expect(usgsQuakes.fetch(ctxFor(fakeHttp([[/fdsnws/, () => quakes(20)]])))).rejects.toThrow(/only 20 earthquakes/);
  });
});

describe('unhcr', () => {
  it('folds small pairs into one row per origin and year without losing anyone', () => {
    const items = [
      { year: 2024, coo_iso: 'SYR', coa_iso: 'TUR', refugees: 3_000_000, asylum_seekers: 0, oip: 0 },
      { year: 2024, coo_iso: 'SYR', coa_iso: 'ISL', refugees: 400, asylum_seekers: 50, oip: '-' },
      { year: 2024, coo_iso: 'SYR', coa_iso: 'MLT', refugees: 300, asylum_seekers: 0, oip: 0 },
      { year: 2024, coo_iso: 'SYR', coa_iso: 'SYR', refugees: 0, idps: 7_000_000 },
    ];
    const out = foldPairs(items);
    expect(out).toHaveLength(3);
    const other = out.find((r) => r.coa_iso === null)!;
    expect(other).toMatchObject({ refugees: 700, asylum_seekers: 50, folded_pairs: 2 });
    expect(out.find((r) => r.coa_iso === 'SYR')!.idps).toBe(7_000_000);
    expect(num('1,234')).toBe(1234);
    expect(num('-')).toBe(0);
  });

  it('saves origin totals, host totals and folded pairs', async () => {
    const rows = (key: 'coo_iso' | 'coa_iso') => Array.from({ length: 160 }, (_, i) => ({ year: 2025, [key]: iso(i), refugees: 5 }));
    const http = fakeHttp([
      [/coo_all=true&coa_all=true/, () => ({ page: 1, maxPages: 1, items: [{ year: 2025, coo_iso: 'AFG', coa_iso: 'IRN', refugees: 5000 }, { year: 2025, coo_iso: 'AFG', coa_iso: 'PAK', refugees: 10 }, { year: 2025, coo_iso: 'AFG', coa_iso: 'IND', refugees: 20 }] })],
      [/coo_all=true/, () => ({ page: 1, maxPages: 1, items: rows('coo_iso') })],
      [/coa_all=true/, () => ({ page: 1, maxPages: 1, items: rows('coa_iso') })],
    ]);
    const r = await unhcr.fetch(ctxFor(http));
    expect(r.files.map((f) => f.name)).toEqual(['by-origin.json', 'by-host.json', 'pairs.json']);
    expect(JSON.parse(body(r, 'pairs.json')).items).toHaveLength(2);
    expect(r.dataTo).toBe('2025');
  });
});

describe('treasury', () => {
  const table = (month: string) => `Table 5: Major Foreign Holders of Treasury Securities\n\tCountry\t${month}\t2026-07\nJapan\t1,100.1\t1,099.0\t1\nChina, Mainland\t700.2\t701.3\t1\n`;

  it('finds the newest month in either date style', () => {
    expect(newestMonth(table('2026-08'))).toBe('2026-08');
    expect(newestMonth('Holders\nAug 2026\tJul 2026\n')).toBe('2026-08');
  });

  it('saves a current table and refuses a stale one', async () => {
    const r = await treasury.fetch(ctxFor(fakeHttp([[/table5/, () => table('2026-08')]])));
    expect(r.dataTo).toBe('2026-08');
    await expect(treasury.fetch(ctxFor(fakeHttp([[/table5/, () => table('2023-01').replace('2026-07', '2022-12')]])))).rejects.toThrow(/2023-01.*stale/);
  });
});

describe('celestrak', () => {
  it('refuses a catalogue far smaller than expected', async () => {
    const csv = toCsv([SATCAT_COLUMNS, ...Array.from({ length: 10 }, () => SATCAT_COLUMNS.map(() => 'x'))]);
    await expect(celestrak.fetch(ctxFor(fakeHttp([[/satcat/, () => csv]])))).rejects.toThrow(/only 10 objects/);
  });
});

describe('csl', () => {
  it('trims records but keeps the list each came from, and refuses a list without the Entity List', async () => {
    const rec = (i: number, src: string) => ({ id: `r${i}`, source: src, name: `N${i}`, programs: ['P'], remarks: 'long text', addresses: [{ address: '1 Road', city: 'C', country: 'CN' }], start_date: '2026-10-01' });
    const list = (srcs: string[]) => ({ results: Array.from({ length: 6000 }, (_, i) => rec(i, srcs[i % srcs.length])) });
    const r = await csl.fetch(ctxFor(fakeHttp([[/consolidated/, () => list(['Entity List (EL) - Bureau of Industry and Security', 'Specially Designated Nationals (SDN) - Treasury Department'])]])));
    const saved = JSON.parse(body(r, 'consolidated.json'));
    expect(saved.results[0]).toEqual({ id: 'r0', source: 'Entity List (EL) - Bureau of Industry and Security', name: 'N0', programs: ['P'], start_date: '2026-10-01', addresses: [{ country: 'CN' }] });
    await expect(csl.fetch(ctxFor(fakeHttp([[/consolidated/, () => list(['Specially Designated Nationals (SDN) - Treasury Department'])]])))).rejects.toThrow(/no Entity List/);
  });
});

describe('eu-sanctions', () => {
  it('trims the semicolon export to entity rows without the daily generation date', async () => {
    const header = [...EU_COLUMNS, 'BirthDate_BirthDate'];
    const rows = Array.from({ length: 2100 }, (_, i) => [[...header.map((h) => (h === 'fileGenerationDate' ? '2026-10-24T10:00:00' : h === 'Entity_LogicalId' ? String(i) : h === 'BirthDate_BirthDate' ? '1970-01-01' : 'x'))], [...header.map((h) => (h === 'fileGenerationDate' ? '2026-10-24T10:00:00' : h === 'Entity_LogicalId' ? String(i) : h === 'BirthDate_BirthDate' ? '1971-01-01' : 'x'))]]).flat();
    const r = await euSanctions.fetch(ctxFor(fakeHttp([[/fsf/, () => toCsv([header, ...rows], ';')]])));
    const out = body(r, 'sanctions.csv').split('\n');
    expect(out[0]).toBe(EU_COLUMNS.slice(1).join(','));
    expect(out.length - 2).toBe(2100);
    expect(r.rows).toBe(2100);
    expect(r.dataTo).toBe('2026-10-24');
    expect(isoDate('23/10/2026')).toBe('2026-10-23');
  });
});

describe('epoch', () => {
  it('falls back to the next address and checks for a country column', async () => {
    const models = toCsv([['Model', 'Country (of organization)'], ...Array.from({ length: 400 }, (_, i) => [`m${i}`, 'US'])]);
    const clusters = toCsv([['Name', 'Country'], ...Array.from({ length: 150 }, (_, i) => [`c${i}`, 'US'])]);
    const r = await epoch.fetch(ctxFor(fakeHttp([[/notable/, () => models], [/ai_supercomputers/, () => clusters]])));
    expect(r.rows).toBe(550);
    await expect(epoch.fetch(ctxFor(fakeHttp([[/notable/, () => 'Model,Org\na,b\n']])))).rejects.toThrow(/no country column/);
  });
});

describe('ioda', () => {
  it('asks 30 days at a time, merges the windows and leaves request metadata out', async () => {
    const events = Array.from({ length: 80 }, (_, i) => ({ location: `country/${iso(i).slice(0, 2)}`, start: 1_790_000_000 + i, duration: 3600, score: 10 }));
    const calls: string[] = [];
    const r = await ioda.fetch(ctxFor(fakeHttp([[/outages\/events/, () => ({ type: 'outages.events', requestParameters: { until: 1 }, data: events })]], calls)));
    expect(calls).toHaveLength(13);
    expect(JSON.parse(body(r, 'outage_events.json'))).toEqual({ type: 'outages.events', data: events });
  });
});

describe('comtrade', () => {
  const rows = (n: number, cmd: string, period: number) => Array.from({ length: n }, (_, i) => ({ period, reporterCode: i + 1, reporterISO: iso(i), reporterDesc: 'x', flowCode: 'M', partnerCode: 0, partnerISO: 'W00', cmdCode: cmd, netWgt: 1000, primaryValue: 5, isReported: true }));
  const env = { COMTRADE_API_KEY: 'k', COMTRADE_PAUSE_MS: '0' };

  it('plans every group and year, newest first, with the three latest years refetched', () => {
    const p = plan(new Date('2026-10-24T00:00:00Z'));
    expect(p[0]).toEqual({ group: 'crude', year: 2025, recent: true });
    expect(p.filter((x) => x.recent).map((x) => x.year)).toEqual(expect.arrayContaining([2025, 2024, 2023]));
    expect(p.at(-1)!.year).toBe(2015);
    expect(trim([{ period: 2024, reporterDesc: 'China', partnerCode: 0, primaryValue: 3 }])).toEqual([{ period: 2024, partnerCode: 0, primaryValue: 3 }]);
  });

  it('fetches what is due within the call budget, carries the rest over, and sends the key as a header', async () => {
    const calls: string[] = [];
    const headers: string[] = [];
    const http = createHttp((async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      headers.push(String((init?.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']));
      const period = Number(/period=(\d{4})/.exec(String(url))![1]);
      const cmd = /cmdCode=([^&]+)/.exec(String(url))![1].split(',')[0];
      return new Response(JSON.stringify({ count: 100, data: rows(period === 2025 ? 5 : 100, cmd, period) }), { status: 200 });
    }) as typeof fetch, 0);
    const old = JSON.stringify({ count: 1, data: rows(100, '2709', 2016) });
    const ctx = { ...ctxFor(http, { 'crude-2016.json': old }), env: { ...env, COMTRADE_MAX_CALLS: '25' } };
    const r = await comtrade.fetch(ctx);
    expect(calls).toHaveLength(25);
    expect(headers.every((h) => h === 'k')).toBe(true);
    expect(calls.every((u) => /partner2Code=0&customsCode=C00&motCode=0/.test(u))).toBe(true);
    // 2025 has too few reporters so far: not saved. 2016 is carried over without a call.
    expect(r.files.some((f) => f.name.endsWith('-2025.json'))).toBe(false);
    expect(r.files.find((f) => f.name === 'crude-2016.json')!.body).toBe(old);
    expect(JSON.parse(body(r, 'crude-2024.json')).data[0]).not.toHaveProperty('reporterDesc');
    expect(r.dataTo).toBe('2024');
  });

  it('refuses an answer at the row limit and a sharp drop in reporters', async () => {
    const big = fakeHttp([[/comtrade|get\/C/, () => ({ count: 100_000, data: rows(100_000, '2709', 2024) })]]);
    await expect(comtrade.fetch({ ...ctxFor(big), env: { ...env, COMTRADE_MAX_CALLS: '1' } })).rejects.toThrow(/limit/);
    const small = fakeHttp([[/get\/C/, () => ({ count: 50, data: rows(50, '2709', 2025) })]]);
    const prev = JSON.stringify({ count: 100, data: rows(100, '2709', 2025) });
    await expect(comtrade.fetch({ ...ctxFor(small, { 'crude-2025.json': prev }), env: { ...env, COMTRADE_MAX_CALLS: '1' } })).rejects.toThrow(/reporters now against 100/);
  });
});

describe('eia', () => {
  const env = { EIA_API_KEY: 'k' };
  const intl = (series: readonly (readonly string[])[]) => series.flatMap(([p, a, u]) => Array.from({ length: 120 }, (_, i) => ({ period: '2024', productId: Number(p), productName: 'x', activityId: Number(a), activityName: a === '1' ? 'Production' : a === '2' ? 'Consumption' : 'Reserves', countryRegionId: iso(i), countryRegionTypeId: 'c', unit: u, value: i === 0 ? '--' : '12' })));
  const months = (s: string) => Array.from({ length: 120 }, (_, i) => ({ period: `${2016 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, series: s, value: 70 }));
  const routes = (lastMonth = true, noReserves = false): Route[] => [
    // Answers each call with the series its facets name, plus an import row the source must drop.
    [/international\/data/, (url) => {
      const f = (name: string) => decodeURIComponent(url).match(new RegExp(`facets\\[${name}\\]\\[\\]=([^&]+)`))?.[1];
      const [p, a, u] = [f('productId'), f('activityId'), f('unit')];
      if (noReserves && a === '6' && p === '57') return { response: { total: 0, data: u ? [] : [{ period: '2024', productId: 57, activityId: 6, countryRegionId: 'SAU', unit: 'BBL', unitName: 'billion barrels', value: '260' }] } };
      const data = intl([[p!, a!, u!]]);
      if (p === '57' && a === '1') data.push({ period: '2024', productId: 57, productName: 'x', activityId: 3, activityName: 'Imports', countryRegionId: 'USA', countryRegionTypeId: 'c', unit: 'TBPD', value: '1' });
      return { response: { total: data.length, data }, apiVersion: '2.1.8' };
    }],
    [/pri\/spt/, () => ({ response: { total: 240, data: [...months('RBRTE'), ...months('RWTC').slice(0, lastMonth ? 120 : 100)] } })],
  ];

  it('saves oil, gas and prices in the API format, without empty values or other series', async () => {
    const r = await eia.fetch({ ...ctxFor(fakeHttp(routes())), now: new Date('2026-02-10T00:00:00Z'), env });
    expect(r.files.map((f) => f.name)).toEqual(['oil_international.json', 'gas_international.json', 'oil_spot_prices.json']);
    const o = JSON.parse(body(r, 'oil_international.json')).response.data;
    expect(o).toHaveLength(4 * 119);
    expect(o.some((x: { activityName: string }) => x.activityName === 'Imports')).toBe(false);
    expect(r.dataTo).toBe('2024');
  });

  it('refuses a price series that stopped updating', async () => {
    await expect(eia.fetch({ ...ctxFor(fakeHttp(routes(false))), now: new Date('2026-02-10T00:00:00Z'), env })).rejects.toThrow(/RWTC ends in 2024-04/);
  });

  it('names the units the API has when a series comes back empty', async () => {
    await expect(eia.fetch({ ...ctxFor(fakeHttp(routes(true, true))), now: new Date('2026-02-10T00:00:00Z'), env })).rejects.toThrow(/activity 6 \(BB\) has only 0 countries.*units BBL \(billion barrels\)/);
  });
});

describe('ember', () => {
  const env = { EMBER_API_KEY: 'k' };
  const gen = (n: number, year: string, entity?: string) => Array.from({ length: n }, (_, i) => [...EMBER_SERIES, 'Fossil'].map((series) => ({
    entity: entity ?? `Place ${i}`, entity_code: entity ? null : iso(i), is_aggregate_entity: Boolean(entity), date: year, series,
    is_aggregate_series: series === 'Fossil', generation_twh: 10, share_of_generation_pct: 10,
  }))).flat();
  const routes = (n = 200, year = '2025'): Route[] => [
    [/entity=World/, () => ({ stats: {}, data: [...gen(1, '2024', 'World'), ...gen(1, '2025', 'World'), ...Array.from({ length: 10 }, (_, i) => gen(1, String(2010 + i), 'World')).flat()] })],
    [/is_aggregate_entity=false/, () => ({ stats: {}, data: gen(n, year) })],
  ];

  it('saves countries and the world in the API format, without aggregate series', async () => {
    const r = await ember.fetch({ ...ctxFor(fakeHttp(routes())), now: new Date('2026-10-10T00:00:00Z'), env });
    expect(r.files.map((f) => f.name)).toEqual(['electricity_generation_yearly.json', 'electricity_generation_world.json']);
    const d = JSON.parse(body(r, 'electricity_generation_yearly.json')).data;
    expect(d).toHaveLength(200 * 9);
    expect(d.some((x: { series: string }) => x.series === 'Fossil')).toBe(false);
    expect(r.dataTo).toBe('2025');
  });

  it('refuses too few countries or a series that stopped updating', async () => {
    await expect(ember.fetch({ ...ctxFor(fakeHttp(routes(100))), now: new Date('2026-10-10T00:00:00Z'), env })).rejects.toThrow(/only 100 countries/);
    await expect(ember.fetch({ ...ctxFor(fakeHttp(routes(200, '2022'))), now: new Date('2026-10-10T00:00:00Z'), env })).rejects.toThrow(/latest year is 2022/);
  });
});

describe('ucdp', () => {
  const env = { UCDP_TOKEN: 't' };
  const ev = (n: number, month: string) => Array.from({ length: n }, (_, i) => ({ id: i, type_of_violence: 1, country_id: 369, latitude: 48, longitude: 37, date_start: `${month}-02 00:00:00.000`, best: 3, dyad_name: 'dropped' }));
  // 26.1 is not out yet; 25.1 is, in two pages; Candidate releases 25.0.1–12 and 26.0.1–9.
  const routes = (seen: string[]): Route[] => [
    [/./, (url: string, init?: RequestInit) => {
      seen.push(url);
      if ((init?.headers as Record<string, string>)['x-ucdp-access-token'] !== 't') return new Response('', { status: 401 });
      const v = /gedevents\/([\d.]+)/.exec(url)![1];
      if (v === '26.1') return new Response('', { status: 404 });
      if (v === '25.1') return url.includes('page=1') ? { TotalCount: 1500, NextPageUrl: '', Result: ev(500, '2024-12') } : { TotalCount: 1500, NextPageUrl: 'http://x/api/gedevents/25.1?page=1', Result: ev(1000, '2024-11') };
      const [y, , m] = v.split('.').map(Number);
      if (y === 26 && m > 9) return new Response('', { status: 404 });
      return { TotalCount: 10, NextPageUrl: '', Result: ev(10, `20${y}-${String(m).padStart(2, '0')}`) };
    }],
  ];

  it('takes the latest yearly release and the Candidate months after it, with the token in a header', async () => {
    const seen: string[] = [];
    const r = await ucdp.fetch({ ...ctxFor(fakeHttp(routes(seen))), now: new Date('2026-10-20T00:00:00Z'), env });
    expect(r.files.map((f) => f.name)).toEqual(['gedevents_25.1.json', ...Array.from({ length: 12 }, (_, i) => `gedevents_25.0.${i + 1}.json`), ...Array.from({ length: 9 }, (_, i) => `gedevents_26.0.${i + 1}.json`)]);
    const g = JSON.parse(body(r, 'gedevents_25.1.json'));
    expect(g.TotalCount).toBe(1500);
    expect(g.Result[0].dyad_name).toBeUndefined();
    expect(r.dataTo).toBe('2026-09');
    expect(seen.some((u) => u.startsWith('https://x/api/gedevents/25.1?page=1'))).toBe(true);
  });

  it('carries over releases it already has', async () => {
    const seen: string[] = [];
    const prev = { 'gedevents_25.1.json': JSON.stringify({ TotalCount: 1200, Result: ev(1200, '2024-10') }), 'gedevents_25.0.3.json': JSON.stringify({ TotalCount: 1, Result: ev(1, '2025-03') }) };
    const r = await ucdp.fetch({ ...ctxFor(fakeHttp(routes(seen)), prev), now: new Date('2026-10-20T00:00:00Z'), env });
    expect(seen.some((u) => u.includes('/25.1?'))).toBe(false);
    expect(seen.some((u) => u.includes('/25.0.3?'))).toBe(false);
    expect(JSON.parse(body(r, 'gedevents_25.0.3.json')).TotalCount).toBe(1);
  });
});

describe('ipc', () => {
  const env = { IPC_API_KEY: 'k' };
  const an = (n: number) => Array.from({ length: n }, (_, i) => ({ anl_id: i, country: iso(i).slice(0, 2), condition: 'A', from: `2026-0${1 + (i % 9)}`, to: '2026-12', phase3plus_population: 1000 }));

  it('saves the acute analyses in the API format', async () => {
    const r = await ipc.fetch({ ...ctxFor(fakeHttp([[/country\?format=json&type=A&key=k/, () => [...an(40), { anl_id: 99, country: 'XX', condition: 'C', from: '2026-01', phase3plus_population: 1 }]]])), env });
    expect(JSON.parse(body(r, 'country.json'))).toHaveLength(40);
    expect(r.dataTo).toBe('2026-09');
  });

  it('refuses too few countries', async () => {
    await expect(ipc.fetch({ ...ctxFor(fakeHttp([[/country/, () => an(10)]])), env })).rejects.toThrow(/only 10 countries/);
  });
});
