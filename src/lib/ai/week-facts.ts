// This week's summary (spec, D15; "The week in brief"): the facts a closed week's summary is drafted from, made from
// the same frozen week file the archive page's cards are built from (data/raw/weeks/<id>.json, pipeline/lib/weeks.ts),
// so the summary can say nothing the cards do not show. Every fact gives its source, a link and the day the source's
// data last changed. The words for hazards, prices and lists are the cards' own (src/i18n/week.en.ts).
//
// A source whose licence is withheld (src/data/licences.ts) gives no counts, levels or lengths, as on its card: only
// its events, by kind, country and date. The Telegram digest keeps its counts (weekCounts).
//
// The checker wants every figure's period in the same sentence, so figures that cover the week itself carry no period
// (the subject and the first fact say which week it is), and monthly figures (conflict, prices) carry their month. An
// alert that began before the week and rose in it says so, with the day GDACS began tracking it as its period, so its
// start date never reads as the week's news. Sanctions lists compared with the week's Monday carry no dates either;
// only a copy from another day gives "since" that day.
import { inSentence, list } from '../../i18n/pages.en.ts';
import { LIST_NAMES, PRICE_TEXT, WEEK_TEXT as W, day, month } from '../../i18n/week.en.ts';
import { place } from '../places.ts';
import { hasFigures, type AlertItem, type Card, type SanctionsCard, type WeekData } from '../week/model.ts';
import { addDays, weekNumber, weekRange } from '../week/period.ts';
import type { Fact, FactsFile } from './facts.ts';
import { withheld } from '../../data/licences.ts';

/** Where each source's data can be checked. */
export const WEEK_LINKS: Record<string, string> = {
  disaster: 'https://www.gdacs.org/',
  conflict: 'https://ucdp.uu.se/downloads/',
  prices: 'https://www.worldbank.org/en/research/commodity-markets',
  outage: 'https://ioda.inetintel.cc.gatech.edu/',
  US: 'https://www.trade.gov/consolidated-screening-list',
  EU: 'https://webgate.ec.europa.eu/fsd/fsf',
  UK: 'https://www.gov.uk/government/publications/the-uk-sanctions-list',
};
/** The country a sanctions list is named after (the EU is an organisation, not a place). */
const LIST_PLACE: Record<string, string | undefined> = { US: 'USA', UK: 'GBR' };
/** Names the summary may use that the checker would otherwise read as a figure or a country ("Thai 5%", "US hard red
 *  winter"): the sources, the lists and the price series. */
const NAMES = ['GDACS', 'UCDP', 'IODA', 'Pink Sheet', 'SDN', 'Entity List', 'UK Sanctions List', 'Consolidated Screening List', 'Rice, Thai 5%', 'Thai 5%', 'Thai rice with 5% broken grains', 'US hard red winter', 'million British thermal units', 'Specially Designated Nationals', 'consolidated financial sanctions list'];
/** At most this many alerts and outages are listed one by one; the counts cover them all. */
export const WEEK_ITEMS = 8;

const long = (d: string) => day(d.slice(0, 10), { long: true });
/** A place's name inside a sentence: "the Philippines", "Brazil". */
const nameOf = (id: string) => inSentence(place(id)?.name ?? id);
const known = (ids: string[]) => ids.filter((p) => place(p) && place(p)!.kind !== 'other');
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
/** A change as words: "up 4.5%", "down 2%", "unchanged". */
const change = (c: number) => (c > 0 ? `up ${c}%` : c < 0 ? `down ${Math.abs(c)}%` : 'unchanged');
/** A count in a statement: "no" for none, so the draft can say "no new alerts". */
const count = (n: number) => (n === 0 ? 'no' : String(n));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** A month as the checker reads it: "October 2026". */
const monthLong = (m: string) => month(m, true);
/** "a drought", "an earthquake", "an orange alert". */
const a = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

/** One alert as what happened in the week: issued in it, or raised in it and tracked since an earlier day. `level`
 *  leaves the level out (a withheld source). */
