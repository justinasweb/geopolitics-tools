import { beforeAll, describe, expect, it } from 'vitest';
import { registerToTable } from '../../pipeline/sources/imported.ts';
import { parseSipriTiv } from '../../src/adapters/sipri.ts';
import { groupOf, periodEnds, supplierMix, totalsBy, windowPairs } from '../../src/lib/arms.ts';

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

describe('arms transfers', () => {
  it('turns the trade register into supplier and recipient totals, splitting each deal over its delivery years', () => {
    const t = registerToTable(REGISTER);
    expect(t).toMatch(/^Supplier,Recipient,2020,2021,2022,2023,2024,2025,Total$/m);
    const { pairs } = parseSipriTiv(t);
    const fra = pairs.filter((p) => p.from === 'FRA' && p.to === 'IND');
    expect(fra.reduce((s, p) => s + p.tiv, 0)).toBeCloseTo(310);
    expect(fra.find((p) => p.year === 2020)!.tiv).toBeCloseTo(100);
    expect(pairs.filter((p) => p.from === 'RUS').map((p) => p.year)).toEqual([2021, 2022]);
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
