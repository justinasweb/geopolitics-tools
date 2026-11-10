import { beforeAll, describe, expect, it } from 'vitest';
import { VIEW_FAMILIES } from '../../src/data/views.ts';
import { VIEW_TEXT } from '../../src/i18n/views.en.ts';
import { VIEW_SLUGS } from '../../src/i18n/slugs.en.ts';

// The map views on registry measures (emissions, refugees), built from the sample files.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Layers = typeof import('../../src/lib/map/layers.ts');
let V: Views;
let L: Layers;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  L = await import('../../src/lib/map/layers.ts');
});

describe('registry map views', () => {
  it('has words and a slug for every layer, and one first layer per family', () => {
    for (const f of VIEW_FAMILIES) {
      for (const l of f.layers) {
        expect(VIEW_TEXT[f.id].layers[l.indicator]).toBeDefined();
        expect(VIEW_SLUGS[l.indicator]).toBeDefined();
      }
      expect(f.layers.filter((l) => VIEW_SLUGS[l.indicator] === '')).toHaveLength(f.rootWaits ? 0 : 1);
      if (!f.rootWaits) expect(VIEW_SLUGS[f.layers[0].indicator]).toBe('');
    }
  });

  it('ranks every year and keeps the colour classes fixed across years', () => {
    const p = V.viewPage('co2')!;
    expect(p.years.at(-1)).toBe(p.year);
    expect(p.edges).toHaveLength(4);
    const y = p.byYear[p.year];
    expect(y.rows[0].rank).toBe(1);
    expect(y.rows.every((r, i) => i === 0 || r.value <= y.rows[i - 1].value)).toBe(true);
    const f = L.layerFile('emissions-co2');
    expect(f.data).toHaveLength(p.years.length);
    for (const d of f.data) for (const e of Object.values(d.v)) expect(e[0]).toBeGreaterThanOrEqual(1);
    expect(f.ticks).toEqual(p.ticks);
  });

  it('colours a diverging layer from the "consumes more" end', () => {
    const p = V.viewPage('co2trade')!;
    expect(p.layer.scale).toBe('div');
    expect([0.5, 0.2, 0.05, 0, -0.05, -0.2, -0.5].map((v) => V.classFor(p, v))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.ticks).toEqual(['30%+', '10–30%', '3–10%', '±3%', '3–10%', '10–30%', '30%+']);
    expect(V.valueText(p, 0.12)).toBe('+12%');
  });

  it('gives shares only for layers that add up, and writes small ones as <0.1%', () => {
    expect(V.shareOf(1, 10000)).toBe('<0.1%');
    expect(V.shareOf(25, 100)).toBe('25%');
    expect(V.shareOf(5, null)).toBeNull();
    const pc = V.viewPage('co2pc')!;
    expect(pc.layer.sums).toBe(false);
    const f = L.layerFile('emissions-co2pc');
    expect(Object.values(f.data.at(-1)!.v).every((e) => e[2] === '')).toBe(true);
  });

  it('writes the answer and the summary from the figures', () => {
    for (const p of V.viewPages()) {
      const a = V.lede(p);
      expect(a).toBeTruthy();
      expect(a).not.toMatch(/undefined|NaN|, The /);
      for (const s of V.summary(p)) expect(s).not.toMatch(/undefined|NaN/);
    }
  });
  it('writes no sign on a change that rounds to zero, and no change from a tiny money figure', () => {
    type P = Parameters<Views['changeText']>[0];
    const pts = { layer: { points: true }, format: { kind: 'share' } } as unknown as P;
    const usd = { layer: {}, format: { kind: 'money', millions: true } } as unknown as P;
    expect(V.changeText(usd, -0.003)).toBe('0%');
    expect(V.changeText(pts, -0.0002)).toBe('0.0 pts');
    expect(V.changeText(usd, 0.12)).toBe('+12%');
    expect(V.placeChange(usd, 16_311_722, 32_624)).toBeNull();
    expect(V.placeChange(usd, 383e6, 85e6)).toBeCloseTo(3.506, 2);
    expect(V.placeChange(pts, 0.41, 0.4)).toBeCloseTo(0.01);
  });

  it('splits a refugees figure into the three groups UNHCR adds together', () => {
    for (const id of ['refout', 'refin']) {
      const p = V.viewPage(id)!;
      for (const r of p.byYear[p.year].rows.slice(0, 5)) {
        const x = V.partsOf(p, r.id, p.year)!;
        expect(x.refugees + x.asylum + x.oip).toBeCloseTo(r.value, 0);
      }
    }
    expect(V.partsOf(V.viewPage('co2')!, 'USA', 2020)).toBeNull();
  });

  it('shows Russia as not reported on the hosted maps from 2024: hatched, its own legend words, out of the ranking', () => {
    for (const id of ['refin', 'refinpc']) {
      const p = V.viewPage(id)!;
      expect(p.byYear[2023].rows.some((r) => r.id === 'RUS')).toBe(true);
      expect(p.byYear[2024].rows.some((r) => r.id === 'RUS')).toBe(false);
      expect(V.unreportedIn(p, 2024).map((n) => n.place)).toEqual(['RUS']);
      const f = L.layerFile(`refugees-${id}`);
      expect(f.missing.withheld).toBe('Not reported since 2023');
      expect(f.text.withheld).toBe('Not reported since 2023');
      expect(f.text.withheldWhy).toMatch(/stop counting Ukrainians in Russia from 2024/);
      expect(f.data.find((d) => d.year === 2024)!.v.RUS[0]).toBe(0);
      expect(f.data.find((d) => d.year === 2023)!.v.RUS[0]).toBeGreaterThan(0);
      expect(f.data.find((d) => d.year === 2024)!.order).not.toContain('RUS');
      expect(f.notes.RUS).toMatch(/stop counting Ukrainians in Russia from 2024/);
    }
    // Ukraine's "fled from" figure stays as UNHCR publishes it, with its note.
    const out = V.viewPage('refout')!;
    expect(V.unreportedIn(out, 2024)).toEqual([]);
    expect(L.layerFile('refugees-refout').missing.withheld).toBeUndefined();
    expect(L.layerFile('refugees-refout').notes.UKR).toMatch(/stop counting Ukrainians in Russia from 2024/);
  });
});

