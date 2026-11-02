// English words for This week (/this-week) and its archive (/this-week/{yyyy}-{ww}). Same rules as pages.en.ts:
// templates take figures already formatted and return plain sentences. Changes are directions, not verdicts ("up 5%
// on August"). IODA states no causes, so outages have none. Sanctions changes are counts of entries added and removed,
// never a judgement of the targets. Phase 5 of the IPC scale is "catastrophic hunger (IPC Phase 5)", never "famine".
// Dates read "21 Oct", times are UTC, and every count gives its period.
import { list } from './pages.en.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (d: string) => ({ y: d.slice(0, 4), m: Number(d.slice(5, 7)) - 1, d: String(Number(d.slice(8, 10))) });

/** "21 Oct"; with `year`, "21 Oct 2026"; `long` gives "21 October 2026". */
export function day(d: string, o: { year?: boolean; long?: boolean } = {}) {
  const p = parts(d);
  return `${p.d} ${(o.long ? LONG : MONTHS)[p.m]}${o.year || o.long ? ` ${p.y}` : ''}`;
}

/** "15–21 Oct 2026", "28 Sep – 4 Oct 2026", "29 Dec 2025 – 4 Jan 2026"; `long` spells the months out; `year: false` drops the year. */
export function range(from: string, to: string, o: { long?: boolean; year?: boolean } = {}) {
  const [a, b] = [parts(from), parts(to)];
  const M = o.long ? LONG : MONTHS;
  const y = o.year === false ? '' : ` ${b.y}`;
  if (from === to) return `${b.d} ${M[b.m]}${y}`;
  if (a.y !== b.y) return o.year === false ? `${a.d} ${M[a.m]} – ${b.d} ${M[b.m]}` : `${a.d} ${M[a.m]} ${a.y} – ${b.d} ${M[b.m]}${y}`;
  if (a.m !== b.m) return `${a.d} ${M[a.m]} – ${b.d} ${M[b.m]}${y}`;
  return `${a.d}–${b.d} ${M[b.m]}${y}`;
}

/** "Sep 2026" or "September 2026" from YYYY-MM; "Aug–Sep 2026" for two months. */
export const month = (m: string, long = false) => `${(long ? LONG : MONTHS)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const monthName = (m: string) => LONG[Number(m.slice(5, 7)) - 1];
export const months = (a: string, b: string) => (a.slice(0, 4) === b.slice(0, 4) ? `${MONTHS[Number(a.slice(5, 7)) - 1]}–${month(b)}` : `${month(a)} – ${month(b)}`);

const MINUS = '−';
/** A change as a signed percentage with one decimal: "+5.0%", "−3.1%", "0.0%". */
export const pct = (c: number) => {
  const v = Math.round(c * 1000) / 10;
  return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(1)}%`;
};
/** A change in whole percent for headlines: "5%". */
const wholePct = (c: number) => `${Math.max(1, Math.round(Math.abs(c) * 100))}%`;
const n = (x: number) => new Intl.NumberFormat('en').format(x);
const s = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;

const HAZARD: Record<string, string> = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', DR: 'Drought', WF: 'Wildfire', VO: 'Volcanic eruption' };
const LEVEL: Record<string, string> = { red: 'Red', orange: 'Orange' };
const LISTS: Record<string, { name: string; sub: string; short: string }> = {
  US: { name: 'United States', sub: 'SDN list and Entity List', short: 'US' },
  EU: { name: 'European Union', sub: 'Financial sanctions file', short: 'EU' },
  UK: { name: 'United Kingdom', sub: 'UK Sanctions List', short: 'UK' },
};

/** The Pink Sheet series on the prices card, with the unit the Pink Sheet prices each in (US dollars). */
export const PRICE_TEXT: Record<string, { name: string; unit: string }> = {
  NGAS_EUR: { name: 'Natural gas, Europe', unit: '$/MMBtu' },
  WHEAT_US_HRW: { name: 'Wheat, US hard red winter', unit: '$/tonne' },
  MAIZE: { name: 'Maize', unit: '$/tonne' },
  RICE_05: { name: 'Rice, Thai 5%', unit: '$/tonne' },
  COPPER: { name: 'Copper', unit: '$/tonne' },
  GOLD: { name: 'Gold', unit: '$/troy oz' },
};

