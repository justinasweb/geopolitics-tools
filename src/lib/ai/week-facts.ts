// This week's summary (spec, D15; "The week in brief"): the facts a closed week's summary is drafted from, made from
// the same frozen week file the archive page's cards are built from (data/raw/weeks/<id>.json, pipeline/lib/weeks.ts),
// so the summary can say nothing the cards do not show. Every fact gives its source, a link and the day the source's
// data last changed. The words for hazards, prices and lists are the cards' own (src/i18n/week.en.ts).
//
// The checker wants every figure's period in the same sentence, so figures that cover the week itself carry no period
// (the subject and the first fact say which week it is), and monthly figures (conflict, prices) carry their month.
import { list } from '../../i18n/pages.en.ts';
import { PRICE_TEXT, WEEK_TEXT as W, day, month } from '../../i18n/week.en.ts';
import { place } from '../places.ts';
import { hasFigures, type Card, type WeekData } from '../week/model.ts';
import { addDays, weekNumber, weekRange } from '../week/period.ts';
import type { Fact, FactsFile } from './facts.ts';

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
const NAMES = ['GDACS', 'UCDP', 'IODA', 'Pink Sheet', 'SDN', 'Entity List', 'UK Sanctions List', 'Consolidated Screening List', 'Rice, Thai 5%', 'Thai 5%', 'US hard red winter'];
/** At most this many alerts and outages are listed one by one; the counts cover them all. */
export const WEEK_ITEMS = 8;

const long = (d: string) => day(d.slice(0, 10), { long: true });
const nameOf = (id: string) => place(id)?.name ?? id;
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

/** The facts a week's summary is drafted from. `id` is the ISO week ("2026-45"). */
export function weekFacts(id: string, w: WeekData): FactsFile {
  const { from, to } = weekRange(id);
  const n = weekNumber(id);
  const year = Number(id.slice(0, 4));
  const facts: Fact[] = [{
    id: 'week', statement: `This summary covers ISO week ${n} of ${year}, from ${long(from)} to ${long(to)}.`,
    value: n, unit: 'week', source: 'geopolitics.tools, This week', link: `https://geopolitics.tools/this-week/${id}`, date: w.made.slice(0, 10),
  }];
  for (const c of w.cards) if (hasFigures(c)) facts.push(...cardFacts(c, to));
  return {
    id: `week:${id}`, kind: 'week', subject: `week ${n} of ${year} (${long(from)} to ${long(to)})`,
    countries: [], names: NAMES,
    generated: `scripts/week.ts, from the frozen week ${id} (data/raw/weeks/${id}.json, made ${w.made})`, facts,
  };
}

function cardFacts(c: Card, weekEnd: string): Fact[] {
  const date = c.src.changed.slice(0, 10);
  switch (c.kind) {
    case 'disaster': {
      const src = { source: 'GDACS', link: WEEK_LINKS.disaster, date };
      const red = c.alerts.filter((a) => a.level === 'red').length;
      const out: Fact[] = [
        { id: 'alerts', statement: `GDACS issued ${count(c.alerts.length)} new orange or red disaster ${plural(c.alerts.length, 'alert', 'alerts')} this week: alerts that began, or rose to orange or red, in the week.`, value: c.alerts.length, unit: 'alerts', ...src },
      ];
      if (c.alerts.length) out.push({ id: 'alerts-red', statement: `${red === 0 ? 'None' : red} of this week's new GDACS alerts ${plural(red, 'was', 'were')} red, the highest of GDACS's levels.`, value: red, unit: 'red alerts', unitAliases: ['red'], ...src });
      for (const [i, a] of c.alerts.slice(0, WEEK_ITEMS).entries()) {
        const places = known(a.places);
        out.push({
          id: `alert-${i + 1}`, period: a.from.slice(0, 10), places, ...src,
          statement: `GDACS ${W.level(a.level).toLowerCase()} alert: ${W.hazard(a.type).toLowerCase()}${places.length ? ` in ${list(places.map(nameOf))}` : ''}, from ${long(a.from)}${a.rose ? `, rising to ${a.level} this week` : ''}.`,
        });
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
      return [
        { id: 'outages', statement: `IODA recorded ${count(c.rows.length)} national-scale internet ${plural(c.rows.length, 'outage', 'outages')} that began this week. IODA reports when an outage began and how long it lasted, not why.`, value: c.rows.length, unit: 'outages', ...src },
        ...c.rows.slice(0, WEEK_ITEMS).map((r, i): Fact => ({
          id: `outage-${i + 1}`, statement: `An internet outage in ${nameOf(r.place)} began on ${long(r.start)} and lasted ${r1(r.hours)} hours.`,
          value: r1(r.hours), unit: 'hours', period: r.start.slice(0, 10), places: [r.place], ...src,
        })),
      ];
    }
    case 'sanctions': {
      const since = c.since!;
      const out: Fact[] = [];
      for (const l of c.lists) {
        const t = W.list(l.list);
        const src = { source: t.sub ? `${t.name}: ${t.sub}` : t.name, link: WEEK_LINKS[l.list] ?? WEEK_LINKS.US, date, places: LIST_PLACE[l.list] ? [LIST_PLACE[l.list]!] : [] };
        const span = `between ${long(since)} and ${long(weekEnd)}`;
        out.push(
          { id: `sanctions-${l.list.toLowerCase()}-added`, statement: `${l.added === 0 ? 'No' : l.added} ${plural(l.added, 'entry was', 'entries were')} added to the ${t.name} sanctions lists (${t.sub}) ${span}.`, value: l.added, unit: 'entries', ...src },
          { id: `sanctions-${l.list.toLowerCase()}-removed`, statement: `${l.removed === 0 ? 'No' : l.removed} ${plural(l.removed, 'entry was', 'entries were')} removed from the ${t.name} sanctions lists (${t.sub}) ${span}.`, value: l.removed, unit: 'entries', ...src },
        );
      }
      if (c.places.length) {
        const places = known(c.places.map((p) => p.place));
        out.push({ id: 'sanctions-places', statement: `${W.sanctionsPlaces(places.map(nameOf))} ${W.sanctionsEntry}`, places, source: W.source.sanctions, link: WEEK_LINKS.US, date });
      }
      return out;
    }
  }
}

/** The three counts the digest gives when a week has no summary: new alerts, outages and sanctions entries added,
 *  each only when its card has figures. Words from src/i18n/week.en.ts. */
export function weekCounts(w: WeekData): { kind: 'disaster' | 'outage' | 'sanctions'; n: number }[] {
  const out: { kind: 'disaster' | 'outage' | 'sanctions'; n: number }[] = [];
  for (const c of w.cards) {
    if (!hasFigures(c)) continue;
    if (c.kind === 'disaster') out.push({ kind: 'disaster', n: c.alerts.length });
    if (c.kind === 'outage') out.push({ kind: 'outage', n: c.rows.length });
    if (c.kind === 'sanctions') out.push({ kind: 'sanctions', n: c.lists.reduce((s, l) => s + l.added, 0) });
  }
  const order = ['disaster', 'outage', 'sanctions'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
