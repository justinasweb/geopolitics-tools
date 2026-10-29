import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The page engine reads the sample files here (the prototype's fixtures), never a live snapshot.
process.env.GT_DATA = 'sample';

describe('topic hubs', async () => {
  const R = await import('../../src/lib/routes.ts');
  const { hubModel, answerOf, topLine } = await import('../../src/lib/hubs.ts');
  const { mapLayers, layerFile } = await import('../../src/lib/map/layers.ts');
  const { NAV_HUBS } = await import('../../src/data/nav.ts');
  const { menuGroups } = await import('../../src/lib/menu.ts');
  const { DOSSIERS } = await import('../../src/lib/country.ts');
  const { HUB_GROUPS } = await import('../../src/data/hubs.ts');
  const { INDICATORS } = await import('../../src/data/indicators.ts');
  const m = hubModel('resources')!;

  it('builds the five hubs, indexed, each with a card per live view family and an intro', () => {
    for (const h of NAV_HUBS) {
      expect(R.live(`hub:${h.id}`)).toMatchObject({ path: h.path, indexed: true });
      const hm = hubModel(h.id)!;
      expect(hm.cards.map((c) => c.family)).toEqual(h.views.map((v) => v.id).filter((f) => R.viewHref(f)));
      for (const c of hm.cards) expect(c.headline.length).toBeGreaterThan(10);
      expect(readFileSync(new URL(`../../src/content/hubs/${h.id}.md`, import.meta.url), 'utf8')).toMatch(/^approved: false$/m);
    }
  });

  it('draws every state of the full map in the thumbnails, with each in the key', () => {
    const lithium = m.cards.find((c) => c.family === 'minerals')!;
    const f = layerFile('minerals-lithium');
    const y = f.data[f.years.indexOf(f.year)];
    if (Object.values(y.v).some((e) => e[0] === 0)) {
      expect(lithium.thumb.withheld).toBe(true);
      expect(lithium.thumb.paths.some((p) => p.fill === `url(#${lithium.thumb.pattern}-w)`)).toBe(true);
      expect(lithium.key.some((k) => k.sw === 'withheld')).toBe(true);
    }
    for (const c of m.cards) expect(c.key.at(-1)).toMatchObject({ sw: 'nodata' });
  });

  it('counts first places on world shares, volumes and counts only', () => {
    const shareOfOwn = mapLayers().filter((d) => d.family === 'electricity' && !d.ranks).map((d) => layerFile(d.id).name.toLowerCase());
    expect(shareOfOwn.length).toBeGreaterThan(0);
    for (const c of m.countries) for (const s of shareOfOwn) expect(c.what.toLowerCase()).not.toContain(s);
  });

  it('names places tied at the top of a ranking together, not in a made-up order', () => {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    expect(topLine([{ id: 'USA', value: 0.5 }, { id: 'CHN', value: 0.3 }, { id: 'RUS', value: 0.1 }], pct)).toBe('Top 3: United States, China, Russia');
    const tied = topLine(['ALB', 'BTN', 'PRY', 'ISL', 'NPL', 'ETH'].map((id) => ({ id, value: 0.999 })).concat([{ id: 'NOR', value: 0.9 }]), pct);
    expect(tied).toBe('Tied first at 100%: Albania, Bhutan, Paraguay, Iceland and 2 more');
  });

  it('has one card per live view family, in menu order, the view’s own answer as the headline', () => {
    const order = NAV_HUBS.find((h) => h.id === 'resources')!.views.map((v) => v.id);
    const families = m.cards.map((c) => c.family);
    expect(families).toEqual(order.filter((f) => R.viewHref(f)));
    for (const c of m.cards) {
      const route = R.routes().find((r) => r.live && r.path === c.href)!;
      expect(c.headline).toBe(answerOf(route.key));
      expect(c.headline).not.toMatch(/\b(dominant|dominates|vulnerable|popular|crucial|key)\b/i);
      for (const x of c.chips) expect(R.routes().some((r) => r.live && r.path === x.href)).toBe(true);
      expect(c.thumb.paths.length).toBeGreaterThan(100);
      expect(c.thumb.paths.some((p) => /var\(--(seq|div)-\d\)/.test(p.fill))).toBe(true);
      expect(c.key.length).toBeGreaterThan(0);
    }
    // The first card is the lead, drawn larger.
    expect(m.cards[0].thumb.width).toBeGreaterThan(m.cards[1].thumb.width);
  });

  it('lists live tools only, with this topic’s supply-chain flows', () => {
    for (const t of m.tools) expect(R.live(`tool:${t.id}`)?.path).toBe(t.href);
    const chains = m.tools.find((t) => t.id === 'supply-chains');
    if (chains) for (const l of chains.links) expect(l.href).toMatch(/^\/supply-chains\//);
  });

  it('lists countries by its stated rule: the dossiers, then countries first on this topic’s maps', () => {
    expect(m.countries.length).toBeLessThanOrEqual(10);
    const dossiers = m.countries.filter((c) => DOSSIERS.includes(c.id)).map((c) => c.id);
    expect(m.countries.slice(0, dossiers.length).map((c) => c.id)).toEqual(dossiers);
    for (const c of m.countries.slice(dossiers.length)) expect(c.what).toMatch(/^First on /);
    for (const c of m.countries) expect(R.live(`country:${c.id}`)?.path).toBe(c.href);
  });

  it('ranks only the indicator groups of the topic', () => {
    for (const r of m.rankings) {
      expect(HUB_GROUPS.resources).toContain(INDICATORS[r.id].group);
      expect(r.top).toMatch(/^\d{4} · (Top 3|Tied first at [^:]+): /);
    }
  });

  it('is the parent of its views: breadcrumbs and menus link to it', () => {
    expect(R.hubCrumb('resources')).toEqual({ label: 'Resources', href: '/resources' });
    expect(R.hubCrumb('power').href).toBe('/power');
    const g = menuGroups().find((x) => x.id === 'resources')!;
    expect(g.links[0].path).toBe('/resources');
  });

  it('keeps its intro a draft until approved', () => {
    const md = readFileSync(new URL('../../src/content/hubs/resources.md', import.meta.url), 'utf8');
    expect(md).toMatch(/^approved: false$/m);
    const intro = /^intro: "(.*)"$/m.exec(md)![1];
    expect(intro.split(/(?<=\.) /).length).toBe(2);
    expect(intro).not.toMatch(/\b(dominant|vulnerable|crucial|popular)\b/i);
  });

  it('names a share or rate measure with what it is of, and every ranking with its year', async () => {
    const climate = hubModel('climate')!;
    const trade = climate.rankings.find((r) => r.id === 'co2trade');
    if (trade) expect(trade.name).toBe('CO2 imported in goods, % of own emissions');
    for (const r of [...climate.rankings, ...hubModel('power')!.rankings]) expect(r.top).toMatch(/^\d{4} · /);
  });

  it('writes lists without a serial comma', async () => {
    const { list } = await import('../../src/i18n/pages.en.ts');
    expect(list(['Ethiopia', 'Sudan', 'Egypt'])).toBe('Ethiopia, Sudan and Egypt');
    expect(list(['Ethiopia', 'Sudan'])).toBe('Ethiopia and Sudan');
    expect(list(['Ethiopia'])).toBe('Ethiopia');
  });
});
