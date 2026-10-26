// The extras on the food crises views, from the IPC analyses (../adapters/ipc.ts): each country's latest analysis,
// people by phase, and the countries with people in Phase 5 (catastrophe).
import { ipc, type Analysis } from '../adapters/ipc.ts';
import { shared } from './data.ts';
import { HUNGER_TEXT } from '../i18n/hunger.en.ts';

const analyses = shared(ipc);

/** Each place's latest analysis, by the start of its period. */
export function latestAnalyses(): Map<string, Analysis> {
  const out = new Map<string, Analysis>();
  for (const a of analyses() ?? []) out.set(a.place, a);
  return out;
}

/** Places whose latest analysis counts people in Phase 5, most first. */
export const catastrophe = () => [...latestAnalyses().values()].filter((a) => a.phases[4] > 0).sort((a, b) => b.phases[4] - a.phases[4]);

/** An analysis period as words: "Jun–Sep 2026", "Nov 2025 – Feb 2026". */
export function monthSpan(from: string, to: string): string {
  const m = (s: string) => HUNGER_TEXT.months[Number(s.slice(5, 7)) - 1];
  return from.slice(0, 4) === to.slice(0, 4) ? `${m(from)}–${m(to)} ${to.slice(0, 4)}` : `${m(from)} ${from.slice(0, 4)} – ${m(to)} ${to.slice(0, 4)}`;
}
