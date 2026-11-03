import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { todaysMembers } from '../../src/i18n/members.en.ts';

// A bloc's share on a map or page adds up its members as they are today, whatever year is shown (decided 2 Nov 2026,
// docs/open-questions.md). Every sentence stating a bloc's share or total says so, through one phrase:
// todaysMembers in src/i18n/members.en.ts ("Today’s OPEC members produced 30% of the world’s oil in 2024.").
process.env.GT_DATA = 'sample';

type Layers = typeof import('../../src/lib/map/layers.ts');
let L: Layers;
let BLOC_TEXT: Record<string, string>;
beforeAll(async () => {
  L = await import('../../src/lib/map/layers.ts');
  BLOC_TEXT = (await import('../../src/i18n/map.en.ts')).BLOC_TEXT;
});

/** Map families whose bloc line is not a share or total over a year: who is in a dispute today (rivers), alerts in
 *  the last days (disasters), a grouping's overlap with the others today (blocs), treaty and sharing status today. */
const NOT_SHARES = new Set(['rivers', 'disasters', 'blocs']);
const NOT_SHARE_LAYERS = new Set(['nuclear-treaties', 'nuclear-sharing']);

const said = (line: string, bloc: string) => {
  const forms = [todaysMembers(bloc), todaysMembers(bloc, { start: true })];
  const counted = new RegExp(`[Tt]oday’s \\d+ ${todaysMembers(bloc).replace(/^today’s /, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return forms.some((f) => line.includes(f)) || counted.test(line);
};

describe('bloc share sentences', () => {
  it('build their subject with one phrase, which reads well for every grouping', () => {
    expect(todaysMembers('OPEC', { start: true })).toBe('Today’s OPEC members');
    expect(todaysMembers('OPEC')).toBe('today’s OPEC members');
    expect(todaysMembers('OPEC', { count: 11 })).toBe('today’s 11 OPEC members');
    expect(todaysMembers('UN Security Council, permanent members')).toBe('today’s permanent members of the UN Security Council');
  });

  it('say "today’s … members" in every bloc line of every map that states a share or total, in every year', () => {
    let lines = 0;
    for (const d of L.mapLayers()) {
      if (NOT_SHARES.has(d.family) || NOT_SHARE_LAYERS.has(d.id)) continue;
      const f = L.layerFile(d.id) as unknown as { data: { blocs?: Record<string, string> }[] };
      for (const y of f.data) {
        for (const [b, line] of Object.entries(y.blocs ?? {})) {
          if (!line) continue;
          lines++;
          // An alliance history line names two groupings: today's members of the outlined one, in the history's.
          expect(said(line, BLOC_TEXT[b] ?? b), `${d.id} ${b}: ${line}`).toBe(true);
        }
      }
    }
    expect(lines).toBeGreaterThan(1000);
  }, 180_000);

  it('say it on the bloc pages and their share images', async () => {
    const { BLOCS_TEXT } = await import('../../src/i18n/blocs.en.ts');
    expect(BLOCS_TEXT.lede('opec', 'OPEC', 11, '6.3%', '2.4%', 2024)).toBe('OPEC has 11 members; together, today’s OPEC members had 6.3% of the world’s people and 2.4% of its GDP in 2024.');
    expect(BLOCS_TEXT.summaryShares('OPEC', ['6.3% of the world’s people (2024)'])).toContain('Today’s OPEC members account for');
    expect(BLOCS_TEXT.imageCaption('opec', 'OPEC', 11)).toBe('Shares of the world: today’s 11 OPEC members');
    expect(BLOCS_TEXT.sharesCaption('opec')).toContain('today’s members');
    expect(BLOCS_TEXT.sharesCaption('g20')).toContain('today’s member countries');
  });

  it('are never written another way: no "{bloc} members" phrase in src/i18n outside the shared phrase and the non-share lines', () => {
    // Lines that count members today and state no share over a year (see NOT_SHARES), and labels.
    // "G20 members: 19 countries, plus …" is a count (src/i18n/members.en.ts), not a share.
    const allowed = ['overlapLine', 'description', 'disasters.en.ts:  blocLine', 'membersOf', 'keyMembers', 'treatyBloc', 'sharingBloc', 'water.en.ts:  blocLine', 'members.en.ts', 'members: ${membersText('];
    const found: string[] = [];
    for (const file of readdirSync('src/i18n')) {
      readFileSync(`src/i18n/${file}`, 'utf8').split('\n').forEach((l, i) => {
        if (/\$\{(b|bloc|other|name)\} members?\b/.test(l) && !allowed.some((a) => `${file}:${l}`.includes(a))) found.push(`src/i18n/${file}:${i + 1}: ${l.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });
});
