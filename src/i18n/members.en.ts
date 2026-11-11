// How the site says who a grouping's members are. Two rules, each with one template so every page says it the same
// way (decided 2 Nov 2026, docs/open-questions.md):
//
// - A bloc's share counts its members today, for every year a map or page shows: `todaysMembers` ("today's OPEC
//   members"). tests/unit/bloc-lines.test.ts checks every share sentence uses it.
// - Some groupings list members that are not countries (the European Union and the African Union in the G20; the EU
//   in the G7, as a non-enumerated member). The map, the counts and every share are of the countries only, so a
//   count says so: `membersText` ("19 countries, plus the European Union and, since 2023, the African Union").
//   tests/unit/bloc-members.test.ts checks the pages that give a count.
// - A grouping that lists a member which has not confirmed it (Saudi Arabia in BRICS) says so with every count:
//   `membersText` ("11 members, including Saudi Arabia, which has not confirmed it"), and the grouping "lists" them
//   (`countSentence`) rather than "has" them.

/** Groupings whose name already ends in "members", said the other way round. */
const MEMBERS_OF: Record<string, string> = { 'UN Security Council, permanent members': 'permanent members of the UN Security Council' };

export interface OtherMember {
  name: string;
  /** The year it joined, when later than the grouping's start. */
  since?: number;
  /** Takes part without being counted among the members (the EU in the G7). */
  nonEnumerated?: boolean;
}

/** Members that are not countries, by grouping id, with the grouping's name as BLOC_TEXT gives it. */
export const NON_COUNTRY_MEMBERS: Record<string, { bloc: string; others: OtherMember[] }> = {
  g20: { bloc: 'G20', others: [{ name: 'the European Union' }, { name: 'the African Union', since: 2023 }] },
  g7: { bloc: 'G7', others: [{ name: 'the European Union', since: 1977, nonEnumerated: true }] },
};

/** Members a grouping lists that have not confirmed it, by grouping id, with the year the grouping lists them from. */
export const UNCONFIRMED: Record<string, { id: string; name: string; from: number }[]> = {
  brics: [{ id: 'SAU', name: 'Saudi Arabia', from: 2024 }],
};

/** The groupings whose counts carry a note: members that are not countries, or members that have not confirmed it. */
export const COUNT_NOTED = [...Object.keys(NON_COUNTRY_MEMBERS), ...Object.keys(UNCONFIRMED)];

/** "including Saudi Arabia, which has not confirmed it", for the membership as it stood in `year` (now when none);
 *  empty when every member has confirmed. */
export function unconfirmedText(id: string, year?: number): string {
  const u = (UNCONFIRMED[id] ?? []).filter((m) => year === undefined || m.from <= year).map((m) => m.name);
  if (!u.length) return '';
  return `including ${u.length === 1 ? u[0] : `${u.slice(0, -1).join(', ')} and ${u.at(-1)}`}, which ${u.length === 1 ? 'has' : 'have'} not confirmed it`;
}

const hasOthers = (blocName: string) => Object.values(NON_COUNTRY_MEMBERS).some((x) => x.bloc === blocName);

/** "today’s OPEC members"; "Today’s OPEC members" at the start of a sentence; "today’s 11 OPEC members" with a count.
 *  A grouping with members that are not countries says "member countries": its shares are of its countries. */
export function todaysMembers(bloc: string, o: { start?: boolean; count?: number } = {}): string {
  const today = o.start ? 'Today’s' : 'today’s';
  const n = o.count !== undefined ? `${o.count} ` : '';
  return `${today} ${n}${MEMBERS_OF[bloc] ?? `${bloc} ${hasOthers(bloc) ? 'member countries' : 'members'}`}`;
}

/** The members that are not countries, as they stood in `year` (now when no year is given). */
export const otherMembers = (id: string, year?: number): OtherMember[] =>
  (NON_COUNTRY_MEMBERS[id]?.others ?? []).filter((o) => year === undefined || !o.since || o.since <= year);

/** What follows the count of countries: "plus the European Union and, since 2023, the African Union"; "with the
 *  European Union taking part as a non-enumerated member since 1977". Empty when there are none. */
export function othersText(id: string, year?: number): string {
  const all = otherMembers(id, year);
  const counted = all.filter((o) => !o.nonEnumerated);
  const since = (o: OtherMember) => (o.since ? `, since ${o.since}, ` : ' ');
  const parts: string[] = [];
  if (counted.length) parts.push(`plus ${counted.map((o, i) => (i === 0 ? o.name : `and${since(o)}${o.name}`)).join(counted.length > 2 ? ', ' : ' ')}`);
  for (const o of all.filter((x) => x.nonEnumerated)) parts.push(`with ${o.name} taking part as a non-enumerated member${o.since ? ` since ${o.since}` : ''}`);
  return parts.join('; ');
}

/** A grouping's members, counted: "11 members"; "19 countries, plus the European Union and, since 2023, the African
 *  Union". `n` is the number of countries; `year` gives the membership as it stood then. */
export function membersText(id: string, n: number, year?: number): string {
  const u = unconfirmedText(id, year);
  if (!NON_COUNTRY_MEMBERS[id]) return `${n} member${n === 1 ? '' : 's'}${u ? `, ${u}` : ''}`;
  const rest = othersText(id, year);
  return `${n} countr${n === 1 ? 'y' : 'ies'}${rest ? `, ${rest}` : ''}`;
}

/** The count as a sentence's start: "NATO has 32 members"; "BRICS lists 11 members, including Saudi Arabia, which
 *  has not confirmed it". `past` for a year gone by ("had", "listed"). */
export function countSentence(id: string, bloc: string, n: number, o: { year?: number; past?: boolean } = {}): string {
  const lists = Boolean(unconfirmedText(id, o.year));
  const verb = lists ? (o.past ? 'listed' : 'lists') : (o.past ? 'had' : 'has');
  return `${bloc} ${verb} ${membersText(id, n, o.year)}`;
}

/** Under the count, for a grouping with members that are not countries: what the map outlines. */
export function mapNote(id: string, n: number, year?: number): string {
  const names = otherMembers(id, year).map((o) => o.name);
  if (!names.length) return '';
  const one = names.length === 1;
  const who = one ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `The map outlines the ${n} countries; ${who} ${one ? 'is not a country' : 'are not countries'}, so ${one ? 'it is' : 'they are'} not on it.`;
}
