// The critical minerals views (/minerals/{mineral}), worked out once per mineral from the USGS adapter: every year
// the release has, its world total and change, the concentration label, the producers in display order, and the
// template sentences. The page template, the map layer files and the share images all read this.
import { minerals as loadMinerals, type Mineral, type MineralYear, type Producer } from '../adapters/minerals.ts';
import { MINERAL_TEXT, inSentence, list } from '../i18n/pages.en.ts';
import { mineralText } from '../i18n/map.en.ts';
import { shared } from './data.ts';
import { formatValue } from './format.ts';
import { place } from './places.ts';

const mineralsData = shared(loadMinerals);
/** The edition of the newest release in the snapshot (MCS2026_… → 2026). */
const editionData = shared((raw) => Number(raw.list('usgs-minerals').filter((f) => /^MCS\d{4}_Commodities_Data\.csv$/.test(f)).at(-1)?.slice(3, 7)));

/** Share classes for the map, fixed across years and minerals so the slider compares like with like. */
export const SHARE_BINS = [0.01, 0.05, 0.1, 0.25];
export const shareClass = (s: number) => 1 + SHARE_BINS.filter((b) => s >= b).length;

/** Concentration labels from the Herfindahl index (2023 US merger guidelines; addendum 3.3). */
export const concentration = (hhi: number): 'low' | 'moderate' | 'high' => (hhi > 1800 ? 'high' : hhi >= 1000 ? 'moderate' : 'low');

/** A share for reading: whole percent from 10%, one decimal below ("32%", "9.7%", "0.1%"). */
export function shareText(s: number): string {
  const p = s * 100;
  if (p > 0 && p < 0.05) return '<0.1%';
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: p >= 10 ? 0 : 1 }).format(p)}%`;
}
/** A share as the table shows it: one decimal ("31.7%", "<0.1%"). */
export const shareExact = (s: number) => (s > 0 && s < 0.0005 ? '<0.1%' : `${new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(s * 100)}%`);

export const nameOf = (p: Producer) => (p.place ? place(p.place)?.name ?? p.label : p.label);
const count = (v: number) => formatValue(v, { kind: 'count' }).replace(/ (m|bn)$/, (_, u) => ` ${u === 'm' ? 'million' : 'billion'}`);
/** A tonnage or weight, in full ("92,000"). */
export const amount = (v: number) => new Intl.NumberFormat('en').format(v);

export interface MineralPage {
  id: string;
  /** "Lithium", "Rare earths": the name at the start of a sentence or a title. */
  title: string;
  /** "lithium", "rare earths": inside a sentence. */
  name: string;
  unit: 't' | 'kg';
  edition: number;
  /** "USGS Mineral Commodity Summaries 2026". */
  source: string;
  years: number[];
  estimated: number[];
  latest: MineralYear;
  byYear: Record<number, MineralYear>;
  mineral: Mineral;
  /** Mine production, or primary production (gallium); the view's words follow it. */
  measure: Mineral['measure'];
  /** What the tonnage counts ("lithium content"), as USGS says. */
  basis: string | null;
  /** USGS's note on revised figures for the year before. */
  revisions: string | null;
  /** The view's words for this mineral's measure. */
  text: ReturnType<typeof mineralText>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let cache: MineralPage[] | null = null;
/** Every mineral the snapshot has a usable table for, in the site's order. */
export function mineralPages(): MineralPage[] {
  if (cache) return cache;
  const ms = mineralsData() ?? [];
  const edition = editionData() ?? 0;
  cache = ms.map((m) => {
    const name = MINERAL_TEXT[m.id] ?? m.label.toLowerCase();
    return {
      id: m.id, title: cap(name), name, unit: /kilogram/i.test(m.unit) ? 'kg' : 't', edition,
      source: `USGS Mineral Commodity Summaries ${edition}`,
      years: m.years, estimated: m.years.filter((y) => m.byYear[y].estimated), latest: m.byYear[m.years.at(-1)!], byYear: m.byYear, mineral: m,
      measure: m.measure, basis: m.basis, revisions: m.revisions, text: mineralText(m.measure),
    };
  });
  return cache;
}
export const mineralPage = (id: string) => mineralPages().find((p) => p.id === id);

/** Producers with a share, largest first, then the withheld ones. */
export const listed = (y: MineralYear) => y.producers.filter((p) => p.share !== null && !p.withheld);
export const withheld = (y: MineralYear) => y.producers.filter((p) => p.withheld);

/** The change in the world total from the year before, as a share, when both years have one. */
export function worldChange(y: MineralYear): number | null {
  return y.world && y.worldPrev ? y.world / y.worldPrev - 1 : null;
}

/** The one-sentence answer under the title. */
export function lede(p: MineralPage, y = p.latest): string | null {
  const l = listed(y);
  if (!l.length) return null;
  // "The top three" says something only when more than three countries are listed (gallium has three).
  const top3 = l.length > 3 ? l.slice(0, 3).reduce((s, x) => s + (x.share ?? 0), 0) : null;
  return p.text.lede(inSentence(nameOf(l[0]), true), shareText(l[0].share!), p.name, top3 !== null ? shareText(top3) : undefined);
}

/** The summary paragraphs: the world total and change, the top producers, who follows, withheld producers, scope. */
export function summary(p: MineralPage, y = p.latest): string[] {
  const T = p.text;
  const l = listed(y);
  const unit = p.unit === 'kg' ? 'kilograms' : 'tonnes';
  const ch = worldChange(y);
  const first: string[] = [];
  if (y.world) {
    const change = ch === null ? null : Math.abs(ch) < 0.005 ? null : T.changeIn(shareText(Math.abs(ch)), ch > 0, y.year - 1);
    first.push(T.total(count(y.world), unit, p.name, p.basis, y.year, change, y.estimated));
  }
  const top = l.slice(0, 3);
  if (top.length) {
    const together = top.length === 3 && l.length > 3 ? shareText(top.reduce((s, x) => s + (x.share ?? 0), 0)) : null;
    first.push(T.top(top.map((x, i) => T.topPart(inSentence(nameOf(x), i === 0), amount(x.value!), p.unit, shareText(x.share!), i === 0)), together));
  }
  const next = l.slice(3, 5);
  if (next.length) first.push(T.follow(next.map((x) => inSentence(nameOf(x), false)), next.map((x) => shareText(x.share!))));
  const second: string[] = [];
  const w = withheld(y);
  if (w.length) second.push(T.withheldSentence(list(w.map((x, i) => inSentence(nameOf(x), i === 0))), p.name, w.length > 1));
  second.push(T.scope(p.name));
  return [first.join(' '), second.join(' ')].filter(Boolean);
}
