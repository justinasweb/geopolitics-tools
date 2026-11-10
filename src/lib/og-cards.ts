// What each page's share image says (src/lib/og.ts draws it): kicker, title, headline figure, caption, bars and
// source, from the same models the pages use. Kept here rather than in the image route so tests can build every card.
import { INDICATORS } from '../data/indicators';
import { INDICATOR_TEXT, STATUS_TEXT, tagged } from '../i18n/en';
import { COMPARE_TEXT, INDICATOR_PAGE, OG_TEXT, SOURCE_NOTE, mineralName } from '../i18n/pages.en';
import { countryModel } from './country';
import { creditName, licenceOf } from './data';
import { formatDate, formatShare, formatValue } from './format';
import { answerFor, indicatorModel, tagOf } from './indicator';
import type { Card } from './og';
import { place } from './places';
import { paths, routes, type Route } from './routes';
import { siteName } from './site';
import { MINERALS_VIEW } from '../i18n/map.en';
import { amount, lede, listed, mineralPage, nameOf as producerName, shareText } from './minerals';
import { creditOf, lede as viewLede, valueText, viewPage } from './views';
import { VIEW_TEXT } from '../i18n/views.en';
import { DISASTERS_TEXT, KIND_TEXT } from '../i18n/disasters.en';
import { disasterPage } from './disasters';
import { conflictPage } from './conflict';
import { CONFLICT_TEXT, monthText } from '../i18n/conflict.en';
import { FOOD_TEXT } from '../i18n/food.en';
import { BLOCS_TEXT, HISTORY_TEXT, MEASURE_TEXT } from '../i18n/blocs.en';
import { BLOC_TEXT } from '../i18n/map.en';
import { blocPage, membershipCounts } from './blocview';
import { historyPage } from './history';
import { BLOCS_CHECKED } from './blocs';
import { riverPage } from './rivers';
import { RIVERS_TEXT } from '../i18n/water.en';
import { estimated as foodEstimated, foodPage, lede as foodLede, mt, netText, shareOf as foodShare } from './food';
import { amount as energyAmount, energyPage, lede as energyLede, shareOf as energyShare, valueText as energyValue } from './energy';
import { ENERGY_TEXT } from '../i18n/energy.en';
import { EXPLORER_TEXT } from '../i18n/explorer.en';
import { explorerMeasures } from './explorer';
import { DEPS_TEXT } from '../i18n/dependencies.en';
import { OVERLAP_TEXT } from '../i18n/overlap.en';
import { CHAIN_TEXT, CHAINS_TEXT, chainTitle } from '../i18n/supply-chains.en';
import { chainLinks, chainOf } from './supply-chains';
import { amount as chainAmount, totals } from './supply-chains/model';
import { ledeOf, periodLabel } from './supply-chains/render';
import type { View } from './explorer/model';
import { ATLAS_TEXT } from '../i18n/atlas.en';
import { atlasLayers } from './atlas';
import { HUB_TEXT } from '../i18n/hubs.en';
import { NUCLEAR_TEXT } from '../i18n/nuclear.en';
import { nuclearAnswer, sharingRows, treatyCounts, warheads, warheadsModel } from './nuclear';
import { hubModel } from './hubs';
import { weekPage } from './week';
import { WEEK_TEXT } from '../i18n/week.en';

const nameOf = (id: string) => place(id)?.name ?? id;
const short = (s: string) => creditName(s);
const TITLES: Record<string, string> = { countries: 'Countries', indicators: 'Indicators', about: 'About', methodology: 'Methodology', privacy: 'Privacy', sources: 'Sources' };

/** The card in words, for og:image:alt and twitter:image:alt: kicker, title, the headline figure with its caption (or
 *  the caption alone) and the source, joined with "; ", or with ". " next to a caption that is a sentence of its own. */
