// The extra sections of the three dossiers (United States, China, Russia), on top of the profile: money and
// reserves, people, technology and space, sanctions and lending, climate and hazards. Each part is left out when
// its source has no figure, so a dossier never shows an empty chart.
import { demography, ageShares, type AgeGroup } from '../adapters/wpp.ts';
import { treasuryHolders } from '../adapters/treasury.ts';
import { ai } from '../adapters/epoch.ts';
import { indicator, shared } from './data.ts';
import { figure, type Figure } from './country.ts';

export interface SeriesView { years: number[]; values: (number | null)[] }

const wppData = shared(demography);
const ticData = shared(treasuryHolders);
const aiData = shared(ai);

/** A place's yearly values of a registry measure, from `from` to its last year. */
export function seriesOf(indId: string, placeId: string, from = 2000): SeriesView | null {
  const v = indicator(indId)?.values[placeId];
  if (!v) return null;
  const ys = Object.keys(v).map(Number).filter((y) => y >= from).sort((a, b) => a - b);
  if (ys.length < 2) return null;
  const years: number[] = [];
  for (let y = ys[0]; y <= ys.at(-1)!; y++) years.push(y);
  return { years, values: years.map((y) => v[y] ?? null) };
}

export interface Treasuries { month: string; value: number; prevMonth: string | null; prev: number | null }

function treasuriesFor(id: string): Treasuries | null {
  const t = ticData();
  const h = t?.holders.find((x) => x.place === id);
  if (!t || !h || h.values[0] === null) return null;
  const i = t.months.length > 12 ? 12 : -1;
  return { month: t.months[0], value: h.values[0], prevMonth: i > 0 ? t.months[i] : null, prev: i > 0 ? h.values[i] : null };
}

export interface People {
  years: number[];
  medium: (number | null)[];
  band: { lo: (number | null)[]; hi: (number | null)[] } | null;
  lastEstimate: number;
  pyramid: { year: number; groups: AgeGroup[] } | null;
  old: number | null;
  oldYear: number | null;
}

function peopleFor(id: string, pyramidYear: number): People | null {
  const w = wppData();
  const med = w?.total.Medium?.[id];
  if (!w || !med) return null;
  const years = Object.keys(med).map(Number).sort((a, b) => a - b);
  const lo = w.total.Low?.[id];
  const hi = w.total.High?.[id];
  const ages = w.ages[id];
  const ageYears = ages ? Object.keys(ages).map(Number).sort((a, b) => a - b) : [];
  const py = ageYears.includes(pyramidYear) ? pyramidYear : ageYears.filter((y) => y <= pyramidYear).at(-1) ?? ageYears.at(-1);
  const shares = py !== undefined ? ageShares(ages[py]) : null;
  return {
    years, medium: years.map((y) => med[y] ?? null), lastEstimate: w.lastEstimate,
    band: lo && hi ? { lo: years.map((y) => (y > w.lastEstimate ? lo[y] ?? null : null)), hi: years.map((y) => (y > w.lastEstimate ? hi[y] ?? null : null)) } : null,
    pyramid: py !== undefined ? { year: py, groups: ages[py] } : null,
    old: shares?.old ?? null, oldYear: shares ? py! : null,
  };
}

function modelsFor(id: string): { value: number; year: number } | null {
  const m = aiData()?.models[id];
  if (!m) return null;
  const year = Math.max(...Object.keys(m).map(Number));
  return { value: m[year], year };
}

export interface Dossier {
  money: { gdp: SeriesView | null; stats: Figure[]; treasuries: Treasuries | null } | null;
  people: (People & { stats: Figure[] }) | null;
  tech: { stats: Figure[]; models: { value: number; year: number } | null } | null;
  climate: { co2: SeriesView | null; stats: Figure[] } | null;
}

const pick = (ids: string[], placeId: string) => ids.map((i) => figure(i, placeId)).filter((f): f is Figure => f !== null);

export function dossierFor(id: string, buildYear: number): Dossier {
  const moneyStats = pick(['growth', 'inflation', 'unemployment', 'reserves', 'trade', 'fdi'], id);
  const gdp = seriesOf('gdp', id);
  const treasuries = treasuriesFor(id);
  const people = peopleFor(id, buildYear);
  const peopleStats = pick(['tfr', 'median', 'lex'], id);
  const techStats = pick(['satellites', 'launches', 'aicompute'], id);
  const models = modelsFor(id);
  const climateStats = pick(['co2', 'co2pc', 'co2cum', 'waterstress'], id);
  const co2 = seriesOf('co2', id, 1990);
  return {
    money: gdp || moneyStats.length || treasuries ? { gdp, stats: moneyStats, treasuries } : null,
    people: people || peopleStats.length ? { ...(people ?? { years: [], medium: [], band: null, lastEstimate: 0, pyramid: null, old: null, oldYear: null }), stats: peopleStats } : null,
    tech: techStats.length || models ? { stats: techStats, models } : null,
    climate: co2 || climateStats.length ? { co2, stats: climateStats } : null,
  };
}
