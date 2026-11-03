// The EuRepoC fetcher, adapter and counts on a fixture in EuRepoC's own format (tests/fixtures/eurepoc: the 1.3.2
// files' full headers, with made-up rows): what is saved, what counts for a state, and the words the panel uses.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../pipeline/lib/csv.ts';
import eurepocSource, { RECORD, VERSION } from '../../pipeline/sources/eurepoc.ts';
import { parseEurepoc } from '../../src/adapters/eurepoc.ts';
import { affecting, attributedTo, cyberSeries, pairs, since, whoOf, yearSplit, yearTotal } from '../../src/lib/cyber.ts';
import { CYBER_TEXT } from '../../src/i18n/cyber.en.ts';
import { ctxFor, fakeHttp, type Route } from './pipeline/helpers.ts';

const fixture = (f: string) => readFileSync(new URL(`../fixtures/eurepoc/${f}`, import.meta.url), 'utf8');
const record = (id: string, version: string, files = true) => ({
  id: Number(id), doi: `10.5281/zenodo.${id}`,
  metadata: { title: 'Global Dataset of Cyber Incidents', version, publication_date: '2025-03-04', license: { id: 'cc-by-nc-4.0' } },
  files: files ? [
    { key: 'eurepoc_global_dataset_1_3.csv', links: { self: 'https://zenodo.org/api/files/global' } },
    { key: 'eurepoc_attribution_dataset_1.3.csv', links: { self: 'https://zenodo.org/api/files/attribution' } },
    { key: 'eurepoc_codebook_1_2.pdf', links: { self: 'https://zenodo.org/api/files/codebook' } },
  ] : [],
  links: { latest: `https://zenodo.org/api/records/${id}/versions/latest` },
});
// The fetcher wants 3,000 incidents; the fixture's rows are repeated under new ids.
const many = (body: string, n: number) => {
  const [head, ...rows] = parseCsv(body);
  const at = head.indexOf('incident_id');
  const out = [head];
  for (let k = 0; k < n; k++) for (const r of rows) out.push(r.map((v, i) => (i === at ? String(k * 100 + Number(v)) : v)));
  return out.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
};
const routes = (latest: string, version = VERSION): Route[] => [
  [/versions\/latest/, () => record(latest, latest === RECORD ? VERSION : '1.4.0', false)],
  [new RegExp(`records/${RECORD}$`), () => record(RECORD, version)],
  [/files\/global/, () => many(fixture('global.csv'), 600)],
  [/files\/attribution/, () => many(fixture('attribution.csv'), 600)],
];

describe('eurepoc fetcher', () => {
  it('saves the pinned version trimmed to the columns the site reads, without repeated rows', async () => {
    const r = await eurepocSource.fetch(ctxFor(fakeHttp(routes(RECORD))));
    expect(r.notice).toBeUndefined();
    expect(r.files.map((f) => f.name)).toEqual(['incidents.csv', 'attributions.csv', 'version.json']);
    const inc = parseCsv(String(r.files[0].body));
    expect(inc[0]).toEqual(['incident_id', 'start_date', 'receiver_country', 'receiver_country_alpha_2_code']);
    expect(inc).toHaveLength(1 + 6 * 600);
    // The two "Gov A" and "Gov B" rows of attribution 10 differ only in the attributing actor, which is not kept.
    expect(parseCsv(String(r.files[1].body))).toHaveLength(1 + 6 * 600);
    expect(JSON.parse(String(r.files[2].body))).toMatchObject({ record: RECORD, version: VERSION, published: '2025-03-04' });
    expect(r.dataTo).toBe('2024');
  });

  it('keeps the pinned version and sends a notice when Zenodo has a newer one', async () => {
    const r = await eurepocSource.fetch(ctxFor(fakeHttp(routes('99999999'))));
    expect(r.files).toHaveLength(3);
    expect(JSON.parse(String(r.files[2].body)).version).toBe(VERSION);
    expect(r.notice).toMatch(/version 1\.4\.0.*zenodo\.org\/records\/99999999.*stays on 1\.3\.2/);
  });

  it('refuses a record whose version is not the pinned one', async () => {
    await expect(eurepocSource.fetch(ctxFor(fakeHttp(routes(RECORD, '1.3.3'))))).rejects.toThrow(/not 1\.3\.2/);
  });
});

