import { describe, expect, it } from 'vitest';
import { DEFAULTS, memberRows, parseState, phoneBlocs, queryOf, shade, sharedMembers, topPairs, twoBlocs, type Data } from '../../src/lib/overlap/model.ts';
import { matrixHtml, overlapCsv, phoneTableHtml, tableHtml, twoHtml } from '../../src/lib/overlap/render.ts';

// The Bloc overlap tool: shared members, the headline pairs, the membership rows and their sort, the settings in the
// address and the markup, on a small table; then the data and bridge countries the build makes from blocs.csv.
process.env.GT_DATA = 'sample';

const bloc = (id: string, name: string, members: string[]) => ({ id, name, inText: name, members });
const data: Data = {
  blocs: [
    bloc('nato', 'NATO', ['USA', 'FRA', 'TUR']), bloc('eu', 'EU', ['FRA', 'DEU']), bloc('g7', 'G7', ['USA', 'FRA', 'DEU']),
    bloc('g20', 'G20', ['USA', 'FRA', 'DEU', 'IND', 'CHN', 'TUR']), bloc('brics', 'BRICS', ['IND', 'CHN']), bloc('sco', 'SCO', ['IND', 'CHN', 'KAZ']),
    bloc('asean', 'ASEAN', ['IDN']), bloc('opec', 'OPEC', ['SAU']), bloc('quad', 'Quad', ['USA', 'IND']),
  ],
  places: Object.fromEntries(['USA:United States', 'FRA:France', 'TUR:Türkiye', 'DEU:Germany', 'IND:India', 'CHN:China', 'KAZ:Kazakhstan', 'IDN:Indonesia', 'SAU:Saudi Arabia']
    .map((x) => x.split(':')).map(([c, n]) => [c, { n, c }])),
  checked: '2026-10-21', checkedText: '21 Oct 2026',
};

describe('Bloc overlap model', () => {
  it('counts shared members and shades them', () => {
    expect(sharedMembers(data, 'nato', 'g7')).toEqual(['France', 'United States'].map((n) => Object.keys(data.places).find((k) => data.places[k].n === n)));
    expect(sharedMembers(data, 'brics', 'asean')).toEqual([]);
    expect([0, 1, 4, 5, 9, 10, 19, 23].map(shade)).toEqual([0, 1, 1, 2, 2, 3, 4, 5]);
  });

  it('names the pair sharing most, then the most among the blocs left', () => {
    // NATO–G20 and G7–G20 both share 3: the earlier bloc wins. Then neither NATO nor the G20: the EU and G7 share 2.
    expect(topPairs(data, DEFAULTS.blocs)).toEqual([['nato', 'g20', 3], ['eu', 'g7', 2]]);
    expect(topPairs(data, ['asean', 'opec'])).toEqual([]);
  });

  it('splits two blocs into in both, only the first and only the second', () => {
    expect(twoBlocs(data, 'brics', 'sco')).toEqual({ both: ['CHN', 'IND'], onlyA: [], onlyB: ['KAZ'] });
  });

  it('sorts members by how many blocs, then by name, or by name', () => {
    const rows = memberRows(data, ['nato', 'g7', 'g20', 'quad'], 'total', 'desc');
    expect(rows[0]).toEqual({ id: 'USA', in: [true, true, true, true], total: 4 });
    expect(rows.map((r) => r.id).slice(1, 3)).toEqual(['FRA', 'DEU']);
    expect(memberRows(data, ['brics', 'sco'], 'country', 'asc').map((r) => r.id)).toEqual(['CHN', 'IND', 'KAZ']);
    expect(memberRows(data, ['brics', 'sco'], 'total', 'asc')[0].id).toBe('KAZ');
  });

  it('keeps settings in the address, leaving out the defaults, and reads the prototype’s ids', () => {
    expect(queryOf(DEFAULTS)).toBe('');
    const s = parseState(new URLSearchParams('blocs=SCO,NATO,nope&a=nato&sort=country&all=1'), data);
    expect(s).toMatchObject({ blocs: ['nato', 'sco'], a: 'nato', b: 'sco', sort: 'country', dir: 'asc', all: true });
    expect(queryOf(s)).toBe('blocs=nato,sco&a=nato&sort=country&all=1');
    // One bloc is not a comparison: back to the defaults.
    expect(parseState(new URLSearchParams('blocs=nato'), data).blocs).toEqual(DEFAULTS.blocs);
  });

  it('gives the phone the picked pair and the chosen blocs closest to it', () => {
    expect(phoneBlocs(data, DEFAULTS)).toEqual(['brics', 'sco', 'g20', 'quad']);
  });
});

