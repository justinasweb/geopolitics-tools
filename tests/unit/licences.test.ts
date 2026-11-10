import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORTED } from '../../pipeline/sources/imported.ts';
import { SOURCES } from '../../pipeline/sources/index.ts';
import { LICENCE_OF, LICENCES } from '../../src/data/licences.ts';
import { licenceTable } from '../../scripts/licence-table.ts';

// The credit tests read the sample snapshot, as CI has no data pull.
process.env.GT_DATA = 'sample';

describe('licence table', () => {
  it('has one record for every fetched and imported source', () => {
    const ids = LICENCES.map((l) => l.source);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of [...SOURCES, ...IMPORTED]) expect(ids, s.id).toContain(LICENCE_OF[s.id] ?? s.id);
  });

  it('offers downloads only where the terms were found to allow it', () => {
    for (const l of LICENCES) {
      expect(l.terms).toMatch(/^https:\/\//);
      if (/not stated|disclaimer|IMF|SIPRI|Comtrade|PeeringDB/i.test(l.licence)) expect(l.downloads, l.source).toBe('shown only');
    }
  });

  it('fills the Aqueduct credit with the day its files were fetched', async () => {
    const { creditLine, data } = await import('../../src/lib/data.ts');
    const fetched = data().snapshot.sources.aqueduct?.fetched;
    expect(fetched).toBeTruthy();
    const line = creditLine('aqueduct');
    expect(line).toMatch(/^Source: WRI Aqueduct, accessed on \d{1,2} \w{3} \d{4}, aqueduct\.wri\.org \(CC BY 4\.0\)$/);
    expect(line).not.toContain('[date]');
  });

  it('links Aqueduct’s site and licence in its source lines, and leaves other sources plain', async () => {
    const { sourceName } = await import('../../src/lib/data.ts');
    const { sourceLinksHtml, sourcePieces } = await import('../../src/lib/source-links.ts');
    const name = sourceName('aqueduct');
    expect(name).toMatch(/^WRI Aqueduct, accessed on \d{1,2} \w{3} \d{4}, aqueduct\.wri\.org \(CC BY 4\.0\)$/);
    expect(sourcePieces(`${name}; FAO AQUASTAT`).filter((p) => p.href).map((p) => [p.text, p.href])).toEqual([
      ['aqueduct.wri.org', 'https://aqueduct.wri.org/'], ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
    ]);
    expect(sourcePieces(`${name}; FAO AQUASTAT`).map((p) => p.text).join('')).toBe(`${name}; FAO AQUASTAT`);
    expect(sourceLinksHtml('Global Carbon Budget, via Our World in Data (CC BY 4.0)')).toBe('Global Carbon Budget, via Our World in Data (CC BY 4.0)');
    expect(sourceLinksHtml('A & B')).toBe('A &amp; B');
  });

  it('matches docs/licences.md (regenerate with node scripts/licence-table.ts > docs/licences.md)', () => {
    expect(readFileSync(new URL('../../docs/licences.md', import.meta.url), 'utf8')).toBe(licenceTable());
  });
});

describe('withheld sources', () => {
  it('reads a withheld source as not in the snapshot, and leaves the others alone', async () => {
    const { withholding } = await import('../../src/lib/data.ts');
    const { withheld, WITHHELD } = await import('../../src/data/licences.ts');
    for (const s of WITHHELD) expect(LICENCES.some((l) => l.source === s)).toBe(true);
    expect(withheld('gdacs')).toBe(true);
    expect(withheld('usgs-quakes')).toBe(false);
    const raw = { has: () => true, list: () => ['a.json'], text: () => 'x', json: <T>() => ({ ok: 1 }) as T };
    const w = withholding(raw, (s) => s === 'gdacs');
    expect(w.has('gdacs', 'events.json')).toBe(false);
    expect(w.list('gdacs')).toEqual([]);
    expect(() => w.json('gdacs', 'events.json')).toThrow(/is not in the snapshot/);
    expect(w.has('usgs-quakes', 'earthquakes.json')).toBe(true);
    expect(w.json('usgs-quakes', 'earthquakes.json')).toEqual({ ok: 1 });
  });
});
