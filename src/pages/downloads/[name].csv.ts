// CSV downloads, one per indicator page whose sources allow it: every country and year, with status, source
// and when the site retrieved it. Columns: country, iso3, year, value, status, source, retrieved.
import type { APIRoute, GetStaticPaths } from 'astro';
import { INDICATOR_SLUGS } from '../../i18n/slugs.en';
import { csvAllowed, indicatorModel } from '../../lib/indicator';
import { licenceOf, refreshed, sourceName } from '../../lib/data';
import { place } from '../../lib/places';
import { ranked } from '../../lib/stats';
import { live, routes } from '../../lib/routes';
import { FORMER, NUCLEAR_CSV, codeIn, nameIn, warheadsModel } from '../../lib/nuclear';
import { NUCLEAR_TEXT } from '../../i18n/nuclear.en';

export const getStaticPaths = (() => [
  ...routes().filter((r) => r.kind === 'indicator' && r.live && csvAllowed(indicatorModel(r.id)!))
    .map((r) => ({ params: { name: INDICATOR_SLUGS[r.id] }, props: { id: r.id } })),
  // The nuclear warheads map's figures (FAS allows a CSV of what we show, with credit).
  ...(live('view:nuclear:warheads') && licenceOf('fas')?.downloads === 'yes' ? [{ params: { name: NUCLEAR_CSV }, props: { id: NUCLEAR_CSV } }] : []),
]) satisfies GetStaticPaths;

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every estimate the warheads map shows: one row per state and year, each an FAS estimate. */
function nuclearCsv(): string {
  const m = warheadsModel()!;
  // FAS's current page for its year; the historical series through Our World in Data for the rest.
  const source = (y: number) => (y === m.current ? licenceOf('fas')!.credit : NUCLEAR_TEXT.creditOwid);
  const retrieved = (refreshed('fas') ?? '').slice(0, 10);
  // A former state's years carry its own name and code (Soviet Union, SUN), with a note; the figures do not move.
  const note = (id: string, y: number) => (FORMER[id] && y <= FORMER[id].until ? NUCLEAR_TEXT.formerShort(nameIn(id, FORMER[id].until + 1), FORMER[id].until + 1) : '');
  const lines = [['country', 'iso3', 'year', 'warheads', 'status', 'source', 'retrieved', 'note'].join(',')];
  const ids = [...m.states].sort((a, b) => (place(a)?.name ?? a).localeCompare(place(b)?.name ?? b, 'en'));
  for (const id of ids) {
    for (const y of m.years) {
      const r = m.byYear[y].rows.find((x) => x.id === id);
      if (r) lines.push([nameIn(id, y), codeIn(id, y), y, Math.round(r.value), 'estimate', source(y), retrieved, note(id, y)].map(cell).join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

export const GET: APIRoute = ({ props }) => {
  if ((props as { id: string }).id === NUCLEAR_CSV) return new Response(nuclearCsv(), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
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
