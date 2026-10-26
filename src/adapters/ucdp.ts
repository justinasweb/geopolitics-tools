// UCDP Georeferenced Event Dataset (ucdp/gedevents_<version>.json, from pipeline/sources/ucdp.ts; the prototype's
// samples have the same names and format). A version like 26.1 is the yearly release; one like 26.0.8 a monthly
// Candidate release, newer but open to revision, whose months are marked preliminary. Where both cover a month,
// the yearly release wins; where two Candidate releases list the same event, the newer one wins.
//
// type_of_violence: 1 state-based (at least one side is a government), 2 non-state (neither is), 3 one-sided (an
// armed group or a government against civilians). UCDP numbers countries by Gleditsch–Ward code (codes.csv, source
// ucdp); events in Gaza and the West Bank carry Israel's number and are moved to Palestine by their adm_1.
import { type Raw, type Series, matcher, num } from './core.ts';

type Row = Record<string, string | number | null>;
interface File { Result?: Row[] }

export type Violence = 1 | 2 | 3;
export interface ConflictEvent {
  id: number;
  /** YYYY-MM-DD, the day it started. */
  date: string;
  month: string;
  type: Violence;
  conflict: string;
  conflictId: number;
  lat: number;
  lon: number;
  /** Internal place id, or null when the country is not matched. */
  place: string | null;
  adm1: string;
  /** UCDP's best estimate of deaths, and its low and high estimates. */
  deaths: number;
  low: number;
  high: number;
  civilians: number;
  /** From a Candidate release: preliminary. */
  candidate: boolean;
}

const PALESTINE = /^(gaza|west bank)/i;
const versionOf = (name: string) => /^gedevents_(\d+)\.(\d+)(?:\.(\d+))?\.json$/.exec(name);
/** Sorts releases oldest first: 25.1 < 25.0.12 < 26.1 < 26.0.1. Yearly releases cover the years before their own. */
const order = (name: string) => {
  const m = versionOf(name)!;
  return Number(m[1]) * 1000 + (m[3] === undefined ? 0 : 1 + Number(m[3]));
};

export function parseGed(files: { name: string; json: File }[]): ConflictEvent[] {
  const m = matcher('ucdp', 'code');
  const yearly: ConflictEvent[] = [];
  const candidate = new Map<number, ConflictEvent>();
  for (const f of [...files].sort((a, b) => order(a.name) - order(b.name))) {
    const isCandidate = versionOf(f.name)?.[3] !== undefined;
    for (const r of f.json.Result ?? []) {
      const date = String(r.date_start ?? '').slice(0, 10);
      const lat = num(r.latitude);
      const lon = num(r.longitude);
      const type = Number(r.type_of_violence);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || lat === null || lon === null || ![1, 2, 3].includes(type)) continue;
      const adm1 = String(r.adm_1 ?? '');
      const e: ConflictEvent = {
        id: Number(r.id), date, month: date.slice(0, 7), type: type as Violence,
        conflict: String(r.conflict_name ?? ''), conflictId: Number(r.conflict_new_id) || 0, lat, lon,
        place: PALESTINE.test(adm1) ? 'PSE' : m.match(String(r.country_id ?? '')), adm1,
        deaths: num(r.best) ?? 0, low: num(r.low) ?? 0, high: num(r.high) ?? 0, civilians: num(r.deaths_civilians) ?? 0, candidate: isCandidate,
      };
      if (isCandidate) candidate.set(e.id, e);
      else yearly.push(e);
    }
  }
  // A month the yearly release covers is taken from it alone.
  const covered = yearly.reduce((mx, e) => (e.month > mx ? e.month : mx), '');
  const out = [...yearly, ...[...candidate.values()].filter((e) => e.month > covered)];
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

export function ged(raw: Raw): ConflictEvent[] {
  const names = raw.list('ucdp').filter((n) => versionOf(n));
  if (!names.length) throw new Error('ucdp/ is not in the snapshot');
  return parseGed(names.map((name) => ({ name, json: raw.json<File>('ucdp', name) })));
}

/** Deaths by country and calendar year, for the registry measure: full years only, so a year in progress never reads as a fall. */
export function deathsByYear(all: ConflictEvent[]): Series {
  const out: Series = {};
  if (!all.length) return out;
  const last = all.at(-1)!.month;
  const lastFull = last.endsWith('-12') ? Number(last.slice(0, 4)) : Number(last.slice(0, 4)) - 1;
  for (const e of all) {
    const y = Number(e.date.slice(0, 4));
    if (!e.place || y > lastFull) continue;
    (out[e.place] ??= {})[y] = (out[e.place][y] ?? 0) + e.deaths;
  }
  return out;
}
