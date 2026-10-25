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
      expect(f.layers.filter((l) => VIEW_SLUGS[l.indicator] === '')).toHaveLength(1);
      expect(VIEW_SLUGS[f.layers[0].indicator]).toBe('');
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
});
