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

  it('lists every country page in the Countries finder, the dossiers marked', async () => {
    const { countryOptions } = await import('../../src/lib/home.ts');
    const { routes } = await import('../../src/lib/routes.ts');
    const opts = countryOptions();
    expect(opts.length).toBe(routes().filter((r) => r.live && r.kind === 'country').length);
    expect(opts.find((o) => o.href === '/countries/china')?.note).toBe('Full dossier');
  });

  it("shows the This week strip with the current week's counts, and hides it with no counts or no /this-week", async () => {
    const { weekStrip } = await import('../../src/lib/home.ts');
    const live = (k: string) => (k === 'week' ? { path: '/this-week' } : undefined);
    const counts = [{ num: '3', label: 'new disaster alerts, orange and red', source: 'GDACS · 27 Oct – 2 Nov 2026' }];
    expect(weekStrip(() => ({ rangeText: '27 October – 2 November 2026', counts }), live))
      .toEqual({ range: '27 October – 2 November 2026', href: '/this-week', counts });
    expect(weekStrip(() => ({ rangeText: '27 October – 2 November 2026', counts: [] }), live)).toBeNull();
    expect(weekStrip(() => ({ rangeText: '27 October – 2 November 2026', counts }), () => undefined)).toBeNull();
    expect(weekStrip(() => null, live)).toBeNull();
  });

  it('gives each dossier card the first sentence of its page summary, tagged when the USGS year is an estimate', async () => {
    const { dossierFact } = await import('../../src/lib/home.ts');
    const { countryModel } = await import('../../src/lib/country.ts');
    for (const id of ['USA', 'CHN', 'RUS']) {
      const m = countryModel(id);
      const f = dossierFact(id);
      expect(f.fact).toBe(m?.summary[0] ?? null);
      const lead = m?.minerals.slice(0, 3).find((x) => x.measure === 'mine') ?? m?.minerals[0];
      expect(f.estimated).toBe(Boolean(f.fact && lead?.estimated));
    }
    expect(dossierFact('XXX')).toEqual({ fact: null, estimated: false });
  });

  it('says in the summary’s source when USGS’s mineral figures are estimates, as the minerals section does', async () => {
    const { countryModel } = await import('../../src/lib/country.ts');
    let seen = 0;
    for (const id of ['USA', 'CHN', 'RUS', 'AUS', 'COD', 'CHL', 'ZAF']) {
      const m = countryModel(id);
      const mined = m?.minerals.slice(0, 3).filter((x) => x.measure === 'mine') ?? [];
      if (!mined.length) continue;
      const line = m!.summary.find((x) => x.includes(' mines '))!;
      expect(line.endsWith(mined.some((x) => x.estimated) ? ', estimated).' : `, ${mined[0].year}).`), id).toBe(true);
      if (mined.some((x) => x.estimated)) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
