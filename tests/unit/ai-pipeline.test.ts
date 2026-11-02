import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDraft, strayNumbers } from '../../src/lib/ai/check.ts';
import { AI_MODEL } from '../../src/lib/ai/config.ts';
import { anthropicClient, cleanReply, draftText, NoKeyError, type DraftClient, type Turn } from '../../src/lib/ai/draft.ts';
import { factsHash, refusals, validateFacts, type FactsFile } from '../../src/lib/ai/facts.ts';
import { buildPrompt, promptSections } from '../../src/lib/ai/prompt.ts';
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
    expect(a).toMatchObject({ approved: true, approvedOn: '2026-11-03', approvedVia: 'telegram', factsHash: factsHash(f) });
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
    expect(md).toContain(`factsHash: "${factsHash(f)}"`);
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
    const t = readText('page:about')!;
    expect(t.factsHash).toBeUndefined();
    expect(stateOf(t, null)).toBe(t.approved ? 'stale' : 'draft');
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
    const run = await runDrafts(['river:nile', 'history:nato'], c);
    expect(c.calls).toHaveLength(0);
    expect(run.drafted).toEqual([]);
    expect(run.skipped.join('\n')).toMatch(/river:nile: fact "agreement-1959" is unverified/);
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
    for (const b of HISTORY_BLOCS) {
      const f = all.find((x) => x.id === `history:${b}`)!;
      for (const s of historySpans().get(b)!) {
        expect(f.facts.find((x) => x.id === `join-${s.place}-${s.from}`)?.period, `${b} ${s.place} ${s.from}`).toBe(String(s.from));
        // A departure may be dated to the day (the UAE left OPEC on 2026-05-01); its year is the CSV's.
        if (s.to !== null) expect(f.facts.find((x) => x.id === `left-${s.place}-${s.to}`)?.period?.slice(0, 4), `${b} ${s.place} left ${s.to}`).toBe(String(s.to));
      }
    }
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
