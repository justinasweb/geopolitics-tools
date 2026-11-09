import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDraft, problemLines, strayNumbers } from '../../src/lib/ai/check.ts';
import { lengthProblems, NoKeyError, wordCount, type DraftClient } from '../../src/lib/ai/draft.ts';
import { duplicateFacts, factsHash, validateFacts } from '../../src/lib/ai/facts.ts';
import { approveText, editText, readText, saveDraft, skipText, stateOf, textHash } from '../../src/lib/ai/store.ts';
import { isTextId } from '../../src/lib/ai/texts.ts';
import { weekCounts, weekFacts } from '../../src/lib/ai/week-facts.ts';
import { place } from '../../src/lib/places.ts';
import { parseCallback } from '../../src/lib/review.ts';
import type { WeekData } from '../../src/lib/week/model.ts';
import { reviewMessage } from '../../scripts/review.ts';
import { digest, digestPost, summary, weekUrl } from '../../scripts/week.ts';
import type { Bot } from '../../scripts/telegram.ts';

// This week's summary (src/lib/ai/week-facts.ts, scripts/week.ts) and the review steps behind the Telegram buttons
// (src/lib/ai/store.ts, scripts/review.ts). The model and Telegram are stubbed.

const src = (changed: string) => ({ fetched: '2026-11-08T23:10:00Z', changed });
const WEEK: WeekData = {
  v: 1, week: '2026-45', period: { from: '2026-11-02', to: '2026-11-08' }, made: '2026-11-09T00:23:00.000Z', feed: [],
  cards: [
    { kind: 'disaster', src: src('2026-11-08T22:00:00Z'), quiet: false, compared: true, active: [], alerts: [
      { id: '1', level: 'red', type: 'TC', places: ['PHL', 'VNM'], name: 'X', from: '2026-11-03' },
      { id: '2', level: 'orange', type: 'EQ', places: ['JPN'], name: 'Y', from: '2026-11-05' },
    ] },
    { kind: 'conflict', src: src('2026-11-04T09:00:00Z'), quiet: false, month: '2026-10', prev: '2026-09', preliminary: true, rows: [{ place: 'UKR', a: 50, b: 60 }], total: { a: 150, b: 170 } },
    { kind: 'prices', src: src('2026-11-04T09:00:00Z'), quiet: false, month: '2026-10', rows: [{ code: 'WHEAT_US_HRW', value: 249.4, month: 0.021, year: -0.05 }, { code: 'RICE_05', value: 383.2, month: 0, year: null }] },
    { kind: 'outage', src: src('2026-11-08T20:00:00Z'), quiet: false, rows: [{ place: 'IRQ', start: '2026-11-04T06:00:00Z', hours: 3.5 }] },
    { kind: 'sanctions', src: src('2026-11-07T10:00:00Z'), quiet: false, since: '2026-11-02', lists: [{ list: 'US', added: 12, removed: 1 }, { list: 'EU', added: 0, removed: 0 }, { list: 'UK', added: 3, removed: 0 }], places: [{ place: 'RUS', n: 6 }] },
  ],
};

const SUMMARY = 'GDACS issued 2 new orange or red disaster alerts this week, 1 of them red: a tropical cyclone in the Philippines and Viet Nam from 3 November 2026, and an earthquake in Japan from 5 November 2026. '
  + 'UCDP recorded 170 events of organised violence in October 2026, preliminary figures, against 150 in September 2026; Ukraine had 60 events in October 2026, up 20% on September 2026. '
  + 'In the Pink Sheet, wheat (US hard red winter) averaged $249.40 a tonne in October 2026, up 2.1% on the month. '
  + 'IODA recorded 1 national-scale internet outage, in Iraq, from 4 November 2026, lasting 3.5 hours. '
  + '12 entries were added to the United States sanctions lists and 3 to the United Kingdom list.';

