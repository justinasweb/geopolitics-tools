// Global Energy Monitor trackers (gem/, imported; CC BY 4.0): gas and oil pipelines, LNG
// terminals, coal and nuclear plants. "stop" is the year a pipeline, terminal or plant stopped
// working (retired, mothballed, cut off), or null. Countries are names in GEM's own spelling.
// Ported from the prototype's src/adapters/gem.js.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, matcher, num } from './core.ts';

export interface Pipeline { id: string; name: string; fuel: string; status: string; start: number | null; stop: number | null; capacity: number | null; unit: string; places: string[]; coords: number[][][] }
export interface Terminal { id: string; name: string; place: string | null; kind: string; status: string; capacity: number | null; start: number | null; stop: number | null; lat: number | null; lon: number | null }
export interface Plant { id: string; name: string; place: string | null; kind: 'coal' | 'nuclear'; status: string; mw: number | null; start: number | null; stop: number | null; lat: number | null; lon: number | null }

interface PipelineFeature { properties: Record<string, string | number | null>; geometry: { type: string; coordinates: number[][] | number[][][] } }

export function parseGem(files: { pipelines: { features?: PipelineFeature[] }; lng: string; coal: string; nuclear: string }) {
  const m = matcher('gem', 'name');
  const at = (name: string | undefined) => (name?.trim() ? m.match(name) : null);
  const s = (v: unknown) => String(v ?? '');
  return {
    pipelines: (files.pipelines.features ?? []).map(({ properties: p, geometry: g }): Pipeline => ({
      id: s(p.ProjectID), name: s(p.PipelineName), fuel: s(p.Fuel).toLowerCase(), status: s(p.Status), start: num(p.StartYear1), stop: num(p.StopYear),
      capacity: num(p.Capacity), unit: s(p.CapacityUnits),
      places: [...new Set(s(p.Countries).split(';').map((c) => at(c)).filter((id): id is string => !!id))],
      coords: (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]) as number[][][],
    })),
    terminals: csvRecords(files.lng).map((r): Terminal => ({
      id: r.TerminalID, name: r.TerminalName, place: at(r.Country), kind: r.FacilityType.toLowerCase(), status: r.Status, capacity: num(r.CapacityInMtpa),
      start: num(r.StartYear1), stop: num(r.StopYear), lat: num(r.Latitude), lon: num(r.Longitude),
    })),
    plants: [
      ...csvRecords(files.coal).map((r): Plant => ({
        id: r['GEM location ID'], name: r['Plant name'], place: at(r['Country/Area']), kind: 'coal', status: r.Status, mw: num(r['Capacity (MW)']),
        start: num(r['Start year']), stop: num(r['Retired year']), lat: num(r.Latitude), lon: num(r.Longitude),
      })),
      ...csvRecords(files.nuclear).map((r): Plant => ({
        id: r['GEM location ID'], name: r['Project Name'], place: at(r['Country/Area']), kind: 'nuclear', status: r.Status, mw: num(r['Capacity (MW)']),
        start: num(r['Start Year']), stop: num(r['Retirement Year']) ?? num(r['Stop year']), lat: num(r.Latitude), lon: num(r.Longitude),
      })),
    ],
  };
}

export const gem = (raw: Raw) => parseGem({
  pipelines: raw.json('gem', 'pipelines.geojson'), lng: raw.text('gem', 'lng_terminals.csv'), coal: raw.text('gem', 'coal_plants.csv'), nuclear: raw.text('gem', 'nuclear_plants.csv'),
});
