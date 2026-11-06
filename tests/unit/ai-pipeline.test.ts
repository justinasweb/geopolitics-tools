import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDraft, strayNumbers } from '../../src/lib/ai/check.ts';
import { AI_MODEL } from '../../src/lib/ai/config.ts';
import { anthropicClient, cleanReply, draftText, NoKeyError, type DraftClient, type Turn } from '../../src/lib/ai/draft.ts';
import { duplicateFacts, factsHash, refusals, validateFacts, type FactsFile } from '../../src/lib/ai/facts.ts';
import { buildPrompt, promptSections } from '../../src/lib/ai/prompt.ts';
import { territoryStatement } from '../../src/lib/ai/page-facts.ts';
import { approveText, readText, saveDraft, stateOf, textHash, writeText } from '../../src/lib/ai/store.ts';
import { HISTORY_BLOCS, historySpans } from '../../src/lib/history.ts';
import { RIVERS } from '../../src/data/rivers.ts';
import { place } from '../../src/lib/places.ts';
import { prBody, runDrafts } from '../../scripts/ai.ts';

// The drafting pipeline (docs/ai-drafting.md) with a stubbed model: nothing here calls the API.

const facts = (over: Partial<FactsFile> = {}): FactsFile => ({
  id: 'river:helmand', kind: 'river', subject: 'the Helmand', countries: ['AFG', 'IRN'], names: ['Helmand River Water Treaty'], generated: 'test',
  facts: [
    { id: 'treaty', statement: 'Afghanistan and Iran signed the Helmand River Water Treaty on 13 March 1973.', period: '1973-03-13', places: ['AFG', 'IRN'], source: 'FAOLEX', link: 'https://www.fao.org/faolex/en/', date: '1973-03-13' },
    { id: 'flow', statement: 'The treaty gives Iran an average flow.', value: 22, unit: 'cubic metres per second', unitAliases: ['m³/s'], period: '1973', places: ['IRN'], source: 'FAOLEX', link: 'https://www.fao.org/faolex/en/', date: '1973-03-13' },
  ],
  ...over,
});

const GOOD = 'Afghanistan and Iran signed the Helmand River Water Treaty on 13 March 1973. It gives Iran an average flow of 22 cubic metres per second (1973).';
const BAD = 'Afghanistan and Iran signed the Helmand River Water Treaty on 13 March 1973. It gives Iran 26 cubic metres per second (1973), and Pakistan none.';

/** A model that answers with the replies given, in turn, and keeps what it was sent. */
function stub(...replies: string[]): DraftClient & { calls: { system: string; messages: Turn[] }[] } {
  const calls: { system: string; messages: Turn[] }[] = [];
  return {
    calls,
    async complete(req) { calls.push({ system: req.system, messages: [...req.messages] }); return { text: replies[Math.min(calls.length - 1, replies.length - 1)], model: req.model }; },
  };
}

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'gt-ai-'));
  mkdirSync(join(root, 'src/content/pages'), { recursive: true });
  mkdirSync(join(root, 'src/content/hubs'), { recursive: true });
  writeFileSync(join(root, 'src/content/pages/about.md'), "---\ntitle: \"About\"\nlede: \"x\"\ndescription: \"y\"\nupdated: '2026-10-25'\napproved: false\n---\n\nOld text.\n");
  writeFileSync(join(root, 'src/content/hubs/power.md'), '---\nintro: "Old intro."\nfacts:\n  - "a fact"\nupdated: \'2026-10-29\'\napproved: false\n---\n');
  return root;
}

describe('the prompt', () => {
  it('has the system rules and a task for every kind of text, and gives the model the facts without notes', () => {
    const s = promptSections();
    for (const k of ['System', 'Task: dossier', 'Task: history', 'Task: river', 'Task: page', 'Task: hub', 'Redraft']) expect(s[k], k).toBeTruthy();
    const p = buildPrompt(facts({ facts: [{ ...facts().facts[0], note: 'secret owner note', unverified: false }] }));
    expect(p.system).toContain('Use only the facts given');
    expect(p.user).toContain('the Helmand');
    expect(p.user).toContain('13 March 1973');
    expect(p.user).not.toContain('secret owner note');
  });
});

