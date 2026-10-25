// The map layers: every shaded layer the site's maps can show, defined once as data (./types.ts) and written to
// /map/<id>.json at build time. A map view page loads its layer file; the Atlas (phase 6) will list the same
// registry. Each layer says which view it belongs to, so the Atlas panel can link to "See full page".
import { MAP_TEXT, BLOC_TEXT, PANEL_TEXT as PT } from '../../i18n/map.en.ts';
import { tagHtml } from '../tags.ts';
import { BLOCS_CHECKED, blocs } from '../blocs.ts';
import { blocPage, blocPages, blocsOf, countClass as blocCountClass, measureYear, membershipCounts, weightIn } from '../blocview.ts';
import { BLOCS_TEXT, HISTORY_TEXT, MEASURE_TEXT, MEMBER_NOTES } from '../../i18n/blocs.en.ts';
import { HISTORY_BLOCS, STATUS_CLASS, historyPage, spanText, statusIn } from '../history.ts';
import { DOSSIERS } from '../country.ts';
import { PLACES, NOTES } from '../places.ts';
import { countryHref, live } from '../routes.ts';
import { amount, listed, mineralPages, shareClass, shareText, withheld, nameOf, type MineralPage } from '../minerals.ts';
import { list, inSentence } from '../../i18n/pages.en.ts';
import { OUTAGE_TEXT, PARTS_TEXT as PX, VIEWS_TEXT } from '../../i18n/views.en.ts';
import { classFor, creditOf, familyPages, partsOf, placeNote, shareOf, valueText, viewPages, type ViewPage } from '../views.ts';
import { shared } from '../data.ts';
import { loadFlows } from '../../data/flows.ts';
import { countClass, daysText, disasterPages, type DisasterPage } from '../disasters.ts';
import { DISASTERS_TEXT, KIND_TEXT } from '../../i18n/disasters.en.ts';
import { formatDate, formatValue } from '../format.ts';
import { TOP_FLOWS, balanceOf, estimated as foodEstimated, classFor as foodClass, foodPages, mt, netText, shareOf as foodShare, sourceOf, valueText as foodValue, type FoodPage } from '../food.ts';
import { FOOD_NOTES, FOOD_TEXT } from '../../i18n/food.en.ts';
import { arcXY, toMap } from './projection.ts';
import { sitesIn, spaceAsOf, workingBy } from '../space.ts';
import { SPACE_TEXT } from '../../i18n/space.en.ts';
import { clustersAt } from '../ai.ts';
import { AI_TEXT } from '../../i18n/ai.en.ts';
import { LISTS, sanctions } from '../../adapters/sanctions.ts';
import { SANCTIONS_TEXT } from '../../i18n/sanctions.en.ts';
import { type Outage, outages } from '../../adapters/digital.ts';
import { anchors } from './basemap.ts';
import type { Hazard } from '../../adapters/hazards.ts';
import type { Entry, LayerFile, LayerYear, Overlay, PanelBlock, Point } from './types.ts';

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
      detailLabel: PT.production(p.measure), rankLabel: PT.rankListed, rankOf: PT.rankOf, statusLabel: PT.status,
      trend: PT.shareTrend(p.measure), trendCaption: PT.trendCaption, ranking: PT.producers,
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes: withSourceNotes(c.notes, p), blocs: c.blocs, data,
    series: seriesOf(p.years.map((year) => Object.fromEntries(listed(p.byYear[year]).filter((x) => x.place).reverse().map((x) => [x.place!, x.share!])))),
    format: { kind: 'share' }, more: otherMinerals(p),
  };
}

/** Per place, one number per year (null where it has none), from each year's figures by place. */
function seriesOf(byYear: Record<string, number>[]): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  byYear.forEach((y, i) => {
    for (const [id, v] of Object.entries(y)) (out[id] ??= Array(byYear.length).fill(null))[i] = v;
  });
  return out;
}

