import { beforeAll, describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { barLayout, fallbackTitle, fitLabel, G, measure, shareSvg, titleLines, type Card } from '../../src/lib/og.ts';
import { formatShare } from '../../src/lib/format.ts';

// Share images (src/lib/og.ts): bar labels wrap to two lines or are cut after a whole word, never mid-word, and every
// row fits the card, whatever the label.
process.env.GT_DATA = 'sample';

const COL = G.innerW - G.leftW - G.columnsGap;

/** True when nothing is drawn in the card's right margin or below its footer: the paper colour only. */
async function marginsClear(c: Card): Promise<boolean> {
  const img = new Resvg(await shareSvg(c)).render();
  // `pixels` copies the image on every read: read it once.
  const data = img.pixels;
  const px = (x: number, y: number) => data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3);
  const paper = px(img.width - 1, 0).join(',');
  for (let y = 0; y < img.height; y++) for (let x = G.width - G.padX + 4; x < img.width; x++) if (px(x, y).join(',') !== paper) return false;
  for (let y = G.height - 30; y < img.height; y++) for (let x = 0; x < img.width; x++) if (px(x, y).join(',') !== paper) return false;
  return true;
}
const words = (s: string) => s.replace(/…/g, ' ').split(/[\s,]+/).filter(Boolean);
/** Every word on the lines is a whole word of the label: nothing split, nothing invented. */
const whole = (label: string, lines: string[]) => {
  const all = new Set(words(label));
  return lines.flatMap(words).every((w) => all.has(w));
};

describe('fitLabel', () => {
  it('keeps a short label on one line', () => {
    expect(fitLabel('Population, 2024', 210, 22)).toEqual({ lines: ['Population, 2024'], cut: false });
  });

  it('wraps a label that is too wide to two lines, at a space', () => {
    // The OPEC card's label that was clipped to "Wheat production, 20".
    const f = fitLabel('Wheat production, 2024', 190, 22)!;
    expect(f.cut).toBe(false);
    // The year does not stand alone on the second line.
    expect(f.lines).toEqual(['Wheat', 'production, 2024']);
  });

  it('keeps a bracketed short name when it cuts a label', () => {
    const f = fitLabel('Treaty on the Non-Proliferation of Nuclear Weapons (NPT)', 210, 22)!;
    expect(f.cut).toBe(true);
    expect(f.lines.at(-1)).toMatch(/… \(NPT\)$/);
    for (const l of f.lines) expect(measure(l, 22)).toBeLessThanOrEqual(210);
  });

  it('cuts a longer label after a whole word, with "…" and the year kept', () => {
    const label = 'Military spending as a share of gross domestic product, constant prices, 2024';
    const f = fitLabel(label, 210, 22)!;
    expect(f.cut).toBe(true);
    expect(f.lines).toHaveLength(2);
    expect(f.lines[1]).toMatch(/…, 2024$/);
    expect(f.lines[1]).not.toMatch(/[,;:]…/);
    for (const l of f.lines) expect(measure(l, 22)).toBeLessThanOrEqual(210);
    expect(whole(label, f.lines)).toBe(true);
  });

  it('cuts a label without a year with "…" alone', () => {
    const f = fitLabel('Democratic Republic of the Congo and the Central African Republic together', 210, 22, 1)!;
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).toMatch(/[A-Za-z]…$/);
    expect(measure(f.lines[0], 22)).toBeLessThanOrEqual(210);
  });

  it('never splits a word: one too wide is refused, so a smaller size is tried, or left out', () => {
    const giant = 'Herfindahl–Hirschman-concentration-index-of-supplier-shares';
    expect(fitLabel(`${giant}, 2024`, 210, 22)).toBeNull();
    const f = fitLabel(`Index ${giant}, 2024`, 210, 22, 2, true)!;
    expect(f.lines.join(' ')).not.toContain('Herfindahl');
    expect(whole(`Index ${giant}, 2024`, f.lines)).toBe(true);
    for (const l of f.lines) expect(measure(l, 22)).toBeLessThanOrEqual(210);
  });

  it('fits every label length from 1 to 120 characters', () => {
    const base = 'Natural gas production from conventional and unconventional fields onshore and offshore in every region of the world';
    for (let n = 1; n <= base.length; n++) {
      const label = `${base.slice(0, n).trim()}, 2024`;
      const f = fitLabel(label, 190, 22) ?? fitLabel(label, 190, 22, 2, true)!;
      expect(f.lines.length, label).toBeLessThanOrEqual(2);
      for (const l of f.lines) expect(measure(l, 22), `${label} → ${l}`).toBeLessThanOrEqual(190);
      // The last word of a cut-off label may be partial only where the input itself ends mid-word.
      expect(whole(label, f.lines), `${label} → ${f.lines.join(' / ')}`).toBe(true);
    }
  });
});