describe('cyber incidents', () => {
  const trimmed = (f: string, cols: string[]) => {
    const [head, ...rows] = parseCsv(fixture(f));
    return [cols, ...rows.map((r) => cols.map((c) => r[head.indexOf(c)]))].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  };
  const c = parseEurepoc(
    trimmed('global.csv', ['incident_id', 'start_date', 'receiver_country', 'receiver_country_alpha_2_code']),
    trimmed('attribution.csv', ['incident_id', 'attribution_id', 'attribution_basis', 'settled_attribution', 'initiator_alpha_2', 'initiator_country', 'initiator_category', 'initiator_subcategory']),
    { record: RECORD, version: VERSION, published: '2025-03-04', doi: '', title: '' },
  );
  const inc = (id: string) => c.incidents.find((i) => i.id === id)!;

  it('matches receivers by their codes, once each, and leaves regions, the EU and unknowns out', () => {
    expect(inc('1').receivers).toEqual(['UKR']);
    expect(inc('2').receivers).toEqual(['USA', 'DEU']);
    expect(inc('3').receivers).toEqual(['NAM']);
    expect(inc('5').receivers).toEqual(['USA']);
    expect(inc('6').receivers).toEqual(['UKR']);
    expect(inc('4').year).toBeNull();
  });

  it('counts an incident once for each country it affected, in the year it started', () => {
    const s = cyberSeries(c);
    expect(s.UKR).toEqual({ 2024: 2 });
    expect(s.USA).toEqual({ 2023: 1, 2024: 1 });
    expect(s.FRA).toBeUndefined();
    expect(yearTotal(c, 2024)).toBe(4);
    expect(since(c, 'USA', 2000)).toBe(2);
  });

  it('counts every attribution: states (state-affiliated groups included), else group kinds, else other or none', () => {
    const one = whoOf(inc('1'));
    expect(one).toHaveLength(1);
    expect(one[0].who).toEqual({ state: 'RUS' });
    expect([...one[0].bases].sort()).toEqual(['government', 'security']);
    expect(one[0].affiliatedOnly).toBe(false);
    // Killnet-style: a hacktivist group linked to Russia counts as hacktivists, never as Russia.
    expect(whoOf(inc('2')).map((x) => x.who)).toEqual([{ group: 'hacktivist' }]);
    expect(whoOf(inc('3')).map((x) => x.who)).toEqual([{ none: true }]);
    expect(whoOf(inc('5')).map((x) => x.who)).toEqual([{ state: 'CHN' }, { state: 'RUS' }]);
    expect(whoOf(inc('6')).map((x) => x.who)).toEqual([{ other: true }]);
    expect(yearSplit(c, 2024)).toEqual({ state: 1, group: 1, other: 1, none: 1 });
  });

  it('breaks a country down by attribution, and a state down by the country affected', () => {
    expect(affecting(c, 'UKR', 2024).map((t) => [t.who, t.n])).toEqual([[{ state: 'RUS' }, 1], [{ other: true }, 1]]);
    expect(attributedTo(c, 'RUS', 2023).map((t) => [t.who, t.n])).toEqual([[{ state: 'USA' }, 1]]);
    expect(pairs(c, 2024)).toEqual([{ from: 'RUS', to: 'UKR', n: 1, by: { government: 1, security: 1 } }]);
  });

  it('says "attributed to … by …", never as fact', () => {
    expect(CYBER_TEXT.toState('Russia')).toBe('Attributed to Russia');
    expect(CYBER_TEXT.by([['government', 4], ['security', 2]])).toBe('by the affected country’s government (4) and IT-security firms or researchers (2)');
    const words = JSON.stringify(Object.values(CYBER_TEXT).map((v) => (typeof v === 'function' ? String(v) : v)));
    expect(words).not.toMatch(/\b(attacked|hacked by|attacker)\b/i);
    expect(CYBER_TEXT.credit(c.version)).toBe('EuRepoC Global Dataset of Cyber Incidents 1.3.2 (4 Mar 2025), CC BY-NC 4.0');
  });
});
