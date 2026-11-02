// The facts a dossier summary (United States, China, Russia) is drafted from: the figures the dossier page already
// shows, each with its unit, year, source, link and the date the site last refreshed that source. Generated from
// the data snapshot (`npm run ai:facts`), and again at build time, so a summary whose figures changed since it was
// approved is hidden until it is redrafted (./texts.ts).
import { INDICATORS } from '../../data/indicators.ts';
import { INDICATOR_TEXT } from '../../i18n/en.ts';
import { RESOURCE_TEXT, mineralName } from '../../i18n/pages.en.ts';
import { countryModel, DOSSIERS, type Figure } from '../country.ts';
import { dossierFor } from '../dossier.ts';
import { data, licenceOf, refreshed, sourceName } from '../data.ts';
import { place } from '../places.ts';
import type { Fact, FactsFile } from './facts.ts';

/** Where each source's figures can be checked: its own data page, or its terms page when it has no other. */
const DATA_LINK: Record<string, (iso2: string, iso3: string) => string> = {
  worldbank: (iso2) => `https://data.worldbank.org/country/${iso2.toLowerCase()}`,
  owid: (_iso2, iso3) => `https://ourworldindata.org/co2/country/${iso3.toLowerCase()}`,
  unhcr: () => 'https://www.unhcr.org/refugee-statistics/download',
  eia: () => 'https://www.eia.gov/international/data/world',
  faostat: () => 'https://www.fao.org/faostat/en/#data',
  'usgs-minerals': () => 'https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries',
  celestrak: () => 'https://celestrak.org/satcat/search.php',
  epoch: () => 'https://epoch.ai/data',
  treasury: () => 'https://home.treasury.gov/data/treasury-international-capital-tic-system',
  fas: () => 'https://fas.org/initiative/status-world-nuclear-forces/',
  wpp: () => 'https://population.un.org/wpp/',
  comtrade: () => 'https://comtradeplus.un.org/',
  sipri: () => 'https://www.sipri.org/databases/armstransfers',
  aqueduct: () => 'https://www.wri.org/aqueduct',
  aiddata: () => 'https://www.aiddata.org/data/aiddatas-global-chinese-development-finance-dataset-version-3-0',
};

const linkOf = (source: string, id: string): string => {
  const p = place(id)!;
  return DATA_LINK[source]?.(p.iso2, p.iso3) ?? licenceOf(source)?.terms ?? 'https://geopolitics.tools/sources';
};
const dateOf = (source: string) => (refreshed(source) ?? data().snapshot.created).slice(0, 10);
const round = (v: number) => Number(v.toPrecision(6));

/** A registry figure as it is meant: a share as a percentage, everything else in its own unit. */
function figureFact(f: Figure, placeId: string, id = f.id): Fact[] {
  const ind = INDICATORS[f.id];
  const t = INDICATOR_TEXT[f.id];
  const share = ind.format.kind === 'share';
  const unit = share ? '%' : ind.format.kind === 'mt' ? 'million tonnes' : t.unit ?? '';
  const value = round(share ? f.value * 100 : f.value);
  const name = place(placeId)!.name;
  const out: Fact[] = [{
    // The indicator's note goes in only when it has no figures of its own (the checker wants one figure a fact).
    id, statement: `${t.label} of ${name}${t.note && !/\d/.test(t.note) ? ` (${t.note.replace(/\.$/, '')})` : ''}.`, value, unit,
    unitAliases: unit === 'US$' ? ['$', 'dollars'] : unit === 'people' ? ['residents', 'inhabitants'] : undefined,
    period: String(f.year), places: [placeId], source: sourceName(f.source), link: linkOf(f.source, placeId), date: dateOf(f.source),
  }];
  if (f.of > 1) {
    const src = { period: String(f.year), places: [placeId], source: sourceName(f.source), link: linkOf(f.source, placeId), date: dateOf(f.source) };
    out.push({ id: `${id}-rank`, statement: `${name}'s place on ${t.label.toLowerCase()}, largest first.`, value: f.rank, unit: 'rank', ...src });
    out.push({ id: `${id}-of`, statement: `Places ranked on ${t.label.toLowerCase()}.`, value: f.of, unit: 'places', unitAliases: ['countries'], ...src });
  }
  return out;
}

