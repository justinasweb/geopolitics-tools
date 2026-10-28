import { describe, expect, it } from 'vitest';
import { NAV_TOOLS, NAV_TOP } from '../../src/data/nav.ts';
import { NAV_TEXT } from '../../src/i18n/en.ts';

// The menu: only live pages are linked, Indicators is a top link like the others, and Tools is empty (so the
// Header leaves it out) when no tool is live; then the menu the build makes from the sample files.
process.env.GT_DATA = 'sample';

describe('menu', () => {
  it('links only live pages, with the path the route registry gives', async () => {
    const { menu } = await import('../../src/lib/menu.ts');
    const live: Record<string, string> = { countries: '/countries', indicators: '/indicators', 'tool:explorer': '/explorer', 'tool:supply-chains': '/supply-chains' };
    const m = menu(false, (k) => (live[k] ? { path: live[k] } : undefined), (id) => (id === 'oil' ? '/oil' : undefined));
    expect(m.top.map((u) => u.id)).toEqual(['countries', 'indicators']);
    expect(m.tools.map((u) => u.id)).toEqual(['explorer', 'supply-chains']);
    expect(m.hubs.map((h) => h.id)).toEqual(['resources']);
    expect(m.hubs[0].views).toEqual([{ id: 'oil', path: '/oil' }]);
  });

  it('has no tools when none is live', async () => {
    const { menu } = await import('../../src/lib/menu.ts');
    const m = menu(false, (k) => (k === 'countries' ? { path: '/countries' } : undefined), () => undefined);
    expect(m.tools).toEqual([]);
    expect(m.hubs).toEqual([]);
    expect(m.top.map((u) => u.id)).toEqual(['countries']);
  });

  it('shows everything in full mode, with words for every link', async () => {
    const { menu } = await import('../../src/lib/menu.ts');
    const m = menu(true);
    expect(m.top.map((u) => u.id)).toEqual(['countries', 'indicators', 'this-week']);
    expect(m.tools.map((u) => u.id)).toEqual(['atlas', 'explorer', 'dependencies', 'supply-chains', 'blocs-overlap']);
    for (const u of NAV_TOP) expect(NAV_TEXT.top[u.id], u.id).toBeTruthy();
    for (const t of NAV_TOOLS) expect(NAV_TEXT.tools[t.id]?.[1], t.id).toBeTruthy();
  });

  it('builds from the sample files: Indicators in the top row, unbuilt tools left out', async () => {
    const { menu } = await import('../../src/lib/menu.ts');
    const { route } = await import('../../src/lib/routes.ts');
    const m = menu();
    expect(m.top.map((u) => u.id)).toContain('indicators');
    expect(m.top.map((u) => u.id)).not.toContain('this-week');
    expect(m.tools.map((u) => u.id)).not.toContain('atlas');
    expect(m.tools.map((u) => u.id)).not.toContain('blocs-overlap');
    // Bloc overlap is registered at its own address, apart from the bloc pages under /blocs.
    expect(route('tool:blocs-overlap')).toMatchObject({ path: '/blocs/overlap', live: false });
    expect(route('tool:this-week')).toMatchObject({ path: '/this-week', live: false });
  });
});