describe('drafting with a stubbed client', () => {
  it('keeps a draft that passes the check first time', async () => {
    const c = stub(GOOD);
    const r = await draftText(facts(), c);
    expect(r).toMatchObject({ ok: true, text: GOOD, attempts: 1, model: AI_MODEL });
    expect(c.calls).toHaveLength(1);
  });

  it('redrafts once with the checker’s findings, and keeps the redraft when it passes', async () => {
    const c = stub(BAD, GOOD);
    const r = await draftText(facts(), c);
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    const second = c.calls[1].messages;
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second[2].content).toContain('The figure "26" is not in the facts');
    expect(second[2].content).toContain('Pakistan is not a place in the facts');
  });

  it('drops the draft when the redraft fails too', async () => {
    const c = stub(BAD, BAD, GOOD);
    const r = await draftText(facts(), c);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('failed-check'); expect(r.attempts).toBe(2); expect(r.problems.length).toBeGreaterThan(0); }
    expect(c.calls).toHaveLength(2);
  });

  it('refuses to draft from unverified facts or sample data, without calling the model', async () => {
    const c = stub(GOOD);
    const un = facts({ facts: [{ ...facts().facts[0], unverified: true, note: 'check it' }, facts().facts[1]] });
    const r = await draftText(un, c);
    expect(r).toMatchObject({ ok: false, reason: 'refused' });
    expect(c.calls).toHaveLength(0);
    expect(refusals(facts({ sample: true }))).toHaveLength(1);
  });

  it('names the facts a draft uses: its figures, and the facts behind a date or place no figure of the sentence gives', () => {
    const f = facts({ countries: ['IRN'] });
    // The date and Afghanistan come from "treaty" only; the figure is "flow", which also gives Iran and 1973.
    expect(checkDraft(GOOD, f).used).toEqual(['flow', 'treaty']);
    expect(checkDraft('It gives Iran an average flow of 22 cubic metres per second (1973).', f).used).toEqual(['flow']);
    // A place in the file's own countries needs no fact; one only facts give brings them in.
    expect(checkDraft('Iran is on the river.', f).used).toEqual([]);
    expect(checkDraft('Afghanistan is on the river.', f).used).toEqual(['treaty']);
    // A name the file allows brings in the facts that state it.
    expect(checkDraft('The Helmand River Water Treaty is in force.', f).used).toEqual(['treaty']);
  });

  it('cleans a reply wrapped in a code fence', () => {
    expect(cleanReply('```markdown\n## Hi\n\nText.\n```')).toBe('## Hi\n\nText.');
  });

  it('stops with a clear message when there is no API key', () => {
    expect(() => anthropicClient('')).toThrow(NoKeyError);
    expect(() => anthropicClient('')).toThrow(/ANTHROPIC_API_KEY.*ai:paste/s);
  });
});

