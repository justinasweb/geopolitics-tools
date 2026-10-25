// Share images for every live page that names one in the route registry (og:image), plus the site default.
import type { APIRoute, GetStaticPaths } from 'astro';
import { INDICATORS } from '../../../data/indicators';
import { INDICATOR_TEXT } from '../../../i18n/en';
import { COMPARE_TEXT, INDICATOR_PAGE, OG_TEXT, SOURCE_NOTE, SOURCE_SHORT, mineralName } from '../../../i18n/pages.en';
import { countryModel } from '../../../lib/country';
import { sourceName } from '../../../lib/data';
import { formatShare, formatValue } from '../../../lib/format';
import { answerFor, indicatorModel } from '../../../lib/indicator';
import { shareImage, type Card } from '../../../lib/og';
import { place } from '../../../lib/places';
import { routes, type Route } from '../../../lib/routes';
import { siteName } from '../../../lib/site';
import { MINERALS_VIEW } from '../../../i18n/map.en';
import { amount, lede, listed, mineralPage, nameOf as producerName, shareText } from '../../../lib/minerals';

export const getStaticPaths = (() => {
  const out = routes().filter((r) => r.live && r.image).map((r) => {
    const [, , kind, file] = r.image!.split('/');
    return { params: { kind, name: file.replace(/\.png$/, '') }, props: { route: r as Route | null } };
  });
  return [...out, { params: { kind: 'page', name: 'default' }, props: { route: null } }];
}) satisfies GetStaticPaths;

const nameOf = (id: string) => place(id)?.name ?? id;
const short = (s: string) => SOURCE_SHORT[s] ?? sourceName(s);
const TITLES: Record<string, string> = { countries: 'Countries', indicators: 'Indicators', about: 'About', methodology: 'Methodology', privacy: 'Privacy', sources: 'Sources' };

function card(r: Route | null): Card {
  if (!r) return { kicker: siteName, title: 'Maps and figures on resources, technology, climate, security and power', caption: 'Every number with its source and date.' };
  if (r.kind === 'country') {
    const m = countryModel(r.id)!;
    const f = m.figures[0];
    return {
      kicker: m.dossier ? OG_TEXT.dossierKicker : OG_TEXT.countryKicker, title: m.place.name,
      figure: f ? formatValue(f.value, INDICATORS[f.id].format) : undefined,
      caption: f ? `${INDICATOR_TEXT[f.id].label}, ${f.year}` : m.summary[0],
      source: f ? short(f.source) : undefined,
      bars: m.minerals.map((x) => ({ label: mineralName(x.id, x.label), value: x.share, text: formatShare(x.share) })),
    };
  }
  if (r.kind === 'indicator') {
    const m = indicatorModel(r.id)!;
    const fmt = m.indicator.format;
    return {
      kicker: OG_TEXT.indicatorKicker, title: INDICATOR_PAGE.shareText(INDICATOR_TEXT[r.id].label), caption: answerFor(m),
      source: SOURCE_NOTE[r.id] ?? m.sources.map(short).join('; '),
      bars: m.common.slice(0, 5).map((x) => ({ label: nameOf(x.id), value: x.value, text: formatValue(x.value, fmt) })),
    };
  }
  if (r.kind === 'compare') {
    const [a, b] = r.id.split(',');
    const gdp = [a, b].map((p) => countryModel(p)!.figures.find((f) => f.id === 'gdp'));
    return {
      kicker: OG_TEXT.compareKicker, title: COMPARE_TEXT.title(nameOf(a), nameOf(b)),
      caption: gdp.every(Boolean) ? `GDP, ${gdp[0]!.year}` : undefined, source: gdp.every(Boolean) ? short(gdp[0]!.source) : undefined,
      bars: gdp.every(Boolean) ? [a, b].map((p, i) => ({ label: nameOf(p), value: gdp[i]!.value, text: formatValue(gdp[i]!.value, INDICATORS.gdp.format) })) : [],
    };
  }
  if (r.kind === 'view' && r.id.startsWith('minerals:')) {
    const p = mineralPage(r.id.split(':')[1])!;
    const y = p.latest;
    return {
      kicker: MINERALS_VIEW.section, title: MINERALS_VIEW.title(p.title), figure: y.world ? `${amount(y.world)} ${p.unit}` : undefined,
      caption: lede(p) ?? undefined, source: `${p.source}${y.estimated ? ', estimated' : ''}`,
      bars: listed(y).slice(0, 5).map((x) => ({ label: producerName(x), value: x.share!, text: shareText(x.share!) })),
    };
  }
  return { kicker: OG_TEXT.pageKicker, title: TITLES[r.id || r.kind] ?? r.id };
}

export const GET: APIRoute = async ({ props }) => {
  const png = await shareImage(card((props as { route: Route | null }).route));
  return new Response(png as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': 'image/png' } });
};
