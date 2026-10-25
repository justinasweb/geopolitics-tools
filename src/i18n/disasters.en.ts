// English words for the disasters map view (/disasters, /disasters/{kind}): GDACS alerts by country over the last
// 30, 90 or 365 days, and USGS earthquakes. Same rules as pages.en.ts: templates take figures already formatted and
// return plain sentences, and a sentence whose figure is missing is left out.
import { list } from './pages.en.ts';

export interface KindText {
  /** The kind's name in the picker ("Cyclones"). */
  pick: string;
  /** The page title and h1. */
  title: string;
  /** "for tropical cyclones", after "alerts"; empty for every kind. */
  forKind: string;
  /** The meta description. */
  description: string;
}

export const KIND_TEXT: Record<string, KindText> = {
  all: { pick: 'All', title: 'Disaster alerts', forKind: '', description: 'Disaster alerts by country over the last 30, 90 or 365 days: earthquakes, tropical cyclones, floods, droughts, wildfires and volcanoes, on a map and in a table. Sources: GDACS, USGS.' },
  EQ: { pick: 'Earthquakes', title: 'Earthquake alerts', forKind: ' for earthquakes', description: 'Earthquake alerts by country over the last 30, 90 or 365 days, and every earthquake of magnitude 5.5 and over, on a map and in tables. Sources: GDACS, USGS.' },
  TC: { pick: 'Cyclones', title: 'Tropical cyclone alerts', forKind: ' for tropical cyclones', description: 'Tropical cyclone alerts by country over the last 30, 90 or 365 days, on a map and in a table. Source: GDACS.' },
  FL: { pick: 'Floods', title: 'Flood alerts', forKind: ' for floods', description: 'Flood alerts by country over the last 30, 90 or 365 days, on a map and in a table. Source: GDACS.' },
  DR: { pick: 'Droughts', title: 'Drought alerts', forKind: ' for droughts', description: 'Drought alerts by country over the last 30, 90 or 365 days, on a map and in a table. Source: GDACS.' },
  WF: { pick: 'Wildfires', title: 'Wildfire alerts', forKind: ' for wildfires', description: 'Wildfire alerts by country over the last 30, 90 or 365 days, on a map and in a table. Source: GDACS.' },
  VO: { pick: 'Volcanoes', title: 'Volcano alerts', forKind: ' for volcanic eruptions', description: 'Volcanic eruption alerts by country over the last 30, 90 or 365 days, on a map and in a table. Source: GDACS.' },
};

const LEVEL = { red: 'Red', orange: 'Orange', green: 'Green', none: 'No PAGER alert' } as Record<string, string>;