function alertStatement(x: AlertItem, places: string[], level: boolean): string {
  const what = W.hazard(x.type).toLowerCase();
  const where = places.length ? ` in ${list(places.map(nameOf))}` : '';
  const lv = W.level(x.level).toLowerCase();
  if (x.rose) return `GDACS raised its alert for ${a(what)}${where}${level ? ` to ${lv}` : ''} in the week; GDACS has tracked this ${what} since ${long(x.from)}.`;
  return `GDACS issued ${a(level ? `${lv} alert` : 'alert')} for ${a(what)}${where}, from ${long(x.from)}.`;
}

/** The facts a week's summary is drafted from. `id` is the ISO week ("2026-45"); `out` says which sources are withheld. */
export function weekFacts(id: string, w: WeekData, out: (source: string) => boolean = withheld): FactsFile {
  const { from, to } = weekRange(id);
  const n = weekNumber(id);
  const year = Number(id.slice(0, 4));
  const facts: Fact[] = [{
    id: 'week', statement: `This summary covers ISO week ${n} of ${year}, from ${long(from)} to ${long(to)}.`,
    value: n, unit: 'week', source: 'geopolitics.tools, This week', link: `https://geopolitics.tools/this-week/${id}`, date: w.made.slice(0, 10),
  }];
  for (const c of w.cards) if (hasFigures(c)) facts.push(...cardFacts(c, from, out));
  return {
    id: `week:${id}`, kind: 'week', subject: `week ${n} of ${year} (${long(from)} to ${long(to)})`,
    countries: [], names: NAMES,
    generated: `scripts/week.ts, from the frozen week ${id} (data/raw/weeks/${id}.json, made ${w.made})`, facts,
  };
}