export function cardAlt(c: Card): string {
  const sentence = !c.figure && /\.$/.test(c.caption ?? '');
  const caption = c.caption?.replace(/\.$/, '');
  const middle = c.figure ? `${c.figure}${caption ? ` (${caption})` : ''}` : caption;
  const parts = [{ text: `${c.kicker}: ${c.title}`, sentence: false }, { text: middle, sentence }, { text: c.source && OG_TEXT.altSource(c.source), sentence: false }]
    .filter((p): p is { text: string; sentence: boolean } => Boolean(p.text));
  return `${parts.map((p, i) => {
    if (!i) return p.text;
    const full = p.sentence || parts[i - 1].sentence;
    return `${full ? '. ' : '; '}${full ? p.text[0].toUpperCase() + p.text.slice(1) : p.text}`;
  }).join('')}.`;
}

/** The site default share image, for pages that name none. */
export const DEFAULT_IMAGE = paths.image('page', 'default');

let byImage: Map<string, Route> | null = null;
/** The alt text for a share image path (/og/countries/germany.png): the site default's own card, or a live page's;
 *  undefined when no card has that path. */
export function shareAlt(image: string | undefined): string | undefined {
  if (image === DEFAULT_IMAGE) return cardAlt(card(null));
  byImage ??= new Map(routes().filter((r) => r.live && r.image).map((r) => [r.image!, r]));
  const r = image ? byImage.get(image) : undefined;
  return r ? cardAlt(card(r)) : undefined;
}