describe('not reported on country pages', () => {
  it('gives Russia’s page "not reported since 2023" for refugees hosted, with its 2023 figure, and no hosted figure', async () => {
    const { countryModel } = await import('../../src/lib/country.ts');
    const r = countryModel('RUS')!.blocks.refugees!;
    expect(r.hosted).toBeUndefined();
    expect(r.hostedUnreported).toMatchObject({ since: 2023, reason: 'ukrainians-in-russia', last: { year: 2023 } });
    expect(r.hostedUnreported!.last!.value).toBeGreaterThan(1_000_000);
    // Other countries' hosted figures are as UNHCR publishes them.
    expect(countryModel('DEU')!.blocks.refugees!.hosted).toBeDefined();
    expect(countryModel('DEU')!.blocks.refugees!.hostedUnreported).toBeUndefined();
  });
});

describe('map legends', () => {
  it('split a long tail into upper bands, for every kind of figure', () => {
    // Refugees by origin: the top fifth runs from 83,000 to 7.6 m.
    const origins = [...Array.from({ length: 40 }, (_, i) => 10 * (i + 1)), ...Array.from({ length: 40 }, (_, i) => 1_000 * (i + 1)), ...Array.from({ length: 15 }, (_, i) => 83_000 + 10_000 * i), 600_000, 1_500_000, 2_500_000, 5_200_000, 7_640_000];
    const tail = V.seqEdges(origins);
    expect(tail.slice(2)).toEqual([500_000, 2_000_000]);
    // CO2, Mt: 85 to 12,300 in the top fifth.
    expect(V.withTail([0.8, 6.5, 21, 85], 12_300)).toEqual([6.5, 85, 500, 2_000]);
    // A share works the same: AI compute, 1.1% to 81%.
    expect(V.withTail([0.00062, 0.0015, 0.0032, 0.011], 0.809)).toEqual([0.0015, 0.011, 0.05, 0.2]);
    // A short tail keeps its quintiles.
    const even = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(V.seqEdges(even)).toEqual([21, 41, 61, 81]);
  });

  it('merge edges that fall on one value, so no band is repeated, and spread their colours', async () => {
    const { seqSteps } = await import('../../src/lib/map/steps.ts');
    // AI models: most countries at 36.
    const models = [1, 1, 1, ...Array(12).fill(36), 50, 65];
    const e = V.seqEdges(models);
    expect(e).toEqual([...new Set(e)]);
    expect(e).toEqual([36]);
    expect(seqSteps(e.length + 1)).toEqual([2, 5]);
    expect(seqSteps(3)).toEqual([1, 3, 5]);
    expect(seqSteps(5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('legend edges as text', () => {
  it('never round an edge to zero, give two significant figures, and keep neighbours apart', async () => {
    const { edgeTexts } = await import('../../src/lib/format.ts');
    const mt = { kind: 'number', unit: 'Mt', digits: 1 } as const;
    // Maize imports, Mt: tiny edges read "0.023 Mt", not "0.0 Mt".
    expect(edgeTexts([0.0234, 1, 2, 10], mt)).toEqual(['0.023 Mt', '1.0 Mt', '2.0 Mt', '10.0 Mt']);
    // Potash use: two edges that would both read 0.00 Mt.
    const two = edgeTexts([0.0012, 0.0016, 0.5, 2], { kind: 'number', unit: 'Mt', digits: 2 });
    expect(two.slice(0, 2)).toEqual(['0.0012 Mt', '0.0016 Mt']);
    // Exact values stay short; CO2's 6.5 gets its decimal.
    expect(edgeTexts([6.5, 85, 500, 2000], { kind: 'number', unit: 'Mt' })).toEqual(['6.5 Mt', '85 Mt', '500 Mt', '2,000 Mt']);
    expect(edgeTexts([1000, 83000, 500000, 2e6], { kind: 'count' })).toEqual(['1,000', '83,000', '500,000', '2 m']);
    expect(edgeTexts([0.0015, 0.011, 0.05, 0.2], { kind: 'share' })).toEqual(['0.15%', '1.1%', '5%', '20%']);
    expect(edgeTexts([4.1e6, 990e6, 5e9, 50e9], { kind: 'money' })).toEqual(['$4.1 m', '$990 m', '$5 bn', '$50 bn']);
  });
});