export const WEEK_TEXT = {
  section: 'This week',
  crumb: 'This week',
  title: (r: string) => `This week: ${r}`,
  /** The h1 before its dates, which do not wrap: "This week:", "Week 45:". */
  titleLead: 'This week:',
  archiveLead: (week: number) => `Week ${week}:`,
  archiveTitle: (week: number, r: string) => `Week ${week}: ${r}`,
  lede: 'Disasters, conflict, prices, internet outages and sanctions, from the latest data each source has published.',
  description: (r: string) => `Disaster alerts, conflict events, commodity prices, internet outages and sanctions list changes for ${r}, from the latest official data, with sources and dates.`,
  archiveDescription: (week: number, r: string) => `Week ${week} (${r}) on geopolitics.tools: disaster alerts, conflict events, commodity prices, internet outages and sanctions list changes as they stood when the week closed.`,
  updatedDaily: 'Updated daily',
  lastUpdate: (d: string, t: string) => `Last update ${d}, ${t} UTC`,
  /** An archived week. */
  frozen: (d: string) => `Kept as it stood on ${d}`,
  frozenNote: 'This page keeps the figures as they stood when the week closed. Sources sometimes revise their data later; the maps show the latest.',
  shareText: (r: string) => `This week on geopolitics.tools: ${r}`,
  shareArchive: (week: number, r: string) => `Week ${week} on geopolitics.tools: ${r}`,
  ogKicker: 'This week',
  countsLabel: 'This week in numbers',
  cardsLabel: 'By source',

  counts: {
    disaster: (x: number) => (x === 1 ? 'new disaster alert, orange or red' : 'new disaster alerts, orange and red'),
  },

  kind: { shipping: 'Shipping', disaster: 'Disaster', conflict: 'Conflict', prices: 'Prices', food: 'Food crisis', outage: 'Internet outage', sanctions: 'Sanctions' } as Record<string, string>,
  /** The card's title when it shows the no-new-data state. */
  quietTitle: { shipping: 'Shipping', disaster: 'Disaster alerts', conflict: 'Conflict', prices: 'Commodity prices', food: 'Food crises', outage: 'Internet outages', sanctions: 'Sanctions lists' } as Record<string, string>,
  noNewData: (d: string) => `No new data since ${d}`,
  quiet: {
    disaster: (d: string) => `GDACS has sent no new alert data since ${d}. The disasters map shows the alerts from then.`,
    conflict: (d: string, m: string) => `UCDP has published no new events since ${d}. The latest month is ${m}; the conflict map shows it.`,
    prices: (d: string, m: string) => `The World Bank has published no new monthly prices since ${d}. The latest month is ${m}.`,
    outage: (d: string) => `IODA has sent no new outage data since ${d}. The outages map shows the outages from then.`,
    sanctions: (d: string) => `None of the three lists has changed since ${d}, so no entries were added or removed this week.`,
  } as Record<string, (d: string, m: string) => string>,
  noBaseline: 'No earlier copy to compare yet',
  noBaselineText: 'Entries added and removed are counted against the lists as they stood on the week’s Monday. There is no copy from this Monday yet; one is kept every day from now on.',

  source: {
    disaster: 'GDACS',
    conflict: (preliminary: boolean) => (preliminary ? 'UCDP GED Candidate' : 'UCDP GED'),
    prices: 'World Bank Pink Sheet',
    outage: 'IODA, Georgia Tech',
    sanctions: 'US Consolidated Screening List; EU FSF; UK Sanctions List',
  },
  feedSource: { disaster: 'GDACS', conflict: 'UCDP', prices: 'World Bank', outage: 'IODA' } as Record<string, string>,
  updated: (d: string, t?: string) => `Updated ${d}${t ? `, ${t} UTC` : ''}`,
  monthly: (m: string) => `${m}, monthly averages`,
  lastData: (d: string) => `no new data since ${d}`,
  since: (d: string, to: string) => `${d} – ${to}`,

  go: {
    disaster: 'Open the disasters map', conflict: 'Open the conflict map', outage: 'Open the outages map', sanctions: 'Open the sanctions map',
  } as Record<string, string>,

  // Disasters
  alertsHead: (total: number, red: number) => {
    if (!total) return 'No new orange or red alerts';
    if (red === total) return s(total, 'new red alert', 'new red alerts');
    if (!red) return s(total, 'new orange alert', 'new orange alerts');
    return `${n(total)} new orange and red alerts, ${red === 1 ? 'one of them red' : `${n(red)} of them red`}`;
  },
  level: (l: string) => LEVEL[l] ?? l,
  hazard: (k: string) => HAZARD[k] ?? k,
  /** Places shown in an alert before the rest fold away behind "+ 11 more". */
  placesShown: 3,
  morePlaces: (x: number) => `+ ${n(x)} more`,
  morePlacesLabel: (x: number) => `(${x === 1 ? 'country' : 'countries'})`,
  fewerPlaces: 'Show fewer',
  /** An alert that began before the period and lasted into it. */
  sinceDay: (d: string) => `since ${d}`,
  rose: (level: string) => `Rose to ${(LEVEL[level] ?? level).toLowerCase()} this week`,
  alertsMore: (x: number) => `And ${s(x, 'more alert', 'more alerts')} on the disasters map.`,
  alertsNone: 'GDACS issued no new orange or red alerts this week.',
  alertsRule: 'Counted: alerts that began, or rose to orange or red, this week.',
  alertsRuleNew: 'Counted: alerts that began this week. Earlier alerts that rose to orange or red this week are counted from the first week with a copy of GDACS’s alerts from its Monday.',
  activeTitle: 'Still active',
  activeNote: 'Began before this week and still active; not counted above.',
  activeMore: (x: number) => `And ${s(x, 'more', 'more')} on the disasters map.`,
  alertsKey: 'Levels are GDACS’s own: red, the highest, is a solid triangle; orange is an outline.',

  // Conflict
  conflictHead: (top: string, ups: string[], prev: string, latest: string) =>
    ups.length ? `Most events in ${top}; ${list(ups)} up on ${prev}` : `Most events in ${top} in ${latest}`,
  conflictNone: (m: string) => `UCDP recorded no events in ${m}.`,
  conflictLabel: (a: string, b: string) => `Events of organised violence, ${a} and ${b}`,
  conflictKey: (b: string, a: string) => `Events in ${b}, change on ${a}`,
  conflictCaption: (total: string, m: string) => `${total} events in ${m} in every country UCDP covers.`,
  // Prices
  pricesHead: (up: { name: string; c: number } | null, down: { name: string; c: number } | null, m: string) => {
    if (up && down) return `${up.name} up ${wholePct(up.c)} on the month, ${down.name[0].toLowerCase()}${down.name.slice(1)} down ${wholePct(down.c)}`;
    if (up) return `${up.name} up ${wholePct(up.c)} on the month`;
    if (down) return `${down.name} down ${wholePct(down.c)} on the month`;
    return `Commodity prices for ${m}`;
  },
  pricesCols: { name: 'Commodity', month: 'Month', year: 'Year' },
  pricesCaption: 'Change on the month before and on the same month a year earlier. Monthly averages in US dollars.',
  // Outages
  outagesHead: (x: number) => (x ? s(x, 'national-scale internet outage', 'national-scale internet outages') : 'No national-scale internet outages recorded'),
  outagesCols: { place: 'Country', began: 'Began', length: 'Length' },
  hours: (h: number) => (h < 1 ? 'under 1 h' : `${n(Math.round(h))} h`),
  outagesNone: 'IODA recorded no country-level outages that began this week.',
  outagesNote: 'IODA reports when an outage began and how long it lasted, not why.',
  // Sanctions
  sanctionsHead: (added: number, removed: number, lists: string[]) => {
    const names = list(lists);
    if (added) return `${s(added, 'entry', 'entries')} added to ${names} sanctions lists`;
    if (removed) return `${s(removed, 'entry', 'entries')} removed from ${names} sanctions lists`;
    return `No entries added to or removed from ${names} sanctions lists`;
  },
  sanctionsCols: { list: 'List', added: 'Added', removed: 'Removed' },
  list: (l: string) => LISTS[l] ?? { name: l, sub: '', short: l },
  sanctionsPlaces: (items: string[]) => `Entries added most often give an address or nationality in ${list(items)}.`,
  sanctionsEntry: 'An entry is a person, company, vessel or aircraft. Counts say how many entries changed, not what the measures do.',
  sanctionsSince: (d: string) => `Compared with the lists as they stood on ${d}.`,

  // Latest feed
  feedTitle: 'Latest',
  feedSub: 'Newest first, from all sources on this page.',
  feedArchiveSub: 'Newest first, from the sources on this page, in this week.',
  feedFilter: 'Show',
  feedAll: 'All',
  feedKinds: { disaster: 'Disasters', shipping: 'Shipping', conflict: 'Conflict', outage: 'Outages', food: 'Food crises', sanctions: 'Sanctions', prices: 'Prices' } as Record<string, string>,
  feedMore: 'Show older items',
  feedEmpty: 'Nothing new from these sources in this period.',
  feedItem: {
    disaster: (level: string, kind: string, places: string[]) => `${LEVEL[level] ?? level} alert: ${(HAZARD[kind] ?? kind).toLowerCase()}${places.length ? `, ${places.length > 3 ? `${places.slice(0, 3).join(', ')} and ${n(places.length - 3)} more` : list(places)}` : ''}`,
    outage: (place: string, hours: string) => `Internet outage began in ${place}, lasting ${hours}`,
    conflict: (m: string) => `Conflict events for ${m} published`,
    prices: (m: string) => `Commodity prices for ${m} published`,
  },

  // Week navigation
  navLabel: 'Earlier weeks',
  week: (x: number) => `Week ${x}`,
  pick: 'Go to a week',
  pickOption: (x: number, r: string) => `Week ${x} · ${r}`,
  pickLive: (r: string) => `This week · ${r}`,
  keptAt: 'Each week is kept at',
  newer: 'Back to this week',

  // The week in brief (AI summary, approved by the editor; a later task fills it)
  summaryTitle: 'The week in brief',
  aiLabel: 'Drafted with AI from this week’s data and reviewed by the editor',
  aiShort: 'Drafted with AI, reviewed by the editor',
  summaryWeek: (x: number, r: string) => `Week ${x}, ${r}`,
  approved: (d: string) => `Approved ${d}`,
  howMade: 'How this summary is made',
};
