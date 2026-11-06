// Site search's matching, shared by the browser (src/scripts/search.ts) and the tests, so it imports nothing from the
// build. The index (src/lib/search.ts, served at /search-index.json) lists every live page with its name, other
// names and codes. A query matches a page when its words start words of the name or of another name; a code (ISO
// "DE", "DEU") matches only when typed whole. With no match, the nearest name within a typo or two is offered
// ("indai" → India) and its results shown.

/** The index as served: compact, one array per page. */
export interface WireIndex {
  /** Group ids, in their tie-break order. */
  g: string[];
  /** [name, group index, line under it, path, other names ("|"-separated), codes (" "-separated), extra]. Extra is
   *  a country's place id, or a bloc's member ids (" "-separated). */
  e: [string, number, string, string, string, string, string][];
  /** Suggestions for the empty state: [label, path]. */
  t: [string, string][];
}

export interface Entry {
  name: string;
  group: string;
  rank: number;
  detail: string;
  path: string;
  aliases: string[];
  codes: string[];
  /** A country's place id. */
  id?: string;
  /** A bloc's member ids. */
  members?: string[];
  /** Folded name and other names, for matching. */
  fields: string[];
}

export interface Index { groups: string[]; entries: Entry[]; suggestions: { label: string; path: string }[] }

export function decode(w: WireIndex): Index {
  const entries = w.e.map(([name, g, detail, path, aliases, codes, extra]): Entry => {
    const group = w.g[g];
    const al = aliases ? aliases.split('|') : [];
    return {
      name, group, rank: g, detail, path, aliases: al, codes: codes ? codes.toLowerCase().split(' ') : [],
      ...(group === 'countries' && extra ? { id: extra } : {}),
      ...(group === 'blocs' && extra ? { members: extra.split(' ') } : {}),
      fields: [name, ...al].map(fold),
    };
  });
  return { groups: w.g, entries, suggestions: w.t.map(([label, path]) => ({ label, path })) };
}

/** Lower case, accents and apostrophes dropped, everything else that is not a letter or digit a single space:
 *  "Côte d’Ivoire" → "cote divoire". `map[i]` is the index in `s` of the folded text's character i. */
export function foldMap(s: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/['’`]/.test(c)) continue;
    const f = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const ch of f) {
      if (/[\p{L}\p{N}]/u.test(ch)) { text += ch; map.push(i); }
      else if (text && !text.endsWith(' ')) { text += ' '; map.push(i); }
    }
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); map.pop(); }
  return { text, map };
}
export const fold = (s: string) => foldMap(s).text;

const words = (f: string) => f.split(' ');
const isPrefixOfWord = (t: string, ws: string[]) => ws.some((w) => w.startsWith(t));

/** How well a query matches a page, 0 for not at all. Its name counts for more than its other names. */
export function score(e: Entry, q: string, tokens: string[]): number {
  if (!q) return 0;
  let best = e.codes.includes(q) ? 95 : 0;
  const all: string[] = [];
  e.fields.forEach((f, i) => {
    const ws = words(f);
    all.push(...ws);
    const alias = i > 0 ? 5 : 0;
    let s = 0;
    if (f === q) s = 100;
    else if (f.startsWith(q)) s = 90;
    // One or two letters find only names that start with them: "us" is not every page with "use" in its name.
    else if (q.length <= 2) s = 0;
    else if (tokens.every((t) => isPrefixOfWord(t, ws))) s = ws[0].startsWith(tokens[0]) ? 75 : 70;
    else if (q.length >= 4 && f.includes(q)) s = 40;
    if (s) best = Math.max(best, s - alias);
  });
  // Words found across the name and the other names together: "nato history", "china united states".
  if (!best && tokens.length > 1 && tokens.every((t) => t.length > 1) && tokens.every((t) => isPrefixOfWord(t, all) || e.codes.includes(t))) best = 50;
  return best;
}

export interface Group { id: string; entries: Entry[]; total: number }
export interface Result {
  groups: Group[];
  /** All matching pages, before each group is cut to its best few. */
  total: number;
  /** The name searched for instead, when what was typed matched nothing. */
  corrected?: string;
  /** When several words matched nothing together: the words that match on their own, searched instead (the page's own
   *  name when they are its name: "ukraine war" → Ukraine). */
  partial?: string;
}

/** Results for a query, grouped: the group with the best match first, then the fixed order. Each group shows its best
 *  `perGroup` (more when only one group matches). When the top result is a country typed in full, the blocs it is a
 *  member of follow. With no match, the words that match on their own are searched (several words), then the nearest
 *  name (a typo). */
