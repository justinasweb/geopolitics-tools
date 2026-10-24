import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORTED } from '../../pipeline/sources/imported.ts';
import { SOURCES } from '../../pipeline/sources/index.ts';
import { LICENCES } from '../../src/data/licences.ts';
import { licenceTable } from '../../scripts/licence-table.ts';

describe('licence table', () => {
  it('has one record for every fetched and imported source', () => {
    const ids = LICENCES.map((l) => l.source);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of [...SOURCES, ...IMPORTED]) expect(ids, s.id).toContain(s.id);
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