/** For each producer of this mineral: its share of the other minerals, in the latest year USGS lists. */
function otherMinerals(p: MineralPage): Record<string, PanelBlock[]> {
  const out: Record<string, PanelBlock[]> = {};
  const others = mineralPages().filter((m) => m.id !== p.id);
  const ids = new Set(p.years.flatMap((y) => listed(p.byYear[y]).map((x) => x.place).filter((x): x is string => !!x)));
  for (const id of ids) {
    const rows = others.flatMap((m) => {
      const l = listed(m.latest);
      const i = l.findIndex((x) => x.place === id);
      return i < 0 ? [] : [{ share: l[i].share!, row: { name: m.title, value: shareText(l[i].share!), href: live(`view:minerals:${m.id}`)?.path, note: `${PT.rankNote(i + 1, l.length)}, ${m.latest.year}` } }];
    }).sort((a, b) => b.share - a.share).map((x) => x.row);
    if (rows.length) out[id] = [{ label: PT.otherMinerals, caption: PT.otherMineralsCaption, rows }];
  }
  return out;
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
    // Refugees: the three groups UNHCR adds together, for each country, this year.
    const more: Record<string, PanelBlock[]> = {};
    for (const r of y.rows) {
      const x = partsOf(p, r.id, year);
      if (!x) continue;
      const f = (v: number) => formatValue(v, { kind: 'count' });
      more[r.id] = [{
        label: PX.block(year), caption: PX.caption,
        rows: [{ name: PX.refugees, value: f(x.refugees) }, { name: PX.asylum, value: f(x.asylum), note: PX.asylumNote }, { name: PX.oipShort, value: f(x.oip) }],
      }];
    }
    return { year, legend: p.text.legend(year), v, order: y.rows.map((r) => r.id), blocs: bl, ...(Object.keys(more).length ? { more } : {}) };
  });
  const notes = { ...c.notes };
  for (const id of new Set(p.years.flatMap((yr) => p.byYear[yr].rows.map((r) => r.id)))) {
    const n = placeNote(p, id);
    if (n) notes[id] = notes[id] ? `${notes[id]} ${n}` : n;
  }
  return {
    id: `${p.family.id}-${p.id}`, scale: p.layer.scale, years: p.years, year: p.year, ticks: p.ticks, ends: p.text.ends,
    missing: { none: W.noData }, source: creditOf(p),
    text: {
      ...(c.words as LayerFile['text']),
      kicker: `${p.text.title} · {year}`, measure: p.text.measure, shareLabel: p.text.figureLabel, none: W.notListed(0).replace('0', '{year}'),
      withheld: MAP_TEXT.withheldBy, withheldWhy: '', prev: W.prevYear(0, '{value}').replace('0', '{year}'),
      rank: W.rank(0, 1).replace('0', '{rank}').replace('1', '{of}'),
      detailLabel: p.layer.sums ? PT.share : undefined, rankLabel: PT.rank, rankOf: PT.rankOf, statusLabel: PT.status,
      trend: PT.figureTrend(p.text.figureLabel), trendCaption: PT.trendCaption, ranking: PT.ranking,
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes, blocs: c.blocs, data,
    series: seriesOf(p.years.map((year) => Object.fromEntries(p.byYear[year].rows.map((r) => [r.id, r.value])))),
    format: p.format, more: p.family.id === 'space' ? withSpace(viewMore(p)) : p.family.id === 'sanctions' ? withSanctions(viewMore(p), p.id) : p.id === 'outages' ? withOutages(viewMore(p)) : viewMore(p),
    ...(p.id === 'launches' ? { overlays: [launchSites(p)] } : p.id === 'aicompute' ? { overlays: [aiClusters(p)] } : {}),
  };
}

/** Space: each country's working satellites now, by orbit and constellation, after its other blocks. */
function withSpace(more: Record<string, PanelBlock[]>): Record<string, PanelBlock[]> {
  const S = SPACE_TEXT;
  const date = formatDate(spaceAsOf() ?? '');
  const f = (v: number) => formatValue(v, { kind: 'count' });
  const out = { ...more };
  for (const [id, w] of workingBy()) {
    const cs = Object.entries(w.constellations).sort((a, b) => b[1] - a[1]);
    out[id] = [...(out[id] ?? []), {
      label: `${S.working}: ${f(w.active)}`, caption: S.workingCaption(date),
      rows: [
        ...(['leo', 'meo', 'geo'] as const).filter((k) => w.orbits[k]).map((k) => ({ name: S.orbit[k], value: f(w.orbits[k]) })),
        ...cs.map(([c, n]) => ({ name: S.names[c] ?? c, value: f(n), note: S.constellation })),
      ],
    }];
  }
  return out;
}

