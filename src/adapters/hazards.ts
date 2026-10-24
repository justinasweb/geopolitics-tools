// Disaster alerts (gdacs/events.json) and earthquakes (usgs-quakes/earthquakes.json), in one shape.
// GDACS names the country; USGS does not, so a quake is placed in the country whose Natural Earth
// shape contains it, else the country named at the end of USGS's place text ("…, Japan"), else in
// none (at sea). Alert levels: GDACS's map directly; USGS PAGER alerts (expected losses) map yellow
// and orange to orange; quakes without one are "none". Ported from the prototype's
// src/adapters/hazards.js, where the fetcher did the placing.
import { countryAt } from '../lib/geo.ts';
import { type Raw, matcher } from './core.ts';

export type Alert = 'green' | 'orange' | 'red' | 'none';
export type HazardKind = 'EQ' | 'TC' | 'FL' | 'DR' | 'WF' | 'VO';

export interface Hazard {
  id: string;
  kind: HazardKind;
  name: string;
  alert: Alert;
  /** Internal id of the (first) affected country; null at sea or unknown. */
  place: string | null;
  /** Every affected country GDACS lists. */
  places: string[];
  lon: number;
  lat: number;
  from: string;
  to: string;
  current: boolean;
  /** GDACS's own severity line ("Maximum wind speed: 132 km/h"); empty for quakes, which have mag. */
  severity: string;
  mag?: number;
  depth?: number;
  tsunami?: boolean;
}

/** YYYY-MM-DD from a time in ms or a GDACS date (UTC, written without a zone). */
const day = (v: unknown) => (v == null || v === '' ? '' : new Date(typeof v === 'number' ? v : `${String(v).slice(0, 19)}Z`).toISOString().slice(0, 10));

const ALERTS = new Set(['green', 'orange', 'red']);

interface GdacsFeature { geometry: { coordinates: number[] }; properties: Record<string, unknown> & { affectedcountries?: { iso3?: string }[]; severitydata?: { severitytext?: string } } }

export function parseGdacs(json: { features?: GdacsFeature[] }): Hazard[] {
  const m = matcher('gdacs', 'iso3');
  return (json.features ?? []).map(({ properties: p, geometry: g }) => {
    const codes = [String(p.iso3 ?? ''), ...(p.affectedcountries ?? []).map((c) => c.iso3 ?? '')].filter(Boolean);
    const places = [...new Set(codes.map((c) => m.match(c)).filter((id): id is string => !!id))];
    const alert = String(p.alertlevel ?? 'green').toLowerCase();
    return {
      id: `${p.eventtype}${p.eventid}`, kind: p.eventtype as HazardKind, name: String(p.name ?? ''), alert: (ALERTS.has(alert) ? alert : 'green') as Alert,
      place: places[0] ?? null, places, lon: g.coordinates[0], lat: g.coordinates[1], from: day(p.fromdate), to: day(p.todate ?? p.fromdate),
      current: String(p.iscurrent) === 'true', severity: p.severitydata?.severitytext ?? '',
    };
  });
}

const PAGER: Record<string, Alert> = { red: 'red', orange: 'orange', yellow: 'orange', green: 'green' };

/** The country named in USGS's place text: after the last comma ("…, Japan"), else after "of" ("190 km S of Tonga"). */
export function placeFromText(text: string): string | null {
  const m = matcher('usgs-quakes', 'name');
  const tail = (/,\s*([^,]+)$/.exec(text)?.[1] ?? /\bof\s+(.+)$/.exec(text)?.[1] ?? text).replace(/\s*\(.*\)$/, '').replace(/\s+region$/i, '').trim();
  // Lookup, not match: sea and ridge names ("Mid-Atlantic Ridge") are expected and not reported.
  return tail ? m.lookup(tail) ?? null : null;
}

interface QuakeFeature { id: string; geometry: { coordinates: number[] }; properties: { mag: number; place?: string; time: number; alert?: string | null; tsunami?: number; title?: string } }

export function parseQuakes(json: { features?: QuakeFeature[] }): Hazard[] {
  return (json.features ?? []).map((f) => {
    const p = f.properties;
    const [lon, lat, depth] = f.geometry.coordinates;
    const place = countryAt(lon, lat) ?? placeFromText(p.place ?? '');
    const d = day(p.time);
    return {
      id: f.id, kind: 'EQ', name: p.title ?? `M ${p.mag}`, alert: PAGER[p.alert ?? ''] ?? 'none', place, places: place ? [place] : [],
      lon, lat, depth, from: d, to: d, current: false, mag: p.mag, tsunami: Boolean(p.tsunami), severity: '',
    };
  });
}

/** Every alert and quake, newest first. */
export const hazards = (raw: Raw): Hazard[] =>
  [...parseGdacs(raw.json('gdacs', 'events.json')), ...parseQuakes(raw.json('usgs-quakes', 'earthquakes.json'))]
    .sort((a, b) => b.from.localeCompare(a.from) || a.id.localeCompare(b.id));