describe('the store and the approval step', () => {
  it('saves a draft that is not shown until approved, and approves only the version the owner saw', () => {
    const root = tempRepo();
    const f = facts();
    const t = saveDraft('river:helmand', { text: GOOD, model: AI_MODEL, facts: f, on: '2026-11-02' }, root);
    expect(stateOf(t, f)).toBe('draft');
    expect(() => approveText('river:helmand', f, { on: '2026-11-03', via: 'telegram', textHash: 'not-it' }, root)).toThrow(/changed since it was sent/);
    const a = approveText('river:helmand', f, { on: '2026-11-03', via: 'telegram', textHash: textHash(GOOD) }, root);
    expect(a).toMatchObject({ approved: true, approvedOn: '2026-11-03', approvedVia: 'telegram', usedFacts: ['flow', 'treaty'], factsHash: factsHash(f, ['flow', 'treaty']) });
    expect(stateOf(readText('river:helmand', root), f)).toBe('approved');
  });

  it('flags an approved text as stale when its facts change', () => {
    const root = tempRepo();
    const f = facts();
    saveDraft('river:helmand', { text: GOOD, model: AI_MODEL, facts: f, on: '2026-11-02' }, root);
    approveText('river:helmand', f, { on: '2026-11-03', via: 'cli' }, root);
    const changed = facts({ facts: [f.facts[0], { ...f.facts[1], value: 23 }] });
    expect(stateOf(readText('river:helmand', root), changed)).toBe('stale');
    expect(() => approveText('river:helmand', changed, { on: '2026-11-04', via: 'cli' }, root)).toThrow(/facts changed/);
    // A new date on a fact (a weekly refresh) is not a change.
    const redated = facts({ facts: f.facts.map((x) => ({ ...x, date: '2026-11-09' })) });
    expect(stateOf(readText('river:helmand', root), redated)).toBe('approved');
  });

  it('hashes only the facts a text uses: a change to another fact, or a new fact, leaves it approved', () => {
    const root = tempRepo();
    const f = facts({ facts: [...facts().facts, { id: 'rank', statement: 'Iran’s place on dams.', value: 7, unit: 'rank', period: '2025', places: ['IRN'], source: 'GDW', link: 'https://www.globaldamwatch.org/', date: '2026-10-25' }] });
    const t = saveDraft('river:helmand', { text: GOOD, model: AI_MODEL, facts: f, on: '2026-11-02' }, root);
    expect(t.usedFacts).toEqual(['flow', 'treaty']);
    approveText('river:helmand', f, { on: '2026-11-03', via: 'cli' }, root);
    const moved = facts({ facts: [...facts().facts, { ...f.facts[2], value: 8 }] });
    expect(stateOf(readText('river:helmand', root), moved)).toBe('approved');
    expect(stateOf(readText('river:helmand', root), facts())).toBe('approved');
    // A used fact that changes, or is gone, makes it stale.
    expect(stateOf(readText('river:helmand', root), facts({ facts: [facts().facts[0]] }))).toBe('stale');
    // A text saved before usedFacts keeps the whole-file hash, as before.
    const old = { ...readText('river:helmand', root)!, usedFacts: undefined, factsHash: factsHash(f) };
    expect(stateOf(old, f)).toBe('approved');
    expect(stateOf(old, moved)).toBe('stale');
  });

  it('refuses to approve a text edited so that it no longer passes the check', () => {
    const root = tempRepo();
    const f = facts();
    const t = saveDraft('river:helmand', { text: GOOD, model: AI_MODEL, facts: f, on: '2026-11-02' }, root);
    writeText({ ...t, text: BAD }, root);
    expect(() => approveText('river:helmand', f, { on: '2026-11-03', via: 'cli' }, root)).toThrow(/no longer passes/);
  });

  it('never overwrites the owner’s own text, which needs no approval', () => {
    const root = tempRepo();
    writeText({ id: 'river:helmand', text: 'My own words.', author: 'owner', approved: true, approvedOn: '2026-11-01' }, root);
    expect(() => saveDraft('river:helmand', { text: GOOD, model: AI_MODEL, facts: facts(), on: '2026-11-02' }, root)).toThrow(/never overwritten/);
    expect(stateOf(readText('river:helmand', root), facts())).toBe('owner');
    expect(() => approveText('river:helmand', facts(), { on: '2026-11-03', via: 'cli' }, root)).toThrow(/owner wrote/);
  });

  it('keeps the long pages in their Markdown, with the record in the front matter', () => {
    const root = tempRepo();
    const f: FactsFile = { ...facts(), id: 'page:about', kind: 'page', subject: 'About' };
    saveDraft('page:about', { text: `## The treaty\n\n${GOOD}`, model: AI_MODEL, facts: f, on: '2026-11-02' }, root);
    const md = readFileSync(join(root, 'src/content/pages/about.md'), 'utf8');
    expect(md).toContain('title: "About"');
    expect(md).toContain('approved: false');
    // A long page keeps the whole file's hash: its prose is more than the figures the checker can match.
    expect(md).toContain(`factsHash: "${factsHash(f)}"`);
    expect(md).not.toContain('usedFacts');
    expect(md).toContain('updated: "2026-11-02"');
    expect(md).toMatch(/---\n\n## The treaty/);
    expect(readText('page:about', root)).toMatchObject({ approved: false, author: 'ai', model: AI_MODEL });
    const a = approveText('page:about', f, { on: '2026-11-05', via: 'pr' }, root);
    expect(a.approved).toBe(true);
    expect(readFileSync(join(root, 'src/content/pages/about.md'), 'utf8')).toContain('approvedOn: "2026-11-05"');
  });

  it('writes a hub intro into its front matter and keeps the other lines', () => {
    const root = tempRepo();
    const f: FactsFile = { ...facts(), id: 'hub:power', kind: 'hub', subject: 'Power' };
    saveDraft('hub:power', { text: GOOD, model: AI_MODEL, facts: f, on: '2026-11-02' }, root);
    const md = readFileSync(join(root, 'src/content/hubs/power.md'), 'utf8');
    expect(md).toContain(`intro: ${JSON.stringify(GOOD)}`);
    expect(md).toContain('  - "a fact"');
    expect(readText('hub:power', root)!.text).toBe(GOOD);
  });

  it('reads a draft written before the pipeline as a draft that cannot be approved as it is', () => {
    const root = tempRepo();
    const t = readText('page:about', root)!;
    expect(t.factsHash).toBeUndefined();
    expect(stateOf(t, null)).toBe('draft');
    expect(stateOf({ ...t, approved: true }, null)).toBe('stale');
  });
});

describe('a drafting run', () => {
  it('lists drafted, dropped and skipped texts for the pull request', () => {
    const body = prBody({ drafted: [{ id: 'river:nile', text: 'A text.', model: AI_MODEL, attempts: 2 }, { id: 'page:about', text: 'one two three', model: AI_MODEL, attempts: 1 }], skipped: ['history:nato: fact "x" is unverified'], dropped: [{ id: 'river:indus', problems: ['- nope'] }] });
    expect(body).toContain('## Pages to approve in this pull request');
    expect(body).toContain('`page:about`: 3 words');
    expect(body).toContain('### river:nile');
    expect(body).toContain('passed on the redraft');
    expect(body).toContain('## Dropped');
    expect(body).toContain('history:nato: fact "x" is unverified');
  });

  it('skips texts whose facts are unverified, without calling the model', async () => {
    const c = stub(GOOD);
    const run = await runDrafts(['river:dnipro', 'history:quad'], c);
    expect(c.calls).toHaveLength(0);
    expect(run.drafted).toEqual([]);
    expect(run.skipped.join('\n')).toMatch(/river:dnipro: fact "agreement-1992" is unverified/);
  });
});

describe('duplicate facts', () => {
  const base = { source: 'S', link: 'https://example.org', date: '2026' };
  const f = (...facts: FactsFile['facts']): FactsFile => ({ id: 'history:csto', kind: 'history', subject: 'CSTO', generated: 'test', facts });

  it('flag the same event said twice in other words', () => {
    const d = duplicateFacts(f(
      { id: 'left-UZB-2012', statement: 'Uzbekistan suspended its membership of the CSTO in 2012.', period: '2012', places: ['UZB'], ...base },
      { id: 'note-2012', statement: 'Uzbekistan suspended its membership in 2012.', period: '2012', places: ['UZB'], ...base },
    ));
    expect(d.map(([a, b]) => [a.id, b.id])).toEqual([['left-UZB-2012', 'note-2012']]);
    // A dated note against a year-only fact still counts: the year is what is compared.
    expect(duplicateFacts(f(
      { id: 'left-GBR-2020', statement: 'United Kingdom left the European Union in 2020.', period: '2020', places: ['GBR'], ...base },
      { id: 'note-2020', statement: 'The United Kingdom left on 31 January 2020.', period: '2020-01-31', places: ['GBR'], ...base },
    ))).toHaveLength(1);
  });

  it('leave apart different places, years and measures', () => {
    expect(duplicateFacts(f(
      { id: 'a', statement: 'Kazakhstan joined in 1992.', period: '1992', places: ['KAZ'], ...base },
      { id: 'b', statement: 'Armenia joined in 1992.', period: '1992', places: ['ARM'], ...base },
      { id: 'c', statement: 'Kazakhstan joined in 1993.', period: '1993', places: ['KAZ'], ...base },
    ))).toEqual([]);
    // One template, two measures, the same rank: not a duplicate.
    expect(duplicateFacts(f(
      { id: 'gdp-rank', statement: 'China’s place on GDP, largest first.', value: 2, unit: 'rank', period: '2024', places: ['CHN'], ...base },
      { id: 'population-rank', statement: 'China’s place on population, largest first.', value: 2, unit: 'rank', period: '2024', places: ['CHN'], ...base },
    ))).toEqual([]);
  });
});

describe('the facts files in the repository', () => {
  const dir = 'src/data/ai/facts';
  const all = readdirSync(dir).flatMap((k) => readdirSync(join(dir, k)).map((f) => JSON.parse(readFileSync(join(dir, k, f), 'utf8')) as FactsFile));

  it('are valid: every fact has a statement, a source, an https link and a date, and names known places', () => {
    for (const f of all) expect(validateFacts(f, (p) => Boolean(place(p))), f.id).toEqual([]);
  });

  it('give each figure a fact of its own', () => {
    for (const f of all) for (const x of f.facts) expect(strayNumbers(x, f.names), `${f.id} ${x.id}`).toEqual([]);
  });

  it('cover the 11 histories and 8 rivers, with a dated fact for every join and departure in bloc-history.csv', () => {
    const ids = new Set(all.map((f) => f.id));
    for (const b of HISTORY_BLOCS) expect(ids.has(`history:${b}`), b).toBe(true);
    for (const r of RIVERS) expect(ids.has(`river:${r.id}`), r.id).toBe(true);
    // A join or departure is covered by its own fact (join-IDN-1962), or by one fact about that place in that year:
    // Indonesia rejoined OPEC and suspended its membership again in 2016, said in one fact. A date may be to the day.
    const covered = (f: FactsFile, id: string, p: string, y: number) =>
      f.facts.some((x) => (x.id === id || (x.places?.includes(p) && !x.id.startsWith('join-') && !x.id.startsWith('left-'))) && x.period?.slice(0, 4) === String(y));
    for (const b of HISTORY_BLOCS) {
      const f = all.find((x) => x.id === `history:${b}`)!;
      for (const s of historySpans().get(b)!) {
        expect(covered(f, `join-${s.place}-${s.from}`, s.place, s.from), `${b} ${s.place} joined ${s.from}`).toBe(true);
        if (s.to !== null) expect(covered(f, `left-${s.place}-${s.to}`, s.place, s.to), `${b} ${s.place} left ${s.to}`).toBe(true);
      }
    }
  });

  it('say nothing twice', () => {
    for (const f of all) expect(duplicateFacts(f).map(([a, b]) => `${a.id} = ${b.id}`), f.id).toEqual([]);
  });

  it('pass their own statements through the checker, so a draft that repeats a fact is accepted', () => {
    for (const f of all.filter((x) => x.kind === 'history' || x.kind === 'river')) {
      for (const x of f.facts.filter((y) => y.value === undefined)) {
        const r = checkDraft(x.statement, f);
        expect(r.problems.map((p) => p.message), `${f.id} ${x.id}: ${x.statement}`).toEqual([]);
      }
    }
  });
});

describe('facts files say what a text may say', () => {
  it('names a territory note’s place, never only its id', () => {
    expect(territoryStatement({ place: 'FLK', area: '', note: 'Administered by the United Kingdom; claimed by Argentina' })).toBe('Falkland Islands: Administered by the United Kingdom; claimed by Argentina');
    expect(territoryStatement({ place: 'RUS', area: 'Crimea', note: 'Crimea: Under Russian control since 2014' })).toBe('Crimea: Under Russian control since 2014');
    expect(territoryStatement({ place: 'CHN', area: '', note: 'This source’s figures for China exclude Hong Kong' })).toBe('This source’s figures for China exclude Hong Kong');
  });

  it('keeps how a history count was checked in the note, not the statement', () => {
    for (const f of readdirSync('src/data/ai/facts/history')) {
      const file = JSON.parse(readFileSync(join('src/data/ai/facts/history', f), 'utf8')) as FactsFile;
      const members = file.facts.find((x) => x.id === 'members-2026');
      if (members) expect(members.statement, f).toMatch(/^Members of .+ in 2026\.$/);
      for (const x of file.facts) expect(x.statement, `${f} ${x.id}`).not.toMatch(/membership table|checked on|counted on/);
    }
  });
});