const outageData = shared(outages);
/** Outages: each country's latest outages, newest first. */
function withOutages(more: Record<string, PanelBlock[]>): Record<string, PanelBlock[]> {
  const O = OUTAGE_TEXT;
  const all = outageData() ?? [];
  const latest = all[0]?.start ?? '';
  const cut = new Date(Date.parse(latest) - 30 * 86_400_000).toISOString();
  const by = new Map<string, Outage[]>();
  for (const o of all) by.set(o.place, [...(by.get(o.place) ?? []), o]);
  const out = { ...more };
  for (const [id, os] of by) {
    out[id] = [{
      label: O.recent, caption: `${O.recentCaption} ${O.last30(os.filter((o) => o.start >= cut).length)}.`,
      rows: os.slice(0, 5).map((o) => ({ name: `${formatDate(o.start.slice(0, 10))}, ${o.start.slice(11, 16)}`, value: O.hours(o.hours) })),
      more: os.length > 5 ? O.more(os.length - 5) : undefined,
    }, ...(out[id] ?? [])];
  }
  return out;
}

const sanctionsData = shared(sanctions);
/** Sanctions: each country's listings by list, by kind of target, and the main programmes (of the layer's list). */
function withSanctions(more: Record<string, PanelBlock[]>, layer: string): Record<string, PanelBlock[]> {
  const S = SANCTIONS_TEXT;
  const d = sanctionsData();
  if (!d) return more;
  const only = ({ sanctionsus: 'US', sanctionseu: 'EU', sanctionsuk: 'UK' } as Record<string, string>)[layer];
  const f = (v: number) => formatValue(v, { kind: 'count' });
  const out = { ...more };
  for (const [id, c] of Object.entries(d.byPlace)) {
    const progs = Object.entries(c.byProgramme).filter(([k]) => !only || k.startsWith(`${only}|`)).sort((a, b) => b[1] - a[1]);
    out[id] = [
      { label: S.byList, caption: S.byListCaption, rows: LISTS.map((l) => ({ name: S.list[l], value: f(c.byList[l]) })) },
      ...(only ? [] : [{ label: S.byType, rows: (['person', 'entity', 'vessel', 'aircraft'] as const).filter((t) => c.byType[t]).map((t) => ({ name: S.type[t], value: f(c.byType[t]!) })) }]),
      ...(progs.length ? [{
        label: S.programmes, caption: S.programmesCaption,
        rows: progs.slice(0, 5).map(([k, n]) => ({ name: only ? k.split('|')[1] : `${S.list[k.split('|')[0]]}: ${k.split('|')[1]}`, value: f(n) })),
        more: progs.length > 5 ? S.morePrograms(progs.length - 5) : undefined,
      }] : []),
      ...(out[id] ?? []),
    ];
  }
  return out;
}

/** AI computing power: a mark for each known supercomputer with a location, sized by its power. */
function aiClusters(p: ViewPage): Overlay {
  const items: Point[] = clustersAt(p.year).filter((c) => c.lat !== null && c.lon !== null).map((c) => ({
    at: toMap(c.lon!, c.lat!), r: Math.min(14, 2.5 + Math.sqrt(c.h100e / 1000)),
    tip: AI_TEXT.tip(c.name, c.owner, formatValue(c.h100e, { kind: 'count' }), c.start.slice(0, 4)),
  }));
  return { id: 'clusters', kind: 'points', label: AI_TEXT.mark, symbol: 'hollow', items };
}

/** Launches: a mark for each site in each year it launched, sized by its launches that year. */
function launchSites(p: ViewPage): Overlay {
  const S = SPACE_TEXT;
  const items: Point[] = p.years.flatMap((year, i) => sitesIn(year).map((x) => ({
    at: toMap(x.lon, x.lat), r: Math.min(14, 3 + Math.sqrt(x.n) * 1.4), m: 2 ** i,
    tip: S.siteTip(x.name, formatValue(x.n, { kind: 'count' }), year),
  })));
  return { id: 'sites', kind: 'points', label: S.sitesMark, symbol: 'hollow', items };
}

