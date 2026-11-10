import { CHAIN_TEXT } from '../../src/i18n/supply-chains.en.ts';
import { describe, expect, it } from 'vitest';
import { amount, concentration, foundPlace, hhi, parseState, queryOf, sankey, totals, OTHERS, type Chain } from '../../src/lib/supply-chains/model.ts';
import { SIDES, chainTitle } from '../../src/i18n/supply-chains.en.ts';
import { chainCsv, flowListHtml, ledeOf, panelHtml, periodLabel, sankeyHtml, tableHtml } from '../../src/lib/supply-chains/render.ts';

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
  it('labels the year as the latest available, FAOSTAT’s as its trade between countries, and five-year totals as such', () => {
    // FAOSTAT's matrix lags its trade totals (2023 against 2024), so its year says what it is.
    expect(periodLabel(chain)).toBe('Trade between countries: 2023, the latest FAOSTAT has published');
    expect(periodLabel({ ...chain, src: 'comtrade' })).toBe('2023, latest available');
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

  it('labels a focused country’s figures as in the flows (refugees: pairs) shown, for every kind of flow', () => {
    for (const kind of Object.keys(SIDES) as (keyof typeof SIDES)[]) {
      expect(SIDES[kind].ins, kind).toMatch(kind === 'refugees' ? / in the pairs shown$/ : / in the flows shown$/);
      expect(SIDES[kind].outs, kind).toMatch(kind === 'refugees' ? / in the pairs shown$/ : / in the flows shown$/);
      const egy = panelHtml({ ...chain, kind }, { country: 'EGY' });
      expect(egy, kind).toContain(`>${SIDES[kind].ins}</span>`);
      expect(egy, kind).toContain(`>${SIDES[kind].outs}</span>`);
    }
  });

  it('keeps every panel bar inside its track, Others included', () => {
    // Russia sells to one large buyer and many small ones: Others is larger than the first bar.
    const many: Chain = { ...chain, pairs: [['RUS', 'TUR', 5], ...['CAN', 'AUS', 'USA', 'FRA', 'UKR', 'ARG', 'KAZ', 'POL'].map((id): [string, string, number] => ['RUS', id, 2])] };
    const widths = [...panelHtml(many, { country: 'RUS' }).matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(Math.max(...widths)).toBe(100);
  });

  it('calls refugees refugee flows, not a supply chain', () => {
    expect(chainTitle('wheat', 'Wheat')).toEqual({ title: 'Wheat', sub: 'supply chain', full: 'Wheat supply chain' });
    // People hosted, not yearly movements: not "flows".
    expect(chainTitle('refugees', 'Refugees')).toEqual({ title: 'Refugees by origin and host country', sub: '', full: 'Refugees by origin and host country' });
    const html = sankeyHtml({ ...chain, key: 'refugees', kind: 'refugees', label: 'Refugees', count: true }, { country: '' });
    expect(html).toContain('aria-label="Refugees by origin and host country, 2023, largest countries of origin to largest host countries, in people"');
    expect(html).not.toContain('supply chain');
  });

  it('lists every flow in the table, and offers a CSV only when the source allows it', () => {
    expect((tableHtml(chain, { country: '' }).match(/<tr>/g) ?? []).length).toBe(chain.pairs.length + 1);
    expect(tableHtml(chain, { country: '' })).toContain('data-sk-csv');
    expect(tableHtml({ ...chain, csv: false, credit: 'UN Comtrade' }, { country: '' })).toContain('UN Comtrade’s terms do not allow');
    const csv = chainCsv(chain, { country: 'EGY' }).trim().split('\n');
    expect(csv[0]).toBe('Supplier,Supplier iso3,Buyer,Buyer iso3,"Volume, million tonnes [FAOSTAT, retrieved 2026-10-24]",period');
    // Gas is in bcm, written out once as "billion cubic metres (bcm)", as on the energy and indicator pages.
    expect(CHAIN_TEXT.gas).toMatchObject({ short: 'bcm', unit: 'billion cubic metres (bcm)' });
    expect(csv).toHaveLength(6);
    expect(csv[1]).toBe('Russia,RUS,Egypt,EGY,5.5,2023');
  });
});

describe('flows from the exporter’s report', () => {
  it('are named wherever flows are said to be as importers report them', async () => {
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    const { ENERGY_TEXT } = await import('../../src/i18n/energy.en.ts');
    const { FOOD_TEXT } = await import('../../src/i18n/food.en.ts');
    const two = ['United States → Mexico', 'Spain → Morocco'];
    const comtrade = { ...chain, src: 'comtrade', source: 'UN Comtrade', credit: 'UN Comtrade', mirror: two, mirrored: DEP_TEXT.asReported(two) };
    expect(sankeyHtml(comtrade, { country: '' })).toContain('UN Comtrade, as importers report it, except United States → Mexico and Spain → Morocco, as the exporter reports them: the main flows only');
    expect(sankeyHtml({ ...comtrade, mirror: undefined }, { country: '' })).toContain('UN Comtrade, as importers report it: the main flows only');
    expect(ENERGY_TEXT.flowsCaption(20, 2025, 'pipeline gas', two.slice(0, 1))).toBe('The 20 largest flows of pipeline gas in 2025, exporter to importer, as importers report them to UN Comtrade, except United States → Mexico, as the exporter reports it.');
    expect(ENERGY_TEXT.flowsCaption(20, 2025, 'LNG')).toBe('The 20 largest flows of LNG in 2025, exporter to importer, as importers report them to UN Comtrade.');
    expect(ENERGY_TEXT.caveats('gas', 'trade', 2025, two).join(' ')).toContain('as importers report them to UN Comtrade, except United States → Mexico and Spain → Morocco, as the exporter reports them: pipeline gas');
    expect(FOOD_TEXT.flowsCaption(20, 2025, true, ['Russia → Brazil'])).toBe('The 20 largest flows in 2025, exporter to importer, as importers report them to UN Comtrade, except Russia → Brazil, as the exporter reports it, in tonnes of product.');
  });

  it('name the three largest and count the rest, marked in the table; gas says which flows it leaves out', async () => {
    const { DEP_TEXT } = await import('../../src/i18n/pages.en.ts');
    const { ENERGY_TEXT } = await import('../../src/i18n/energy.en.ts');
    const five = ['United States → France', 'United States → Egypt', 'Kazakhstan → China', 'Belgium → France', 'Norway → France'];
    expect(DEP_TEXT.asImporters('it', five)).toBe('as importers report it, except United States → France, United States → Egypt, Kazakhstan → China and 2 smaller flows, marked in the table, as the exporter reports them');
    expect(DEP_TEXT.asReported(five, true)).toBe('United States → France, United States → Egypt, Kazakhstan → China and 2 smaller flows as reported by the exporter, marked in the table');
    const c = { ...chain, places: { ...chain.places, KAZ: { n: 'Kazakhstan', c: 'KAZ' } }, src: 'comtrade', mirror: ['Kazakhstan → TUR'], notShown: ENERGY_TEXT.notShown(['Russia → China', 'Turkmenistan → China'], [])! };
    expect(c.notShown).toBe('Not shown: Russia → China and Turkmenistan → China pipeline gas, because neither country reports a volume to UN Comtrade.');
    expect(sankeyHtml(c, { country: '' })).toContain(c.notShown);
    const html = tableHtml(c, { country: '' });
    expect(html.match(/gt-flowmark/g)).toHaveLength(1);
    expect(html).toMatch(/Kazakhstan<\/th><td>TUR<span class="gt-caption gt-flowmark">exporter’s report<\/span>/);
    expect(ENERGY_TEXT.notShown([], [])).toBeNull();
  });

  it('label a pair only when most of its amount is the exporter’s report', async () => {
    const { sumPairs } = await import('../../src/data/flows.ts');
    // A few cubic metres of pipeline gas from the exporter's report do not make a pair's LNG the exporter's.
    expect(sumPairs([{ from: 'USA', to: 'KOR', amount: 6 }, { from: 'USA', to: 'KOR', amount: 0.001, mirror: true }], (r) => r.amount)[0].mirror).toBeUndefined();
  });
});

describe('totals beside the source’s full figures', () => {
  // India's rice, 2023: 12.0 Mt in the flows shown (FAOSTAT's matrix, each importer's main suppliers), 17.7 Mt of exports.
  const full: Chain = { ...chain, full: { from: { RUS: 17.7, CAN: 4.5 }, to: { EGY: 13 } } };

  it('label the diagram’s totals in the flows shown, the full figure in brackets', () => {
    const html = sankeyHtml(full, { country: '' });
    expect(html).toMatch(/>Russia<\/tspan> 14\.5 <tspan class="gt-sk__all">\(17\.7\)<\/tspan>/);
    expect(html).toContain('then in brackets all its exports or imports that year, from FAOSTAT’s trade figures.');
    // Wider label gutters: no label runs off the page.
    expect(html).toContain('--l:200px');
    expect(sankeyHtml(chain, { country: '' })).toContain('>Suppliers</text>');
  });

  it('show the total alone when it is at least the full figure (Brazil’s rice: 1.3 in the flows shown, 1.2 exported)', () => {
    const c: Chain = { ...chain, full: { from: { RUS: 14.5, CAN: 3.9, AUS: 9 }, to: {} } };
    const html = sankeyHtml(c, { country: '' });
    // Russia 14.5 of 14.5 and Canada 4.0 of 3.9: one number each; Australia 3.5 of 9.0 keeps its bracket.
    expect(html).toMatch(/>Russia<\/tspan> 14\.5<\/text>/);
    expect(html).toMatch(/>CAN<\/tspan> 4\.0<\/text>/);
    expect(html).toMatch(/>AUS<\/tspan> 3\.5 <tspan class="gt-sk__all">\(9\.0\)/);
    const panel = panelHtml(c, { country: '' });
    expect(panel).not.toContain('14.5 of');
    expect(panel).toContain('3.5 of 9.0');
  });

  it('give the full figure in the panel’s lists and under a focused country’s total', () => {
    const panel = panelHtml(full, { country: '' });
    expect(panel).toContain('Top suppliers in the flows shown, Mt');
    expect(panel).toContain('14.5 of 17.7');
    const egy = panelHtml(full, { country: 'EGY' });
    expect(egy).toContain('All imports, 2023: 13.0 Mt');
    const ref = panelHtml({ ...full, kind: 'refugees', key: 'refugees', count: true, full: { from: {}, to: { EGY: 4_176_592 } } }, { country: 'EGY' });
    expect(ref).toContain('Hosted in the pairs shown');
    expect(ref).toContain('All hosted, 2023: 4.2 m people');
  });
});

describe('UN Comtrade’s flows', () => {
  it('rank the flows reported to it, not all trade', () => {
    const c = { ...chain, key: 'oil', src: 'comtrade', source: 'UN Comtrade', credit: 'UN Comtrade' };
    expect(ledeOf(c)).toBe('In the flows reported to UN Comtrade for 2023, Russia, CAN and AUS ship the most crude oil.');
    expect(ledeOf(chain)).toBe('In the FAOSTAT flows for 2023, Russia, CAN and AUS ship the most wheat.');
    const panel = panelHtml(c, { country: '' });
    expect(panel).toContain('Largest suppliers in the flows reported to UN Comtrade, kb/d');
    expect(panel).toContain('Largest buyers in the flows reported to UN Comtrade, kb/d');
    expect(panelHtml(chain, { country: '' })).toContain('Top suppliers, Mt');
    expect(flowListHtml(c, { country: '' })).toContain('Top 10 flows reported to UN Comtrade, kb/d');
  });

  it('say when the latest year is not complete yet', () => {
    expect(periodLabel({ ...chain, src: 'comtrade', partial: true, period: '2024' })).toBe('2024, the latest year most countries have reported');
    expect(periodLabel({ ...chain, src: 'comtrade' })).toBe('2023, latest available');
  });

  it('note a flow larger than its exporter’s own output that year', async () => {
    const { ENERGY_TEXT } = await import('../../src/i18n/energy.en.ts');
    const { overOutput } = await import('../../src/data/flows.ts');
    const prod = { MYS: { 2025: 512.7 }, CHN: { 2025: 4300 }, TGO: { 2025: 0 }, USA: { 2025: 75_000 } };
    expect(overOutput(prod, 'MYS', 2025, 1300)).toBe(512.7);
    expect(overOutput(prod, 'MYS', 2024, 1300)).toBeNull();
    expect(overOutput(prod, 'CHN', 2025, 1300)).toBeNull();
    // Under 0.1% of world output: not marked, though Togo produces none.
    expect(overOutput(prod, 'TGO', 2025, 50)).toBeNull();
    expect(overOutput(prod, 'TGO', 2025, 90)).toBe(0);
    const note = ENERGY_TEXT.overOutput('oil', 'Malaysia', 'China', 2025, '513k b/d');
    expect(note).toBe('More than Malaysia’s own output in 2025 (513k b/d, EIA): China’s customs records this origin, which can include oil shipped on from elsewhere.');
    expect(ENERGY_TEXT.overOutput('oil', 'Croatia', 'Slovakia', 2025, '9.0k b/d', true)).toContain('Croatia’s customs records these exports');
    expect(ENERGY_TEXT.overOutput('oil', 'the Netherlands', 'Belgium', 2025, '21k b/d')).toMatch(/^More than the Netherlands’ own output/);
    const c = { ...chain, key: 'oil', src: 'comtrade', over: { 'RUS>TUR': note } };
    expect(tableHtml(c, { country: '' })).toContain(`TUR<span class="gt-caption gt-flowmark">${note}</span>`);
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
