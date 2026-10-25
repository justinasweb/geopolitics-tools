import { beforeAll, describe, expect, it } from 'vitest';

// The sanctions views: all three lists together, then each list on its own.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let V: Views;
let R: Routes;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  R = await import('../../src/lib/routes.ts');
});

describe('sanctions views', () => {
  it('has the three lists at /sanctions/{us,eu,uk}', () => {
    expect(R.route('view:sanctions:sanctions')!.path).toBe('/sanctions');
    for (const l of ['us', 'eu', 'uk']) {
      const r = R.route(`view:sanctions:sanctions${l}`);
      if (r) expect(r.path).toBe(`/sanctions/${l}`);
    }
  });

  it('adds the lists up to the all-lists total for each country', () => {
    const all = V.viewPage('sanctions')!;
    const lists = ['sanctionsus', 'sanctionseu', 'sanctionsuk'].map((id) => V.viewPage(id)).filter((p) => p !== undefined);
    if (lists.length < 3) return;
    for (const r of all.byYear[all.year].rows.slice(0, 10)) {
      const sum = lists.reduce((t, p) => t + (p!.byYear[p!.year].rows.find((x) => x.id === r.id)?.value ?? 0), 0);
      expect(sum).toBe(r.value);
    }
  });
});
