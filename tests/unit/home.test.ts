import { describe, expect, it } from 'vitest';

// The homepage's tool row: the live tools only, always in the design's order (Atlas, Explorer, Dependencies,
// Supply chains, Bloc overlap, This week), each linked where the route registry says; a tool that is not live is
// left out, never shown as coming. Then the row and the worked questions the build makes from the sample files.
process.env.GT_DATA = 'sample';

describe('homepage tool row', () => {
  it('lists only live tools, in the fixed order', async () => {
    const { toolRow } = await import('../../src/lib/home.ts');
    // Given out of order, with Dependencies and Atlas not live.
    const live: Record<string, string> = { week: '/this-week', 'tool:blocs-overlap': '/blocs/overlap', 'tool:explorer': '/explorer', 'tool:supply-chains': '/supply-chains' };
    const row = toolRow((k) => (live[k] ? { path: live[k] } : undefined), () => 10);
    expect(row.map((t) => t.id)).toEqual(['explorer', 'supply-chains', 'blocs-overlap', 'this-week']);
    expect(row.map((t) => t.href)).toEqual(['/explorer', '/supply-chains', '/blocs/overlap', '/this-week']);
    expect(row.find((t) => t.id === 'supply-chains')?.desc).toBe('Supplier to buyer flows for 10 goods');
  });

  it('keeps all six in order when every tool is live, each with a name and a short line', async () => {
    const { toolRow, TRAIL } = await import('../../src/lib/home.ts');
    const row = toolRow((k) => ({ path: `/${k}` }), () => 0);
    expect(row.map((t) => t.id)).toEqual([...TRAIL]);
    expect(TRAIL).toEqual(['atlas', 'explorer', 'dependencies', 'supply-chains', 'blocs-overlap', 'this-week']);
    for (const t of row) {
      expect(t.name).not.toBe('');
      expect(t.desc.length).toBeLessThanOrEqual(46);
    }
  });

  it('is empty when no tool is live', async () => {
    const { toolRow } = await import('../../src/lib/home.ts');
    expect(toolRow(() => undefined)).toEqual([]);
  });

  it('links worked questions and prepared questions to live pages only, naming where each opens', async () => {
    const { questionCards, questions } = await import('../../src/lib/home.ts');
    const { routes } = await import('../../src/lib/routes.ts');
    const paths = new Set(routes().filter((r) => r.live).map((r) => r.path));
    const path = (href: string) => href.split(/[?#]/)[0];
    for (const c of questionCards()) {
      expect(paths.has(path(c.href))).toBe(true);
      expect(c.go).toMatch(/^Open /);
      expect(c.source).not.toBe('');
    }
    const qs = questions();
    expect(qs.length).toBeLessThanOrEqual(6);
    for (const q of qs) expect(paths.has(path(q.href))).toBe(true);
  });
});
