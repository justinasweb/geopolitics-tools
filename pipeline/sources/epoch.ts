// Epoch AI datasets (CSV downloads, CC BY) → epoch/notable_ai_models.csv and epoch/gpu_clusters.csv,
// saved as published. They feed "share of AI computing power" by country and the notable models layer.
import { getText } from '../lib/http.ts';
import { parseCsv } from '../lib/csv.ts';
import { type Source, DAY, check, guardShrink, text } from '../lib/source.ts';

/** Each file with the addresses to try, in order (Epoch has moved its downloads before). */
export const FILES: { name: string; urls: string[]; minRows: number }[] = [
  { name: 'notable_ai_models.csv', urls: ['https://epoch.ai/data/notable_ai_models.csv'], minRows: 300 },
  { name: 'gpu_clusters.csv', urls: ['https://epoch.ai/data/gpu_clusters.csv', 'https://epoch.ai/data/ai_supercomputers.csv'], minRows: 100 },
];

const source: Source = {
  id: 'epoch',
  name: 'Epoch AI',
  every: 7 * DAY,
  staleAfter: 60 * DAY,
  enabled: true,
  attribution: 'Epoch AI',
  licence: 'CC BY 4.0',
  async fetch(ctx) {
    const files = [];
    let total = 0;
    for (const f of FILES) {
      let body = '';
      const errors: string[] = [];
      for (const url of f.urls) {
        try { body = await getText(ctx.http, url, { timeout: 120_000 }); break; } catch (e) { errors.push((e as Error).message); }
      }
      check(body, `${f.name}: ${errors.join('; ')}`);
      const rows = parseCsv(body);
      const header = rows[0] ?? [];
      check(header.some((h) => /country/i.test(h)), `${f.name}: no country column; columns are ${header.slice(0, 30).join(', ')}`);
      const n = rows.length - 1;
      check(n >= f.minRows, `${f.name}: only ${n} rows`);
      const prev = await ctx.previous(f.name);
      guardShrink(ctx, f.name, n, prev, (p) => parseCsv(p).length - 1);
      ctx.log(`${f.name}: ${n} rows, ${header.length} columns`);
      files.push(text(f.name, body, 'text/csv'));
      total += n;
    }
    return { files, rows: total };
  },
};
export default source;
