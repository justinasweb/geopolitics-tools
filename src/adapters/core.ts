// What every adapter shares: reading a snapshot's raw files, the series shape the indicator
// registry uses, and one place collecting what each source's codes failed to match, so the build
// prints it (territories policy, section 5: "each adapter reports anything unmatched").
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Matcher, type System } from '../lib/places.ts';

/** Values by internal place id and year. */
export type Series = Record<string, Record<number, number>>;

/** A snapshot's raw files, as pipeline/pull.ts unpacks them: <dir>/<source>/<file>. */
export interface Raw {
  has(source: string, file: string): boolean;
  text(source: string, file: string): string;
  json<T = unknown>(source: string, file: string): T;
}

/** `folders` maps source ids to other folder names (the prototype's samples use its own names). */
export function rawDir(dir: string, folders: Record<string, string> = {}): Raw {
  const path = (s: string, f: string) => join(dir, folders[s] ?? s, f);
  const text = (s: string, f: string) => {
    if (!existsSync(path(s, f))) throw new Error(`${s}/${f} is not in the snapshot at ${dir}`);
    return readFileSync(path(s, f), 'utf8');
  };
  return { has: (s, f) => existsSync(path(s, f)), text, json: <T>(s: string, f: string) => JSON.parse(text(s, f)) as T };
}

const matchers = new Map<string, Matcher>();

/** The matcher for a source's codes; one per source and kind of code, so its report covers every file. */
export function matcher(source: string, system: System): Matcher {
  const k = `${source}:${system}`;
  let m = matchers.get(k);
  if (!m) matchers.set(k, (m = new Matcher(source, system)));
  return m;
}

/** Every matcher's report, for the build log. */
export const matchReports = () => [...matchers.values()].map((m) => m.report());
export const resetMatchers = () => matchers.clear();

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function put(s: Series, id: string, year: number, v: number | null, add = false) {
  if (v === null) return;
  const row = (s[id] ??= {});
  row[year] = add ? (row[year] ?? 0) + v : v;
}

/** Years present in a series, oldest first. */
export const yearsOf = (s: Series) => [...new Set(Object.values(s).flatMap((y) => Object.keys(y).map(Number)))].sort((a, b) => a - b);

/** a ⊕ b per place and year, where both have a value. */
export function combine(a: Series, b: Series, f: (x: number, y: number) => number | null): Series {
  const out: Series = {};
  for (const [id, ys] of Object.entries(a)) {
    for (const [y, v] of Object.entries(ys)) {
      const w = b[id]?.[Number(y)];
      if (w === undefined) continue;
      const r = f(v, w);
      if (r !== null && Number.isFinite(r)) put(out, id, Number(y), r);
    }
  }
  return out;
}
