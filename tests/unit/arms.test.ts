import { beforeAll, describe, expect, it } from 'vitest';
import { KINDS, registerToTable } from '../../pipeline/sources/imported.ts';
import { OTHER_SUPPLIER, parseSipriTiv } from '../../src/adapters/sipri.ts';
import { caveatsOf, groupOf, periodEnds, supplierMix, totalsBy, windowPairs } from '../../src/lib/arms.ts';
import { ARMS_SPLIT_CAVEAT } from '../../src/i18n/pages.en.ts';

// The arms views: five-year totals from SIPRI, built from the trade register or the TIV table.
process.env.GT_DATA = 'sample';
type Views = typeof import('../../src/lib/views.ts');
type Routes = typeof import('../../src/lib/routes.ts');
let V: Views;
let R: Routes;
beforeAll(async () => {
  V = await import('../../src/lib/views.ts');
  R = await import('../../src/lib/routes.ts');
});

const REGISTER = `"Transfers of major weapons: Deals with deliveries or orders made for year range '2020' to '2025'"
"Information generated: 9 March 2026"

Recipient,Supplier,Year of order,,Number ordered,,Weapon designation,Weapon description,Number delivered,,Year(s) of delivery,status,Comments,SIPRI TIV per unit,SIPRI TIV for total order,SIPRI TIV of delivered weapons
India,France,2016,,36,,Rafale,FGA aircraft,36,,2020; 2021; 2022,,,90,3240,300
India,Russia,2018,,5,,S-400,SAM system,3,,2021; 2022,,,200,1000,600
India,France,2019,,2,,X,ship,1,,2025,,,10,20,10
`;

// SIPRI's "Import/Export values" download for Germany and China, 2015–2025 (preamble trimmed): one block per recipient.
const VALUES = `Volume of transfers of major arms
Figures are in millions of SIPRI trend-indicator values (TIVs).
Source: SIPRI Arms Transfers Database (c) SIPRI.
Data generated: 8 Nov 2026 6:09:00 PM

Supplier,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2015-2025,Percentage,Sum total years,Percentage of total
Israel,9,18,,2,2,19,69,25,22,7,1300,1472,50%,1472,50%
United States,29,5,3,2,7,65,114,197,153,203,283,1061,36%,1061,36%
Sweden,7,29,,,,,,18,18,18,19,109,3.7%,109,3.7%
France,26,,,,13,,23,10,,,7,78,2.6%,78,2.6%
United Kingdom,,,,10,10,,10,10,10,,10,60,2.0%,60,2.0%
Canada,28,,,,,14,3,1,,,,46,1.5%,46,1.5%
Italy,,,,,7,7,7,7,,13,,41,1.4%,41,1.4%
Netherlands,6,,32,,,,,,,,,38,1.3%,38,1.3%
Switzerland,14,3,,,,,,1,,,14,31,1.0%,31,1.0%
Belgium,,,,,,,10,,,,,10,0.3%,10,0.3%
Poland,,,6,,,,,,,,,6,0.2%,6,0.2%
Croatia,,,3,,,,,,,,,3,0.1%,3,0.1%
Austria,,,,,,,,1,,,,1,0.0%,1,0.0%
Total exports to Germany,119,55,43,14,38,105,235,269,203,240,1632,2953,100%,2953,

Volume of transfers of major arms
Source: SIPRI Arms Transfers Database (c) SIPRI.

Supplier,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2015-2025,Percentage,Sum total years,Percentage of total
Russia,726,742,1222,1906,1322,547,467,499,327,30,25,7811,74%,7811,74%
France,176,173,130,133,144,123,43,56,93,23,56,1150,11%,1150,11%
Ukraine,100,92,107,143,84,84,132,72,7,12,84,917,8.7%,917,8.7%
Germany,20,9,15,21,21,21,43,19,1,6,42,216,2.0%,216,2.0%
Switzerland,65,65,33,33,,,,,,,,195,1.8%,195,1.8%
United Kingdom,70,60,40,20,,,,,,,,190,1.8%,190,1.8%
Uzbekistan,34,68,,,,,,,,,,102,1.0%,102,1.0%
Total exports to China,1190,1209,1546,2254,1571,775,685,646,428,71,207,10581,100%,10581,
`;

