// The map layers: every shaded layer the site's maps can show, defined once as data (./types.ts) and written to
// /map/<id>.json at build time. A map view page loads its layer file; the Atlas (phase 6) will list the same
// registry. Each layer says which view it belongs to, so the Atlas panel can link to "See full page".
import { MAP_TEXT, BLOC_TEXT } from '../../i18n/map.en.ts';
import { tagHtml } from '../tags.ts';
import { blocs } from '../blocs.ts';
import { DOSSIERS } from '../country.ts';
import { PLACES, NOTES } from '../places.ts';
import { countryHref } from '../routes.ts';
import { amount, listed, mineralPages, shareClass, shareText, withheld, nameOf, type MineralPage } from '../minerals.ts';
import { list, inSentence } from '../../i18n/pages.en.ts';
import { VIEWS_TEXT } from '../../i18n/views.en.ts';
import { classFor, creditOf, shareOf, valueText, viewPages, type ViewPage } from '../views.ts';
import type { Entry, LayerFile, LayerYear, Overlay } from './types.ts';

export interface LayerDef {
  id: string;
  /** The route key of the map view the layer belongs to. */
  view: string;
  /** The topic (hub) the Atlas groups it under. */
  topic: string;
  build: () => LayerFile;
}

/** Fills {name} placeholders. The engine has its own copy (src/scripts/map/text.ts); this one is for tests. */
export const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** The parts of a layer file every layer shares: names, links, notes, blocs and the interface words. */
function common(): Pick<LayerFile, 'tags' | 'names' | 'hrefs' | 'dossiers' | 'slugs' | 'notes' | 'blocs'> & { words: Partial<LayerFile['text']> } {
  const names: Record<string, string> = {};
  const slugs: Record<string, string> = {};
  const hrefs: Record<string, string> = {};
  for (const p of PLACES) {
    names[p.id] = p.name;
    slugs[p.id] = p.slug;
    const h = countryHref(p.id);
    if (h) hrefs[p.id] = h;
  }
  const notes: Record<string, string> = {};
  for (const n of NOTES) if (n.source === '*') notes[n.place] = n.note;
  const bl: LayerFile['blocs'] = {};
  for (const [id, members] of blocs()) bl[id] = { name: BLOC_TEXT[id] ?? id, members };
  return {
    tags: { estimate: tagHtml('estimate'), projection: tagHtml('projection'), preliminary: tagHtml('preliminary') },
    names, hrefs, dossiers: DOSSIERS, slugs, notes, blocs: bl,
    words: {
      world: MAP_TEXT.world, close: MAP_TEXT.close, countryPage: MAP_TEXT.countryPage, dossier: MAP_TEXT.dossier, inTable: MAP_TEXT.inTable,
      hint: MAP_TEXT.clickHint, tapHint: MAP_TEXT.tapHint, note: MAP_TEXT.note, disputed: MAP_TEXT.disputed,
      selected: MAP_TEXT.selected('{name}'), cleared: MAP_TEXT.cleared, members: MAP_TEXT.members(0).replace('0', '{n}'),
      removeBloc: MAP_TEXT.removeBloc('{bloc}'), movedYear: MAP_TEXT.movedYear(0, 1).replace('0', '{want}').replace('1', '{got}'),
      keys: MAP_TEXT.keys, rank: MAP_TEXT.rank(0, 1).replace('0', '{rank}').replace('1', '{of}'),
    },
  };
}

