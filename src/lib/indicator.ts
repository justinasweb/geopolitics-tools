// What an indicator page shows, worked out once per measure: the common year, both rankings (that year for all,
// and latest available up to two years back), coverage, the median and five highest over time, and whether the
// page is indexed.
import { INDICATORS, type Indicator, type Loaded } from '../data/indicators.ts';
import { indicator, licenceOf } from './data.ts';
import { formatValue } from './format.ts';
import { place } from './places.ts';
import { ANSWER, DEFAULT_VERB, INDICATOR_PAGE, inSentence } from '../i18n/pages.en.ts';
import { counts, defaultYear, median, preliminaryYears, ranked, ranking, type Row } from './stats.ts';

/** Fewer reporting places than this in the common year, and the page is built but not indexed. */
export const INDEX_MIN_PLACES = 20;
/** How far "latest available" reaches back. */
export const FALLBACK_YEARS = 2;
/** How many years the trend shows. */
export const TREND_YEARS = 15;

export interface IndicatorModel {
  indicator: Indicator;
  loaded: Loaded;
  source: string;
  sources: string[];
  year: number;
  common: Row[];
  latest: Row[];
  /** Places with a value somewhere: the denominator of the coverage note. */
  reporting: number;
  possible: number;
  preliminary: number[];
  trend: { years: number[]; median: (number | null)[]; top: { id: string; values: (number | null)[] }[] };
  indexed: boolean;
}

const cache = new Map<string, IndicatorModel | null>();

export function indicatorModel(id: string): IndicatorModel | null {
  if (cache.has(id)) return cache.get(id)!;
  const l = indicator(id);
  let out: IndicatorModel | null = null;
  const year = l ? defaultYear(l) : undefined;
  if (l && year !== undefined) {
    const common = ranking(l, year);
    const latest = ranking(l, year, FALLBACK_YEARS);
    const actualYears = [...counts(l).keys()].sort((a, b) => a - b).filter((y) => y <= year);
    const years = l.indicator.static ? [] : actualYears.slice(-TREND_YEARS);
    const top = common.slice(0, 5).map((r) => ({ id: r.id, values: years.map((y) => l.values[r.id]?.[y] ?? null) }));
    const src = INDICATORS[id].source;
    const sources = Array.isArray(src) ? src : [src];
    out = {
      indicator: INDICATORS[id], loaded: l, source: sources[0], sources, year, common, latest,
      reporting: common.length, possible: Object.keys(l.values).filter(ranked).length, preliminary: preliminaryYears(l),
      trend: { years, median: years.map((y) => median(l, y)), top },
      indexed: common.length >= INDEX_MIN_PLACES,
    };
  }
  cache.set(id, out);
  return out;
}

/** The page's answer: the place ranked first, with the indicator's verb ("In 2024, Ukraine spent the largest…"). */
export function answerFor(m: IndicatorModel): string {
  const top = m.common[0];
  if (!top) return '';
  const name = place(top.id)?.name ?? top.id;
  const verb = ANSWER[m.indicator.id]?.verb ?? DEFAULT_VERB;
  const value = formatValue(top.value, m.indicator.format);
  return m.indicator.static ? INDICATOR_PAGE.answerStatic(inSentence(name, true), verb, value) : INDICATOR_PAGE.answer(inSentence(name), verb, value, top.year);
}

/** Whether the indicator page offers a CSV: every source behind it allows downloads (licence table). */
export const csvAllowed = (m: IndicatorModel) => m.sources.every((s) => licenceOf(s)?.downloads === 'yes');
