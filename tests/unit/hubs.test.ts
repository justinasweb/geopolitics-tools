import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The page engine reads the sample files here (the prototype's fixtures), never a live snapshot.
process.env.GT_DATA = 'sample';

describe('topic hubs', async () => {
  const R = await import('../../src/lib/routes.ts');
  const { hubModel, answerOf } = await import('../../src/lib/hubs.ts');
  const { NAV_HUBS } = await import('../../src/data/nav.ts');
  const { menuGroups } = await import('../../src/lib/menu.ts');
  const { DOSSIERS } = await import('../../src/lib/country.ts');
  const { HUB_GROUPS } = await import('../../src/data/hubs.ts');
  const { INDICATORS } = await import('../../src/data/indicators.ts');
  const m = hubModel('resources')!;

  it('builds Resources at /resources, indexed; the other hubs wait', () => {
    expect(R.live('hub:resources')).toMatchObject({ path: '/resources', indexed: true });
    for (const h of ['technology', 'climate', 'security', 'power']) expect(R.live(`hub:${h}`)).toBeUndefined();
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
      expect(r.top).toMatch(/^Top 3: /);
    }
  });

  it('is the parent of its views: breadcrumbs and menus link to it', () => {
    expect(R.hubCrumb('resources')).toEqual({ label: 'Resources', href: '/resources' });
    expect(R.hubCrumb('power').href).toBeUndefined();
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
});
