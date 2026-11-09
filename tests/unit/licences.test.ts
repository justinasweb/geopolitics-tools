import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORTED } from '../../pipeline/sources/imported.ts';
import { SOURCES } from '../../pipeline/sources/index.ts';
import { LICENCE_OF, LICENCES } from '../../src/data/licences.ts';
import { licenceTable } from '../../scripts/licence-table.ts';

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
