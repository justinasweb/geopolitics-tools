import { describe, expect, it } from 'vitest';

// Structured data (src/lib/jsonld.ts, src/lib/structured.ts): one country, one indicator, the home page and one map
// view, built from the sample files as the pages build them, carry the fields Google requires for their type, with
// absolute links. The Organization's logo is a PNG (Google Images format), and the share card's alt text is one sentence.
process.env.GT_DATA = 'sample';

type Ld = Record<string, unknown> & { '@type': string };
const ofType = (lds: object[], type: string) => (lds as Ld[]).find((x) => x['@type'] === type)!;
const absolute = (u: unknown) => typeof u === 'string' && u.startsWith('https://geopolitics.tools/');

/** The first breadcrumb links somewhere, and every link is an absolute address (a crumb with no page of its own,
 *  such as an indicator's group, has none). */
function linked(list: Ld) {
  const items = list.itemListElement as { position: number; name: string; item?: string }[];
  expect(items.length).toBeGreaterThan(0);
  items.forEach((it, i) => expect(it.position).toBe(i + 1));
  expect(absolute(items[0].item)).toBe(true);
  items.filter((it) => it.item !== undefined).forEach((it) => expect(absolute(it.item)).toBe(true));
}

describe('structured data', () => {
  it('an indicator page has a Dataset with name, description, url, creator, publisher and the licence', async () => {
    const { indicatorLd } = await import('../../src/lib/jsonld.ts');
    const { licenceOf } = await import('../../src/lib/data.ts');
    const { indicatorModel } = await import('../../src/lib/indicator.ts');
    const lds = indicatorLd('gdp');
    const d = ofType(lds, 'Dataset');
    expect(d['@context']).toBe('https://schema.org');
    expect(d.name).toBe('GDP by country');
    expect(String(d.description).length).toBeGreaterThan(20);
    expect(d.url).toBe('https://geopolitics.tools/indicators/gdp');
    expect(d.creator).toMatchObject({ '@type': 'Organization', name: expect.stringMatching(/\S/) });
    expect(d.publisher).toEqual({ '@type': 'Organization', name: 'geopolitics.tools', url: 'https://geopolitics.tools' });
    const terms = licenceOf(indicatorModel('gdp')!.source)?.terms;
    if (terms) expect(d.license).toBe(terms);
    linked(ofType(lds, 'BreadcrumbList'));
  });

  it('a country page has a Country with its ISO code, and linked breadcrumbs', async () => {
    const { countryLd } = await import('../../src/lib/jsonld.ts');
    const lds = countryLd('DEU');
    expect(ofType(lds, 'Country')).toMatchObject({
      name: 'Germany', url: 'https://geopolitics.tools/countries/germany',
      identifier: { '@type': 'PropertyValue', propertyID: 'ISO 3166-1 alpha-3', value: 'DEU' },
    });
    linked(ofType(lds, 'BreadcrumbList'));
  });

  it('the home page has a WebSite with name and url', async () => {
    const { homeLd } = await import('../../src/lib/jsonld.ts');
    expect(ofType(homeLd(), 'WebSite')).toMatchObject({ name: 'geopolitics.tools', url: 'https://geopolitics.tools/' });
  });

  it('the conflict map view has breadcrumbs with links, its own page last', async () => {
    const { conflictLd } = await import('../../src/lib/jsonld.ts');
    const list = ofType(conflictLd(), 'BreadcrumbList');
    linked(list);
    expect((list.itemListElement as { item?: string }[]).at(-1)!.item).toBe('https://geopolitics.tools/conflict');
  });

  it('the Organization has a name, url, the social accounts and a PNG logo', async () => {
    const { organization } = await import('../../src/lib/structured.ts');
    const o = organization();
    expect(o).toMatchObject({ '@type': 'Organization', name: 'geopolitics.tools', url: 'https://geopolitics.tools' });
    expect(o.logo).toMatch(/^https:\/\/geopolitics\.tools\/.+\.png$/);
    expect(o.sameAs).toHaveLength(2);
  });

  it('the logo file is the 512 × 512 PNG that scripts/logo.ts renders from the design system symbol', async () => {
    const { readFileSync } = await import('node:fs');
    const { logoPng, SIZE } = await import('../../scripts/logo.ts');
    const file = readFileSync(new URL('../../public/logo-512.png', import.meta.url));
    // PNG header: width and height are big-endian at bytes 16 and 20.
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([SIZE, SIZE]);
    expect(file.equals(logoPng()), 'public/logo-512.png is out of date: run node scripts/logo.ts').toBe(true);
  });
});

