// Components rendered as the build renders them (Astro's container API).
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import DataTable from '../../src/components/DataTable.astro';

describe('DataTable', () => {
  it('shows a tagged figure’s value with its tag beside it, and sorts by the value', async () => {
    const c = await AstroContainer.create();
    const html = await c.renderToString(DataTable, { props: {
      label: 'All figures',
      columns: [{ key: 'measure', label: 'Measure' }, { key: 'value', label: 'Value', num: true }, { key: 'status', label: 'Status' }],
      rows: [
        ['Natural gas production', { v: 0.0021, text: '0.0 bcm', status: 'preliminary' }, { v: 'Estimate', status: 'estimate' }],
        ['GDP', { v: 9.5e10, text: 'US$95.0 billion' }, null],
      ],
    } });
    const cell = html.match(/<td class="n" data-v="0.0021">([\s\S]*?)<\/td>/)?.[1] ?? '';
    expect(cell).toContain('0.0 bcm');
    expect(cell).toMatch(/0\.0 bcm[\s\S]*gt-tag--preliminary/);
    // A status column's cell has no figure of its own: the tag is the cell.
    expect(html).toMatch(/<td data-v="Estimate">\s*<span class="gt-tag gt-tag--estimate/);
  });
});
