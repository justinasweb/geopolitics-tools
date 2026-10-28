import { describe, expect, it } from 'vitest';
import { amount, concentration, foundPlace, hhi, parseState, queryOf, sankey, totals, OTHERS, type Chain } from '../../src/lib/supply-chains/model.ts';
import { chainCsv, ledeOf, panelHtml, periodLabel, sankeyHtml, tableHtml } from '../../src/lib/supply-chains/render.ts';

// The Supply chains tool: the focus in the address, totals and concentration, the Sankey's grouping and layout,
// the panel and the download, on a small flow; then the flows the build makes from the sample files.
process.env.GT_DATA = 'sample';

const places: Chain['places'] = Object.fromEntries(
  ['RUS', 'CAN', 'AUS', 'USA', 'FRA', 'UKR', 'ARG', 'KAZ', 'POL', 'EGY', 'TUR', 'CHN', 'IDN'].map((id) => [id, { n: id === 'EGY' ? 'Egypt' : id === 'RUS' ? 'Russia' : id, c: id }]),
);
places.EGY.h = '/countries/egypt';
const chain: Chain = {
  key: 'wheat', label: 'Wheat', kind: 'trade', period: '2023',
  pairs: [
    ['RUS', 'TUR', 9], ['RUS', 'EGY', 5.5], ['CAN', 'CHN', 4], ['AUS', 'CHN', 3.5], ['USA', 'IDN', 3], ['FRA', 'EGY', 2],
    ['UKR', 'EGY', 1], ['ARG', 'IDN', 0.8], ['KAZ', 'TUR', 0.5], ['POL', 'EGY', 0.3], ['EGY', 'TUR', 0.04],
  ],
  places, div: 1, digits: 1, src: 'faostat', source: 'FAOSTAT', credit: 'FAOSTAT', updated: '2026-10-24', retrieved: '2026-10-24', csv: true,
  method: '/methodology#supply-chains',
};

