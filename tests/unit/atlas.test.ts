import { describe, expect, it } from 'vitest';
import { carryYear, readAtlasState, writeAtlasState, yearOn, type AtlasContext } from '../../src/scripts/map/atlas-state.ts';
import { monthNumber } from '../../src/scripts/map/state.ts';

// The page engine reads the sample files here (the prototype's fixtures), never a live snapshot.
process.env.GT_DATA = 'sample';

const ctx: AtlasContext = {
  start: 'minerals-lithium',
  layers: [
    { key: 'minerals-lithium', years: [2024, 2025], year: 2025 },
    { key: 'oil-trade', years: [2015, 2020, 2023, 2024], year: 2023 },
    { key: 'conflict', years: [monthNumber('2026-01'), monthNumber('2026-02'), monthNumber('2026-03')], year: monthNumber('2026-03'), axis: 'months' },
    { key: 'disasters', years: [30, 90, 365], year: 365, axis: 'days' },
  ],
  slugs: { IND: 'india', USA: 'united-states' },
  overlays: ['flows', 'pipelines'],
};
const url = (s: string) => new URL(`https://geopolitics.tools/atlas${s}`);
const write = (s: Parameters<typeof writeAtlasState>[1]) => writeAtlasState(url('?old=1'), s, ctx).search;

describe('Atlas address', () => {
  it('opens on lithium with a bare address', () => {
    expect(readAtlasState('', ctx).state).toEqual({ layer: 'minerals-lithium', overlays: [] });
    expect(write({ layer: 'minerals-lithium', overlays: [] })).toBe('');
  });

  it('reads and writes the whole state, in a fixed order, ISO3 in capitals', () => {
    const s = '?layer=oil-trade&year=2020&country=IND&overlays=flows,pipelines';
    const { state } = readAtlasState(s, ctx);
    expect(state).toEqual({ layer: 'oil-trade', year: 2020, country: 'IND', overlays: ['flows', 'pipelines'] });
    expect(write(state)).toBe(s);
  });

  it('drops what it does not know: a layer, a place, an overlay', () => {
    const { state } = readAtlasState('?layer=nope&country=atlantis&overlays=flows,cables', ctx);
    expect(state).toEqual({ layer: 'minerals-lithium', overlays: ['flows'] });
  });

  it('takes a country as an id in any case, or as its slug', () => {
    expect(readAtlasState('?country=ind', ctx).state.country).toBe('IND');
    expect(readAtlasState('?country=united-states', ctx).state.country).toBe('USA');
  });

  it('moves a year the layer lacks to the nearest one, and says which was asked', () => {
    expect(readAtlasState('?layer=oil-trade&year=2022', ctx)).toEqual({ state: { layer: 'oil-trade', year: 2023, overlays: [] }, askedYear: 2022 });
  });

  it('leaves out the layer’s own default year', () => {
    expect(write({ layer: 'oil-trade', year: 2023, overlays: [] })).toBe('?layer=oil-trade');
  });

  it('writes a month as 2026-02 and a period in days', () => {
    const { state } = readAtlasState('?layer=conflict&year=2026-02', ctx);
    expect(state.year).toBe(monthNumber('2026-02'));
    expect(write(state)).toBe('?layer=conflict&year=2026-02');
    expect(write({ layer: 'disasters', year: 90, overlays: [] })).toBe('?layer=disasters&year=90');
  });
});

describe('Atlas year across layers', () => {
  const [lithium, oil, conflict] = ctx.layers;
  it('keeps a chosen year when the next layer steps in years, shown at the nearest it has', () => {
    expect(carryYear(lithium, oil, 2025)).toBe(2025);
    expect(yearOn(oil, 2025)).toBe(2024);
    // Back on lithium, the year asked for is still 2025.
    expect(yearOn(lithium, carryYear(oil, lithium, 2025))).toBe(2025);
  });

  it('opens on the layer’s default when the reader never chose, or the steps differ', () => {
    expect(yearOn(oil, carryYear(lithium, oil, undefined))).toBe(2023);
    expect(carryYear(lithium, conflict, 2025)).toBeUndefined();
  });
});

describe('Atlas layers', async () => {
  const { atlasLayers, atlasTopics, defaultLayer, keyOf } = await import('../../src/lib/atlas.ts');
  const { mapLayers } = await import('../../src/lib/map/layers.ts');
  const { live } = await import('../../src/lib/routes.ts');
  const { NAV_HUBS } = await import('../../src/data/nav.ts');

  it('is live and indexed at /atlas', () => {
    expect(live('tool:atlas')).toMatchObject({ path: '/atlas', indexed: true });
  });

  it('lists every layer whose map view is live, and only those', () => {
    const want = mapLayers().filter((d) => live(d.view)).map((d) => d.id).sort();
    expect(atlasLayers().map((l) => l.id).sort()).toEqual(want);
    expect(want.length).toBeGreaterThan(0);
  });

  it('groups them as the menu does: topics, then families, in menu order', () => {
    const order = NAV_HUBS.flatMap((h) => h.views.map((v) => v.id));
    const families = atlasTopics().flatMap((t) => t.rows.map((r) => r.family));
    expect(families).toEqual(order.filter((f) => families.includes(f)));
    expect(atlasTopics().map((t) => t.id)).toEqual(NAV_HUBS.map((h) => h.id).filter((h) => atlasTopics().some((t) => t.id === h)));
  });

  it('names each layer by its view’s path, from its layer file', () => {
    for (const l of atlasLayers()) {
      expect(l.key).toBe(keyOf(l.path));
      expect(l.name).toBeTruthy();
      expect(l.years).toContain(l.year);
    }
    expect(new Set(atlasLayers().map((l) => l.key)).size).toBe(atlasLayers().length);
    expect(keyOf('/oil/trade')).toBe('oil-trade');
  });

  it('opens on lithium', () => {
    expect(defaultLayer()).toMatchObject({ id: 'minerals-lithium', key: 'minerals-lithium', name: 'Lithium' });
  });
});