describe('Bloc overlap markup', () => {
  it('writes every matrix cell, the diagonal as the bloc size', () => {
    const html = matrixHtml(DEFAULTS, data);
    expect(html).toContain('gt-mx--self"><span>3</span><small>members</small>');
    expect(html).toContain('gt-mx--0"><span>–</span>');
    expect((html.match(/<td /g) ?? []).length).toBe(81);
  });

  it('marks memberships with shapes and labels, and sorts on country and total', () => {
    const html = tableHtml(DEFAULTS, data);
    expect(html).toContain('gt-mk--sq" role="img" aria-label="Member"');
    expect(html).toContain('gt-mk--tri" role="img" aria-label="Member"');
    expect(html).toContain('aria-label="Not a member"');
    expect(html).toContain('aria-sort="descending"><button type="button" data-o-sort="total">');
    // The same two groups as the bridge rule; the G20 and every other bloc is a dot.
    expect(html).toContain('Member: NATO, EU, G7 or Quad');
    expect(html).toContain('Member: BRICS or SCO');
    expect(html).toContain('Member: G20, ASEAN or OPEC');
  });

  it('shows two blocs side by side on a phone, and the closest blocs in its table', () => {
    expect(twoHtml(DEFAULTS, data)).toContain('BRICS and SCO share 2 members.');
    expect(twoHtml({ ...DEFAULTS, b: 'brics' }, data)).toContain('Pick two different blocs.');
    const phone = phoneTableHtml(DEFAULTS, data);
    expect(phone).toContain('Show all countries and blocs');
    expect(phone).not.toContain('>NATO<');
  });

  it('downloads every country with a 1 or 0 per chosen bloc and the date', () => {
    const csv = overlapCsv({ ...DEFAULTS, blocs: ['brics', 'sco'] }, data).trim().split('\n');
    expect(csv[0]).toBe('country,iso3,BRICS,SCO,total,members as of');
    expect(csv).toContain('India,IND,1,1,2,2026-10-21');
    expect(csv).toContain('Kazakhstan,KAZ,0,1,1,2026-10-21');
  });
});

describe('Bloc overlap from blocs.csv', () => {
  it('offers all 19 groupings, with the reviewed member counts', async () => {
    const { overlapData } = await import('../../src/lib/overlap.ts');
    const d = overlapData();
    expect(d.blocs).toHaveLength(19);
    const size = Object.fromEntries(d.blocs.map((b) => [b.id, b.members.length]));
    expect(size).toMatchObject({ nato: 32, eu: 27, g7: 7, g20: 19, brics: 10, sco: 10, asean: 11, opec: 12, quad: 4 });
    expect(sharedMembers(d, 'nato', 'eu')).toHaveLength(23);
    expect(sharedMembers(d, 'brics', 'sco')).toHaveLength(4);
  });

  it('finds India as the one bridge country, and lists partners apart', async () => {
    const { bridges } = await import('../../src/lib/overlap.ts');
    const b = bridges();
    expect(b.list).toEqual([{ id: 'IND', a: ['quad'], b: ['brics', 'sco'] }]);
    expect(b.partners).toEqual([
      { id: 'TUR', text: 'NATO; SCO dialogue partner; offered BRICS partner status in 2024' },
      { id: 'SAU', text: 'invited to BRICS; has not confirmed membership' },
      { id: 'MYS', text: 'BRICS partner country' },
    ]);
    expect(b.neither).toEqual(['g20', 'asean', 'opec']);
    const { bridgeHtml } = await import('../../src/lib/overlap/render.ts');
    const { overlapData } = await import('../../src/lib/overlap.ts');
    const html = bridgeHtml(b, overlapData());
    expect(html).toContain('India is the only country that is a full member of groupings on both sides: the Quad on one, BRICS and the SCO on the other.');
    expect(html).toContain('One side is NATO, the EU, the G7 and the Quad; the other is BRICS and the SCO. Full members only. Membership of other groupings, the G20, ASEAN and OPEC among them, is not counted here.');
    expect(html).not.toMatch(/western/i);
  });

  it('names in the bridge sentence only the blocs the country belongs to', async () => {
    const { bridges, overlapData } = await import('../../src/lib/overlap.ts');
    const { bridgeHtml } = await import('../../src/lib/overlap/render.ts');
    const b = bridges();
    const d = overlapData();
    const sentence = bridgeHtml(b, d).match(/gt-cpsec__find">(.*?)<\/p>/)?.[1] ?? '';
    const held = [...b.list[0].a, ...b.list[0].b];
    for (const id of [...b.a, ...b.b]) {
      const { inText } = d.blocs.find((x) => x.id === id)!;
      if (held.includes(id)) expect(sentence).toContain(inText);
      else expect(sentence).not.toContain(inText);
    }
  });

  it('words the bridge sentence for several countries and for none', async () => {
    const { OVERLAP_TEXT: T } = await import('../../src/i18n/overlap.en.ts');
    const country = (name: string) => ({ name, a: ['the Quad'], b: ['BRICS'] });
    expect(T.bridgeFind([country('Brazil'), country('India')])).toBe('Brazil and India are full members of a grouping on each side.');
    expect(T.bridgeFind([])).toBe('No country is a full member of a grouping on each side.');
  });
});
