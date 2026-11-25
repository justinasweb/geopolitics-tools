// The extras on the food crises views and country pages, from the IPC analyses (../adapters/ipc.ts): each country's
// latest analysis, people by phase, and the countries with people in Phase 5 (catastrophe) in the analyses in force.
import { ipc, isPartial, latestByYear, latestOf, type Analysis } from '../adapters/ipc.ts';
import type { Status } from './tags.ts';
import { formatValue } from './format.ts';
import { data, shared } from './data.ts';
import { HUNGER_TEXT } from '../i18n/hunger.en.ts';

const analyses = shared(ipc);

/** The day "in force" is counted on: the snapshot's. */
export const ipcDay = () => data().snapshot.created.slice(0, 10);

const latest = shared(() => latestOf(analyses() ?? []));
/** Each place's latest analysis, by the start of its period. */
export const latestAnalyses = (): Map<string, Analysis> => latest() ?? new Map();

/** Each place's latest analysis valid on the snapshot's day. */
export const analysesInForce = (): Map<string, Analysis> => latestOf(analyses() ?? [], ipcDay());

const byYear = shared(() => latestByYear(analyses() ?? []));
/** The analysis behind a place's figure in a year on the maps: the latest starting in that year. */
export const analysisIn = (id: string, year: number): Analysis | undefined => byYear()?.[id]?.[year];

/** The analysis's period ended before the snapshot's day (its last month is before the day's). */
export const isEnded = (a: Analysis, day = ipcDay()) => a.to < day.slice(0, 7);

/**
 * A food crisis figure's tags, wherever it is shown (maps, tables, indicator and country pages): Part of country when
 * the analysis covered part of it, and Period ended when it is the place's latest analysis and no longer in force, so
 * a figure the source has not replaced never reads as current. Earlier years' figures are past by their year.
 */
export function foodTags(id: string, year: number): Status[] {
  const a = analysisIn(id, year);
  if (!a) return [];
  return [...(isPartial(a) ? ['partial' as const] : []), ...(latestAnalyses().get(id) === a && isEnded(a) ? ['ended' as const] : [])];
}

const people = (v: number) => formatValue(v, { kind: 'count' });
/** "(of 8.3 m people analysed)" beside a count from an analysis of part of the country; empty otherwise. */
export const ofAnalysed = (a: Analysis) => (isPartial(a) ? ` ${HUNGER_TEXT.ofAnalysed(people(a.analysed))}` : '');
/** The note on a map figure from a partial analysis, or one naming its area: people analysed against IPC's count for
 *  the country, and the area its title names. */
export function analysisNote(a: Analysis): string | null {
  const parts = [isPartial(a) ? HUNGER_TEXT.mapNote(people(a.analysed), people(a.population!)) : '', a.area ? HUNGER_TEXT.area(a.area) : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** Places whose analysis in force counts people in Phase 5, most first. */
export const catastrophe = () => [...analysesInForce().values()].filter((a) => a.phases[4] > 0).sort((a, b) => b.phases[4] - a.phases[4]);

/** An analysis period as words: "Jun–Sep 2026", "Nov 2025 – Feb 2026". */
export function monthSpan(from: string, to: string): string {
  const m = (s: string) => HUNGER_TEXT.months[Number(s.slice(5, 7)) - 1];
  if (from === to) return `${m(from)} ${from.slice(0, 4)}`;
  return from.slice(0, 4) === to.slice(0, 4) ? `${m(from)}–${m(to)} ${to.slice(0, 4)}` : `${m(from)} ${from.slice(0, 4)} – ${m(to)} ${to.slice(0, 4)}`;
}