/** The facts file of one dossier, or null when the snapshot has nothing for it. */
export function dossierFacts(id: string, buildYear = Number(data().snapshot.created.slice(0, 4))): FactsFile | null {
  if (!DOSSIERS.includes(id)) return null;
  const m = countryModel(id);
  if (!m) return null;
  const name = m.place.name;
  const facts: Fact[] = [];
  const seen = new Set<string>();
  const addFig = (f: Figure) => { if (!seen.has(f.id)) { seen.add(f.id); facts.push(...figureFact(f, id)); } };
  m.figures.forEach(addFig);
  const d = dossierFor(id, buildYear);
  [...(d.money?.stats ?? []), ...(d.people?.stats ?? []), ...(d.tech?.stats ?? []), ...(d.climate?.stats ?? [])].forEach(addFig);
  const countries = new Set<string>([id]);
  for (const r of m.deps) {
    if (r.state !== 'ok') continue;
    const noun = RESOURCE_TEXT[r.resource].noun;
    const period = r.period ?? (r.year ? String(r.year) : undefined);
    const base = { period, places: [id], source: sourceName(r.source), link: linkOf(r.source, id), date: dateOf(r.source) };
    if (r.reliance !== undefined && r.reliance >= 0) facts.push({ id: `imports-${r.resource}`, statement: `${name}'s net imports of ${noun} as a share of its use.`, value: round(r.reliance * 100), unit: '%', unitAliases: [`${noun} use`, `${noun} it uses`, `of its ${noun}`, `${noun} imports`], ...base });
    if (r.exportShare !== undefined && r.reliance !== undefined && r.reliance < 0) facts.push({ id: `exports-${r.resource}`, statement: `${name}'s net exports of ${noun} as a share of its production.`, value: round(r.exportShare * 100), unit: '%', unitAliases: [`${noun} production`, `${noun} it produces`, `of its ${noun}`, `${noun} exports`], ...base });
    const main = r.main ?? r.top;
    if (main && place(main.id)) {
      countries.add(main.id);
      facts.push({ id: `main-supplier-${r.resource}`, statement: `${place(main.id)!.name} is the main supplier of ${name}'s ${noun} imports.`, value: round(main.share * 100), unit: '%', unitAliases: [`${noun} imports`, `imports of ${noun}`], ...base, places: [id, main.id] });
    }
  }
  for (const x of m.minerals) {
    const usgs = { source: sourceName('usgs-minerals'), link: linkOf('usgs-minerals', id), date: dateOf('usgs-minerals') };
    const what = `${x.measure === 'primary' ? 'primary production' : 'mine production'} of ${mineralName(x.id, x.label)}`;
    facts.push({ id: `mineral-${x.id}`, statement: `${name}'s share of world ${what}${x.estimated ? ' (estimated)' : ''}.`, value: round(x.share * 100), unit: '%', unitAliases: [mineralName(x.id, x.label)], period: String(x.year), places: [id], ...usgs });
    facts.push({ id: `mineral-${x.id}-rank`, statement: `${name}'s place among producers of ${mineralName(x.id, x.label)}, largest first.`, value: x.rank, unit: 'rank', period: String(x.year), places: [id], ...usgs });
  }
  const b = m.blocks;
  if (b.refugees?.hosted) addFig(b.refugees.hosted);
  if (b.refugees?.from) addFig(b.refugees.from);
  if (b.nuclear) facts.push({ id: 'nuclear-warheads', statement: `${name}'s estimated total inventory of nuclear warheads.`, value: b.nuclear.value, unit: 'warheads', period: String(b.nuclear.year), places: [id], source: sourceName('fas'), link: linkOf('fas', id), date: dateOf('fas') });
  if (b.lending) facts.push({ id: 'chinese-lending', statement: `Loans and grants committed by China to ${name}.`, value: round(b.lending.total), unit: 'US$', unitAliases: ['$', 'dollars'], period: `${b.lending.from}–${b.lending.to}`, places: [id, 'CHN'], source: sourceName('aiddata'), link: linkOf('aiddata', id), date: dateOf('aiddata') });
  if (d.money?.treasuries) {
    const t = d.money.treasuries;
    facts.push({ id: 'us-treasuries', statement: `US Treasury securities held in ${name}.`, value: round(t.value), unit: 'billion US$', unitAliases: ['billion dollars', '$ billion'], period: t.month, places: [id, 'USA'], source: sourceName('treasury'), link: linkOf('treasury', id), date: dateOf('treasury') });
  }
  if (d.tech?.models) facts.push({ id: 'ai-models', statement: `Notable AI models from organisations in ${name}.`, value: d.tech.models.value, unit: 'models', period: String(d.tech.models.year), places: [id], source: sourceName('epoch'), link: linkOf('epoch', id), date: dateOf('epoch') });
  if (!facts.length) return null;
  return {
    id: `dossier:${id}`, kind: 'dossier', subject: name, countries: [...countries],
    generated: `src/lib/ai/dossier-facts.ts from snapshot ${data().snapshot.id}`, sample: process.env.GT_DATA === 'sample' || undefined, facts,
  };
}
