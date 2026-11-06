// The checker (spec, D15, "Check"): compares every number, date and country name in a draft with its facts file.
// It is strict on purpose: a draft passes only when everything it states can be found in the facts, with the
// fact's unit and period in the same sentence. What it reads:
//
// - Numbers in digits ("1,234,567", "55.5", "−15%"), with a scale ("1.2 million", "$27 tn", "3bn") or as words
//   ("twenty-one", "three million", "a dozen"), ordinals ("third", "21st") and fractions ("half", "two-thirds").
//   Ranges ("15–20%", "1.2 to 3.4 million", "between 1,000 and 1,800") give their scale or % to both ends.
// - Rounding: a figure may be rounded the way it is written, to at least two significant figures, so
//   "1.2 million" and "1.23 million" match 1,234,567 but "1.3 million" and "1 million" do not. "50%" does not match
//   47.3%. Signs are ignored, so "down 3%" matches −3.
// - A percentage only matches a fact in % (and money only a fact in dollars), and the fact's unit and period must
//   be in the same sentence: "55.5 billion cubic metres a year (1959)".
// - Dates: "6 June 2023", "June 2023", "2023-06-06", years, decades ("the 1990s") and ranges of years. A day must be
//   a day in the facts, a month a month in them, a year a year in them.
// - Country names, aliases and demonyms (./names.ts): only the places the facts file names.
// - Words that state a comparison ("doubled", "twice") must be in a fact; words the site never uses (forecasts,
//   blame, judging adjectives) fail the draft (STYLE), and so do words about the drafting material ("the facts",
//   "this summary": SELF_REFERENCE).
import type { Fact, FactsFile } from './facts.ts';
import { countryNames, NOT_COUNTRIES, stripAccents } from './names.ts';

export type ProblemKind = 'number' | 'date' | 'country' | 'comparison' | 'style' | 'owner';
export interface Problem { kind: ProblemKind; text: string; sentence: string; message: string }
export interface CheckResult { ok: boolean; problems: Problem[] }

// ---------------------------------------------------------------------------------------------------------------
// Reading numbers

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const ABBR: Record<string, number> = { k: 1e3, m: 1e6, mn: 1e6, bn: 1e9, b: 1e9, tn: 1e12, trn: 1e12 };
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20,
};
/** Fractions said in words, as percentages. */
const FRACTIONS: Record<string, number> = {
  half: 50, 'a half': 50, 'one half': 50, 'a third': 100 / 3, 'one third': 100 / 3, 'one-third': 100 / 3,
  'two thirds': 200 / 3, 'two-thirds': 200 / 3, 'a quarter': 25, 'one quarter': 25, 'one-quarter': 25,
  'three quarters': 75, 'three-quarters': 75, 'a fifth': 20, 'one fifth': 20, 'one-fifth': 20,
};
/** Words that state a comparison between figures; allowed only when a fact says it. */
const COMPARISONS = ['doubled', 'doubling', 'double', 'tripled', 'triple', 'quadrupled', 'halved', 'twice', 'thrice', 'tenfold', 'twofold', 'threefold', 'fold'];
/** Words the site does not use (spec, "Neutral wording"; prompt.md): forecasts, blame and judging adjectives. */
export const STYLE = [
  'will', "won't", 'expected to', 'likely', 'unlikely', 'forecast', 'predict', 'predicted', 'set to', 'poised',
  'dominant', 'dominates', 'dominate', 'vulnerable', 'vulnerability', 'powerful', 'aggressive', 'aggression',
  'crucial', 'critical', 'vital', 'significant', 'significantly', 'massive', 'huge', 'tiny', 'alarming', 'worrying',
  'dramatic', 'dramatically', 'staggering', 'remarkable', 'impressive', 'notorious', 'infamous', 'controversial',
  'unfortunately', 'fortunately', 'sadly', 'blame', 'blamed', 'fault', 'provocative', 'hostile', 'rogue',
  'superpower', 'strongman', 'regime', 'threat', 'threatens', 'threatening', 'weaponise', 'weaponize', 'weaponised',
  'weaponized', 'clearly', 'obviously', 'of course', 'merely', 'only just', 'mere', 'leading', 'top',
];
/** Words that talk about the drafting material instead of the subject (prompt.md): a reader never sees the facts. */
export const SELF_REFERENCE = ['the facts', 'this summary'];

