// Measures that only the map views show (no indicator page, profile row or Compare column): the AI and chips
// view's notable models and US Entity List counts, each sanctions list on its own, and
// internet outages. Same shape as the registry (./indicators.ts); `load` also gets
// the year the source was fetched, for lists that hold only what is current.
import type { Raw, Series } from '../adapters/core.ts';
import { put } from '../adapters/core.ts';
import { ai } from '../adapters/epoch.ts';
import { outages } from '../adapters/digital.ts';
import { type List, sanctions } from '../adapters/sanctions.ts';
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
  sanctionsus: { id: 'sanctionsus', group: 'influence', source: 'csl', format: { kind: 'count' }, scale: 'log', static: true, load: onList('US') },
  sanctionseu: { id: 'sanctionseu', group: 'influence', source: 'eu-sanctions', format: { kind: 'count' }, scale: 'log', static: true, load: onList('EU') },
  sanctionsuk: { id: 'sanctionsuk', group: 'influence', source: 'uk-sanctions', format: { kind: 'count' }, scale: 'log', static: true, load: onList('UK') },
};
