// CSV downloads, one per indicator page whose sources allow it: every country and year, with status, source
// and when the site retrieved it. Columns: country, iso3, year, value, status, source, retrieved.
import type { APIRoute, GetStaticPaths } from 'astro';
import { INDICATOR_SLUGS } from '../../i18n/slugs.en';
import { csvAllowed, indicatorModel } from '../../lib/indicator';
import { licenceOf, refreshed, sourceName } from '../../lib/data';
import { place } from '../../lib/places';
import { ranked } from '../../lib/stats';
import { routes } from '../../lib/routes';

export const getStaticPaths = (() => routes()
  .filter((r) => r.kind === 'indicator' && r.live && csvAllowed(indicatorModel(r.id)!))
  .map((r) => ({ params: { name: INDICATOR_SLUGS[r.id] }, props: { id: r.id } }))) satisfies GetStaticPaths;

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = ({ props }) => {
  const m = indicatorModel((props as { id: string }).id)!;
  const source = m.sources.map((s) => licenceOf(s)?.credit ?? sourceName(s)).join('; ');
  const retrieved = (refreshed(m.source) ?? '').slice(0, 10);
  const after = m.indicator.projectedAfter;
  const prelim = new Set(m.preliminary);
  const lines = [['country', 'iso3', 'year', 'value', 'status', 'source', 'retrieved'].join(',')];
  const ids = Object.keys(m.loaded.values).filter(ranked).sort((a, b) => (place(a)?.name ?? a).localeCompare(place(b)?.name ?? b, 'en'));
  for (const id of ids) {
    const p = place(id)!;
    for (const [y, v] of Object.entries(m.loaded.values[id]).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const status = after !== undefined && Number(y) > after ? 'projection' : prelim.has(Number(y)) ? 'preliminary' : '';
      lines.push([p.name, p.iso3, y, v, status, source, retrieved].map(cell).join(','));
    }
  }
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