/** A figure as the draft writes it. */
export interface Quantity {
  /** Where it starts and ends in the text it was read from. */
  start: number;
  end: number;
  text: string;
  value: number;
  /** The value without its scale word ("1.2" in "1.2 million"), to match a fact whose unit carries the scale. */
  bare: number;
  scale: number;
  scaleWord: string;
  /** The unit of rounding as written: 100,000 for "1.2 million", 1 for "1,234,567", 0.1 for "55.5". */
  step: number;
  /** Significant figures as written ("1.2 million": 2, "1,200,000": 2, "50": 1). */
  sig: number;
  percent: boolean;
  money: boolean;
  ordinal: boolean;
  /** A whole number of 4 digits, written without a comma, that could be a year. */
  yearLike: boolean;
  /** Written in words. */
  words: boolean;
}

const sigOf = (digits: string): { sig: number; step: number } => {
  // digits: the number as written with commas removed ("1200000", "55.5", "0.47").
  const [int, frac = ''] = digits.split('.');
  if (frac) {
    const all = (int.replace(/^0+/, '') + frac).replace(/^0+/, '');
    return { sig: Math.max(all.length, 1), step: 10 ** -frac.length };
  }
  const trimmed = int.replace(/^0+/, '') || '0';
  const zeros = trimmed.length - trimmed.replace(/0+$/, '').length;
  const sig = Math.max(trimmed.length - zeros, 1);
  return { sig, step: 10 ** zeros };
};

/** "twenty-one", "three hundred and five", "two million": the value, or null when the words are not a number. */
export function wordsToNumber(s: string): number | null {
  const parts = s.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter((w) => w && w !== 'and');
  if (!parts.length) return null;
  let total = 0;
  let current = 0;
  let seen = false;
  for (const w of parts) {
    if (w in UNITS) { current += UNITS[w]; seen = true; } else if (w in TENS) { current += TENS[w]; seen = true; } else if (w === 'hundred') { current = (current || 1) * 100; seen = true; } else if (w in SCALES) { total += (current || 1) * SCALES[w]; current = 0; seen = true; } else if (w === 'a' && !seen) { current = 1; } else if (w === 'dozen') { current = (current || 1) * 12; seen = true; } else return null;
  }
  return seen ? total + current : null;
}

const WORD_ALT = [...Object.keys(UNITS), ...Object.keys(TENS), 'hundred', 'thousand', 'million', 'billion', 'trillion', 'dozen'].join('|');
const NUMBER_WORDS = new RegExp(`\\b(?:a\\s+(?=(?:hundred|thousand|million|billion|trillion|dozen)\\b))?(?:${WORD_ALT})(?:(?:[\\s-]+|\\s+and\\s+)(?:${WORD_ALT}))*\\b`, 'gi');
const DIGITS = /(?<![\w.,])(?<money>US\$|\$)?\s?(?<sign>[−-])?(?<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?<ord>st|nd|rd|th)?(?:(?:\s|&nbsp;)?(?<scale>trillion|billion|million|thousand|tn|trn|bn|mn|m|b|k)\b)?(?<pct>\s?(?:%|per ?cent\b|percent\b|percentage points?\b|pp\b))?(?![\w])/dg;
const ORDINAL_WORDS = new RegExp(`\\b(${Object.keys(ORDINALS).join('|')})\\b`, 'gi');
const FRACTION_WORDS = new RegExp(`\\b(${Object.keys(FRACTIONS).sort((a, b) => b.length - a.length).join('|').replace(/ /g, '\\s+')})\\b`, 'gi');

