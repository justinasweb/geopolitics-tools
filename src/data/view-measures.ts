// Measures that only the map views show (no indicator page, profile row or Compare column): the AI and chips
// view's notable models and US Entity List counts, each sanctions list on its own,
// internet outages, water stress in 2050, Chinese lending by sector and five-year arms totals. Same shape as the registry (./indicators.ts); `load` also gets
// the year the source was fetched, for lists that hold only what is current.
import type { Raw, Series } from '../adapters/core.ts';
import { put } from '../adapters/core.ts';
import { ai } from '../adapters/epoch.ts';
import { outages } from '../adapters/digital.ts';
import { water } from '../adapters/water.ts';
import { lending } from '../adapters/aiddata.ts';
import { type List, sanctions } from '../adapters/sanctions.ts';
import { arms } from '../adapters/sipri.ts';
import { periodEnds, totalsBy, windowPairs } from '../lib/arms.ts';
import type { Indicator } from './indicators.ts';

export interface ViewMeasure extends Omit<Indicator, 'load'> { load: (raw: Raw, fetched: number) => Series }

/** One sanctions list's listings by place, dated like the registry's total (the latest year any list added to). */
const onList = (list: List) => (raw: Raw): Series => {
  const s = sanctions(raw);
  const year = Math.max(0, ...Object.values(s.added).flatMap((a) => Object.keys(a).map(Number)));
  const out: Series = {};
  for (const [id, c] of Object.entries(s.byPlace)) if (c.byList[list]) put(out, id, year, c.byList[list]);
  return out;
};

/** Chinese commitments 2000 to the dataset's last year, added up, for one group of sectors (or all), dated at the last year. */
const lent = (group: string | null) => (raw: Raw): Series => {
  const l = lending(raw);
  const last = l.years.at(-1) ?? 0;
  const out: Series = {};
  for (const [id, by] of Object.entries(l.bySector)) {
    const v = group ? by[group] ?? 0 : Object.values(by).reduce((a, b) => a + b, 0);
    if (v > 0) put(out, id, last, v);
  }
  return out;
};
const money = { kind: 'money' } as const;

/** Arms exports ('from') or imports ('to') over the five years ending in each year, dated at the last year. */
const fiveYears = (side: 'from' | 'to') => (raw: Raw): Series => {
  const a = arms(raw);
  const out: Series = {};
  for (const end of periodEnds(a.years)) for (const [id, v] of Object.entries(totalsBy(windowPairs(a.pairs, end), side))) put(out, id, end, v);
  return out;
};

export const VIEW_MEASURES: Record<string, ViewMeasure> = {
  aimodels: { id: 'aimodels', group: 'tech', source: 'epoch', format: { kind: 'count' }, scale: 'linear', load: (raw) => ai(raw).models },
  entitylist: {
    id: 'entitylist', group: 'tech', source: 'csl', format: { kind: 'count' }, scale: 'log', static: true,
    load: (raw, fetched) => {
      const out: Series = {};
      for (const [id, n] of Object.entries(sanctions(raw).entityList)) put(out, id, fetched, n);
      return out;
    },
  },
  // IODA's file holds the last 365 days: outage events per country over that year, dated by the fetch.
  outages: {
    id: 'outages', group: 'tech', source: 'ioda', format: { kind: 'count' }, scale: 'linear', static: true,
    load: (raw, fetched) => {
      const out: Series = {};
      for (const o of outages(raw)) put(out, o.place, fetched, 1, true);
      return out;
    },
  },
  // Aqueduct's 2050 projection under business as usual.
  waterstress2050: {
    id: 'waterstress2050', group: 'climate', source: 'aqueduct', format: { kind: 'number', digits: 1 }, scale: 'linear', static: true,
    load: (raw) => {
      const out: Series = {};
      for (const [id, s] of Object.entries(water(raw).stress)) if (s.future[2050]?.score != null) put(out, id, 2050, s.future[2050].score);
      return out;
    },
  },
  lendall: { id: 'lendall', group: 'influence', source: 'aiddata', format: money, scale: 'log', static: true, load: lent(null) },
  lendenergy: { id: 'lendenergy', group: 'influence', source: 'aiddata', format: money, scale: 'log', static: true, load: lent('energy') },
  lendtransport: { id: 'lendtransport', group: 'influence', source: 'aiddata', format: money, scale: 'log', static: true, load: lent('transport') },
  lendindustry: { id: 'lendindustry', group: 'influence', source: 'aiddata', format: money, scale: 'log', static: true, load: lent('industry') },
  lendbanking: { id: 'lendbanking', group: 'influence', source: 'aiddata', format: money, scale: 'log', static: true, load: lent('banking') },
  lendother: { id: 'lendother', group: 'influence', source: 'aiddata', format: money, scale: 'log', static: true, load: lent('other') },
  armsexp5: { id: 'armsexp5', group: 'security', source: 'sipri', format: { kind: 'number', unit: 'TIV m' }, scale: 'log', load: fiveYears('from') },
  armsimp5: { id: 'armsimp5', group: 'security', source: 'sipri', format: { kind: 'number', unit: 'TIV m' }, scale: 'log', load: fiveYears('to') },
  sanctionsus: { id: 'sanctionsus', group: 'influence', source: 'csl', format: { kind: 'count' }, scale: 'log', static: true, load: onList('US') },
  sanctionseu: { id: 'sanctionseu', group: 'influence', source: 'eu-sanctions', format: { kind: 'count' }, scale: 'log', static: true, load: onList('EU') },
  sanctionsuk: { id: 'sanctionsuk', group: 'influence', source: 'uk-sanctions', format: { kind: 'count' }, scale: 'log', static: true, load: onList('UK') },
};