describe('breadcrumbs in structured data', () => {
  /** Every ListItem but the last has an absolute link, and positions run 1, 2, 3… without gaps. */
  function valid(lds: object[]) {
    const items = ofType(lds, 'BreadcrumbList').itemListElement as { position: number; name: string; item?: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((it) => it.position)).toEqual(items.map((_, i) => i + 1));
    items.slice(0, -1).forEach((it) => expect(absolute(it.item), `${it.name} has no link`).toBe(true));
    return items;
  }

  it('an indicator page drops its group, which has no page', async () => {
    const { indicatorLd } = await import('../../src/lib/jsonld.ts');
    expect(valid(indicatorLd('gdp')).map((it) => it.name)).toEqual(['Indicators', 'GDP']);
  });

  it('a supply chain page, /explorer/over-time and /blocs/overlap drop "Tools"', async () => {
    const { supplyChainLd, explorerLd, overlapLd } = await import('../../src/lib/jsonld.ts');
    const chain = valid(supplyChainLd('oil'));
    expect(chain[0]).toMatchObject({ name: 'Supply chains', item: 'https://geopolitics.tools/supply-chains' });
    expect(chain).toHaveLength(2);
    for (const lds of [explorerLd(), overlapLd()]) expect(valid(lds).map((it) => it.name)).not.toContain('Tools');
  });

  it('keeps the last crumb without a link, and the page’s visible crumbs unchanged', async () => {
    const { breadcrumbs } = await import('../../src/lib/structured.ts');
    const { explorerCrumbs } = await import('../../src/lib/jsonld.ts');
    expect(breadcrumbs([{ label: 'A', href: '/a' }, { label: 'B' }, { label: 'C', href: '/c' }, { label: 'D' }]).itemListElement)
      .toEqual([
        { '@type': 'ListItem', position: 1, name: 'A', item: 'https://geopolitics.tools/a' },
        { '@type': 'ListItem', position: 2, name: 'C', item: 'https://geopolitics.tools/c' },
        { '@type': 'ListItem', position: 3, name: 'D' },
      ]);
    expect(explorerCrumbs()[0].label).toBe('Tools');
  });
});

describe('share card alt text', () => {
  it('reads kicker, title, figure with its caption and the source as one sentence', async () => {
    const { cardAlt } = await import('../../src/lib/og-cards.ts');
    expect(cardAlt({ kicker: 'Country page', title: 'Germany', figure: '4.5 trillion US$', caption: 'GDP, 2024', source: 'World Bank' }))
      .toBe('Country page: Germany; 4.5 trillion US$ (GDP, 2024); source: World Bank.');
    expect(cardAlt({ kicker: 'Indicator', title: 'GDP by country', caption: 'GDP, 2024', source: 'World Bank' })).toBe('Indicator: GDP by country; GDP, 2024; source: World Bank.');
  });

  it('ends a part and starts the next with ". " around a caption that is a sentence of its own', async () => {
    const { cardAlt, shareAlt } = await import('../../src/lib/og-cards.ts');
    expect(cardAlt({ kicker: 'Indicator', title: 'GDP by country', caption: 'The US reports the most.' })).toBe('Indicator: GDP by country. The US reports the most.');
    expect(cardAlt({ kicker: 'Indicator', title: 'GDP by country', caption: 'The US reports the most.', source: 'World Bank' }))
      .toBe('Indicator: GDP by country. The US reports the most. Source: World Bank.');
    expect(shareAlt('/og/page/default.png')).toBe('geopolitics.tools: Maps and figures on resources, technology, climate, security and power. Every number with its source and date.');
  });

  it('describes a live page’s share image from its route', async () => {
    const { shareAlt } = await import('../../src/lib/og-cards.ts');
    expect(shareAlt('/og/countries/germany.png')).toMatch(/^Country page: Germany; /);
    expect(shareAlt('/og/page/default.png')).toMatch(/^geopolitics\.tools: Maps and figures on /);
    expect(shareAlt('/og/page/no-such-card.png')).toBeUndefined();
  });
});
