import { beforeAll, describe, expect, it } from 'vitest';
import { damsOn } from '../../src/lib/rivers.ts';
import { RIVERS, river } from '../../src/data/rivers.ts';
import type { Dam } from '../../src/adapters/water.ts';

// The disputed river pages: which of Global Dam Watch's dams belong to each river, and their addresses.
process.env.GT_DATA = 'sample';
type Routes = typeof import('../../src/lib/routes.ts');
let R: Routes;
beforeAll(async () => {
  R = await import('../../src/lib/routes.ts');
});

const dam = (name: string, riverName: string, place: string, basin = '', capacity = 1): Dam =>
  ({ id: name, name, river: riverName, basin, place, year: 2000, height: null, capacity, use: '', lon: 0, lat: 0, status: 'Operating' });

describe('disputed rivers', () => {
  it('has the eight rivers of the site map at /water/rivers/{river}', () => {
    expect(RIVERS.map((r) => r.id)).toEqual(['nile', 'indus', 'mekong', 'tigris-euphrates', 'brahmaputra', 'amu-darya', 'helmand', 'dnipro']);
    const r = R.route('view:rivers:nile');
    if (r) expect(r.path).toBe('/water/rivers/nile');
  });

  it('takes the dams on the river and its tributaries in the dispute’s countries, largest first', () => {
    const all = [
      dam('Merowe', 'Nile', 'SDN', '', 12000), dam('High Aswan Dam', 'Nile', 'EGY', '', 162000), dam('Owen Falls', 'White Nile', 'UGA'),
      dam('Tekeze', 'Tekeze', 'ETH'), dam('Finchaa', 'Finochaa', 'ETH', 'Nile'), dam('Tendaho', 'Awash', 'ETH', 'Nile'), dam('Koka', 'Awash', 'ETH'),
    ];
    expect(damsOn(river('nile')!, all).map((d) => d.name)).toEqual(['High Aswan Dam', 'Merowe', 'Tekeze', 'Finchaa']);
  });

  it('does not take a river whose name only contains a tributary’s', () => {
    expect(damsOn(river('tigris-euphrates')!, [dam('Tangab', 'Firuzabad', 'IRN'), dam('Dokan', 'Lesser Zab', 'IRQ')]).map((d) => d.name)).toEqual(['Dokan']);
  });
});