describe('the week’s facts', () => {
  const f = weekFacts('2026-45', WEEK);

  it('come from the frozen week, each with a source, a link and the day the source last changed', () => {
    expect(f).toMatchObject({ id: 'week:2026-45', kind: 'week', subject: 'week 45 of 2026 (2 November 2026 to 8 November 2026)' });
    expect(validateFacts(f, (p) => Boolean(place(p)))).toEqual([]);
    const byId = Object.fromEntries(f.facts.map((x) => [x.id, x]));
    expect(byId.alerts).toMatchObject({ value: 2, unit: 'alerts', source: 'GDACS', date: '2026-11-08' });
    expect(byId['alert-1'].places).toEqual(['PHL', 'VNM']);
    expect(byId['conflict-total']).toMatchObject({ value: 170, period: '2026-10', source: 'UCDP GED Candidate' });
    expect(byId['conflict-total'].statement).toContain('preliminary');
    expect(byId['conflict-ukr-change']).toMatchObject({ value: 20, unit: '%' });
    expect(byId['price-wheat-us-hrw']).toMatchObject({ value: 249.4, unit: '$/tonne', period: '2026-10' });
    expect(byId['price-rice-05-month'].statement).toBe('Rice, Thai 5% was unchanged in October 2026 on September 2026.');
    expect(byId['price-rice-05-year']).toBeUndefined();
    expect(byId['outage-1']).toMatchObject({ value: 3.5, unit: 'hours', places: ['IRQ'] });
    expect(byId['sanctions-us-added']).toMatchObject({ value: 12, places: ['USA'] });
    expect(byId['sanctions-eu-none'].statement).toMatch(/^No entries were added to or removed from the European Union/);
    expect(byId['sanctions-eu-added']).toBeUndefined();
  });

  it('pass the repository checks: a fall is "down 5%" for a value of -5, and a list with no changes is one fact', () => {
    // Week 2026-45 failed ci: "down 8.6%" read as a stray figure, and "no entries added" and "no entries removed" from
    // the UK list as one fact said twice.
    const uk = weekFacts('2026-45', { ...WEEK, cards: WEEK.cards.map((c) => (c.kind === 'sanctions' ? { ...c, lists: [{ list: 'UK', added: 0, removed: 0 }] } : c)) });
    expect(uk.facts.find((x) => x.id === 'price-wheat-us-hrw-year')!.statement).toContain('down 5%');
    for (const x of uk.facts) expect(strayNumbers(x, uk.names), x.id).toEqual([]);
    expect(duplicateFacts(uk)).toEqual([]);
    expect(uk.facts.filter((x) => x.id.startsWith('sanctions-uk')).map((x) => x.id)).toEqual(['sanctions-uk-none']);
  });

  it('leave out quiet cards, so last month’s figures never read as this week’s', () => {
    const quiet = weekFacts('2026-45', { ...WEEK, cards: WEEK.cards.map((c) => ({ ...c, quiet: true }) as typeof c) });
    expect(quiet.facts.map((x) => x.id)).toEqual(['week']);
  });

  it('let a neutral summary through the checker, and catch a figure that is not in them', () => {
    const r = checkDraft(SUMMARY, f);
    expect(problemLines(r)).toEqual([]);
    expect(lengthProblems(SUMMARY, 'week')).toEqual([]);
    expect(checkDraft(SUMMARY.replace('170 events', '175 events'), f).ok).toBe(false);
    expect(checkDraft(`${SUMMARY} Prices will rise.`, f).ok).toBe(false);
  });

  it('hold a summary to 100–150 words when it is drafted', () => {
    expect(wordCount('One two, three — four.')).toBe(4);
    expect(lengthProblems('Too short.', 'week')[0]).toMatch(/2 words; it must have 100 to 150/);
    expect(lengthProblems('Too short.', 'river')).toEqual([]);
  });

  it('give the digest its three counts', () => {
    expect(weekCounts(WEEK)).toEqual([{ kind: 'disaster', n: 2 }, { kind: 'outage', n: 1 }, { kind: 'sanctions', n: 15 }]);
  });
});

describe('the review steps', () => {
  const f = weekFacts('2026-45', WEEK);
  const root = () => mkdtempSync(join(tmpdir(), 'gt-review-'));

  it('know week ids', () => {
    expect(isTextId('week:2026-45')).toBe(true);
    expect(isTextId('week:2026-60')).toBe(false);
  });

  it('Skip records that the text is not published, for that version only; Approve later still can', () => {
    const r = root();
    const t = saveDraft('week:2026-45', { text: SUMMARY, model: 'm', facts: f, on: '2026-11-09' }, r);
    expect(() => skipText('week:2026-45', { on: '2026-11-09', textHash: 'abcdef012345' }, r)).toThrow(/changed since/);
    skipText('week:2026-45', { on: '2026-11-09', textHash: textHash(t.text) }, r);
    const s = readText('week:2026-45', r)!;
    expect(s).toMatchObject({ skipped: '2026-11-09', approved: false });
    expect(stateOf(s, f)).toBe('skipped');
    approveText('week:2026-45', f, { on: '2026-11-10', via: 'telegram', textHash: textHash(t.text) }, r);
    const a = readText('week:2026-45', r)!;
    expect(a).toMatchObject({ approved: true, approvedVia: 'telegram' });
    expect(a.skipped).toBeUndefined();
    expect(stateOf(a, f)).toBe('approved');
  });

  it('Edit takes a correction only if it passes the check, and makes it a draft to approve again', () => {
    const r = root();
    const t = saveDraft('week:2026-45', { text: SUMMARY, model: 'm', facts: f, on: '2026-11-09' }, r);
    const h = textHash(t.text);
    expect(() => editText('week:2026-45', SUMMARY.replace('170 events', '171 events'), f, { on: '2026-11-09', textHash: h }, r)).toThrow(/does not pass the check[\s\S]*171/);
    expect(readText('week:2026-45', r)!.text).toBe(SUMMARY);
    const fixed = SUMMARY.replace(' preliminary figures,', ' preliminary figures from the Candidate release,');
    const e = editText('week:2026-45', `${fixed}\r\n`, f, { on: '2026-11-09', textHash: h }, r);
    expect(e).toMatchObject({ text: fixed, edited: '2026-11-09', approved: false, factsHash: factsHash(f, e.usedFacts) });
    expect(e.usedFacts!.length).toBeGreaterThan(0);
    expect(() => approveText('week:2026-45', f, { on: '2026-11-09', via: 'telegram', textHash: h }, r)).toThrow(/changed since/);
    expect(approveText('week:2026-45', f, { on: '2026-11-09', via: 'telegram', textHash: textHash(fixed) }, r).approved).toBe(true);
  });

  it('send the exact text with buttons that name its version', () => {
    const t = { id: 'week:2026-45', text: 'A <b> & text', author: 'ai' as const, approved: false, drafted: '2026-11-09', model: 'claude-sonnet-5-5' };
    const m = reviewMessage(t, f);
    expect(m.text).toContain('A &lt;b&gt; &amp; text');
    expect(m.text).toContain('This week’s summary, week 45 of 2026');
    const buttons = m.extra.reply_markup.inline_keyboard[0].map((b) => parseCallback(b.callback_data));
    expect(buttons).toEqual(['a', 'e', 's'].map((action) => ({ action, id: 'week:2026-45', hash: textHash(t.text) })));
  });
});

