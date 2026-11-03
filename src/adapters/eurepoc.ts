// EuRepoC Global Dataset of Cyber Incidents (eurepoc/incidents.csv, attributions.csv and version.json, from
// pipeline/sources/eurepoc.ts). Publicly known cyber incidents, coded by EuRepoC from public reports: which countries'
// organisations were affected (receivers), and every attribution EuRepoC records, with who made it.
//
// Receivers are matched by their ISO alpha-2 codes; regions (EUROPE, NATO, world) and unknown receivers ("#N/A") are
// not countries and are left out. An attributed initiator counts for a state only when EuRepoC codes it as a state
// ("State") or a state-affiliated group ("State affiliated actor": a non-state group whose state affiliation is
// suggested). A non-state group or individual is kept by its kind (hacktivists, criminals), never by its country.
import { csvRecords } from '../../pipeline/lib/csv.ts';
import { type Raw, matcher } from './core.ts';

/** Who made an attribution (EuRepoC's attribution_basis). */
export type Basis = 'government' | 'receiver' | 'security' | 'self' | 'media' | 'thirdparty' | 'eu' | 'io' | 'contested' | 'unstated';
const BASIS: Record<string, Basis> = {
  'Attribution by receiver government / state entity': 'government',
  'Receiver attributes attacker': 'receiver',
  'IT-security community attributes attacker': 'security',
  'Attacker confirms': 'self',
  'Media-based attribution': 'media',
  'Attribution by third-party': 'thirdparty',
  'Attribution by EU institution/agency': 'eu',
  'Attribution by international organization': 'io',
  'Contested attribution': 'contested',
};

/** What EuRepoC says the attributed initiator is. `none`: the incident was not attributed. */
export type Kind = 'state' | 'affiliated' | 'group' | 'individual' | 'unknown' | 'none';
const KIND: Record<string, Kind> = {
  State: 'state', 'State affiliated actor': 'affiliated', 'Non-state-group': 'group', 'Individual hacker(s)': 'individual',
  'Not attributed': 'none',
};

/** Non-state groups by EuRepoC's subcategory. */
export type Group = 'hacktivist' | 'criminal' | 'terrorist' | 'private' | 'ethnic' | 'religious' | 'individual' | 'other';
const GROUP: Record<string, Group> = {
  'Hacktivist(s)': 'hacktivist', 'Criminal(s)': 'criminal', 'Terrorist(s)': 'terrorist', 'Ethnic actors': 'ethnic', 'Religious actors': 'religious',
  'Private technology companies / hacking for hire groups without state affiliation / research entities': 'private',
};

export interface Attribution {
  /** EuRepoC's attribution id: one attribution can name several initiators and bases, one row each. */
  id: string;
  basis: Basis;
  kind: Kind;
  /** Internal place ids, for a state or state-affiliated initiator only. */
  states: string[];
  /** The kind of non-state actor, for groups and individuals. */
  group?: Group;
}

export interface Incident {
  id: string;
  /** The year the incident started; null when EuRepoC has no start date. */
  year: number | null;
  /** Internal place ids of the countries and territories whose organisations or people were affected. */
  receivers: string[];
  attributions: Attribution[];
}

export interface Version { record: string; version: string; published: string; doi: string; title: string }

export interface Cyber { version: Version; incidents: Incident[] }

const COUNTRY = /^[A-Z]{2}$/;

export function parseEurepoc(incidents: string, attributions: string, version: Version): Cyber {
  const m = matcher('eurepoc', 'iso2');
  const places = (codes: string[]) => [...new Set(codes.map((c) => c.trim()).filter((c) => COUNTRY.test(c)).map((c) => m.match(c)).filter((x): x is string => !!x))];
  const byId = new Map<string, Incident>();
  for (const r of csvRecords(incidents)) {
    const y = /(\d{4})$/.exec(r.start_date)?.[1];
    byId.set(r.incident_id, { id: r.incident_id, year: y ? Number(y) : null, receivers: places(r.receiver_country_alpha_2_code.split(';')), attributions: [] });
  }
  for (const r of csvRecords(attributions)) {
    const inc = byId.get(r.incident_id);
    if (!inc) continue;
    const kind = KIND[r.initiator_category] ?? 'unknown';
    const stated = kind === 'state' || kind === 'affiliated';
    inc.attributions.push({
      id: r.attribution_id, basis: BASIS[r.attribution_basis] ?? 'unstated', kind,
      states: stated ? places(r.initiator_alpha_2.split(',')) : [],
      ...(kind === 'group' ? { group: GROUP[r.initiator_subcategory] ?? 'other' } : kind === 'individual' ? { group: 'individual' as const } : {}),
    });
  }
  return { version, incidents: [...byId.values()] };
}

export const eurepoc = (raw: Raw) => parseEurepoc(raw.text('eurepoc', 'incidents.csv'), raw.text('eurepoc', 'attributions.csv'), raw.json<Version>('eurepoc', 'version.json'));
