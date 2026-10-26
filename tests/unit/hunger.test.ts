import { beforeAll, describe, expect, it } from 'vitest';
import { hungerSeries, parseIpc } from '../../src/adapters/ipc.ts';

// The food crises views and the IPC adapter, built from the sample file.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let V: Views;
let L: Layers;
let R: Routes;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
});

const an = (id: number, from: string, p3: number, extra = {}) => ({ anl_id: id, country: 'SD', condition: 'A', system: 'IPC', from, to: from, estimated_population: 1000, phase1_population: 1000 - p3, phase3_population: p3, phase3plus_population: p3, ...extra });

describe('IPC adapter', () => {
  it('takes each country’s latest acute analysis in a year', () => {
    const list = parseIpc([an(2, '2025-10', 300), an(1, '2025-03', 200), an(3, '2024-06', 100), an(4, '2025-12', 900, { condition: 'C' })]);
    expect(list.map((a) => a.id)).toEqual([3, 1, 2]);
    expect(hungerSeries(list, 'people')).toEqual({ SDN: { 2024: 100, 2025: 300 } });
    expect(hungerSeries(list, 'share').SDN[2025]).toBeCloseTo(0.3);
  });
});

describe('food crises views', () => {
  it('builds people at /food-crises and the share at /food-crises/share', () => {
    expect(V.familyPages('food-crises').map((p) => R.live(`view:food-crises:${p.id}`)?.path)).toEqual(['/food-crises', '/food-crises/share']);
  });

  it('says a country without an analysis has none, not no data, and gives each country its phases', () => {
    const f = L.layerFile('food-crises-hunger');
    expect(f.missing.none).toBe('No IPC analysis');
    const block = f.more!.SDN.at(-1)!;
    expect(block.label).toBe('Latest analysis');
    expect(block.rows.map((r) => r.name)[0]).toBe('Phase 5, catastrophe');
  });
});