/** A mineral's share of world mine production, by country and year (USGS). */
function mineralLayer(p: MineralPage): LayerFile {
  const c = common();
  const MV = p.text;
  const memberships = blocs();
  const data: LayerYear[] = p.years.map((year) => {
    const y = p.byYear[year];
    const v: Record<string, Entry> = {};
    const l = listed(y);
    l.forEach((x, i) => {
      if (!x.place) return;
      // A place listed twice (two source rows mapping to one id) keeps its first, larger row.
      v[x.place] ??= [shareClass(x.share!), shareText(x.share!), `${amount(x.value!)} ${p.unit}`, x.estimated ? 'estimate' : 0, i + 1];
    });
    for (const x of withheld(y)) if (x.place) v[x.place] ??= [0, MV.withheld, '', 0, 0];
    const bl: Record<string, string> = {};
    for (const [id, members] of memberships) {
      const inBloc = l.filter((x) => x.place && members.includes(x.place));
      const share = inBloc.reduce((s, x) => s + (x.share ?? 0), 0);
      const name = BLOC_TEXT[id] ?? id;
      const w = withheld(y).filter((x) => x.place && members.includes(x.place));
      bl[id] = [inBloc.length ? MV.bloc(name, shareText(share), p.name, year) : MV.blocNone(name, p.name, year),
        w.length ? MV.blocWithheld(list(w.map((x, i) => inSentence(nameOf(x), i === 0)))) : ''].filter(Boolean).join(' ');
    }
    return { year, status: y.estimated ? 'estimate' : undefined, legend: MV.legendTitle(year), v, order: l.map((x) => x.place!).filter(Boolean), blocs: bl };
  });
  return {
    id: `minerals-${p.id}`, scale: 'seq', years: p.years, year: p.years.at(-1)!, ticks: MV.ticks,
    missing: { none: MV.notListedLegend, withheld: data.some((d) => Object.values(d.v).some((e) => e[0] === 0)) ? MV.withheldBy : undefined },
    source: p.source,
    text: {
      ...(c.words as LayerFile['text']),
      kicker: `${p.title} · {year}`, measure: MV.measure, shareLabel: MV.shareLabel, none: MV.notListed(0).replace('0', '{year}'),
      withheld: MV.withheldBy, withheldWhy: MV.withheldWhy(p.name), prev: MV.prevYear(0, '{detail}', '{value}').replace('0', '{year}'),
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes: withSourceNotes(c.notes, p), blocs: c.blocs, data,
  };
}

/**
 * The place notes plus USGS's own note on a place's figure, when it says the same in every year the place is listed
 * (the layer's notes are not per year; a note on one year only is in the table under the map).
 */
function withSourceNotes(notes: Record<string, string>, p: MineralPage): Record<string, string> {
  const out = { ...notes };
  const byPlace = new Map<string, (string | null)[]>();
  for (const year of p.years) for (const x of p.byYear[year].producers) if (x.place) byPlace.set(x.place, [...(byPlace.get(x.place) ?? []), x.note]);
  for (const [place, said] of byPlace) {
    const n = said[0];
    if (n && said.every((x) => x === n)) out[place] = out[place] ? `${out[place]} ${n}` : n;
  }
  return out;
}

/** A registry measure by country and year (emissions, refugees): its classes are fixed across years (../views.ts). */
function indicatorLayer(p: ViewPage): LayerFile {
  const c = common();
  const W = VIEWS_TEXT;
  const memberships = blocs();
  const data: LayerYear[] = p.years.map((year) => {
    const y = p.byYear[year];
    const v: Record<string, Entry> = {};
    y.rows.forEach((r, i) => {
      const share = p.layer.sums ? shareOf(r.value, y.world) : null;
      v[r.id] = [classFor(p, r.value), valueText(p, r.value), share ? (y.worldOwn ? W.ofWorld(share) : W.ofTotal(share)) : '', 0, i + 1];
    });
    const bl: Record<string, string> = {};
    for (const [id, members] of memberships) {
      const name = BLOC_TEXT[id] ?? id;
      const inBloc = y.rows.filter((r) => members.includes(r.id));
      const share = p.layer.sums && p.text.bloc ? shareOf(inBloc.reduce((s, r) => s + r.value, 0), y.world) : null;
      bl[id] = !inBloc.length ? W.blocNone(name, year) : share ? p.text.bloc!(name, share, year) : W.blocCount(name, inBloc.length, members.length, year);
    }
    return { year, legend: p.text.legend(year), v, order: y.rows.map((r) => r.id), blocs: bl };
  });
  return {
    id: `${p.family.id}-${p.id}`, scale: p.layer.scale, years: p.years, year: p.year, ticks: p.ticks, ends: p.text.ends,
    missing: { none: W.noData }, source: creditOf(p),
    text: {
      ...(c.words as LayerFile['text']),
      kicker: `${p.text.title} · {year}`, measure: p.text.measure, shareLabel: p.text.figureLabel, none: W.notListed(0).replace('0', '{year}'),
      withheld: MAP_TEXT.withheldBy, withheldWhy: '', prev: W.prevYear(0, '{value}').replace('0', '{year}'),
      rank: W.rank(0, 1).replace('0', '{rank}').replace('1', '{of}'),
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes: c.notes, blocs: c.blocs, data,
  };
}

let defs: LayerDef[] | null = null;
export function mapLayers(): LayerDef[] {
  defs ??= [
    ...mineralPages().map((p) => ({ id: `minerals-${p.id}`, view: `view:minerals:${p.id}`, topic: 'resources', build: () => mineralLayer(p) })),
    ...viewPages().map((p) => ({ id: `${p.family.id}-${p.id}`, view: `view:${p.family.id}:${p.id}`, topic: p.family.hub, build: () => indicatorLayer(p) })),
  ];
  return defs;
}

const built = new Map<string, LayerFile>();
export function layerFile(id: string, overlays?: Overlay[]): LayerFile {
  if (!built.has(id)) {
    const d = mapLayers().find((x) => x.id === id);
    if (!d) throw new Error(`no map layer "${id}"`);
    built.set(id, d.build());
  }
  const f = built.get(id)!;
  return overlays ? { ...f, overlays } : f;
}

/** Where a layer file is served. */
export const layerPath = (id: string) => `/map/${id}.json`;