function cardFacts(c: Card, weekStart: string, isWithheld: (source: string) => boolean): Fact[] {
  const date = c.src.changed.slice(0, 10);
  switch (c.kind) {
    case 'disaster': {
      const src = { source: 'GDACS', link: WEEK_LINKS.disaster, date };
      if (isWithheld('gdacs')) {
        return c.alerts.slice(0, WEEK_ITEMS).map((x, i): Fact => {
          const places = known(x.places);
          return { id: `alert-${i + 1}`, period: x.from.slice(0, 10), places, ...src, statement: alertStatement(x, places, false) };
        });
      }
      const red = c.alerts.filter((a) => a.level === 'red').length;
      const out: Fact[] = [
        { id: 'alerts', statement: `GDACS issued ${count(c.alerts.length)} new orange or red disaster ${plural(c.alerts.length, 'alert', 'alerts')} in the week: alerts that began, or rose to orange or red, in the week.`, value: c.alerts.length, unit: 'alerts', ...src },
      ];
      if (c.alerts.length) out.push({ id: 'alerts-red', statement: `${red === 0 ? 'None' : red} of the week's new GDACS alerts ${plural(red, 'was', 'were')} red, the highest of GDACS's levels.`, value: red, unit: 'red alerts', unitAliases: ['red'], ...src });
      for (const [i, x] of c.alerts.slice(0, WEEK_ITEMS).entries()) {
        const places = known(x.places);
        out.push({ id: `alert-${i + 1}`, period: x.from.slice(0, 10), places, ...src, statement: alertStatement(x, places, true) });
      }
      return out;
    }
    case 'conflict': {
      const prelim = c.preliminary ? ' (preliminary: from the UCDP Candidate release)' : '';
      const src = { source: W.source.conflict(c.preliminary), link: WEEK_LINKS.conflict, date };
      const [m, p] = [monthLong(c.month), monthLong(c.prev)];
      const out: Fact[] = [
        { id: 'conflict-total', statement: `UCDP recorded ${c.total.b} events of organised violence in ${m} in every country it covers${prelim}.`, value: c.total.b, unit: 'events', period: c.month, ...src },
        { id: 'conflict-total-prev', statement: `UCDP recorded ${c.total.a} events of organised violence in ${p} in every country it covers.`, value: c.total.a, unit: 'events', period: c.prev, ...src },
      ];
      for (const r of c.rows) {
        const k = r.place.toLowerCase();
        out.push(
          { id: `conflict-${k}`, statement: `UCDP recorded ${r.b} events of organised violence in ${nameOf(r.place)} in ${m}${prelim}.`, value: r.b, unit: 'events', period: c.month, places: [r.place], ...src },
          { id: `conflict-${k}-prev`, statement: `UCDP recorded ${r.a} events of organised violence in ${nameOf(r.place)} in ${p}.`, value: r.a, unit: 'events', period: c.prev, places: [r.place], ...src },
        );
        if (r.a) {
          const ch = r1((r.b / r.a - 1) * 100);
          out.push({ id: `conflict-${k}-change`, statement: `Events of organised violence in ${nameOf(r.place)} were ${change(ch)} in ${m} on ${p}.`, value: ch, unit: '%', period: `${c.prev}–${c.month}`, places: [r.place], ...src });
        }
      }
      return out;
    }
    case 'prices': {
      const src = { source: 'World Bank Pink Sheet', link: WEEK_LINKS.prices, date };
      const m = monthLong(c.month);
      const prevMonth = addDays(`${c.month}-01`, -1).slice(0, 7);
      const yearAgo = `${Number(c.month.slice(0, 4)) - 1}${c.month.slice(4)}`;
      return c.rows.flatMap((r): Fact[] => {
        const t = PRICE_TEXT[r.code] ?? { name: r.code, unit: '' };
        const k = r.code.toLowerCase().replace(/_/g, '-');
        const out: Fact[] = [{ id: `price-${k}`, statement: `${t.name}: ${r2(r.value)} ${t.unit}, the monthly average for ${m}.`, value: r2(r.value), unit: t.unit, period: c.month, ...src }];
        if (r.month !== null) out.push({ id: `price-${k}-month`, statement: `${t.name} was ${change(r1(r.month * 100))} in ${m} on ${monthLong(prevMonth)}.`, value: r1(r.month * 100), unit: '%', period: c.month, ...src });
        if (r.year !== null) out.push({ id: `price-${k}-year`, statement: `${t.name} was ${change(r1(r.year * 100))} in ${m} on ${monthLong(yearAgo)}.`, value: r1(r.year * 100), unit: '%', period: c.month, ...src });
        return out;
      });
    }
    case 'outage': {
      const src = { source: 'IODA, Georgia Tech', link: WEEK_LINKS.outage, date };
      if (isWithheld('ioda')) {
        return c.rows.slice(0, WEEK_ITEMS).map((r, i): Fact => ({
          id: `outage-${i + 1}`, statement: `IODA recorded an internet outage in ${nameOf(r.place)} that began on ${long(r.start)}.`,
          period: r.start.slice(0, 10), places: [r.place], ...src,
        }));
      }
      return [
        { id: 'outages', statement: `IODA recorded ${count(c.rows.length)} national-scale internet ${plural(c.rows.length, 'outage', 'outages')} that began in the week. IODA reports when an outage began and how long it lasted, not why.`, value: c.rows.length, unit: 'outages', ...src },
        ...c.rows.slice(0, WEEK_ITEMS).map((r, i): Fact => ({
          id: `outage-${i + 1}`, statement: `An internet outage in ${nameOf(r.place)} began on ${long(r.start)} and lasted ${r1(r.hours)} hours.`,
          value: r1(r.hours), unit: 'hours', period: r.start.slice(0, 10), places: [r.place], ...src,
        })),
      ];
    }
    case 'sanctions':
      return sanctionsFacts(c, weekStart, date);
  }
}

/**
 * One fact per list, with its added and removed together ("2 entries were added to and none removed from …"), so a
 * draft never needs a sentence on what did not change. A fact holds one figure, so a list with both added and removed
 * entries gives one fact for each. The two US lists come apart, with the total the card shows; a week frozen before
 * they were counted apart gives the total only.
 */