/** For each place on a registry view: its figures on the family's other layers, and for refugees its main partners. */
function viewMore(p: ViewPage): Record<string, PanelBlock[]> {
  const out: Record<string, PanelBlock[]> = {};
  const others = familyPages(p.family.id).filter((o) => o.id !== p.id);
  const fl = refugeeFlows();
  const ids = new Set(p.years.flatMap((y) => p.byYear[y].rows.map((r) => r.id)));
  for (const id of ids) {
    const blocks: PanelBlock[] = [];
    const rows = others.flatMap((o) => {
      const y = o.byYear[o.year];
      const i = y.rows.findIndex((r) => r.id === id);
      return i < 0 ? [] : [{ name: o.text.title, value: valueText(o, y.rows[i].value), href: live(`view:${o.family.id}:${o.id}`)?.path, note: `${o.year}, ${VIEWS_TEXT.rank(i + 1, y.rows.length).toLowerCase()}` }];
    });
    if (rows.length) blocks.push({ label: PT.otherMeasures, caption: PT.otherMeasuresCaption, rows });
    if (fl && (p.id === 'refout' || p.id === 'refin' || p.id === 'refinpc')) {
      const out_ = p.id === 'refout';
      const pairs = fl.pairs.filter((x) => (out_ ? x.from : x.to) === id && x.amount > 0).sort((a, b) => b.amount - a.amount);
      const total = pairs.reduce((t, x) => t + x.amount, 0);
      if (pairs.length) {
        blocks.push({
          label: out_ ? PT.fledTo(fl.period) : PT.cameFrom(fl.period), caption: PT.partnersCaption,
          rows: pairs.slice(0, 5).map((x) => ({ name: nameOf2(out_ ? x.to : x.from), value: formatValue(x.amount, fl.format), note: PT.ofTotal(shareOf(x.amount, total) ?? '') })),
          more: pairs.length > 5 ? PT.morePartners(pairs.length - 5) : undefined,
        });
      }
    }
    if (blocks.length) out[id] = blocks;
  }
  return out;
}
const refugeeFlows = shared((raw) => loadFlows(raw, 'refugees'));

