// Who a bloc's share counts: its members today, for every year a map or page shows (decided 2 Nov 2026,
// docs/open-questions.md). Every sentence that states a bloc's share, total or coverage builds its subject with
// `todaysMembers`, so they all say "today's" the same way; tests/unit/bloc-lines.test.ts checks it.

/** Groupings whose name already ends in "members", said the other way round. */
const MEMBERS_OF: Record<string, string> = { 'UN Security Council, permanent members': 'permanent members of the UN Security Council' };

/** "today’s OPEC members"; "Today’s OPEC members" at the start of a sentence; "today’s 11 OPEC members" with a count. */
export function todaysMembers(bloc: string, o: { start?: boolean; count?: number } = {}): string {
  const today = o.start ? 'Today’s' : 'today’s';
  const n = o.count !== undefined ? `${o.count} ` : '';
  return `${today} ${n}${MEMBERS_OF[bloc] ?? `${bloc} members`}`;
}
