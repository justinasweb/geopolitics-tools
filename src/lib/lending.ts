// The extras on the Chinese lending views, from AidData (../adapters/aiddata.ts): each country's
// commitments by kind of flow and its largest projects, and the largest projects overall.
import { lending, type Project } from '../adapters/aiddata.ts';
import { shared } from './data.ts';

const lendingData = shared(lending);

export const lendingOf = () => lendingData();

/** The largest projects anywhere, with their recipient, biggest first. */
export function largestProjects(n: number, group: string | null = null): (Project & { place: string })[] {
  const l = lendingData();
  if (!l) return [];
  return Object.entries(l.top).flatMap(([place, ps]) => ps.map((p) => ({ ...p, place })))
    .filter((p) => !group || p.group === group).sort((a, b) => b.amount - a.amount).slice(0, n);
}