/** Alerts by country over the last 30, 90 and 365 days (GDACS), with the alerts (or, for earthquakes, USGS quakes) as marks. */
function disasterLayer(p: DisasterPage): LayerFile {
  const c = common();
  const D = DISASTERS_TEXT;
  const memberships = blocs();
  const data: LayerYear[] = p.periods.map((per) => {
    const v: Record<string, Entry> = {};
    per.rows.forEach((r, i) => {
      v[r.id] = [countClass(r.n), D.alerts(r.n), D.levelParts(r.red, r.orange, null), 0, i + 1];
    });
    const bl: Record<string, string> = {};
    for (const [id, members] of memberships) {
      const n = per.alerts.filter((h) => h.places.some((x) => members.includes(x))).length;
      bl[id] = D.blocLine(BLOC_TEXT[id] ?? id, n, per.rows.filter((r) => members.includes(r.id)).length, per.days);
    }
    // A selected country's own alerts in the period, by kind and newest first; on the earthquakes page its largest quakes.
    const more: Record<string, PanelBlock[]> = {};
    for (const r of per.rows) {
      const mine = per.alerts.filter((h) => h.places.includes(r.id));
      const blocks: PanelBlock[] = [];
      if (!p.kind) {
        const k = new Map<string, number>();
        for (const h of mine) k.set(h.kind, (k.get(h.kind) ?? 0) + 1);
        blocks.push({ label: D.kindsBlock, rows: [...k].sort((a, b) => b[1] - a[1]).map(([kind, n]) => ({ name: KIND_TEXT[kind].pick, value: String(n), href: live(`view:disasters:${kind}`)?.path })) });
      }
      blocks.push({
        label: D.alertsBlock, caption: D.alertsCaption(per.days),
        rows: mine.slice(0, 6).map((h) => ({ name: h.name, value: D.level(h.alert), note: daysText(h, formatDate) })),
        more: mine.length > 6 ? D.andMore(mine.length - 6) : undefined,
      });
      more[r.id] = blocks;
    }
    if (p.kind === 'EQ') {
      const byPlace = new Map<string, Hazard[]>();
      for (const q of per.quakes) if (q.place) byPlace.set(q.place, [...(byPlace.get(q.place) ?? []), q]);
      for (const [id, qs] of byPlace) {
        (more[id] ??= []).push({
          label: D.quakesBlock, caption: D.quakesCaption(per.days),
          rows: qs.slice(0, 5).map((q) => ({ name: q.name.replace(/^M [\d.]+ - /, ''), value: `M ${q.mag!.toFixed(1)}`, note: formatDate(q.from) })),
          more: qs.length > 5 ? D.andMore(qs.length - 5) : undefined,
        });
      }
    }
    return { year: per.days, label: D.last(per.days), legend: D.legend(per.days), v, order: per.rows.map((r) => r.id), blocs: bl, more };
  });
  // A mark shows in the periods whose list has it: bit i for period i.
  const mask = (h: Hazard, pick: (i: number) => Hazard[]) => p.periods.reduce((m, _, i) => (pick(i).includes(h) ? m | (1 << i) : m), 0);
  const where = (h: Hazard) => (h.places.length ? list(h.places.map((x, i) => inSentence(nameOf2(x), i === 0))) : D.atSea);
  const overlays: Overlay[] = [];
  if (p.kind === 'EQ') {
    const all = p.periods.at(-1)!.quakes;
    overlays.push({
      id: 'quakes', kind: 'points', label: D.marks.quake, symbol: 'hollow',
      items: all.map((q): Point => ({
        at: toMap(q.lon, q.lat), r: Math.max(3, ((q.mag ?? 5.5) - 5) * 4 + 1), m: mask(q, (i) => p.periods[i].quakes),
        tip: D.tipQuake(q.name, formatDate(q.from), q.depth != null ? D.km(Math.round(q.depth)) : '', q.alert !== 'none' ? `PAGER: ${D.level(q.alert).toLowerCase()}` : ''),
      })),
    });
  } else {
    const seen = new Set<Hazard>();
    for (const per of p.periods) for (const h of [...per.alerts, ...per.green]) seen.add(h);
    const symbols = { red: 'triangle', orange: 'diamond', green: 'dot' } as const;
    for (const level of ['green', 'orange', 'red'] as const) {
      const items = [...seen].filter((h) => h.alert === level).map((h): Point => ({
        at: toMap(h.lon, h.lat), r: 3.5, m: mask(h, (i) => (level === 'green' ? p.periods[i].green : p.periods[i].alerts)),
        tip: D.tipAlert(h.name, D.levelAlert(level), daysText(h, formatDate), where(h), h.severity),
      }));
      if (items.length) overlays.push({ id: `alerts-${level}`, kind: 'points', label: D.marks[level], symbol: symbols[level], items });
    }
  }
  const title = KIND_TEXT[p.id].title;
  return {
    id: `disasters-${p.id}`, scale: 'seq', axis: 'days', years: p.periods.map((x) => x.days), year: p.days, ticks: D.ticks,
    missing: { none: D.none }, source: p.kind === 'EQ' ? 'GDACS; USGS' : 'GDACS',
    text: {
      ...(c.words as LayerFile['text']),
      kicker: `${title} · {year}`, measure: '', shareLabel: D.figureLabel, none: D.noneIn,
      withheld: MAP_TEXT.withheldBy, withheldWhy: '', prev: '{year}: {value}', rank: VIEWS_TEXT.rank(0, 1).replace('0', '{rank}').replace('1', '{of}'),
      movedYear: D.movedDays,
      detailLabel: D.byLevel, rankLabel: PT.rank, rankOf: PT.rankOf, ranking: D.rankingIn,
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes: c.notes, blocs: c.blocs, data,
    series: seriesOf(p.periods.map((x) => Object.fromEntries(x.rows.map((r) => [r.id, r.n])))), format: { kind: 'count' },
    // Red marks last, so they sit on top.
    overlays,
  };
}
/** A commodity's production, use or net trade by country and year (FAOSTAT); on a crop's trade map, its largest flows. */
function foodLayer(p: FoodPage): LayerFile {
  const c = common();
  const F = FOOD_TEXT;
  const L = F.layer[p.layer];
  const T = p.text;
  const trade = p.layer === 'trade';
  const memberships = blocs();
  const data: LayerYear[] = p.years.map((year) => {
    const y = p.byYear[year];
    const v: Record<string, Entry> = {};
    y.rows.forEach((r, i) => {
      const est = foodEstimated(p, r.id, year) ? 'estimate' : 0;
      v[r.id] = trade ? [foodClass(p, r.value, y.world), netText(r.value), '', est, i + 1] : [foodClass(p, r.value, y.world), foodShare(r.value, y.world) ?? '', mt(r.value), est, i + 1];
    });
    for (const n of y.notYet) v[n.id] = [-1, F.notYet, F.lastFigure(n.year, foodValue(p, n.value)), 0, 0];
    const bl: Record<string, string> = {};
    for (const [id, members] of memberships) {
      const name = BLOC_TEXT[id] ?? id;
      const inBloc = y.rows.filter((r) => members.includes(r.id));
      const sum = inBloc.reduce((t, r) => t + r.value, 0);
      bl[id] = !inBloc.length ? F.blocNone(name, year)
        : trade ? F.bloc.trade(name, mt(Math.abs(sum)), sum >= 0, T.name, year)
        : F.bloc[p.layer as 'production' | 'use'](name, foodShare(sum, y.world) ?? '', T.name, year);
    }
    return { year, legend: L.legend(year), v, order: y.rows.map((r) => r.id), blocs: bl };
  });
  const overlays: Overlay[] = [];
  if (p.flows.length && p.flowYear) {
    const at = anchors();
    const items = p.flows.filter((f) => at[f.from] && at[f.to]).slice(0, TOP_FLOWS)
      .map((f) => ({ p: arcXY(at[f.from], at[f.to]), w: f.amount, tip: F.flowTip(nameOf2(f.from), nameOf2(f.to), mt(f.amount), p.flowYear!) }));
    overlays.push({ id: 'flows', kind: 'arcs', label: F.flowsLabel(p.flowYear), items });
  }
  return {
    id: `food-${p.id}`, scale: trade ? 'div' : 'seq', years: p.years, year: p.year, ticks: p.ticks, ends: trade ? F.ends : undefined,
    missing: { none: F.none, notyet: data.some((d) => Object.values(d.v).some((e) => e[0] === -1)) ? F.notYetLegend : undefined }, source: sourceOf(p),
    text: {
      ...(c.words as LayerFile['text']),
      kicker: `${L.title(T.pick)} · {year}`, measure: L.measure, shareLabel: trade ? L.figure : F.share, none: F.notListed(0).replace('0', '{year}'),
      withheld: MAP_TEXT.withheldBy, withheldWhy: '', prev: '{year}: {value}', rank: VIEWS_TEXT.rank(0, 1).replace('0', '{rank}').replace('1', '{of}'),
      detailLabel: trade ? undefined : L.figure, rankLabel: F.rank, rankOf: F.rankOf, statusLabel: F.status,
      trend: F.trend(L.figure), trendCaption: F.trendCaption, ranking: F.ranking,
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes: withFoodNotes(c.notes, p.id), blocs: c.blocs, data,
    series: seriesOf(p.years.map((year) => Object.fromEntries(p.byYear[year].rows.map((r) => [r.id, r.value])))),
    format: { kind: 'mt' }, more: foodMore(p),
    ...(overlays.length ? { overlays } : {}),
  };
}

function withFoodNotes(notes: Record<string, string>, id: string): Record<string, string> {
  const out = { ...notes };
  for (const [place, n] of Object.entries(FOOD_NOTES[id] ?? {})) out[place] = out[place] ? `${out[place]} ${n}` : n;
  return out;
}

/** For each place on a food view: its balance in the latest year, its main partners (crops), and the same measure for the other commodities. */
function foodMore(p: FoodPage): Record<string, PanelBlock[]> {
  const F = FOOD_TEXT;
  const out: Record<string, PanelBlock[]> = {};
  const others = foodPages().filter((o) => o.layer === p.layer && o.commodity !== p.commodity);
  const ids = new Set(p.years.flatMap((y) => p.byYear[y].rows.map((r) => r.id)));
  const flows = p.crop ? foodPages().find((o) => o.commodity === p.commodity && o.layer === 'trade') : undefined;
  for (const id of ids) {
    const blocks: PanelBlock[] = [];
    const b = balanceOf(p, id, p.year);
    const rows = ([['production', F.production], ['imports', F.imports], ['exports', F.exports], ['use', F.use]] as const)
      .filter(([k]) => b[k] !== undefined).map(([k, name]) => ({ name, value: mt(b[k]!) }));
    if (b.production !== undefined && b.use) rows.push({ name: F.selfSufficiency, value: formatValue(b.production / b.use, { kind: 'share' }) });
    if (rows.length) blocks.push({ label: F.balanceBlock(p.year), caption: p.crop ? F.balanceCaption : F.balanceCaptionFert, rows });
    if (flows?.flowYear) {
      for (const [dir, label] of [['to', F.suppliers(flows.flowYear)], ['from', F.buyers(flows.flowYear)]] as const) {
        const mine = flows.flows.filter((f) => f[dir] === id);
        const total = mine.reduce((t, f) => t + f.amount, 0);
        if (!mine.length) continue;
        blocks.push({
          label, caption: F.partnersCaption,
          rows: mine.slice(0, 5).map((f) => ({ name: nameOf2(dir === 'to' ? f.from : f.to), value: mt(f.amount), note: F.ofListed(shareText(f.amount / total)) })),
          more: mine.length > 5 ? F.morePartners(mine.length - 5) : undefined,
        });
      }
    }
    const other = others.flatMap((o) => {
      const y = o.byYear[o.year];
      const i = y.rows.findIndex((r) => r.id === id);
      return i < 0 ? [] : [{ name: o.text.pick, value: foodValue(o, y.rows[i].value), href: live(`view:food:${o.id}`)?.path, note: F.rankNote(i + 1, y.rows.length, o.year) }];
    });
    if (other.length) blocks.push({ label: F.otherBlock(F.layer[p.layer].figure), caption: F.otherCaption, rows: other });
    if (blocks.length) out[id] = blocks;
  }
  return out;
}

/** A grouping's members (/blocs/{bloc}), or how many groupings each country belongs to (/blocs). Memberships do not change by year. */
function blocLayer(id: string): LayerFile {
  const c = common();
  const B = BLOCS_TEXT;
  const all = blocs();
  const year = Number(BLOCS_CHECKED.slice(0, 4));
  const label = B.checked(formatDate(BLOCS_CHECKED));
  const name = id === 'all' ? B.allTitle : BLOC_TEXT[id] ?? id;
  const v: Record<string, Entry> = {};
  const bl: Record<string, string> = {};
  const more: Record<string, PanelBlock[]> = {};
  const groupsOf = (pl: string, except?: string) => blocsOf(pl).filter((b) => b !== except)
    .map((b) => ({ name: BLOC_TEXT[b] ?? b, value: B.sub(all.get(b)!.length), href: live(`view:blocs:${b}`)?.path }));
  let order: string[];
  let series: Record<string, (number | null)[]> | undefined;
  if (id === 'all') {
    const counts = membershipCounts();
    counts.forEach((r, i) => { v[r.id] = [blocCountClass(r.n), B.memberOf(r.n), '', 0, i + 1]; });
    order = counts.map((r) => r.id);
    series = Object.fromEntries(counts.map((r) => [r.id, [r.n]]));
    for (const r of counts) more[r.id] = [{ label: B.itsBlocs, rows: groupsOf(r.id) }];
    for (const [b, m] of all) bl[b] = B.allBlocLine(BLOC_TEXT[b] ?? b, m.length);
  } else {
    const p = blocPage(id)!;
    order = p.byPopulation;
    for (const m of p.members) {
      const w = weightIn('population', m, p.members);
      v[m] = [4, B.member, w !== null ? shareText(w) : '', 0, 0];
      const rows = (['population', 'gdp', 'milusd', 'co2'] as const).map((k) => [k, weightIn(k, m, p.members)] as const)
        .filter(([, x]) => x !== null).map(([k, x]) => ({ name: MEASURE_TEXT[k], value: shareText(x!), note: String(measureYear(k)) }));
      more[m] = [...(rows.length ? [{ label: B.weightLabel, caption: B.weightCaption, rows }] : [])];
    }
    for (const pl of PLACES) {
      const g = groupsOf(pl.id, id);
      if (g.length) (more[pl.id] ??= []).push({ label: p.members.includes(pl.id) ? B.otherBlocs : B.itsBlocs, rows: g });
    }
    for (const [b, m] of all) {
      if (b === id) continue;
      const shared = m.filter((x) => p.members.includes(x));
      bl[b] = B.overlapLine(BLOC_TEXT[b] ?? b, shared.length, m.length, name);
    }
  }
  const notes = { ...c.notes };
  if (id !== 'all') for (const [pl, n] of Object.entries(MEMBER_NOTES[id] ?? {})) notes[pl] = notes[pl] ? `${notes[pl]} ${n}` : n;
  else for (const ns of Object.values(MEMBER_NOTES)) for (const [pl, n] of Object.entries(ns)) notes[pl] = notes[pl] ? `${notes[pl]} ${n}` : n;
  return {
    id: `blocs-${id}`, scale: 'seq', years: [year], year, ticks: id === 'all' ? B.countTicks : [],
    missing: { none: id === 'all' ? B.none : B.notMember }, source: B.source,
    text: {
      ...(c.words as LayerFile['text']),
      kicker: `${name} · {year}`, measure: '', shareLabel: id === 'all' ? B.groupings : B.membership, none: id === 'all' ? B.none : B.notMember,
      withheld: MAP_TEXT.withheldBy, withheldWhy: '', prev: '{year}: {value}', rank: VIEWS_TEXT.rank(0, 1).replace('0', '{rank}').replace('1', '{of}'),
      detailLabel: id === 'all' ? undefined : B.weightPopLabel, rankLabel: PT.rank, rankOf: PT.rankOf, ranking: B.ranking,
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes, blocs: c.blocs,
    data: [{ year, label, legend: id === 'all' ? B.countLegend : B.legendMember, v, order, blocs: bl }],
    ...(series ? { series, format: { kind: 'count' } as const } : {}), more,
  };
}

/** A grouping's members year by year since its founding: joined that year, member, left that year, former member. */
function historyLayer(id: string): LayerFile {
  const c = common();
  const H = HISTORY_TEXT;
  const p = historyPage(id)!;
  const name = BLOC_TEXT[id] ?? id;
  const today = blocs();
  const data: LayerYear[] = p.years.map((year) => {
    const v: Record<string, Entry> = {};
    for (const pl of p.ever) {
      const st = statusIn(p.spans, pl, year);
      if (st) v[pl] = [STATUS_CLASS[st], H.status[st], H.since(spanText(p.spans, pl)), 0, 0];
    }
    const members = p.byYear[year].members;
    const bl: Record<string, string> = {};
    for (const [b, m] of today) bl[b] = H.blocLine(BLOC_TEXT[b] ?? b, m.filter((x) => members.includes(x)).length, m.length, name, year);
    return { year, legend: H.legend(year), v, order: members, blocs: bl };
  });
  const more: Record<string, PanelBlock[]> = {};
  for (const pl of p.ever) {
    more[pl] = [{ label: H.spans, rows: p.spans.filter((s) => s.place === pl).map((s) => ({ name: `${H.joined} ${s.from}`, value: s.to === null ? H.status.member : `${H.left} ${s.to}` })) }];
  }
  return {
    id: `history-${id}`, scale: 'seq', years: p.years, year: p.years.at(-1)!, ticks: [],
    missing: { none: H.notMember }, source: H.source,
    text: {
      ...(c.words as LayerFile['text']),
      kicker: `${name} · {year}`, measure: '', shareLabel: H.membership, none: H.notMember,
      withheld: MAP_TEXT.withheldBy, withheldWhy: '', prev: '{year}: {value}', rank: VIEWS_TEXT.rank(0, 1).replace('0', '{rank}').replace('1', '{of}'),
      detailLabel: H.spans, statusLabel: PT.status,
    },
    tags: c.tags, names: c.names, hrefs: c.hrefs, dossiers: c.dossiers, slugs: c.slugs, notes: c.notes, blocs: c.blocs, data, more,
  };
}

const placeNames = new Map(PLACES.map((x) => [x.id, x.name]));
const nameOf2 = (id: string) => placeNames.get(id) ?? id;

let defs: LayerDef[] | null = null;
export function mapLayers(): LayerDef[] {
  defs ??= [
    ...mineralPages().map((p) => ({ id: `minerals-${p.id}`, view: `view:minerals:${p.id}`, topic: 'resources', build: () => mineralLayer(p) })),
    ...viewPages().map((p) => ({ id: `${p.family.id}-${p.id}`, view: `view:${p.family.id}:${p.id}`, topic: p.family.hub, build: () => indicatorLayer(p) })),
    ...disasterPages().map((p) => ({ id: `disasters-${p.id}`, view: `view:disasters:${p.id}`, topic: 'climate', build: () => disasterLayer(p) })),
    ...foodPages().map((p) => ({ id: `food-${p.id}`, view: `view:food:${p.id}`, topic: 'resources', build: () => foodLayer(p) })),
    ...HISTORY_BLOCS.map((id) => ({ id: `history-${id}`, view: `view:alliance-history:${id}`, topic: 'power', build: () => historyLayer(id) })),
    ...['all', ...blocPages().map((b) => b.id)].map((id) => ({ id: `blocs-${id}`, view: `view:blocs:${id}`, topic: 'power', build: () => blocLayer(id) })),
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