/** Every figure in a text, left to right. Ranges carry their scale and % from the second end to the first. */
export function readQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);
  for (const m of text.matchAll(DIGITS)) {
    const g = m.groups!;
    const start = m.index!;
    const end = start + m[0].length;
    const num = g.num.replace(/,/g, '');
    // A letter right before the number makes it part of a name (G20, CO2) and the lookbehind misses "G 20" only.
    if (start > 0 && /[A-Za-z]/.test(text[start - 1]) && !g.money) continue;
    // "m" and "b" are a scale only after money: "5,150 m" is metres.
    let scaleWord = g.scale?.toLowerCase() ?? '';
    if (scaleWord && ['m', 'b', 'k'].includes(scaleWord) && !g.money) scaleWord = '';
    const scale = scaleWord ? SCALES[scaleWord] ?? ABBR[scaleWord] : 1;
    const { sig, step } = sigOf(num);
    const bare = Number(num);
    // A dropped scale ("m" for metres) is not part of the figure.
    const ix = (m as RegExpMatchArray & { indices: { groups: Record<string, [number, number] | undefined> } }).indices.groups;
    const realEnd = g.scale && !scaleWord ? (ix.ord ?? ix.num)![1] : end;
    out.push({
      start, end: realEnd, text: text.slice(start, realEnd).trim(), value: bare * scale, bare, scale, scaleWord, step: step * scale, sig,
      percent: Boolean(g.pct), money: Boolean(g.money), ordinal: Boolean(g.ord), words: false,
      yearLike: !g.money && !g.pct && !scaleWord && !g.ord && /^\d{4}$/.test(g.num),
    });
    taken.push([start, realEnd]);
  }
  for (const m of text.matchAll(FRACTION_WORDS)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (!free(start, end)) continue;
    const v = FRACTIONS[m[0].toLowerCase().replace(/\s+/g, ' ')];
    out.push({ start, end, text: m[0], value: v, bare: v, scale: 1, scaleWord: '', step: 0, sig: 1, percent: true, money: false, ordinal: false, yearLike: false, words: true });
    taken.push([start, end]);
  }
  for (const m of text.matchAll(NUMBER_WORDS)) {
    const start = m.index!;
    let end = start + m[0].length;
    if (!free(start, end)) continue;
    const v = wordsToNumber(m[0]);
    if (v === null) continue;
    // Phrases where "one" is not a figure.
    const around = text.slice(Math.max(0, start - 6), end + 8).toLowerCase();
    if (/^one$/i.test(m[0]) && /(no one|one another|each one|every one|give one|one or more|one of the)/.test(around)) continue;
    let pct = false;
    const after = text.slice(end).match(/^\s?(%|per ?cent\b|percent\b)/i);
    if (after) { pct = true; end += after[0].length; }
    const words = m[0].toLowerCase().split(/[\s-]+/);
    const last = words.at(-1)!;
    const scale = SCALES[last] && last !== 'hundred' ? SCALES[last] : 1;
    out.push({ start, end, text: text.slice(start, end), value: v, bare: v / scale, scale, scaleWord: scale > 1 ? last : '', step: scale > 1 ? scale : 1, sig: String(v / scale).replace(/0+$/, '').length || 1, percent: pct, money: false, ordinal: false, yearLike: false, words: true });
    taken.push([start, end]);
  }
  for (const m of text.matchAll(ORDINAL_WORDS)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (!free(start, end)) continue;
    // "per second", "a second time": the unit of time, not a rank.
    if (/^second$/i.test(m[0]) && /\b(per|a|each|one|every)\s+$/i.test(text.slice(Math.max(0, start - 8), start))) continue;
    const v = ORDINALS[m[0].toLowerCase()];
    out.push({ start, end, text: m[0], value: v, bare: v, scale: 1, scaleWord: '', step: 1, sig: String(v).length, percent: false, money: false, ordinal: true, yearLike: false, words: true });
    taken.push([start, end]);
  }
  out.sort((a, b) => a.start - b.start);
  // Ranges: "15–20%", "1.2 to 3.4 million", "between 1,000 and 1,800", "from 2 to 3 billion".
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    const gap = text.slice(a.end, b.start);
    if (!/^\s*(–|—|-|to|and)\s*$/i.test(gap)) continue;
    if (/^\s*and\s*$/i.test(gap) && !/between\s*$/i.test(text.slice(Math.max(0, a.start - 10), a.start))) continue;
    if (b.scale > 1 && a.scale === 1 && !a.yearLike) { a.value = a.bare * b.scale; a.scale = b.scale; a.scaleWord = b.scaleWord; a.step *= b.scale; }
    if (b.percent && !a.percent && !a.yearLike) a.percent = true;
    if (b.money && !a.money) a.money = true;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading dates

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = MONTHS.map((m) => `${m}|${m.slice(0, 3)}${m === 'september' ? '|sept' : ''}`).join('|');
const monthNo = (s: string) => String(MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3))) + 1).padStart(2, '0');

