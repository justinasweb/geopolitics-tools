import { describe, expect, it } from 'vitest';
import { carryYear, kindOf, overlayAt, overlayStep, readAtlasState, toggleOverlay, writeAtlasState, yearOn, type AtlasContext } from '../../src/scripts/map/atlas-state.ts';
import { legendHtml } from '../../src/scripts/map/legend.ts';
import type { LayerFile, Overlay } from '../../src/lib/map/types.ts';
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
  overlays: ['flows-oil-trade', 'flows-food-wheat-trade', 'launches', 'bloc-nato', 'bloc-brics'],
};
const url = (s: string) => new URL(`https://geopolitics.tools/atlas${s}`);
const write = (s: Parameters<typeof writeAtlasState>[1]) => writeAtlasState(url('?old=1'), s, ctx).search;

describe('Atlas address', () => {
  it('opens on lithium with a bare address', () => {
    expect(readAtlasState('', ctx).state).toEqual({ layer: 'minerals-lithium', overlays: [] });
    expect(write({ layer: 'minerals-lithium', overlays: [] })).toBe('');
  });

  it('reads and writes the whole state, in a fixed order, ISO3 in capitals', () => {
    const s = '?layer=oil-trade&year=2020&country=IND&overlays=flows-oil-trade,bloc-nato';
    const { state } = readAtlasState(s, ctx);
    expect(state).toEqual({ layer: 'oil-trade', year: 2020, country: 'IND', overlays: ['flows-oil-trade', 'bloc-nato'] });
    expect(write(state)).toBe(s);
  });

  it('drops what it does not know: a layer, a place, an overlay', () => {
    const { state } = readAtlasState('?layer=nope&country=atlantis&overlays=launches,cables', ctx);
    expect(state).toEqual({ layer: 'minerals-lithium', overlays: ['launches'] });
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

describe('Atlas overlays', () => {
  it('keeps one choice per overlay, the first named, in list order', () => {
    expect(readAtlasState('?overlays=bloc-brics,launches,bloc-nato', ctx).state.overlays).toEqual(['launches', 'bloc-brics']);
    expect(kindOf('flows-food-wheat-trade')).toBe('flows');
  });

  it('turns a choice on in place of another of the same overlay, and off', () => {
    let on = toggleOverlay([], 'bloc-nato', true, ctx.overlays);
    on = toggleOverlay(on, 'flows-oil-trade', true, ctx.overlays);
    expect(on).toEqual(['flows-oil-trade', 'bloc-nato']);
    expect(toggleOverlay(on, 'bloc-brics', true, ctx.overlays)).toEqual(['flows-oil-trade', 'bloc-brics']);
    expect(toggleOverlay(on, 'bloc-nato', false, ctx.overlays)).toEqual(['flows-oil-trade']);
  });

  const arcs: Overlay = { id: 'flows', kind: 'arcs', label: 'Flows', items: [
    { p: [[0, 0], [1, 1]], w: 1, tip: 'every year' },
    { p: [[0, 0], [1, 1]], w: 1, tip: 'year 0', m: 1 },
    { p: [[0, 0], [1, 1]], w: 1, tip: 'year 2', m: 4 },
  ] };
  it('takes an overlay’s marks for one step of its own layer, masks off', () => {
    expect(overlayAt(arcs, 2).items.map((a) => [a.tip, (a as { m?: number }).m])).toEqual([['every year', 0], ['year 2', 0]]);
    const pts: Overlay = { id: 'ev', kind: 'points', label: 'Events', symbol: 'dot', items: [{ at: [0, 0], tip: 'a', i: 1 }, { at: [0, 0], tip: 'b', i: 2 }] };
    const at = overlayAt(pts, 1);
    expect(at.items).toEqual([{ at: [0, 0], tip: 'a', m: 0 }]);
  });

  it('shows the step nearest the map’s year that has marks, or a fixed one', () => {
    const src = { key: 'oil-trade', years: [2015, 2020, 2023, 2024], year: 2023 };
    const all = () => true;
    expect(overlayStep(src, undefined, ctx.layers[0], 2025, all)).toBe(3);
    expect(overlayStep(src, undefined, ctx.layers[0], 2025, (i) => i < 3)).toBe(2);
    expect(overlayStep(src, 0, ctx.layers[0], 2025, all)).toBe(0);
    // A map over months: the overlay keeps its own default.
    expect(overlayStep(src, undefined, ctx.layers[2], monthNumber('2026-03'), all)).toBe(2);
  });
});

describe('legend', () => {
  const f = { scale: 'seq', ticks: ['<1%', '1–5%', '5–10%', '10–25%', '25%+'], missing: { none: 'No production listed', withheld: 'Withheld by source' },
    data: [{ legend: 'Share of world mine production, 2025' }] } as unknown as LayerFile;
  it('draws a scale with its ticks and the shapes without a class', () => {
    const h = legendHtml(f, 0);
    expect(h).toContain('Share of world mine production, 2025');
    expect(h.match(/var\(--seq-\d\)/g)).toHaveLength(5);
    expect(h).toContain('gt-sw--withheld');
    expect(h).not.toContain('gt-sw--notyet');
  });
  it('names classes in place of a scale', () => {
    const h = legendHtml({ ...f, ticks: [], categories: [{ cls: 4, label: 'Member' }] }, 0);
    expect(h).toContain('Member');
    expect(h).not.toContain('gt-legend__scale');
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

  it('lists only overlays drawn by a live layer, each part present in its file', async () => {
    const { atlasOverlays } = await import('../../src/lib/atlas.ts');
    const { layerFile } = await import('../../src/lib/map/layers.ts');
    const ids = new Set(atlasLayers().map((l) => l.file));
    const all = atlasOverlays().flatMap((o) => o.variants.map((v) => ({ o, v })));
    expect(new Set(all.map((x) => x.v.token)).size).toBe(all.length);
    for (const { o, v } of all) {
      expect(kindOf(v.token)).toBe(o.id);
      if (!v.file) continue;
      expect(ids.has(v.file)).toBe(true);
      const f = layerFile(atlasLayers().find((l) => l.file === v.file)!.id);
      for (const part of v.parts!) expect(f.overlays?.some((x) => x.id === part && x.items.length)).toBe(true);
    }
    // Pipelines, cables, chokepoints and outage marks have no live view yet.
    expect(atlasOverlays().map((o) => o.id)).not.toContain('pipelines');
  });
});