describe('Supply chains model', () => {
  it('keeps a focus only for a country in the flows', () => {
    expect(parseState(new URLSearchParams('country=EGY'), chain)).toEqual({ country: 'EGY' });
    expect(parseState(new URLSearchParams('country=XYZ'), chain)).toEqual({ country: '' });
    expect(queryOf({ country: 'EGY' })).toBe('country=EGY');
    expect(queryOf({ country: '' })).toBe('');
  });

  it('writes amounts in the short unit, small ones to two figures', () => {
    expect(amount(9, chain)).toBe('9.0');
    expect(amount(0.04, chain)).toBe('0.04');
    expect(amount(2_808_446, { ...chain, count: true })).toBe('2.8 m');
    expect(amount(88.5e9, { ...chain, div: 1e9 })).toBe('88.5');
  });

  it('totals each side and measures concentration on the 2023 merger thresholds', () => {
    expect(totals(chain.pairs, 0)[0]).toEqual(['RUS', 14.5]);
    expect(hhi([['a', 1]])).toBe(10000);
    expect(hhi([['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1], ['f', 1], ['g', 1], ['h', 1], ['i', 1], ['j', 1], ['k', 1]])).toBe(909);
    expect(concentration(999)).toBe('low');
    expect(concentration(1000)).toBe('moderate');
    expect(concentration(1801)).toBe('high');
  });

  it('finds a country by its name, its start, then any part', () => {
    expect(foundPlace(chain, 'egypt')).toBe('EGY');
    expect(foundPlace(chain, 'rus')).toBe('RUS');
    expect(foundPlace(chain, 'zzz')).toBeNull();
  });

  it('names the seven largest suppliers, groups the rest as Others, and keeps the amounts', () => {
    const sk = sankey(chain, { country: '' });
    const left = sk.nodes.filter((n) => n.side === 0);
    expect(left).toHaveLength(8);
    expect(left.at(-1)!.id).toBe(OTHERS);
    expect(left.at(-1)!.value).toBeCloseTo(0.5 + 0.3 + 0.04);
    const total = chain.pairs.reduce((t, p) => t + p[2], 0);
    expect(sk.bands.reduce((t, b) => t + b.value, 0)).toBeCloseTo(total);
    // Both sides carry the same total, so the node heights add up the same.
    const h = (side: 0 | 1) => sk.nodes.filter((n) => n.side === side).reduce((t, n) => t + n.h, 0);
    expect(h(0)).toBeCloseTo(h(1));
  });

  it('draws a focused country on both sides when it sends and receives', () => {
    const sk = sankey(chain, { country: 'EGY' });
    expect(sk.nodes.filter((n) => n.sel).map((n) => n.side).sort()).toEqual([0, 1]);
    expect(sk.bands.every((b) => b.from === 'EGY' || b.to === 'EGY')).toBe(true);
    expect(sk.height).toBeLessThan(sankey(chain, { country: '' }).height);
  });
});

describe('Supply chains markup', () => {
  it('labels the year as the latest available, and five-year totals as such', () => {
    expect(periodLabel(chain)).toBe('2023, latest available');
    expect(periodLabel({ ...chain, period: '2021–2025' })).toBe('2021–2025, latest five years available');
    expect(ledeOf(chain)).toBe('In the FAOSTAT flows for 2023, Russia, CAN and AUS ship the most wheat.');
  });

  it('names every band and node, and shows the focus', () => {
    const html = sankeyHtml(chain, { country: '' });
    expect(html).toContain('<title>Russia to TUR: 9.0 Mt</title>');
    expect(html).toContain('>Others</tspan>');
    expect(sankeyHtml(chain, { country: 'EGY' })).toContain('Focused on <b>Egypt</b>');
  });

  it('gives the world panel and a focused country’s imports and exports', () => {
    expect(panelHtml(chain, { country: '' })).toMatch(/All flows shown.*Total of the flows shown.*Concentration/s);
    const egy = panelHtml(chain, { country: 'EGY' });
    expect(egy).toContain('Russia supplies 63% of what Egypt imports in these flows.');
    expect(egy).toMatch(/Imports.*Exports/s);
    expect(egy).toContain('Egypt country page');
    // No concentration for refugees: origins are not suppliers.
    expect(panelHtml({ ...chain, kind: 'refugees' }, { country: '' })).not.toContain('Concentration');
  });

  it('lists every flow in the table, and offers a CSV only when the source allows it', () => {
    expect((tableHtml(chain, { country: '' }).match(/<tr>/g) ?? []).length).toBe(chain.pairs.length + 1);
    expect(tableHtml(chain, { country: '' })).toContain('data-sk-csv');
    expect(tableHtml({ ...chain, csv: false, credit: 'UN Comtrade' }, { country: '' })).toContain('UN Comtrade’s terms do not allow');
    const csv = chainCsv(chain, { country: 'EGY' }).trim().split('\n');
    expect(csv[0]).toBe('Supplier,Supplier iso3,Buyer,Buyer iso3,"Volume (million tonnes) [FAOSTAT, retrieved 2026-10-24]",period');
    expect(csv).toHaveLength(6);
    expect(csv[1]).toBe('Russia,RUS,Egypt,EGY,5.5,2023');
  });
});

describe('Supply chains from the sample files', () => {
  it('builds each live flow for one period only, with pairs and places', async () => {
    const { chainOf, liveChains } = await import('../../src/lib/supply-chains.ts');
    const live = liveChains();
    expect(live).toContain('gas');
    // The sample rice matrix is empty, so rice has no page.
    expect(live).not.toContain('rice');
    for (const k of live) {
      const c = chainOf(k);
      expect(c.period, k).toMatch(/^\d{4}(–\d{4})?$/);
      expect(c.pairs.length, k).toBeGreaterThan(0);
      for (const [f, t] of c.pairs) expect(c.places[f] && c.places[t], k).toBeTruthy();
    }
    expect(chainOf('arms').csv).toBe(false);
    expect(chainOf('refugees').csv).toBe(true);
  });
});
