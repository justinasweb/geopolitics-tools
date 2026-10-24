// CelesTrak SATCAT (celestrak/satcat.csv): every catalogued object; payloads only are counted.
// Owners are CelesTrak's own codes (PRC, CIS, ESA), matched through codes.csv: international
// bodies and operators (ESA, Intelsat) are listed but belong to no country, and CIS is the Soviet
// Union until it ended, then Russia. Launches are counted once each (OBJECT_ID year and number), by
// the state the launch site counts for. Ported from the prototype's src/adapters/celestrak.js.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, type Series, matcher, put } from './core.ts';

/** Working satellites: OPS_STATUS_CODE + (operational), P (partly), B (backup), S (spare), X (extended mission). */
const ACTIVE = new Set(['+', 'P', 'B', 'S', 'X']);

export interface Site { name: string; lat: number; lon: number; state: (year: number) => string | null }
const at = (id: string) => () => id;
/** A site on Soviet territory counts for the Soviet Union until 1992, then for its successor (Baikonur for Russia, which runs it). */
const soviet = (after: string) => (y: number) => (y <= 1991 ? 'SUN' : after);

/** Launch sites by SATCAT code, with the state their launches count for. Coordinates are approximate, for map dots. */
export const SITES: Record<string, Site> = {
  AFETR: { name: 'Cape Canaveral', lat: 28.5, lon: -80.6, state: at('USA') },
  AFWTR: { name: 'Vandenberg', lat: 34.7, lon: -120.6, state: at('USA') },
  TXSTB: { name: 'Starbase, Texas', lat: 25.99, lon: -97.15, state: at('USA') },
  WLPIS: { name: 'Wallops Island', lat: 37.85, lon: -75.47, state: at('USA') },
  KODAK: { name: 'Kodiak', lat: 57.43, lon: -152.34, state: at('USA') },
  KWAJ: { name: 'Kwajalein (US test site)', lat: 9.05, lon: 167.74, state: at('USA') },
  ERAS: { name: 'Air launch (Pegasus)', lat: 28.5, lon: -80.6, state: at('USA') },
  RLLB: { name: 'Mahia (Rocket Lab)', lat: -39.26, lon: 177.86, state: at('NZL') },
  JSC: { name: 'Jiuquan', lat: 40.96, lon: 100.29, state: at('CHN') },
  XICLF: { name: 'Xichang', lat: 28.25, lon: 102.03, state: at('CHN') },
  TAISC: { name: 'Taiyuan', lat: 38.85, lon: 111.6, state: at('CHN') },
  WSC: { name: 'Wenchang', lat: 19.61, lon: 110.95, state: at('CHN') },
  YSLA: { name: 'Yellow Sea (sea launch)', lat: 34.9, lon: 121.2, state: at('CHN') },
  TYMSC: { name: 'Baikonur', lat: 45.96, lon: 63.3, state: soviet('RUS') },
  PKMTR: { name: 'Plesetsk', lat: 62.93, lon: 40.57, state: soviet('RUS') },
  KYMSC: { name: 'Kapustin Yar', lat: 48.6, lon: 45.8, state: soviet('RUS') },
  DLS: { name: 'Dombarovsky', lat: 51.2, lon: 59.85, state: at('RUS') },
  SVOB: { name: 'Svobodny', lat: 51.8, lon: 128.3, state: at('RUS') },
  VOSTO: { name: 'Vostochny', lat: 51.88, lon: 128.33, state: at('RUS') },
  FRGUI: { name: 'Kourou', lat: 5.24, lon: -52.77, state: at('FRA') },
  HGSTR: { name: 'Hammaguir (French launches, 1965–67)', lat: 30.9, lon: -3.0, state: at('FRA') },
  SNMLP: { name: 'San Marco (Italian platform off Kenya)', lat: -2.94, lon: 40.21, state: at('ITA') },
  SRILR: { name: 'Sriharikota', lat: 13.72, lon: 80.23, state: at('IND') },
  TNSTA: { name: 'Tanegashima', lat: 30.4, lon: 130.97, state: at('JPN') },
  KSCUT: { name: 'Uchinoura', lat: 31.25, lon: 131.08, state: at('JPN') },
  SEMLS: { name: 'Semnan', lat: 35.23, lon: 53.92, state: at('IRN') },
  YUN: { name: 'Sohae', lat: 39.66, lon: 124.7, state: at('PRK') },
  NSC: { name: 'Naro', lat: 34.43, lon: 127.53, state: at('KOR') },
  PALMA: { name: 'Palmachim', lat: 31.88, lon: 34.68, state: at('ISR') },
  WOMRA: { name: 'Woomera', lat: -30.95, lon: 136.5, state: at('AUS') },
  ALCLC: { name: 'Alcântara', lat: -2.37, lon: -44.4, state: at('BRA') },
  // Codes the live check found in the real catalogue (names as understood; to check against CelesTrak's site list).
  PLMSC: { name: 'Plesetsk', lat: 62.93, lon: 40.57, state: soviet('RUS') },
  TANSC: { name: 'Tanegashima', lat: 30.4, lon: 130.97, state: at('JPN') },
  SVOBO: { name: 'Svobodny', lat: 51.8, lon: 128.3, state: at('RUS') },
  SUBL: { name: 'Submarine launch, Barents Sea', lat: 70, lon: 35, state: soviet('RUS') },
  WRAS: { name: 'Air launch, Western Range (Pegasus)', lat: 34.7, lon: -121.5, state: at('USA') },
  CAS: { name: 'Air launch, Canary Islands (Pegasus)', lat: 28, lon: -15, state: at('USA') },
  STARB: { name: 'Starbase, Texas', lat: 25.99, lon: -97.15, state: at('USA') },
  YAVNE: { name: 'Palmachim (Yavne)', lat: 31.88, lon: 34.68, state: at('ISR') },
  SMTS: { name: 'Shahrud', lat: 36.2, lon: 55.33, state: at('IRN') },
  SCSLA: { name: 'South China Sea (sea launch)', lat: 20.5, lon: 113.5, state: at('CHN') },
  JJSLA: { name: 'Jeju (sea launch)', lat: 33.1, lon: 126.5, state: at('KOR') },
  ANDSP: { name: 'Andøya', lat: 69.29, lon: 16.02, state: at('NOR') },
  // Sea Launch, an international venture, from the equatorial Pacific: counted for no country.
  SEAL: { name: 'Sea Launch (Pacific)', lat: 0, lon: -154, state: () => null },
};