describe('arms transfers', () => {
  it('reads SIPRI’s Import/Export values download and matches SIPRI’s own shares', () => {
    const kind = KINDS.sipri;
    const t = kind.convert!(VALUES);
    expect(kind.check!(t)).toBeGreaterThan(0);
    const { years, pairs, split } = parseSipriTiv(t);
    expect(years).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(split).toBe(false);
    // Actual delivery years, as SIPRI reports them: Israel delivered 1300 to Germany in 2025.
    expect(pairs.find((p) => p.from === 'ISR' && p.to === 'DEU' && p.year === 2025)!.tiv).toBe(1300);
    const w = windowPairs(pairs, 2025);
    const share = (from: string, to: string) => w.find((p) => p.from === from && p.to === to)!.amount / totalsBy(w, 'to')[to];
    expect(Math.round(share('ISR', 'DEU') * 100)).toBe(55); // SIPRI: 55% of Germany's imports, 2021–2025
    expect(Math.round(share('RUS', 'CHN') * 100)).toBe(66); // SIPRI: 66% of China's
    expect(parseSipriTiv(registerToTable(REGISTER)).split).toBe(true);
    // The sample table is not split, so the arms pages drop the "single years are estimates" caveat.
    expect(caveatsOf('armsimp')).not.toContain(ARMS_SPLIT_CAVEAT);
    expect(caveatsOf('armsimp').length).toBeGreaterThan(0);
  });

  it('turns the trade register into supplier and recipient totals, splitting each deal over its delivery years', () => {
    const t = registerToTable(REGISTER);
    expect(t).toMatch(/^Supplier,Recipient,2020,2021,2022,2023,2024,2025,Total$/m);
    const { pairs } = parseSipriTiv(t);
    const fra = pairs.filter((p) => p.from === 'FRA' && p.to === 'IND');
    expect(fra.reduce((s, p) => s + p.tiv, 0)).toBeCloseTo(310);
    expect(fra.find((p) => p.year === 2020)!.tiv).toBeCloseTo(100);
    expect(pairs.filter((p) => p.from === 'RUS').map((p) => p.year)).toEqual([2021, 2022]);
  });

  it('keeps deliveries from suppliers that are not a country in the recipient’s total, never as a country', () => {
    // Germany gets 55.6 from Israel and 40 from the US, plus 4.4 from an unknown supplier and a non-state actor: Israel's
    // share is 55.6 of 100, not of 95.6. Unknown recipients and non-state recipients still count for no one.
    const table = 'Supplier,Recipient,2024,2025,Total\nIsrael,Germany,55.6,,55.6\nUnited States,Germany,40,,40\nunknown supplier(s),Germany,2.4,,2.4\n'
      + 'Hezbollah (Lebanon)*,Germany,2,,2\nBosnia-Herzegovina,Ukraine,,5.5,5.5\nUnited States,unknown recipient(s),9,,9\nRussia,RSF (Sudan)*,3,,3\n';
    const { pairs } = parseSipriTiv(table);
    const de = pairs.filter((p) => p.to === 'DEU');
    expect(de.reduce((t, p) => t + p.tiv, 0)).toBeCloseTo(100);
    expect(de.filter((p) => p.from === OTHER_SUPPLIER).reduce((t, p) => t + p.tiv, 0)).toBeCloseTo(4.4);
    expect(pairs.some((p) => p.from === 'BIH' && p.to === 'UKR')).toBe(true);
    expect(pairs.every((p) => p.to !== OTHER_SUPPLIER)).toBe(true);
    expect(pairs).toHaveLength(5);
    // The country views never show it as a supplier: exports by place leave it out, the supplier mix groups it as other.
    const w = windowPairs(pairs, 2025);
    expect(totalsBy(w, 'from')[OTHER_SUPPLIER]).toBeUndefined();
    // The "other" group holds Israel (55.6) and the suppliers that are not a country (4.4).
    expect(supplierMix(w, 'DEU').find((g) => g.group === 'other')!.share).toBeCloseTo(0.6);
  });

  it('leaves a TIV table as it is', () => {
    const table = '"SIPRI"\n\nSupplier,Recipient,2024,2025,Total\nFrance,India,1,2,3\n';
    expect(registerToTable(table)).toBe(table);
  });

  it('adds up five-year periods that fit inside the data', () => {
    expect(periodEnds([2020, 2021, 2022, 2023, 2024, 2025])).toEqual([2024, 2025]);
    expect(periodEnds([2024, 2025])).toEqual([]);
    const { pairs } = parseSipriTiv(registerToTable(REGISTER));
    const w = windowPairs(pairs, 2025);
    expect(totalsBy(w, 'to').IND).toBeCloseTo(810); // 2021–2025: France 100 + 100 + 10, Russia 600
    expect(totalsBy(w, 'from').FRA).toBeCloseTo(210);
  });

  it('splits an importer’s suppliers into the United States, China, Russia, Europe and others', () => {
    expect(groupOf('FRA')).toBe('europe');
    expect(groupOf('RUS')).toBe('RUS');
    expect(groupOf('TUR')).toBe('other');
    const mix = supplierMix([{ from: 'RUS', to: 'IND', amount: 3 }, { from: 'FRA', to: 'IND', amount: 1 }, { from: 'USA', to: 'PAK', amount: 5 }], 'IND');
    expect(mix.map((g) => g.group)).toEqual(['RUS', 'europe']);
    expect(mix[0].share).toBeCloseTo(0.75);
  });

  it('has exporters at /arms and importers at /arms/importers, as five-year totals', () => {
    expect(R.route('view:arms:armsexp5')!.path).toBe('/arms');
    expect(R.route('view:arms:armsimp5')!.path).toBe('/arms/importers');
    const p = V.viewPage('armsimp5');
    if (!p) return;
    expect(p.text.period!(p.year)).toBe(`${p.year - 4}–${p.year}`);
    const exp = V.viewPage('armsexp5')!;
    expect(exp.byYear[exp.year].world).toBeCloseTo(p.byYear[p.year].world!);
  });
});