/** The card for one page, from its route; null gives the site default. */
export function card(r: Route | null): Card {
  if (!r) return { kicker: siteName, title: 'Maps and figures on resources, technology, climate, security and power', caption: 'Every number with its source and date.' };
  if (r.kind === 'country') {
    const m = countryModel(r.id)!;
    const f = m.figures[0];
    const fm = f && indicatorModel(f.id);
    return {
      kicker: OG_TEXT.countryKicker, title: m.place.name,
      figure: f ? formatValue(f.value, INDICATORS[f.id].format) : undefined,
      caption: f ? tagged(`${INDICATOR_TEXT[f.id].label}, ${f.year}`, fm ? tagOf(fm, r.id, f.year) : undefined) : m.summary[0],
      source: f ? short(f.source) : undefined,
      bars: m.minerals.map((x) => ({ label: mineralName(x.id, x.label), value: x.share, text: formatShare(x.share) })),
    };
  }
  if (r.kind === 'indicator') {
    const m = indicatorModel(r.id)!;
    const fmt = m.indicator.format;
    return {
      kicker: OG_TEXT.indicatorKicker, title: INDICATOR_PAGE.shareText(INDICATOR_TEXT[r.id].label), caption: answerFor(m, true),
      source: SOURCE_NOTE[r.id] ?? m.sources.map(short).join('; '),
      bars: m.common.slice(0, 5).map((x) => ({ label: nameOf(x.id), value: x.value, text: tagged(formatValue(x.value, fmt), tagOf(m, x.id, x.year)) })),
    };
  }
  if (r.kind === 'compare' && r.id) {
    const [a, b] = r.id.split(',');
    const gdp = [a, b].map((p) => countryModel(p)!.figures.find((f) => f.id === 'gdp'));
    const gm = indicatorModel('gdp');
    return {
      kicker: OG_TEXT.compareKicker, title: COMPARE_TEXT.title(nameOf(a), nameOf(b)),
      caption: gdp.every(Boolean) ? `GDP, ${gdp[0]!.year}` : undefined, source: gdp.every(Boolean) ? short(gdp[0]!.source) : undefined,
      bars: gdp.every(Boolean) ? [a, b].map((p, i) => ({ label: nameOf(p), value: gdp[i]!.value, text: tagged(formatValue(gdp[i]!.value, INDICATORS.gdp.format), gm ? tagOf(gm, p, gdp[i]!.year) : undefined) })) : [],
    };
  }
  if (r.kind === 'view' && r.id.startsWith('minerals:')) {
    const p = mineralPage(r.id.split(':')[1])!;
    const y = p.latest;
    return {
      kicker: MINERALS_VIEW.section, title: p.text.title(p.title), figure: y.world ? `${amount(y.world)} ${p.unit}` : undefined,
      caption: lede(p) ?? undefined, source: `${p.source}${y.estimated ? ', estimated' : ''}`,
      bars: listed(y).slice(0, 5).map((x) => ({ label: producerName(x), value: x.share!, text: shareText(x.share!) })),
    };
  }
  if (r.kind === 'view' && r.id.startsWith('disasters:')) {
    const p = disasterPage(r.id.split(':')[1])!;
    const x = p.byDays[p.days];
    return {
      kicker: DISASTERS_TEXT.section, title: KIND_TEXT[p.id].title, figure: DISASTERS_TEXT.ogFigure(x.alerts.length), caption: DISASTERS_TEXT.ogCaption(x.days),
      source: `${short('gdacs')}, ${formatDate(x.from)} – ${formatDate(x.to)}`,
      bars: x.rows.slice(0, 5).map((y) => ({ label: nameOf(y.id), value: y.n, text: String(y.n) })),
    };
  }
  if (r.kind === 'view' && r.id.startsWith('conflict:')) {
    const p = conflictPage()!;
    const m = p.byMonth[p.month];
    const f = (v: number) => formatValue(v, { kind: 'count' });
    return {
      kicker: CONFLICT_TEXT.section, title: CONFLICT_TEXT.title, figure: CONFLICT_TEXT.deaths(f(m.deaths12)), caption: CONFLICT_TEXT.in12(monthText(m.n, true)),
      source: `${short('ucdp')}, ${monthText(m.n)}${m.preliminary ? `, ${CONFLICT_TEXT.preliminary.toLowerCase()}` : ''}`,
      bars: m.rows.slice(0, 5).map((y) => ({ label: nameOf(y.id), value: y.deaths, text: f(y.deaths) })),
    };
  }
  if (r.kind === 'view' && r.id.startsWith('blocs:')) {
    const id = r.id.split(':')[1];
    if (id === 'all') {
      const c = membershipCounts().slice(0, 5);
      return { kicker: BLOCS_TEXT.hub, title: BLOCS_TEXT.allTitle, caption: BLOCS_TEXT.countLegend, bars: c.map((x) => ({ label: nameOf(x.id), value: x.n, text: String(x.n) })), source: BLOCS_TEXT.imageSource(formatDate(BLOCS_CHECKED), []) };
    }
    const p = blocPage(id)!;
    const shares = p.shares.slice(0, 5);
    // The count is the member lists'; the shares are their measures' sources, each named once.
    const others = [...new Set(shares.flatMap((s) => [INDICATORS[s.id].source].flat()).map(short))];
    return {
      kicker: BLOCS_TEXT.section, title: BLOC_TEXT[id] ?? id, figure: String(p.members.length), caption: BLOCS_TEXT.imageCaption(id, BLOC_TEXT[id] ?? id, p.members.length),
      bars: shares.map((s) => ({ label: `${MEASURE_TEXT[s.id]}, ${s.year}`, value: s.share, text: formatShare(s.share) })),
      source: BLOCS_TEXT.imageSource(formatDate(BLOCS_CHECKED), others),
    };
  }
  if (r.kind === 'view' && r.id.startsWith('history:')) {
    const id = r.id.split(':')[1];
    const p = historyPage(id)!;
    const name = BLOC_TEXT[id] ?? id;
    const first = p.years[0];
    const last = p.years.at(-1)!;
    const steps = [...new Set([first, ...p.changes.filter((y) => y % 5 === 0 || y === p.changes.at(-1)), last])].slice(-5);
    return {
      kicker: HISTORY_TEXT.section, title: HISTORY_TEXT.title(name), figure: String(p.byYear[last].members.length), caption: HISTORY_TEXT.imageCaption(id, first, last, p.byYear[last].members.length),
      bars: steps.map((y) => ({ label: String(y), value: p.byYear[y].members.length, text: String(p.byYear[y].members.length) })),
      source: HISTORY_TEXT.imageSource(last),
    };
  }
  if (r.kind === 'view' && r.id.startsWith('rivers:')) {
    const id = r.id.split(':')[1];
    const p = riverPage(id)!;
    const dep = viewPage('waterdep');
    const name = RIVERS_TEXT.name[id] ?? id;
    const bars = dep ? p.countries.filter((x) => x.fromAbroad !== null).map((x) => ({ label: `${nameOf(x.id)}, ${RIVERS_TEXT.fromAbroad(dep.year).toLowerCase()}`, value: x.fromAbroad!, text: valueText(dep, x.fromAbroad!) })) : [];
    // The dams are Global Dam Watch's, credited in full as its licence asks; the bars are AQUASTAT's.
    return {
      kicker: RIVERS_TEXT.section, title: RIVERS_TEXT.title(name), figure: String(p.dams.length), caption: RIVERS_TEXT.damsTitle, bars,
      source: [licenceOf('gdw')?.credit ?? short('gdw'), ...(bars.length ? [short('aquastat')] : [])].join('; '),
    };
  }
  if (r.kind === 'view' && r.id.startsWith('nuclear:')) {
    const id = r.id.split(':')[1];
    const N = NUCLEAR_TEXT;
    if (id === 'warheads') {
      const m = warheadsModel()!;
      const y = m.byYear[m.year];
      return {
        kicker: N.section, title: N.title.warheads, figure: N.ogFigure(warheads(y.world)), caption: nuclearAnswer(id) ?? undefined, source: N.estimate(m.year),
        bars: y.rows.slice(0, 5).map((x) => ({ label: nameOf(x.id), value: x.value, text: warheads(x.value) })),
      };
    }
    if (id === 'treaties') {
      const c = treatyCounts();
      return {
        kicker: N.section, title: N.title.treaties, caption: nuclearAnswer(id) ?? undefined, source: N.treatySource,
        bars: [{ label: N.nptLong, value: c.npt, text: String(c.npt) }, { label: N.tpnwLong, value: c.tpnw, text: String(c.tpnw) }],
      };
    }
    return { kicker: N.section, title: N.title.sharing, figure: String(new Set(sharingRows().map((x) => x.place)).size), caption: nuclearAnswer(id) ?? undefined, source: N.sharingLegend };
  }
  if (r.kind === 'view' && r.id.startsWith('food:')) {
    const p = foodPage(r.id.split(':')[1])!;
    const y = p.byYear[p.year];
    const trade = p.layer === 'trade';
    const rows = trade ? [...y.rows.slice(0, 3), ...y.rows.slice(-2)] : y.rows.slice(0, 5);
    return {
      kicker: FOOD_TEXT.section, title: FOOD_TEXT.layer[p.layer].title(p.text.pick), caption: foodLede(p) ?? undefined, source: `${short('faostat')}, ${p.year}`,
      // An estimate says so after the share, in the same brackets: "12.3 Mt (15%, estimate)".
      bars: rows.map((x) => {
        const est = foodEstimated(p, x.id, p.year);
        return { label: nameOf(x.id), value: Math.abs(x.value), text: trade ? tagged(netText(x.value), est ? 'estimate' : undefined) : `${mt(x.value)} (${foodShare(x.value, y.world)}${est ? `, ${STATUS_TEXT.estimate.toLowerCase()}` : ''})` };
      }),
    };
  }
  if (r.kind === 'view' && r.id.startsWith('energy:')) {
    const p = energyPage(r.id.split(':')[1])!;
    const y = p.byYear[p.year];
    const trade = p.layer === 'trade';
    const rows = trade ? [...y.rows.slice(0, 3), ...y.rows.slice(-2)] : y.rows.slice(0, 5);
    return {
      kicker: p.text.pick, title: ENERGY_TEXT.layer[p.layer].title(p.text.pick), caption: energyLede(p) ?? undefined, source: `${short('eia')}, ${p.year}`,
      bars: rows.map((x) => ({ label: nameOf(x.id), value: Math.abs(x.value), text: trade ? energyValue(p, x.value) : `${energyAmount(p.fuel, p.layer, x.value)} (${energyShare(x.value, y.world)})` })),
    };
  }
  if (r.kind === 'view') {
    const [family, id] = r.id.split(':');
    const p = viewPage(id)!;
    const y = p.byYear[p.year];
    const rows = p.layer.scale === 'div' ? [...y.rows.slice(0, 3), ...y.rows.slice(-2)] : y.rows.slice(0, 5);
    return {
      kicker: VIEW_TEXT[family].section, title: p.text.title, caption: viewLede(p) ?? undefined, source: `${creditOf(p)}, ${p.year}`,
      bars: rows.map((x) => ({ label: nameOf(x.id), value: Math.abs(x.value), text: valueText(p, x.value) })),
    };
  }
  if (r.kind === 'tool' && r.id.startsWith('explorer:')) {
    const view = r.id.split(':')[1];
    return { kicker: EXPLORER_TEXT.title, title: EXPLORER_TEXT.views[view], caption: EXPLORER_TEXT.description[view as View](explorerMeasures().length) };
  }
  if (r.kind === 'week') {
    // The alert count when there is one, else the first card's finding; every figure with its period.
    const m = weekPage(r.id || undefined)!;
    const c = m.counts[0];
    // A card that only names events (a withheld source) has no finding to lead with.
    const lead = m.cards.find((x) => !x.quiet && x.body?.type !== 'links') ?? m.cards[0];
    return {
      kicker: WEEK_TEXT.ogKicker, title: m.title, figure: c?.num, caption: c ? `${c.label}, ${c.source.split(' · ')[1]}` : lead?.headline,
      source: c ? 'GDACS' : lead ? `${lead.source}, ${lead.period}` : undefined,
    };
  }
  if (r.kind === 'hub') {
    const m = hubModel(r.id)!;
    const lead = m.cards[0];
    return { kicker: HUB_TEXT.kicker, title: m.name, caption: lead?.headline, source: lead ? `${lead.source}, ${lead.period}` : undefined };
  }
  if (r.kind === 'tool' && r.id === 'atlas') return { kicker: ATLAS_TEXT.crumb, title: ATLAS_TEXT.title, caption: ATLAS_TEXT.description(atlasLayers().length) };
  if (r.kind === 'tool' && r.id === 'dependencies') return { kicker: DEPS_TEXT.crumb, title: DEPS_TEXT.title, caption: DEPS_TEXT.lede };
  if (r.kind === 'tool' && r.id === 'blocs-overlap') return { kicker: OVERLAP_TEXT.crumb, title: OVERLAP_TEXT.title, caption: OVERLAP_TEXT.lede };
  if (r.kind === 'tool' && r.id === 'supply-chains') return { kicker: CHAINS_TEXT.crumb, title: CHAINS_TEXT.title, caption: CHAINS_TEXT.indexLede(chainLinks().length) };
  if (r.kind === 'tool' && r.id.startsWith('supply-chains:')) {
    const c = chainOf(r.id.split(':')[1]);
    // Units longer than "kb/d" wrap beside the bars, so they go in the source line instead.
    const { short, unit } = CHAIN_TEXT[c.key];
    const fits = short.length <= 4;
    return {
      kicker: CHAINS_TEXT.title, title: chainTitle(c.key, c.label).full, caption: ledeOf(c), source: `${c.credit}, ${periodLabel(c)}${fits ? '' : `, ${unit}`}`,
      bars: totals(c.pairs, 0).slice(0, 5).map(([id, v]) => ({ label: nameOf(id), value: v, text: fits ? `${chainAmount(v, c)} ${short}` : chainAmount(v, c) })),
    };
  }
  return { kicker: OG_TEXT.pageKicker, title: TITLES[r.id || r.kind] ?? r.id };
}