function sanctionsFacts(c: SanctionsCard, weekStart: string, date: string): Fact[] {
  const since = c.since!;
  const when = since === weekStart ? '' : ` since ${long(since)}`;
  const out: Fact[] = [];
  /** "No entries were", "1 entry was", "12 entries were". */
  const entries = (x: number) => `${x === 0 ? 'No' : x} ${plural(x, 'entry was', 'entries were')}`;
  /** A list's facts; `total`: the count covers more than one list. */
  const push = (id: string, name: string, added: number, removed: number, src: Omit<Fact, 'id' | 'statement'>, total = false) => {
    const fact = (k: string, value: number, statement: string) => out.push({ id: `${id}-${k}`, statement: `${statement}${when}.`, value, unit: 'entries', ...src });
    if (added === 0 && removed === 0) return fact('none', 0, `No entries were added to or removed from ${name}`);
    if (removed === 0) return fact('added', added, total ? `${entries(added)} added in total to ${name}, and none removed` : `${entries(added)} added to and none removed from ${name}`);
    if (added === 0) return fact('removed', removed, total ? `${entries(removed)} removed in total from ${name}, and none added` : `${entries(removed)} removed from and none added to ${name}`);
    fact('added', added, total ? `${entries(added)} added in total to ${name}` : `${entries(added)} added to ${name}`);
    fact('removed', removed, total ? `${entries(removed)} removed in total from ${name}` : `${entries(removed)} removed from ${name}`);
  };
  for (const l of c.lists) {
    const t = W.list(l.list);
    const src = { source: t.sub ? `${t.name}: ${t.sub}` : t.name, link: WEEK_LINKS[l.list] ?? WEEK_LINKS.US, date, places: LIST_PLACE[l.list] ? [LIST_PLACE[l.list]!] : [] };
    const id = `sanctions-${l.list.toLowerCase()}`;
    if (l.list === 'US' && l.parts) {
      push(`${id}-sdn`, LIST_NAMES.sdn, l.parts.sdn.added, l.parts.sdn.removed, { ...src, source: 'United States: SDN list' });
      push(`${id}-entity`, LIST_NAMES.entity, l.parts.entity.added, l.parts.entity.removed, { ...src, source: 'United States: Entity List' });
      push(id, LIST_NAMES.US, l.added, l.removed, src, true);
    } else if (l.list === 'US') push(id, `${LIST_NAMES.sdn} and ${LIST_NAMES.entity}`, l.added, l.removed, src, true);
    else push(id, LIST_NAMES[l.list] ?? `the ${t.name} sanctions lists`, l.added, l.removed, src);
  }
  if (c.places.length) {
    const places = known(c.places.map((p) => p.place));
    out.push({ id: 'sanctions-places', statement: `${W.sanctionsPlaces(places.map(nameOf))} ${W.sanctionsEntry}`, places, source: W.source.sanctions, link: WEEK_LINKS.US, date });
  }
  return out;
}

/** The three counts the digest gives when a week has no summary: new alerts, outages and sanctions entries added
 *  (with the lists they were added to), each only when its card has figures. Words from src/i18n/week.en.ts. */
export function weekCounts(w: WeekData): { kind: 'disaster' | 'outage' | 'sanctions'; n: number; lists?: string }[] {
  const out: { kind: 'disaster' | 'outage' | 'sanctions'; n: number; lists?: string }[] = [];
  for (const c of w.cards) {
    if (!hasFigures(c)) continue;
    if (c.kind === 'disaster') out.push({ kind: 'disaster', n: c.alerts.length });
    if (c.kind === 'outage') out.push({ kind: 'outage', n: c.rows.length });
    // Only the lists entries were added to are named ("the US and UK sanctions lists").
    if (c.kind === 'sanctions') out.push({ kind: 'sanctions', n: c.lists.reduce((s, l) => s + l.added, 0), lists: list(c.lists.filter((l) => l.added > 0).map((l) => W.list(l.list).short)) });
  }
  const order = ['disaster', 'outage', 'sanctions'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
