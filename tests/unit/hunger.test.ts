import { beforeAll, describe, expect, it } from 'vitest';
import { hungerSeries, inForce, ipcMonth, isPartial, latestOf, parseIpc, partialSeries } from '../../src/adapters/ipc.ts';

// The food crises views and the IPC adapter, built from the sample file.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
type Routes = typeof import('../../src/lib/routes.ts');
type Country = typeof import('../../src/lib/country.ts');
type Hunger = typeof import('../../src/lib/hunger.ts');
let V: Views;
let C: Country;
let L: Layers;
let R: Routes;
let H: Hunger;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  L = await import('../../src/lib/map/layers.ts');
  R = await import('../../src/lib/routes.ts');
  C = await import('../../src/lib/country.ts');
  H = await import('../../src/lib/hunger.ts');
});

// One analysis in the IPC API's format: months as "Oct 2025", people by phase in `phases`.
const an = (id: number, from: string, p3: number, extra: Record<string, unknown> = {}) => ({
  id: String(id), title: 'Acute Food Insecurity Analysis', country: 'SD', condition: 'A', ipc_period: 'P', year: Number(from.slice(-4)), from, to: from,
  estimated_population: 1000, population: 4000,
  phases: [1000 - p3, 0, p3, 0, 0].map((population, i) => ({ phase: i + 1, population, percentage: population / 1000 })), ...extra,
});

describe('IPC adapter', () => {
  it('takes each country’s latest acute analysis in a year', () => {
    const list = parseIpc([an(2, 'Oct 2025', 300), an(1, 'Mar 2025', 200), an(3, 'Jun 2024', 100), an(4, 'Dec 2025', 900, { condition: 'C' })]);
    expect(list.map((a) => a.id)).toEqual([3, 1, 2]);
    expect(list[2]).toMatchObject({ from: '2025-10', period: 'projection', analysed: 1000, population: 4000, crisis: 300, system: 'IPC' });
    expect(hungerSeries(list, 'people')).toEqual({ SDN: { 2024: 100, 2025: 300 } });
    expect(hungerSeries(list, 'share').SDN[2025]).toBeCloseTo(0.3);
  });

  it('puts the later of two analyses for one period last, and reads Cadre Harmonisé from the title', () => {
    const list = parseIpc([
      an(9, 'Jun 2026', 300, { year: 2026, title: 'Cadre Harmonisé Analysis July 2026' }),
      an(5, 'Jun 2026', 200, { year: 2025, title: 'Cadre Harmonisé Analysis November 2025' }),
    ]);
    expect(list.map((a) => a.id)).toEqual([5, 9]);
    expect(list[1].system).toBe('CH');
    expect(latestOf(list).get('SDN')?.id).toBe(9);
  });

  it('leaves out analyses with no people in any phase, regional ones and other months', () => {
    const empty = an(1, 'Aug 2013', 0, { phases: [1, 2, 3, 4, 5].map((phase) => ({ phase, population: 0, percentage: 0 })) });
    expect(parseIpc([empty, an(2, 'Jul 2026', 10, { country: 'LAC' }), an(3, '2026-07', 10)])).toEqual([]);
  });

  it('never takes fewer people analysed than it counts in phases', () => {
    expect(parseIpc([an(1, 'Mar 2013', 300, { estimated_population: 144 })])[0].analysed).toBe(1000);
  });

  it('tells analyses of part of a country, and names the Gaza Strip only when the title does', () => {
    const [whole, part] = parseIpc([an(1, 'Jun 2026', 300, { population: 1020 }), an(2, 'Jul 2026', 300, { country: 'YE', population: 35000 })]);
    expect([isPartial(whole), isPartial(part)]).toEqual([false, true]);
    expect(partialSeries([whole, part])).toEqual({ YEM: { 2026: 1 } });
    expect(parseIpc([an(3, 'Jul 2026', 10, { country: 'PS', population: 0 })])[0]).toMatchObject({ population: null, area: null });
    expect(isPartial(parseIpc([an(3, 'Jul 2026', 10, { country: 'PS', population: 0 })])[0])).toBe(false);
    expect(parseIpc([an(4, 'Jul 2026', 10, { country: 'PS', title: 'Gaza Strip: Acute Food Insecurity Situation' })])[0].area).toBe('the Gaza Strip');
  });

  it('knows which analyses are in force on a day', () => {
    const list = parseIpc([an(1, 'Jun 2026', 300, { to: 'Aug 2026' }), an(2, 'Oct 2026', 100, { to: 'Jan 2027', country: 'SO' })]);
    expect([...latestOf(list, '2026-11-24').keys()]).toEqual(['SOM']);
    expect(inForce(list[0], '2026-08-31')).toBe(true);
    expect(ipcMonth('Sept 2022')).toBe('2022-09');
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

describe('country pages', () => {
  it('give a place IPC has analysed the analysis the maps show, ended or not, and no block to others', () => {
    const f = C.countryModel('SDN')!.blocks.food!;
    expect(f.analysis).toBe(H.latestAnalyses().get('SDN'));
    expect(f.ended).toBe(H.isEnded(f.analysis));
    expect(C.countryModel('FRA')?.blocks.food).toBeUndefined();
  });
});

describe('food crisis tags', () => {
  it('say Period ended and the area in plain words in the tooltip, never as a tag its dark ground would hide', async () => {
    const { tooltipHtml } = await import('../../src/scripts/map/panel.ts');
    const f = L.layerFile('food-crises-hunger');
    f.data.forEach((y, i) => {
      for (const id of Object.keys(y.v)) {
        const html = tooltipHtml(f, y, id, id);
        expect(html).not.toMatch(/gt-tag--(ended|area)/);
        expect(html).not.toMatch(/<span[^>]*>\s*<\/span>/);
        if (H.foodTags(id, f.years[i]).includes('ended')) expect(html).toMatch(/<span>[^<]*Period ended<\/span>/);
      }
    });
  });

  it('tag a place’s latest figure Period ended when its period ended before the snapshot’s day, and no earlier one', () => {
    const [a] = parseIpc([an(1, 'Jun 2026', 300, { to: 'Aug 2026' })]);
    expect([H.isEnded(a, '2026-08-31'), H.isEnded(a, '2026-09-01')]).toEqual([false, true]);
    for (const [id, a] of H.latestAnalyses()) {
      const year = Number(a.from.slice(0, 4));
      expect(H.foodTags(id, year).includes('ended')).toBe(H.isEnded(a));
      expect(H.foodTags(id, year).includes('partial')).toBe(isPartial(a));
      for (const y of [year - 1, year - 2]) expect(H.foodTags(id, y)).not.toContain('ended');
    }
  });

  it('put the same tags on the map as beside the figure elsewhere', () => {
    const f = L.layerFile('food-crises-hunger');
    const i = f.years.indexOf(f.year);
    for (const [id, e] of Object.entries(f.data[i].v)) expect(e[3] || '').toBe(H.foodTags(id, f.year).join(' '));
  });
});