describe('the summary and digest runs', () => {
  const sent: { text: string; extra?: Record<string, unknown> }[] = [];
  const b: Bot = { configured: true, send: async (text, extra) => { sent.push({ text, extra }); return true; } };
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); sent.length = 0; });

  /** A repository with the prompt and a data folder holding the frozen week, as the week workflow has it. */
  function repo(): string {
    const r = mkdtempSync(join(tmpdir(), 'gt-week-'));
    mkdirSync(join(r, 'src/data/ai'), { recursive: true });
    cpSync(join(process.cwd(), 'src/data/ai/prompt.md'), join(r, 'src/data/ai/prompt.md'));
    mkdirSync(join(r, 'data/weeks'), { recursive: true });
    writeFileSync(join(r, 'data/weeks/2026-45.json'), JSON.stringify(WEEK));
    vi.stubEnv('GT_DATA_DIR', join(r, 'data'));
    vi.spyOn(process, 'cwd').mockReturnValue(r);
    return r;
  }
  const model = (...replies: string[]): DraftClient => { let i = 0; return { complete: async () => ({ text: replies[Math.min(i++, replies.length - 1)], model: 'claude-sonnet-5-5' }) }; };

  it('drafts, saves and sends a passing summary for review, once', async () => {
    const r = repo();
    expect(await summary('2026-45', () => model(SUMMARY), b, '2026-11-09')).toEqual({ outcome: 'drafted' });
    expect(readText('week:2026-45', r)).toMatchObject({ text: SUMMARY, approved: false, drafted: '2026-11-09' });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('For review');
    expect(await summary('2026-45', () => model(SUMMARY), b)).toEqual({ outcome: 'exists', detail: 'draft' });
  });

  it('drops a draft that fails twice and tells the owner the week shows the cards only', async () => {
    const r = repo();
    const bad = SUMMARY.replace('170 events', '999 events');
    expect((await summary('2026-45', () => model(bad), b)).outcome).toBe('dropped');
    expect(readText('week:2026-45', r)).toBeNull();
    expect(sent[0].text).toMatch(/failed the number and fact check twice/);
  });

  it('runs with cards only without an API key, and does nothing for a week not archived', async () => {
    repo();
    expect((await summary('2026-45', () => { throw new NoKeyError(); }, b)).outcome).toBe('no key');
    expect((await summary('2026-44', () => model(SUMMARY), b)).outcome).toBe('not frozen');
  });

  it('builds the digest from the approved summary, or the counts, with the archive link', () => {
    const withSummary = digestPost('2026-45', WEEK, SUMMARY);
    expect(withSummary).toContain('Week 45 on geopolitics.tools: 2–8 November 2026');
    expect(withSummary).toContain(SUMMARY);
    expect(withSummary).toContain('Summary drafted with AI from the week’s data and reviewed by the editor.');
    expect(withSummary).toContain('https://geopolitics.tools/this-week/2026-45');
    const counts = digestPost('2026-45', WEEK, null);
    expect(counts).toContain('• 2 new orange or red disaster alerts (GDACS)');
    expect(counts).toContain('• 1 national-scale internet outage (IODA)');
    expect(counts).toContain('• 15 entries added to the US, EU and UK sanctions lists');
    expect(weekUrl('2026-45')).toBe('https://geopolitics.tools/this-week/2026-45');
  });

  it('sends the digest to the owner with Post, never while on the holding page or before the page is live', async () => {
    repo();
    expect(await digest('2026-45', b, { holding: true })).toBe('holding');
    expect(sent).toEqual([]);
    expect(await digest('2026-45', b, { holding: false, check: async () => 404 })).toBe('not live');
    sent.length = 0;
    expect(await digest('2026-45', b, { holding: false, check: async () => 200 })).toBe('sent');
    expect(sent).toHaveLength(2);
    const post = sent[1];
    expect(post.text).toContain('• 2 new orange or red disaster alerts (GDACS)');
    expect((post.extra!.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0].map((x) => x.callback_data)).toEqual(['p|2026-45', 'x|2026-45']);
  });
});