export interface DateRef { start: number; end: number; text: string; day?: string; month?: string; year?: number; decade?: number }

/** Every date in a text: days, months, years and decades, with where they are. */
export function readDates(text: string): DateRef[] {
  const out: DateRef[] = [];
  const add = (d: DateRef) => { if (!out.some((o) => d.start < o.end && d.end > o.start)) out.push(d); };
  const pad = (n: string) => n.padStart(2, '0');
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add({ start: m.index!, end: m.index! + m[0].length, text: m[0], day: m[0], year: Number(m[1]) });
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON})\\.?,?\\s+(\\d{4})\\b`, 'gi'))) add({ start: m.index!, end: m.index! + m[0].length, text: m[0], day: `${m[3]}-${monthNo(m[2])}-${pad(m[1])}`, year: Number(m[3]) });
  for (const m of text.matchAll(new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'))) add({ start: m.index!, end: m.index! + m[0].length, text: m[0], day: `${m[3]}-${monthNo(m[1])}-${pad(m[2])}`, year: Number(m[3]) });
  for (const m of text.matchAll(new RegExp(`\\b(${MON})\\.?,?\\s+(\\d{4})\\b`, 'gi'))) add({ start: m.index!, end: m.index! + m[0].length, text: m[0], month: `${m[2]}-${monthNo(m[1])}`, year: Number(m[2]) });
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})\b(?!-)/g)) if (Number(m[2]) >= 1 && Number(m[2]) <= 12) add({ start: m.index!, end: m.index! + m[0].length, text: m[0], month: m[0], year: Number(m[1]) });
  for (const m of text.matchAll(/\b(1[0-9]|20)(\d)0s\b/g)) add({ start: m.index!, end: m.index! + m[0].length, text: m[0], decade: Number(`${m[1]}${m[2]}0`) });
  // Days in a month without the year ("on 31 January") read as the day alone: they need a year nearby to be checked,
  // so they are left to the year next to them.
  return out.sort((a, b) => a.start - b.start);
}

/** The years a period covers at its ends ("2019–2023" → 2019 and 2023). */
export const periodYears = (p?: string): number[] => (p ? [...p.matchAll(/\d{4}/g)].map((m) => Number(m[0])).filter((_y, i, a) => i === 0 || i === a.length - 1) : []);

// ---------------------------------------------------------------------------------------------------------------
// What the facts allow

interface Allowed {
  value: number;
  percent: boolean;
  money: boolean;
  ordinal: boolean;
  /** Words of the unit that must be in the sentence; empty for none. */
  unit: string[][];
  /** Years of the period that must be in the sentence. */
  period: number[];
  fact: Fact;
}

interface AllowedSet {
  numbers: Allowed[];
  years: Set<number>;
  months: Set<string>;
  days: Set<string>;
  places: Set<string>;
  names: string[];
  comparisons: Set<string>;
}

const STOP = new Set(['a', 'an', 'the', 'of', 'per', 'in', 'on', 'at', 'to', 'by', 'for', 'and', 'or', 'its', 'their', 'us', 'from', 'with']);
const SCALE_WORDS = new Set([...Object.keys(SCALES), ...Object.keys(ABBR)]);

/** A unit as the groups of words a sentence must contain: "billion cubic metres a year" → cubic, metres, year. */
function unitWords(unit: string): string[] {
  return unit.toLowerCase().replace(/us\$|\$|%/g, ' ').split(/[^a-z0-9³²]+/).filter((w) => w && !STOP.has(w) && !SCALE_WORDS.has(w) && !/^\d+$/.test(w));
}
const isPercentUnit = (u = '') => /^\s*(%|per ?cent|percent|percentage point)/i.test(u);
const isMoneyUnit = (u = '') => /us\$|\$|dollar/i.test(u);

function allowedFrom(f: FactsFile): AllowedSet {
  const set: AllowedSet = { numbers: [], years: new Set(), months: new Set(), days: new Set(), places: new Set(f.countries ?? []), names: f.names ?? [], comparisons: new Set() };
  const addDate = (s?: string) => {
    if (!s) return;
    for (const y of s.matchAll(/\d{4}(-\d{2}(-\d{2})?)?/g)) {
      const d = y[0];
      set.years.add(Number(d.slice(0, 4)));
      if (d.length >= 7) set.months.add(d.slice(0, 7));
      if (d.length === 10) set.days.add(d);
    }
    // Every year inside a range counts as said ("1999–2001" says 2000 too only if the draft writes the range).
  };
  for (const x of f.facts) {
    for (const p of x.places ?? []) set.places.add(p);
    addDate(x.period);
    addDate(x.date);
    for (const d of readDates(x.statement)) {
      if (d.day) addDate(d.day);
      else if (d.month) addDate(d.month);
    }
    const unitGroups = [unitWords(x.unit ?? ''), ...(x.unitAliases ?? []).map(unitWords)].filter((g, i) => i === 0 || g.length);
    const unit = unitGroups[0].length || (x.unitAliases ?? []).length ? unitGroups : [];
    const period = periodYears(x.period);
    if (x.value !== undefined && x.value !== null) {
      set.numbers.push({ value: x.value, percent: isPercentUnit(x.unit), money: isMoneyUnit(x.unit), ordinal: false, unit, period, fact: x });
      if ((x.unit ?? '').toLowerCase() === 'rank') set.numbers.push({ value: x.value, percent: false, money: false, ordinal: true, unit: [], period, fact: x });
    }
    // Numbers said in the statement itself: years and dates count as dates; a number in words ("the four countries")
    // counts with the word after it as its unit.
    const dates = readDates(x.statement);
    const inName = (q: Quantity) => (f.names ?? []).some((n) => { const i = x.statement.indexOf(n); return i >= 0 && q.start >= i && q.end <= i + n.length; });
    for (const q of readQuantities(x.statement)) {
      if (inName(q) || dates.some((d) => q.start >= d.start && q.end <= d.end)) continue;
      if (q.yearLike) { set.years.add(q.value); continue; }
      if (x.value !== undefined && x.value !== null && Math.abs(q.value - x.value) < 1e-9) continue;
      const next = x.statement.slice(q.end).match(/^\s+([A-Za-z]+)/)?.[1]?.toLowerCase();
      set.numbers.push({ value: q.value, percent: q.percent, money: q.money, ordinal: q.ordinal, unit: next && !STOP.has(next) && !q.ordinal ? [[next]] : [], period, fact: x });
    }
    const lower = x.statement.toLowerCase();
    for (const c of COMPARISONS) if (new RegExp(`\\b${c}\\b`).test(lower)) set.comparisons.add(c);
  }
  return set;
}

/** Numbers in a statement that are neither its value nor a year or date: each should be a fact of its own. */
export function strayNumbers(x: Fact, names: string[] = []): string[] {
  const dates = readDates(x.statement);
  const inName = (q: Quantity) => names.some((n) => { const i = x.statement.indexOf(n); return i >= 0 && q.start >= i && q.end <= i + n.length; });
  return readQuantities(x.statement)
    .filter((q) => !q.words && !q.ordinal && !q.yearLike && !inName(q) && !dates.some((d) => q.start >= d.start && q.end <= d.end))
    .filter((q) => x.value === undefined || x.value === null || !(Math.abs(q.value - x.value) < 1e-9 || Math.abs(q.bare - x.value) < 1e-9))
    .map((q) => q.text);
}

// ---------------------------------------------------------------------------------------------------------------
// Matching

/** Whether a figure as written is the fact's value, exactly or rounded the way it is written. */
export function sameFigure(q: Pick<Quantity, 'value' | 'step' | 'sig'>, factValue: number): boolean {
  const a = Math.abs(q.value);
  const b = Math.abs(factValue);
  const eps = Math.max(1e-9, b * 1e-12);
  if (Math.abs(a - b) <= eps) return true;
  if (q.step <= 0 || q.sig < 2) return false;
  const rounded = Math.round(b / q.step) * q.step;
  return Math.abs(rounded - a) <= Math.max(eps, q.step * 1e-6);
}

const wordIn = (sentence: string, w: string) => {
  const s = sentence.toLowerCase();
  if (w.length <= 3) return new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(s);
  // A word counts with any ending ("uses" for "use", "metres" for "metre"), not as part of another word.
  return new RegExp(`(^|[^a-z])${w.slice(0, Math.max(4, w.length - 2))}[a-z]*`).test(s);
};
const unitIn = (sentence: string, a: Allowed) => !a.unit.length || a.unit.some((g) => g.every((w) => wordIn(sentence, w)));

// ---------------------------------------------------------------------------------------------------------------
// The check

/** Markdown and HTML reduced to the words a reader sees: link targets, tags and table rules go. */
export function plainText(md: string): string {
  return md
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\|/g, ' . ')
    .replace(/\u00a0/g, ' ');
}

/** Sentences, cut at full stops that end one (not "U.S." or "1.2") and at line breaks. */
export function sentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^\n]+?(?:[.!?](?=\s+[A-Z“"‘(]|\s*$)|$)/gm;
  for (const m of text.matchAll(re)) if (m[0].trim()) out.push({ text: m[0], start: m.index! });
  return out;
}

/** The owner's own words in a page, between `<!-- owner -->` and `<!-- /owner -->`. */
export const OWNER_BLOCK = /<!-- owner -->\s*([\s\S]*?)\s*<!-- \/owner -->/g;

/** The owner's words (facts with `owner: true`) must be in the text word for word, each between its markers, and
 *  nothing else may be marked as theirs. */
export function ownerProblems(draft: string, facts: FactsFile): Problem[] {
  const want = facts.facts.filter((f) => f.owner).map((f) => f.statement.trim());
  const have = [...draft.matchAll(OWNER_BLOCK)].map((m) => m[1].trim());
  const out: Problem[] = [];
  for (const w of want) if (!have.includes(w)) out.push({ kind: 'owner', text: w, sentence: w, message: 'The owner’s own words are missing or changed; copy them unchanged between <!-- owner --> and <!-- /owner -->.' });
  for (const h of have) if (!want.includes(h)) out.push({ kind: 'owner', text: h, sentence: h, message: 'Only the owner’s own words, as the facts give them, go between <!-- owner --> and <!-- /owner -->.' });
  return out;
}

/** Checks a draft against its facts file. `ok` only when there is no problem at all. The owner's own words are
 *  compared as they are, not read as a draft. */
export function checkDraft(draft: string, facts: FactsFile): CheckResult {
  const allowed = allowedFrom(facts);
  const problems: Problem[] = ownerProblems(draft, facts);
  const text = stripAccents(plainText(draft.replace(OWNER_BLOCK, '\n'))).replace(/[’‘]/g, "'");
  for (const s of sentences(text)) {
    const st = s.text;
    const dates = readDates(st);
    const sentenceYears = new Set<number>(dates.flatMap((d) => (d.year ? [d.year] : [])));
    // Names the facts allow may carry digits ("CC BY 4.0", "G20"): their figures are part of the name.
    const nameSpans = [...allowed.names].map(stripAccents).flatMap((n) => [...st.matchAll(new RegExp(`(?<![A-Za-z])${escape(n)}(?![A-Za-z])`, 'g'))].map((m) => [m.index!, m.index! + m[0].length] as const));
    const quantities = readQuantities(st).filter((q) => !nameSpans.some(([a, b]) => q.start >= a && q.end <= b));
    for (const q of quantities) if (q.yearLike) sentenceYears.add(q.value);
    const push = (kind: ProblemKind, t: string, message: string) => problems.push({ kind, text: t, sentence: st.trim(), message });

    for (const d of dates) {
      if (d.day && !allowed.days.has(d.day)) push('date', d.text, `The date ${d.text} is not in the facts.`);
      else if (d.month && !allowed.months.has(d.month)) push('date', d.text, `${d.text} is not a month in the facts.`);
      else if (d.decade !== undefined && ![...allowed.years].some((y) => y >= d.decade! && y < d.decade! + 10)) push('date', d.text, `No fact is dated in the ${d.text}.`);
      else if (d.year !== undefined && !allowed.years.has(d.year)) push('date', d.text, `The year ${d.year} is not in the facts.`);
    }
    for (const q of quantities) {
      if (dates.some((d) => q.start >= d.start && q.end <= d.end)) continue;
      if (q.yearLike && allowed.years.has(q.value)) continue;
      const kind = (a: Allowed) => a.percent === q.percent && a.money === q.money && a.ordinal === q.ordinal;
      const same = allowed.numbers.filter((a) => kind(a) && (sameFigure(q, a.value) || (q.scale > 1 && unitStartsWithScale(a.fact.unit, q.scaleWord) && sameFigure({ value: q.bare, step: q.step / q.scale, sig: q.sig }, a.value))));
      if (!same.length) {
        if (q.yearLike) { push('date', q.text, `The year ${q.text} is not in the facts.`); continue; }
        const near = allowed.numbers.filter((a) => sameFigure(q, a.value) || sameFigure({ ...q, step: q.step, sig: 9 }, a.value));
        const why = near.length ? ` It matches "${near[0].fact.id}" only as a ${near[0].percent ? 'percentage' : near[0].money ? 'money figure' : 'plain number'}.` : '';
        const oneFigure = !q.ordinal && q.sig < 2 && allowed.numbers.some((a) => kind(a) && sameFigure({ ...q, sig: 2 }, a.value));
        push('number', q.text, `${q.ordinal ? 'The ordinal' : 'The figure'} "${q.text}" is not in the facts${oneFigure ? ' (a figure rounded to one significant figure is never accepted)' : ''}.${why}`);
        continue;
      }
      const good = same.find((a) => unitIn(st, a) && a.period.every((y) => sentenceYears.has(y) || q.value === y));
      if (!good) {
        const a = same[0];
        const missing = [!unitIn(st, a) ? `its unit (${a.fact.unit || a.unit.map((g) => g.join(' ')).join(' or ')})` : '', a.period.some((y) => !sentenceYears.has(y)) ? `its period (${a.fact.period})` : ''].filter(Boolean).join(' and ');
        push('number', q.text, `"${q.text}" is fact "${a.fact.id}", but ${missing} is not in the same sentence.`);
      }
    }
    // Country names: longest first, each part of the text read once.
    const spans: [number, number][] = [];
    const freeSpan = (a: number, b: number) => !spans.some(([x, y]) => a < y && b > x);
    for (const n of [...NOT_COUNTRIES, ...allowed.names].map(stripAccents).sort((a, b) => b.length - a.length)) {
      for (const m of st.matchAll(new RegExp(`(?<![A-Za-z])${escape(n)}(?![A-Za-z])`, 'g'))) if (freeSpan(m.index!, m.index! + m[0].length)) spans.push([m.index!, m.index! + m[0].length]);
    }
    for (const { name, place } of countryNames()) {
      for (const m of st.matchAll(new RegExp(`(?<![A-Za-z.])${escape(name)}(?![A-Za-z])`, 'g'))) {
        const a = m.index!;
        const b = a + m[0].length;
        if (!freeSpan(a, b)) continue;
        spans.push([a, b]);
        if (place.startsWith('?')) push('country', m[0], `"${m[0]}" could be more than one country; name it in full.`);
        else if (!allowed.places.has(place)) push('country', m[0], `${m[0]} is not a place in the facts.`);
      }
    }
    // A name the facts allow may hold a word the site otherwise leaves out ("critical minerals").
    const lower = [...allowed.names].reduce((s, n) => s.replace(new RegExp(`(?<![a-z])${escape(stripAccents(n).toLowerCase())}(?![a-z])`, 'g'), ' '), st.toLowerCase());
    for (const c of COMPARISONS) if (new RegExp(`\\b${c}\\b`).test(lower) && !allowed.comparisons.has(c)) push('comparison', c, `"${c}" states a comparison no fact makes.`);
    for (const w of STYLE) if (new RegExp(`(^|[^a-z])${escape(w)}([^a-z]|$)`).test(lower)) push('style', w, `"${w}" is not used on the site (forecasts, blame and judging words are left out).`);
    for (const w of SELF_REFERENCE) if (new RegExp(`(^|[^a-z])${escape(w)}([^a-z]|$)`).test(lower)) push('style', w, `"${w}" talks about the drafting material, not the subject; leave it out.`);
  }
  return { ok: problems.length === 0, problems };
}

function unitStartsWithScale(unit = '', scaleWord: string): boolean {
  const first = unit.toLowerCase().trim().split(/\s+/)[0] ?? '';
  const v = SCALES[first] ?? ABBR[first];
  return v !== undefined && v === (SCALES[scaleWord] ?? ABBR[scaleWord]);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The problems as lines for a person or for the redraft prompt. */
export const problemLines = (r: CheckResult) => r.problems.map((p) => `- ${p.message} (in: "${p.sentence.length > 140 ? `${p.sentence.slice(0, 137)}…` : p.sentence}")`);
