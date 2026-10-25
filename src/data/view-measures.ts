// Measures that only the map views show (no indicator page, profile row or Compare column): the AI and chips
// view's notable models and US Entity List counts. Same shape as the registry (./indicators.ts); `load` also gets
// the year the source was fetched, for lists that hold only what is current.
import type { Raw, Series } from '../adapters/core.ts';
import { put } from '../adapters/core.ts';
import { ai } from '../adapters/epoch.ts';
import { sanctions } from '../adapters/sanctions.ts';
import type { Indicator } from './indicators.ts';

export interface ViewMeasure extends Omit<Indicator, 'load'> { load: (raw: Raw, fetched: number) => Series }

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
};