export const DISASTERS_TEXT = {
  section: 'Disasters',
  pickerLabel: 'Kind',
  sub: 'by country',
  periodLabel: 'Period',
  /** The period control's buttons, and the filter sheet. */
  period: (days: number) => `${days} days`,
  /** Where a year would be: the panel kicker, the tooltip, the phone filter summary. */
  last: (days: number) => `Last ${days} days`,
  lastIn: (days: number) => `the last ${days} days`,
  /** Which alerts a period counts. */
  levels: 'orange and red alerts',
  movedDays: 'There is no {want}-day view; showing the last {got} days, the nearest one.',
  periodNote: 'Counts are orange and red alerts. GDACS keeps green (low-impact) alerts for 30 days only, so they are drawn as dots on the 30-day map but not counted.',
  greenNote: (n: string) => `Also ${n} green (low-impact) alert${n === '1' ? '' : 's'}, drawn as dots and not counted.`,
  legend: (days: number) => `Orange and red alerts per country, last ${days} days`,
  ticks: ['1', '2–4', '5–9', '10–24', '25+'],
  none: 'No alerts',
  noneIn: 'No alerts in this period',
  figureLabel: 'Alerts',
  measure: 'alerts',
  alerts: (n: number) => `${n} alert${n === 1 ? '' : 's'}`,
  level: (l: string) => LEVEL[l] ?? l,
  levelAlert: (l: string) => `${LEVEL[l] ?? l} alert`,
  levelParts: (red: number, orange: number, green: number | null) => [
    red ? `${red} red` : '', orange ? `${orange} orange` : '', green ? `${green} green` : '',
  ].filter(Boolean).join(', '),
  marks: { red: 'Red alert', orange: 'Orange alert', green: 'Green alert (30 days only, not counted)', quake: 'Earthquake, magnitude 5.5+ (size by magnitude)' },
  /** The answer under the title. */
  lede: (p: { days: number; n: string; red: number; forKind: string; top?: string; topN?: string }) =>
    p.n === '0'
      ? `GDACS issued no orange or red alerts${p.forKind} in the last ${p.days} days.`
      : `In the last ${p.days} days, GDACS issued ${p.n} orange and red alert${p.n === '1' ? '' : 's'}${p.forKind}${p.red ? `, ${p.red} of them red` : ''}.`
        + (p.top ? ` ${p.top} was named in the most alerts: ${p.topN}.` : ''),
  quakes: (n: string, days: number, largest?: { mag: string; place: string; date: string }) =>
    `USGS recorded ${n} earthquake${n === '1' ? '' : 's'} of magnitude 5.5 and over in the last ${days} days${largest ? `; the largest, magnitude ${largest.mag}, was ${largest.place} on ${largest.date}` : ''}.`,
  /** The summary under the map. */
  byKind: (parts: string[]) => `By kind: ${list(parts)}.`,
  kindPart: (n: number, kind: string) => `${n} ${kind}`,
  countries: (n: number) => `${n} countr${n === 1 ? 'y was' : 'ies were'} named in at least one.`,
  caveat: 'GDACS alert levels estimate the likely humanitarian impact, from the size of the hazard and the people and places exposed to it: red, orange or green. They are worked out within hours from models, not from reported damage.',
  counting: 'An alert counts in a period if the event lasted into it, and counts once for each country it names.',
  quakeNote: 'Earthquakes on the map are from USGS: every earthquake of magnitude 5.5 and over. Their PAGER alert estimates losses and can differ from the GDACS alert for the same earthquake.',
  // The panel.
  byLevel: 'By level',
  rankingIn: 'Most alerts, {year}',
  kindsBlock: 'By kind',
  alertsBlock: 'Its alerts',
  alertsCaption: (days: number) => `Newest first, last ${days} days`,
  quakesBlock: 'Largest earthquakes in or near it',
  quakesCaption: (days: number) => `USGS, magnitude 5.5 and over, last ${days} days`,
  andMore: (n: number) => `and ${n} more`,
  most: 'Most alerts',
  latest: 'Latest',
  largest: 'Largest earthquakes',
  keyLabel: (days: number) => `Alerts, last ${days} days`,
  // The tables.
  summary: 'Summary',
  all: 'All countries',
  tableLabel: (title: string) => `${title}, every country named`,
  caption: (days: number[]) => `Every country named in an orange or red alert in the last ${days.at(-1)} days, with its count over ${days.slice(0, -1).join(' and ')} days.`,
  country: 'Country',
  col: (days: number) => `${days} days`,
  red: (days: number) => `Red, ${days} days`,
  events: (days: number) => `Orange and red alerts, last ${days} days`,
  eventsLabel: 'Orange and red alerts',
  eventsCaption: (n: number, days: number) => `${n} orange and red alert${n === 1 ? '' : 's'} active in the last ${days} days, newest first.`,
  date: 'Dates',
  event: 'Event',
  kind: 'Kind',
  levelCol: 'Alert',
  where: 'Countries',
  severity: 'Severity (GDACS)',
  atSea: 'At sea',
  quakeTable: (days: number) => `Largest earthquakes, last ${days} days`,
  quakeCaption: (n: number, total: number) => `The ${n} largest of ${total} earthquakes of magnitude 5.5 and over, by magnitude.`,
  mag: 'Magnitude',
  place: 'Where (USGS)',
  depth: 'Depth',
  pager: 'PAGER alert',
  km: (n: number) => `${n} km`,
  tsunami: 'tsunami warning issued',
  related: 'Related',
  sameView: 'Same view, another kind',
  countryPage: 'Country page',
  dossier: 'Full dossier',
  // Tooltips on marks.
  tipAlert: (name: string, level: string, dates: string, where: string, severity: string) => [name, level, dates, where, severity].filter(Boolean).join(' · '),
  tipQuake: (title: string, date: string, depth: string, pager: string) => [title, date, depth, pager].filter(Boolean).join(' · '),
  blocLine: (bloc: string, n: number, k: number, days: number) => (n ? `${n} alert${n === 1 ? '' : 's'} named ${k} ${bloc} member${k === 1 ? '' : 's'} in the last ${days} days.` : `No alert named a ${bloc} member in the last ${days} days.`),
  ogFigure: (n: number) => `${n}`,
  ogCaption: (days: number) => `Orange and red alerts, last ${days} days`,
};
