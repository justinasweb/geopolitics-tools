// IPC and Cadre Harmonisé acute food insecurity analyses (ipc/country.json, from pipeline/sources/ipc.ts; the
// prototype's sample has the same name and format). Countries are named by ISO2 code. Each analysis covers part of
// a country's people (the population analysed) for a period (`from`–`to`, months), and counts the people in each
// phase: 1 minimal, 2 stressed, 3 crisis, 4 emergency, 5 catastrophe. Phase 3 or above is "in food crisis".
// Phase 5 counts people in catastrophe; famine is a classification of an area, which this endpoint does not give.
import { type Raw, type Series, matcher, num, put } from './core.ts';

type Row = Record<string, string | number | null>;

export interface Analysis {
  id: number;
  place: string;
  title: string;
  /** IPC or CH (Cadre Harmonisé, West Africa and the Sahel). */
  system: string;
  /** YYYY-MM. */
  from: string;
  to: string;
  analysed: number;
  phases: [number, number, number, number, number];
  crisis: number;
  /** Phase 3 or above as a share of the population analysed. */
  share: number | null;
}

export function parseIpc(rows: Row[]): Analysis[] {
  const m = matcher('ipc', 'iso2');
  const out: Analysis[] = [];
  for (const r of rows) {
    if (r.condition && r.condition !== 'A') continue;
    const place = m.match(String(r.country ?? ''));
    const from = String(r.from ?? '');
    if (!place || !/^\d{4}-\d{2}/.test(from)) continue;
    const ph = [1, 2, 3, 4, 5].map((k) => num(r[`phase${k}_population`]) ?? 0) as Analysis['phases'];
    const crisis = num(r.phase3plus_population) ?? ph[2] + ph[3] + ph[4];
    const analysed = num(r.estimated_population) ?? 0;
    out.push({
      id: Number(r.anl_id), place, title: String(r.title ?? ''), system: String(r.system ?? 'IPC'), from: from.slice(0, 7), to: String(r.to ?? from).slice(0, 7),
      analysed, phases: ph, crisis, share: num(r.phase3plus_percentage) ?? (analysed ? crisis / analysed : null),
    });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.id - b.id));
}

export const ipc = (raw: Raw) => parseIpc(raw.json<Row[]>('ipc', 'country.json'));

/** The latest analysis of each place starting in each year. */
export function latestByYear(list: Analysis[]): Record<string, Record<number, Analysis>> {
  const out: Record<string, Record<number, Analysis>> = {};
  for (const a of list) (out[a.place] ??= {})[Number(a.from.slice(0, 4))] = a;
  return out;
}

/** People in Phase 3 or above, or their share of the population analysed, by place and year (the year's latest analysis). */
export function hungerSeries(list: Analysis[], measure: 'people' | 'share'): Series {
  const out: Series = {};
  for (const [id, years] of Object.entries(latestByYear(list))) {
    for (const [y, a] of Object.entries(years)) put(out, id, Number(y), measure === 'people' ? a.crisis : a.share);
  }
  return out;
}