/** Checks a card's bars fit: widths, lines, whole words and height. */
function fitsCard(c: Card, what: string) {
  const L = barLayout(c);
  if (!L) return;
  expect(L.labelW + L.barW + L.valueW + 2 * G.cellGap, `${what}: row width`).toBeLessThanOrEqual(COL);
  expect(L.barW, `${what}: bar width`).toBeGreaterThanOrEqual(40);
  expect(L.height, `${what}: rows under "${c.title}"`).toBeLessThanOrEqual(L.room);
  (c.bars ?? []).slice(0, 5).forEach((b, i) => {
    expect(L.labels[i].length, `${what}: ${b.label}`).toBeLessThanOrEqual(2);
    for (const l of L.labels[i]) expect(measure(l, L.labelSize), `${what}: "${l}"`).toBeLessThanOrEqual(L.labelW);
    expect(whole(b.label, L.labels[i]), `${what}: ${b.label} → ${L.labels[i].join(' / ')}`).toBe(true);
    expect(measure(b.text, L.labelSize, 'sans600'), `${what}: value ${b.text}`).toBeLessThanOrEqual(L.valueW);
  });
}

describe('share image cards', () => {
  let cards: { family: string; key: string; card: Card }[];
  beforeAll(async () => {
    const { routes } = await import('../../src/lib/routes.ts');
    const { card } = await import('../../src/lib/og-cards.ts');
    cards = routes().filter((r) => r.live && r.image).map((r) => {
      const [kind, family] = r.key.split(':');
      return { family: kind === 'view' ? family : kind, key: r.key, card: card(r) };
    });
  }, 300_000);

  it('fit every card the site builds', () => {
    expect(cards.length).toBeGreaterThan(300);
    for (const c of cards) fitsCard(c.card, c.key);
  });

  it('give every card with a figure or bars a source line that fits on one line beside the lockup', () => {
    for (const c of cards.filter((x) => x.card.figure || x.card.bars?.length)) {
      expect(c.card.source, c.key).toBeTruthy();
      expect(measure(`Source: ${c.card.source}`, 20) + G.logoGap + G.logoW, c.key).toBeLessThanOrEqual(G.innerW);
    }
  });

  it('draw the site default and the six pages with no figure as the design\'s fallback card: title on two lines, one line with the address', async () => {
    const { card } = await import('../../src/lib/og-cards.ts');
    const fb = [{ key: 'default', card: card(null) }, ...cards.filter((c) => c.card.fallback)];
    expect(fb.map((c) => c.key).sort()).toEqual(['countries', 'default', 'indicators', 'page:about', 'page:methodology', 'page:privacy', 'page:sources']);
    for (const c of fb) {
      const t = fallbackTitle(c.card.title);
      expect(titleLines(c.card.title, t.size, G.width - 2 * G.fb.pad), c.key).toBeLessThanOrEqual(2);
      expect(c.card.caption, c.key).toBeTruthy();
      expect(c.card.address, c.key).toMatch(/^geopolitics\.tools(\/[a-z-]+)?$/);
      expect(measure(`${c.card.caption!.replace(/\.$/, '')} · ${c.card.address}`, G.fb.line, 'sans500'), c.key).toBeLessThanOrEqual(G.width - 2 * G.fb.pad);
    }
    // One-word page titles keep the design's size; the site default steps down to fit two lines.
    expect(fallbackTitle('Methodology').size).toBe(96);
    expect(fallbackTitle(fb[0].card.title).size).toBeLessThan(96);
  });

  it('date the member lists on the bloc and alliance-history cards', () => {
    const blocs = cards.filter((c) => c.family === 'blocs');
    const history = cards.filter((c) => c.family === 'alliance-history' || c.family === 'history');
    expect(blocs).toHaveLength(20);
    expect(history).toHaveLength(11);
    for (const c of blocs) expect(c.card.source, c.key).toMatch(/^Groupings’ own lists, as of \d{1,2} \w{3} \d{4}/);
    for (const c of history) expect(c.card.source, c.key).toMatch(/^The groupings’ own member lists and histories, as of \d{4}$/);
  });

  it('give the mineral bars on country cards their year, USGS as a source and "estimate" where USGS estimates', async () => {
    const { countryModel } = await import('../../src/lib/country.ts');
    const withBars = cards.filter((c) => c.family === 'country' && c.card.bars?.length);
    expect(withBars.length).toBeGreaterThan(0);
    for (const c of withBars) {
      const m = countryModel(c.key.split(':')[1])!;
      expect(c.card.source, c.key).toContain('USGS (mineral shares)');
      c.card.bars!.forEach((b, i) => {
        expect(b.label, c.key).toMatch(new RegExp(`, ${m.minerals[i].year}$`));
        expect(b.text.endsWith('(estimate)'), `${c.key} ${b.label}`).toBe(m.minerals[i].estimated);
        // The site's one share formatter, as the country page writes the same share.
        expect(b.text.replace(/ \(estimate\)$/, ''), `${c.key} ${b.label}`).toBe(formatShare(m.minerals[i].share));
      });
    }
  });

  it('date the mineral cards by the data year, not USGS’s edition', async () => {
    const { mineralPage, listed } = await import('../../src/lib/minerals.ts');
    for (const c of cards.filter((x) => x.family === 'minerals')) {
      const p = mineralPage(c.key.split(':')[2])!;
      expect(c.card.source, c.key).toBe(`USGS, ${p.latest.year}${p.latest.estimated ? ', estimated' : ''}`);
      const top = listed(p.latest).slice(0, 5);
      expect(c.card.bars!.map((b) => b.text), c.key).toEqual(top.map((x) => formatShare(x.share!)));
    }
  });

  it('credit the dams and the water figures on every river card, on one line beside the lockup', () => {
    const rivers = cards.filter((c) => c.family === 'rivers');
    expect(rivers).toHaveLength(8);
    for (const c of rivers) {
      expect(c.card.source, c.key).toMatch(/^Lehner et al\. \(2024\), Global Dam Watch database version 1\.0 \(CC BY 4\.0\)/);
      if (c.card.bars?.length) expect(c.card.source, c.key).toContain('FAO AQUASTAT');
      expect(measure(`Source: ${c.card.source}`, 20) + G.logoGap + G.logoW, c.key).toBeLessThanOrEqual(G.innerW);
    }
  });

  it('fit the longest label of each view family, five times over, under its longest title, and render inside the card', async () => {
    const families = [...new Set(cards.map((c) => c.family))];
    expect(families).toEqual(expect.arrayContaining(['blocs', 'minerals', 'oil', 'food', 'country', 'indicator']));
    for (const f of families) {
      const mine = cards.filter((c) => c.family === f && c.card.bars?.length);
      if (!mine.length) continue;
      const bars = mine.flatMap((c) => c.card.bars!);
      const label = bars.reduce((a, b) => (b.label.length > a.label.length ? b : a)).label;
      const text = bars.reduce((a, b) => (measure(b.text, 22, 'sans600') > measure(a.text, 22, 'sans600') ? b : a)).text;
      const title = mine.reduce((a, b) => (b.card.title.length > a.card.title.length ? b : a)).card.title;
      const worst: Card = { ...mine[0].card, title, bars: [1, 0.8, 0.6, 0.4, 0.2].map((value) => ({ label, value, text })) };
      fitsCard(worst, `${f} (longest label "${label}")`);
      expect(await marginsClear(worst), `${f}: nothing drawn in the card's right and bottom margins`).toBe(true);
    }
  }, 300_000);
});
