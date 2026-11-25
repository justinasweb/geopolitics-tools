import { beforeAll, describe, expect, it } from 'vitest';
import { lineChartHtml } from '../../src/lib/linechart.ts';
import { areaIn, coverageChanged, hungerSeries, inForce, ipcMonth, isPartial, latestOf, parseIpc, partialSeries } from '../../src/adapters/ipc.ts';

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

  it('tells analyses of part of a country, and names the area only when IPC’s list of analyses does', () => {
    const [whole, part] = parseIpc([an(1, 'Jun 2026', 300, { population: 1020 }), an(2, 'Jul 2026', 300, { country: 'YE', population: 35000 })]);
    expect([isPartial(whole), isPartial(part)]).toEqual([false, true]);
    expect(partialSeries([whole, part])).toEqual({ YEM: { 2026: 1 } });
    expect(parseIpc([an(3, 'Jul 2026', 10, { country: 'PS', population: 0 })])[0]).toMatchObject({ population: null, area: null });
    expect(isPartial(parseIpc([an(3, 'Jul 2026', 10, { country: 'PS', population: 0 })])[0])).toBe(false);
    // The country endpoint's titles never name it; the list's do, by analysis id.
    const list = [{ id: '4', title: 'Palestine (Gaza Strip) - Acute Food Insecurity Analysis – PS May 2026', link: 'https://www.ipcinfo.org/x/' }];
    expect(parseIpc([an(4, 'Jul 2026', 10, { country: 'PS' })], list)[0]).toMatchObject({ area: 'Gaza Strip', link: 'https://www.ipcinfo.org/x/' });
    expect(parseIpc([an(5, 'Jul 2026', 10, { country: 'PS' })], list)[0].area).toBeNull();
    expect([areaIn('Nigeria - Cadre Harmonisé Analysis March 2025'), areaIn('Guinea-Bissau - Cadre Harmonisé Analysis March 2025'), areaIn('Yemen - Acute Food Insecurity (Projection)')]).toEqual([null, null, null]);
  });

  it('says coverage changed between analyses of different populations, never a percentage', () => {
    // Yemen: 34.9 m nationwide in 2025, 10.5 m (its south) in 2026.
    const [nation, south, near] = parseIpc([
      an(1, 'Sep 2025', 300, { country: 'YE', estimated_population: 34_900_000, population: 34_900_000 }),
      an(2, 'Oct 2026', 300, { country: 'YE', estimated_population: 10_500_000, population: 35_300_000 }),
      an(3, 'Oct 2027', 300, { country: 'YE', estimated_population: 32_000_000, population: 35_300_000 }),
    ]);
    expect(coverageChanged(nation, south)).toBe(true);
    // 32 m of 35.3 m is tagged Part of country and the 2025 one not, but the people analysed are within 20%: IPC's
    // population for a country moves between analyses of the same people, so the tags are not compared.
    expect(coverageChanged(nation, near)).toBe(false);
    const [a, b] = parseIpc([an(4, 'Jun 2025', 300, { estimated_population: 1000, population: 1000 }), an(5, 'Jun 2026', 300, { estimated_population: 1150, population: 1150 })]);
    expect(coverageChanged(a, b)).toBe(false);
    const html = lineChartHtml({ label: 'x', years: [2024, 2025, 2026], lines: [{ label: 'Yemen', values: [10, 18, 5], breaks: [2] }], format: { kind: 'count' } });
    expect(html.match(/class="gt-lc__line[^"]*" d="M/g)).toHaveLength(2);
    expect(html).toContain('gt-lc__break');
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

  it('say on a place IPC has not analysed that there is no analysis, rather than nothing', () => {
    expect(C.countryModel('FRA')?.blocks.foodNone).toBe(true);
    expect(C.countryModel('SDN')?.blocks.foodNone).toBeUndefined();
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

  it('give no percentage change where coverage changed, and say so in the year’s note', () => {
    const p = V.familyPages('food-crises')[0];
    for (const y of p.years.slice(1)) for (const r of p.byYear[y].rows) {
      if (!V.coverageBreak(p, r.id, y)) continue;
      expect(V.yearNote(p, r.id, y)).toContain(`Coverage changed from ${y - 1}`);
    }
  });

  it('draw partial analyses with lines the legend names', () => {
    const f = L.layerFile('food-crises-hunger');
    expect(f.missing.partial).toBe('Analysis of part of the country');
    for (const [id, a] of H.latestAnalyses()) if (isPartial(a)) expect(H.ofAnalysedAt(id, Number(a.from.slice(0, 4)))).toMatch(/^of .+ people analysed$/);
  });

  it('say whose analysis covered part of the country, with its figures, and "the" where the name takes it', () => {
    const [sd, cd] = parseIpc([
      an(1, 'Oct 2026', 300, { estimated_population: 8_289_603, population: 47_535_794 }),
      an(2, 'Oct 2026', 300, { country: 'CD', estimated_population: 105_000_000, population: 113_000_000 }),
    ]);
    expect(H.analysisNote(sd)).toBe('Sudan’s analysis covered 8.3 m of the 48 m people IPC counts in the country.');
    expect(H.analysisNote(cd)).toBe('The Democratic Republic of the Congo’s analysis covered 105 m of the 113 m people IPC counts in the country.');
    expect(H.analysisNote(parseIpc([an(3, 'Oct 2026', 300, { population: 1000 })])[0])).toBeNull();
  });

  it('put the same tags in the tooltip as beside the figure elsewhere, and only Part of country in the panel, as on main', () => {
    const f = L.layerFile('food-crises-hunger');
    const i = f.years.indexOf(f.year);
    for (const [id, e] of Object.entries(f.data[i].v)) {
      const tags = H.foodTags(id, f.year);
      expect(e[3]).toBe(tags.includes('partial') ? 'partial' : 0);
      expect((f.data[i].tip?.[id]?.t ?? '').split(' ').filter((t) => !t.startsWith('area-')).join(' ')).toBe(tags.join(' '));
      expect(f.data[i].notes?.[id] ?? null).toBe(H.panelNote(id, f.year));
    }
  });

  it('keep the panel as on main: no periods, area labels or coverage notes there, all of them in the tooltip', async () => {
    const { countryPanelHtml, tooltipHtml } = await import('../../src/scripts/map/panel.ts');
    const f = L.layerFile('food-crises-hunger');
    const i = f.years.indexOf(f.year);
    for (const id of Object.keys(f.data[i].v)) {
      const panel = countryPanelHtml(f, i, id);
      const tip = tooltipHtml(f, f.data[i], id, id);
      if (f.data[i].periods?.[id]) { expect(tip).toContain(f.data[i].periods![id]); expect(panel).not.toContain(f.data[i].periods![id]); }
      expect(panel).not.toMatch(/Period ended|Coverage changed| only<|of the total shown|IPC counts in the country\. These figures/);
      if (H.foodTags(id, f.year).includes('ended')) expect(tip).toContain('Period ended');
    }
  });
});