export function search(index: Index, typed: string, perGroup = 5, memberLine?: (country: string) => string): Result {
  const q = fold(typed);
  if (!q) return { groups: [], total: 0 };
  let res = run(index, q, perGroup, memberLine);
  // Several words that match nothing together: search again with the words that match on their own, or, when those
  // match nothing together either ("germany lithium"), with the first of them.
  const tokens = words(q);
  if (!res.total && tokens.length > 1) {
    const kept = tokens.filter((t) => run(index, t, perGroup).total > 0);
    for (const k of kept.length ? [kept.join(' '), kept[0]] : []) {
      const again = run(index, k, perGroup, memberLine);
      const top = again.groups[0]?.entries[0];
      if (again.total) return { ...again, partial: top && top.fields.includes(k) ? top.name : k };
    }
  }
  if (!res.total && q.length >= 3) {
    const near = nearest(index, q);
    if (near) res = { ...run(index, fold(near), perGroup, memberLine), corrected: near };
  }
  return res;
}

function run(index: Index, q: string, perGroup: number, memberLine?: (country: string) => string): Result {
  const tokens = words(q);
  const hits = index.entries.map((e, i) => ({ e, i, s: score(e, q, tokens) })).filter((h) => h.s > 0)
    .sort((a, b) => b.s - a.s || a.e.rank - b.e.rank || a.i - b.i);
  const by = new Map<string, { e: Entry; s: number }[]>();
  for (const h of hits) {
    const list = by.get(h.e.group) ?? [];
    list.push(h);
    by.set(h.e.group, list);
  }
  // The blocs follow a country only when it is clearly what was typed: no other page matches as well.
  const top = hits[0];
  if (memberLine && top?.e.id && top.s >= 90 && !hits.slice(1).some((h) => h.s >= top.s)) {
    const id = top.e.id;
    const blocs = by.get('blocs') ?? [];
    const extra = index.entries.filter((e) => e.members?.includes(id) && !blocs.some((b) => b.e === e))
      .map((e) => ({ e: { ...e, detail: memberLine(top.e.name) }, s: 1 }));
    if (extra.length) by.set('blocs', [...blocs, ...extra]);
  }
  const order = [...by.keys()].sort((a, b) => by.get(b)![0].s - by.get(a)![0].s || index.groups.indexOf(a) - index.groups.indexOf(b));
  const n = order.length === 1 ? perGroup * 2 + 2 : perGroup;
  const groups = order.map((id) => ({ id, entries: by.get(id)!.slice(0, n).map((h) => h.e), total: by.get(id)!.length }));
  return { groups, total: groups.reduce((t, g) => t + g.total, 0) };
}

/** The page name nearest to what was typed, by its name or another name, within a typo or two (one for short words).
 *  The page's own name is returned, never the other name ("Zaire" finds Democratic Republic of the Congo). */
export function nearest(index: Index, q: string): string | undefined {
  const limit = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best: { d: number; name: string } | undefined;
  for (const e of index.entries) {
    for (const f of e.fields) {
      // The whole name, and each word of it on its own ("germny" → Germany, "brazl" → Brazil).
      for (const cand of [f, ...(words(f).length > 1 && !q.includes(' ') ? words(f).filter((w) => w.length >= 4) : [])]) {
        if (Math.abs(cand.length - q.length) > limit) continue;
        const d = distance(q, cand, limit);
        if (d <= limit && (!best || d < best.d)) best = { d, name: e.name };
      }
    }
  }
  return best?.name;
}

/** Edit distance with swapped neighbours counting as one edit (optimal string alignment), giving up past `max`. */
export function distance(a: string, b: string, max = Infinity): number {
  const m = a.length, n = b.length;
  let prev2: number[] = [], prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      low = Math.min(low, v);
    }
    if (low > max) return low;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Where to mark the typed words in a name: [start, end) ranges in the name as written. */
export function marks(name: string, typed: string): [number, number][] {
  const { text, map } = foldMap(name);
  const out: [number, number][] = [];
  for (const t of words(fold(typed))) {
    if (!t) continue;
    let at = -1;
    for (let k = text.indexOf(t); k > -1; k = text.indexOf(t, k + 1)) if (k === 0 || text[k - 1] === ' ') { at = k; break; }
    if (at < 0) continue;
    const end = at + t.length - 1;
    out.push([map[at], map[end] + 1]);
  }
  return out.sort((a, b) => a[0] - b[0]).filter((r, i, all) => i === 0 || r[0] >= all[i - 1][1]);
}