export type Orbit = 'leo' | 'meo' | 'geo';
/** Orbit class from the period in minutes: geostationary from 1,300, medium from 128, else low. */
export const orbitClass = (period: number): Orbit => (period >= 1300 ? 'geo' : period >= 128 ? 'meo' : 'leo');

const CONSTELLATION = /^(STARLINK|KUIPER|ONEWEB|QIANFAN|GUOWANG|YAOGAN)-/;

export interface Owner { code: string; place: string | null; active: number; orbits: Record<Orbit, number>; constellations: Record<string, number> }

export interface Space {
  /** Latest launch date in the file; "now" for working counts. */
  asOf: string;
  /** Payloads in orbit at the end of each year, working or not, by owning place. */
  inOrbit: Series;
  /** Orbital launches by the state their site counts for. */
  launches: Series;
  /** Launches from sites not in SITES, by year (shown as "other"). */
  otherLaunches: Record<number, number>;
  /** Launch site codes not in SITES, with their launch counts. */
  unknownSites: Record<string, number>;
  sites: Record<string, Site & { byYear: Record<number, number> }>;
  /** Every owner code, including international bodies (place null). */
  owners: Record<string, Owner>;
  constellations: Record<string, { owner: string; active: number }>;
}

export function parseSatcat(text: string): Space {
  const m = matcher('celestrak', 'code');
  const rows = csvRecords(text).filter((r) => r.OBJECT_TYPE === 'PAY' && /^\d{4}/.test(r.LAUNCH_DATE));
  const asOf = rows.reduce((a, r) => (r.LAUNCH_DATE > a ? r.LAUNCH_DATE : a), '');
  const lastY = Number(asOf.slice(0, 4));
  const out: Space = { asOf, inOrbit: {}, launches: {}, otherLaunches: {}, unknownSites: {}, sites: {}, owners: {}, constellations: {} };
  for (const [k, s] of Object.entries(SITES)) out.sites[k] = { ...s, byYear: {} };
  const owners = new Map<string, (y: number) => string | null>();
  const seen = new Set<string>();
  for (const r of rows) {
    const ly = Number(r.LAUNCH_DATE.slice(0, 4));
    // An owner's place can change over time (CIS); match once per code and year.
    const placeAt = owners.get(r.OWNER) ?? (() => {
      const memo = new Map<number, string | null>();
      const f = (y: number) => { if (!memo.has(y)) memo.set(y, m.match(r.OWNER, String(y))); return memo.get(y)!; };
      owners.set(r.OWNER, f);
      return f;
    })();
    const o = (out.owners[r.OWNER] ??= { code: r.OWNER, place: placeAt(lastY), active: 0, orbits: { leo: 0, meo: 0, geo: 0 }, constellations: {} });
    if (ACTIVE.has(r.OPS_STATUS_CODE) && !r.DECAY_DATE) {
      o.active++;
      o.orbits[orbitClass(Number(r.PERIOD) || 0)]++;
      const c = CONSTELLATION.exec(r.OBJECT_NAME)?.[1];
      if (c) {
        o.constellations[c] = (o.constellations[c] ?? 0) + 1;
        (out.constellations[c] ??= { owner: r.OWNER, active: 0 }).active++;
      }
    }
    const decayY = r.DECAY_DATE ? Number(r.DECAY_DATE.slice(0, 4)) : Infinity;
    for (let y = ly; y <= lastY; y++) {
      // In orbit at the end of year y; for the current year, at the file's date.
      if (decayY > y || (decayY === y && y === lastY && r.DECAY_DATE > asOf)) {
        const id = placeAt(y);
        if (id) put(out.inOrbit, id, y, 1, true);
      }
    }
    const launch = r.OBJECT_ID.slice(0, 8);
    if (seen.has(launch)) continue;
    seen.add(launch);
    const site = out.sites[r.LAUNCH_SITE];
    const state = site?.state(ly);
    if (site) site.byYear[ly] = (site.byYear[ly] ?? 0) + 1;
    else out.unknownSites[r.LAUNCH_SITE] = (out.unknownSites[r.LAUNCH_SITE] ?? 0) + 1;
    if (state) put(out.launches, state, ly, 1, true);
    else out.otherLaunches[ly] = (out.otherLaunches[ly] ?? 0) + 1;
  }
  return out;
}

export const space = (raw: Raw) => parseSatcat(raw.text('celestrak', 'satcat.csv'));
