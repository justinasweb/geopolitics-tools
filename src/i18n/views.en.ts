// English words for the map views drawn from the indicator registry (src/data/views.ts): emissions, refugees, space and AI.
// Same rules as pages.en.ts: templates take figures already formatted and return plain sentences, plain verbs, no
// adjectives that judge, and a sentence whose figure is missing is left out. Another language is another file with
// the same keys.

export interface LayerText {
  /** The layer's name in the picker ("Per person"). */
  pick: string;
  /** The page title and h1 ("CO2 emissions per person"). */
  title: string;
  /** Under the title, after it ("by country"). */
  sub: string;
  /** After a value in the tooltip ("11,903 Mt" + "of CO2"); may be empty. */
  measure: string;
  /** The panel's label for a country's figure. */
  figureLabel: string;
  /** The legend title. */
  legend: (year: number) => string;
  /** The panel's key figure label, when the layer has a world figure. */
  worldLabel?: string;
  /** The one-sentence answer under the title: `top` starts a sentence ("The United States"), `topIn` sits inside one. */
  lede: (p: { top: string; topIn: string; value: string; share?: string; top3?: string; world?: string; year: number; up?: number; down?: number; of?: number }) => string;
  /** The first summary sentence, on the world figure. */
  total?: (value: string, year: number, change: string | null) => string;
  /** A bloc's line in the panel, for layers that add up. */
  bloc?: (bloc: string, share: string, year: number) => string;
  /** The diverging scale's two ends. */
  ends?: [string, string];
  /** Named class ticks, for layers with fixed bands. */
  ticks?: string[];
  /** What a single-year layer's figures cover, where the year alone would mislead ("2000–2021", "last 12 months"). */
  period?: (year: number) => string;
  /** The caveat in the panel. */
  caveat: string;
  /** The page's meta description. */
  description: (year: number) => string;
}

export interface FamilyText {
  section: string;
  pickerLabel: string;
  layers: Record<string, LayerText>;
}

const fossil = 'from fossil fuels and cement';
const power5 = ['Under 20%', '20–40%', '40–60%', '60–80%', '80% or more'];
const powerCaveat = 'Shares of the electricity generated inside each country, before trade in electricity. A small system can reach a high share with one large plant. Changes are in percentage points.';
const armsPeriod = (y: number) => `${y - 4}–${y}`;
const armsCaveat = 'SIPRI’s trend-indicator value measures the military capability of major weapons delivered, not the price paid, so it is not money. Deliveries are lumpy, so figures are five-year totals. Small arms, ammunition and transfers to or from groups that are not states are left out.';

export const VIEW_TEXT: Record<string, FamilyText> = {
  electricity: {
    section: 'Electricity',
    pickerLabel: 'Source',
    layers: {
      lowcarbon: {
        pick: 'Low-carbon', title: 'Low-carbon electricity', sub: 'share of each country’s generation', measure: 'of its electricity', figureLabel: 'Low-carbon share',
        legend: (y) => `Share of electricity from nuclear and renewables, ${y}`, worldLabel: 'World, low-carbon share', ticks: power5,
        lede: ({ world, up, of, year }) => `${world ? `Low-carbon sources made ${world} of the world’s electricity in ${year}. ` : ''}${up} of ${of} countries got 80% or more of theirs from them.`,
        total: (v, y, ch) => `Nuclear and renewables made ${v} of the world’s electricity in ${y}${ch ? `, ${ch}` : ''}.`,
        caveat: `Low-carbon counts nuclear, hydro, wind, solar, bioenergy and other renewables. ${powerCaveat}`,
        description: (y) => `Share of electricity from nuclear and renewables by country, ${y}, with each country’s power mix since 2000. Source: Ember.`,
      },
      windsolar: {
        pick: 'Wind and solar', title: 'Electricity from wind and solar', sub: 'share of each country’s generation', measure: 'of its electricity', figureLabel: 'Wind and solar share',
        legend: (y) => `Share of electricity from wind and solar, ${y}`, worldLabel: 'World, wind and solar share', ticks: ['Under 5%', '5–10%', '10–20%', '20–30%', '30% or more'],
        lede: ({ world, up, of, year }) => `${world ? `Wind and solar made ${world} of the world’s electricity in ${year}. ` : ''}${up} of ${of} countries got 30% or more of theirs from them.`,
        total: (v, y, ch) => `Wind and solar made ${v} of the world’s electricity in ${y}${ch ? `, ${ch}` : ''}.`,
        caveat: powerCaveat,
        description: (y) => `Share of electricity from wind and solar by country, ${y}, on a map and in a table. Source: Ember.`,
      },
      coalpower: {
        pick: 'Coal', title: 'Electricity from coal', sub: 'share of each country’s generation', measure: 'of its electricity', figureLabel: 'Coal share',
        legend: (y) => `Share of electricity from coal, ${y}`, worldLabel: 'World, coal share', ticks: power5,
        lede: ({ world, up, of, year }) => `${world ? `Coal made ${world} of the world’s electricity in ${year}. ` : ''}${up} of ${of} countries got 80% or more of theirs from coal.`,
        total: (v, y, ch) => `Coal made ${v} of the world’s electricity in ${y}${ch ? `, ${ch}` : ''}.`,
        caveat: powerCaveat,
        description: (y) => `Share of electricity from coal by country, ${y}, on a map and in a table. Source: Ember.`,
      },
      gaspower: {
        pick: 'Gas', title: 'Electricity from gas', sub: 'share of each country’s generation', measure: 'of its electricity', figureLabel: 'Gas share',
        legend: (y) => `Share of electricity from natural gas, ${y}`, worldLabel: 'World, gas share', ticks: power5,
        lede: ({ world, up, of, year }) => `${world ? `Natural gas made ${world} of the world’s electricity in ${year}. ` : ''}${up} of ${of} countries got 80% or more of theirs from gas.`,
        total: (v, y, ch) => `Natural gas made ${v} of the world’s electricity in ${y}${ch ? `, ${ch}` : ''}.`,
        caveat: `Natural gas only; oil and other fossil fuels are counted apart. ${powerCaveat}`,
        description: (y) => `Share of electricity from natural gas by country, ${y}, on a map and in a table. Source: Ember.`,
      },
      nuclearpower: {
        pick: 'Nuclear', title: 'Electricity from nuclear', sub: 'share of each country’s generation', measure: 'of its electricity', figureLabel: 'Nuclear share',
        legend: (y) => `Share of electricity from nuclear power, ${y}`, worldLabel: 'World, nuclear share', ticks: ['Under 5%', '5–15%', '15–30%', '30–50%', '50% or more'],
        lede: ({ world, up, of, year }) => `${world ? `Nuclear power made ${world} of the world’s electricity in ${year}. ` : ''}${up} of ${of} countries got half or more of theirs from it.`,
        total: (v, y, ch) => `Nuclear power made ${v} of the world’s electricity in ${y}${ch ? `, ${ch}` : ''}.`,
        caveat: `Countries with no nuclear plant have a share of 0%. ${powerCaveat}`,
        description: (y) => `Share of electricity from nuclear power by country, ${y}, on a map and in a table. Source: Ember.`,
      },
    },
  },
  emissions: {
    section: 'Emissions',
    pickerLabel: 'Measure',
    layers: {
      co2: {
        pick: 'Total', title: 'CO2 emissions', sub: 'by country', measure: 'of CO2', figureLabel: 'CO2 emissions',
        legend: (y) => `CO2 emissions, million tonnes, ${y}`, worldLabel: 'World CO2 emissions',
        lede: ({ top, share, top3, year }) => `${top} emitted ${share} of the world’s CO2 ${fossil} in ${year}${top3 ? `; the top three countries emitted ${top3}` : ''}.`,
        total: (v, y, ch) => `The world emitted ${v} of CO2 ${fossil} in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${b} members emitted ${s} of the world’s CO2 in ${y}.`,
        caveat: 'CO2 from fossil fuels and cement inside each country’s borders. Land use, other greenhouse gases, and international flights and shipping (in the world total only) are not given to any country.',
        description: (y) => `CO2 emissions from fossil fuels and cement by country, 1990–${y}: each country’s total and share of the world, on a map and in a table. Source: Global Carbon Budget.`,
      },
      co2pc: {
        pick: 'Per person', title: 'CO2 emissions per person', sub: 'by country', measure: 'per person', figureLabel: 'CO2 per person',
        legend: (y) => `Tonnes of CO2 per person, ${y}`, worldLabel: 'World average',
        lede: ({ topIn, value, world, year }) => `In ${year}, ${topIn} emitted the most CO2 per person: ${value}${world ? `, against ${world} for the world as a whole` : ''}.`,
        total: (v, y, ch) => `The world as a whole emitted ${v} of CO2 per person in ${y}${ch ? `, ${ch}` : ''}.`,
        caveat: 'A country’s CO2 from fossil fuels and cement divided by its population: an average, not what any one person emits.',
        description: (y) => `CO2 emissions per person by country, 1990–${y}, on a map and in a table. Source: Global Carbon Budget.`,
      },
      co2cum: {
        pick: 'Since 1750', title: 'CO2 emitted since 1750', sub: 'by country', measure: 'since 1750', figureLabel: 'CO2 since 1750',
        legend: (y) => `CO2 emitted 1750–${y}, million tonnes`, worldLabel: 'World, since 1750',
        lede: ({ topIn, share, top3, year }) => `Between 1750 and ${year}, ${topIn} emitted ${share} of the world’s CO2 ${fossil}${top3 ? `; the top three countries ${top3}` : ''}.`,
        total: (v, y) => `From 1750 to ${y}, the world emitted ${v} of CO2 ${fossil}.`,
        bloc: (b, s, y) => `${b} members emitted ${s} of the world’s CO2 between 1750 and ${y}.`,
        caveat: 'Each country’s emissions inside its present borders, added up from 1750. Emissions of former states are given to the countries that now cover them.',
        description: (y) => `CO2 emitted since 1750 by country, up to ${y}: each country’s total and share of the world, on a map and in a table. Source: Global Carbon Budget.`,
      },
      co2trade: {
        pick: 'Imported in goods', title: 'CO2 imported in goods', sub: 'by country', measure: 'against own emissions', figureLabel: 'CO2 in trade, against own emissions',
        legend: (y) => `CO2 caused by what a country consumes, against what it emits at home, ${y}`,
        ends: ['Consumes more than it emits', 'Emits more than it consumes'],
        lede: ({ up, down, year }) => `In ${year}, what ${up} countries consumed caused more CO2 than they emitted at home, because their imports carried more emissions than their exports; in ${down} countries it was the other way round.`,
        caveat: 'Emissions caused by what a country consumes, including in imported goods, against those inside its borders. Consumption-based figures end earlier than the others and cover fewer countries.',
        description: (y) => `CO2 in traded goods by country, ${y}: how much more or less CO2 each country’s consumption causes than it emits at home. Source: Global Carbon Budget.`,
      },
    },
  },
  refugees: {
    section: 'Refugees',
    pickerLabel: 'Measure',
    layers: {
      refout: {
        pick: 'Fled from', title: 'Refugees by country of origin', sub: 'where people fled from', measure: 'from here', figureLabel: 'Refugees from the country',
        legend: (y) => `Refugees and others in need of protection, by origin, ${y}`, worldLabel: 'Total, all origins reported',
        lede: ({ top, value, share, top3, year }) => `${top} was the origin of ${value} refugees and others in need of international protection in ${year}, ${share} of all UNHCR counted${top3 ? `; the top three countries of origin ${top3}` : ''}.`,
        total: (v, y, ch) => `UNHCR counted ${v} refugees, asylum seekers and others in need of international protection in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${s} came from ${b} members in ${y}.`,
        caveat: 'Refugees, asylum seekers and others in need of international protection, by country of origin, as UNHCR counts them. Palestinian refugees under UNRWA’s mandate are not included.',
        description: (y) => `Refugees by country of origin, 2015–${y}: how many people fled each country, on a map and in a table. Source: UNHCR.`,
      },
      refin: {
        pick: 'Hosted', title: 'Refugees hosted', sub: 'by host country', measure: 'hosted', figureLabel: 'Refugees hosted',
        legend: (y) => `Refugees and others in need of protection hosted, ${y}`, worldLabel: 'Total, all hosts reported',
        lede: ({ top, value, share, top3, year }) => `${top} hosted ${value} refugees and others in need of international protection in ${year}, ${share} of all UNHCR counted${top3 ? `; the top three host countries ${top3}` : ''}.`,
        total: (v, y, ch) => `UNHCR counted ${v} refugees, asylum seekers and others in need of international protection in host countries in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${b} members hosted ${s} of them in ${y}.`,
        caveat: 'Refugees, asylum seekers and others in need of international protection living in each country, as UNHCR counts them. Palestinian refugees under UNRWA’s mandate are not included.',
        description: (y) => `Refugees hosted by country, 2015–${y}, on a map and in a table. Source: UNHCR.`,
      },
      refinpc: {
        pick: 'Per 1,000 residents', title: 'Refugees hosted per 1,000 residents', sub: 'by host country', measure: 'per 1,000 residents', figureLabel: 'Refugees hosted per 1,000 residents',
        legend: (y) => `Refugees hosted per 1,000 residents, ${y}`,
        lede: ({ topIn, value, year }) => `In ${year}, ${topIn} hosted the most refugees for its population: ${value} per 1,000 residents.`,
        caveat: 'UNHCR’s count of refugees and others in need of protection divided by the World Bank’s population figure.',
        description: (y) => `Refugees hosted per 1,000 residents by country, 2015–${y}, on a map and in a table. Sources: UNHCR, World Bank.`,
      },
      idps: {
        pick: 'Displaced at home', title: 'People displaced inside their country', sub: 'by country', measure: 'displaced', figureLabel: 'Internally displaced',
        legend: (y) => `People displaced inside their country, ${y}`, worldLabel: 'Total, all countries reported',
        lede: ({ top, value, share, year }) => `${top} had ${value} people displaced inside the country in ${year}, ${share} of those UNHCR counted.`,
        total: (v, y, ch) => `UNHCR counted ${v} people displaced inside their own country in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${s} of them were in ${b} members in ${y}.`,
        caveat: 'UNHCR counts the internally displaced people it protects or assists, so fewer countries report than for refugees, and its totals are lower than counts that cover every country.',
        description: (y) => `People displaced inside their own country, 2015–${y}, on a map and in a table. Source: UNHCR.`,
      },
    },
  },
  space: {
    section: 'Space',
    pickerLabel: 'Measure',
    layers: {
      satellites: {
        pick: 'Satellites', title: 'Satellites in orbit', sub: 'by owning country', measure: 'in orbit', figureLabel: 'Satellites in orbit',
        legend: (y) => `Satellites in orbit, working or not, ${y}`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} owned ${value} of the satellites in orbit in ${year}, ${share} of those owned by a single country${top3 ? `; the top three countries owned ${top3}` : ''}.`,
        total: (v, y, ch) => `Countries owned ${v} satellites in orbit in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${b} members owned ${s} of them in ${y}.`,
        caveat: 'Satellites in orbit, working or not, by owning country, as CelesTrak’s catalogue records them. Satellites of international bodies and operators, such as ESA and Intelsat, are not given to any country. The latest year counts what was in orbit on the day the catalogue was read.',
        description: (y) => `Satellites in orbit by owning country, up to ${y}: each country’s count and share, on a map and in a table. Source: CelesTrak.`,
      },
      launches: {
        pick: 'Launches', title: 'Orbital launches', sub: 'by country of the launch site', measure: 'launches', figureLabel: 'Orbital launches',
        legend: (y) => `Orbital launches, ${y}`, worldLabel: 'Total, all countries',
        lede: ({ topIn, value, share, top3, year }) => `In ${year}, ${value} orbital launches went up from ${topIn}, ${share} of the world’s${top3 ? `; the top three countries made ${top3}` : ''}.`,
        total: (v, y, ch) => `There were ${v} orbital launches from countries’ sites in ${y}${ch ? `, ${ch}` : ''}.`,
        bloc: (b, s, y) => `${s} of them went up from ${b} members in ${y}.`,
        caveat: 'Launches that put at least one satellite in orbit, counted for the country of the launch site, not the rocket’s maker or the customer. Failed launches are not in the catalogue. The current year is left out until it ends.',
        description: (y) => `Orbital launches by country of the launch site, up to ${y}, on a map and in a table, with the launch sites. Source: CelesTrak.`,
      },
    },
  },
  ai: {
    section: 'AI and chips',
    pickerLabel: 'Measure',
    layers: {
      aicompute: {
        pick: 'Computing power', title: 'AI computing power', sub: 'share by country', measure: 'of known AI computing power', figureLabel: 'Share of AI computing power',
        legend: (y) => `Share of known AI supercomputer power, end of ${y}`,
        lede: ({ topIn, value, year }) => `At the end of ${year}, ${topIn} had ${value} of the computing power of the AI supercomputers Epoch AI knows of.`,
        caveat: 'Each country’s share of the computing power, in H100 equivalents, of the AI supercomputers Epoch AI has found in operation. Many private clusters are not public, so the shares are of known systems only.',
        description: (y) => `Share of AI computing power by country, end of ${y}: known AI supercomputers on a map and in a table. Source: Epoch AI.`,
      },
      aimodels: {
        pick: 'Notable models', title: 'Notable AI models', sub: 'by country of the developer', measure: 'notable models', figureLabel: 'Notable AI models',
        legend: (y) => `Notable AI models published, ${y}`,
        lede: ({ topIn, value, year }) => `In ${year}, labs in ${topIn} published the most notable AI models: ${value}.`,
        caveat: 'Models Epoch AI counts as notable, for their results, citations or size, by the country of the organisation that made them. A model made by labs in two countries counts once for each. The current year is left out until it ends.',
        description: (y) => `Notable AI models by country of the developer, up to ${y}, on a map and in a table. Source: Epoch AI.`,
      },
      entitylist: {
        pick: 'Export controls', title: 'US export controls on companies and bodies', sub: 'Entity List entries by country', measure: 'entries', figureLabel: 'Entity List entries',
        legend: (y) => `US Entity List entries by country, ${y}`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} had ${value} entries on the US Entity List in ${year}, ${share} of the total${top3 ? `; the top three countries had ${top3}` : ''}.`,
        total: (v, y) => `The US Entity List had ${v} entries with a country in ${y}.`,
        bloc: (b, s, y) => `${s} of the entries were in ${b} members in ${y}.`,
        caveat: 'The Entity List names companies, research bodies and people that need a US licence to receive US goods and technology, including chips and chipmaking tools. It is an export control, not a sanction. Entries are counted by the country of their address.',
        description: (y) => `US Entity List entries by country, ${y}: who needs a licence to get US chips and technology, on a map and in a table. Source: US Consolidated Screening List.`,
      },
    },
  },
  water: {
    section: 'Water',
    pickerLabel: 'Measure',
    layers: {
      waterstress: {
        pick: 'Water stress today', title: 'Water stress', sub: 'by country', measure: 'out of 5', figureLabel: 'Water stress score',
        legend: () => 'Water stress: share of available water withdrawn each year (low to extremely high)', ticks: ['Under 10%', '10–20%', '20–40%', '40–80%', 'Over 80%'],
        lede: ({ up, of }) => `${up} of ${of} countries face extremely high water stress: each year they use more than 80% of the water available to them.`,
        caveat: 'WRI Aqueduct’s baseline water stress: the share of renewable surface and ground water withdrawn each year, as a score from 0 to 5 (low, under 10%, to extremely high, over 80%). A country’s score averages its river basins, which can differ a great deal. Dots are large dams.',
        description: () => 'Water stress by country, with large dams: how much of the available water each country withdraws, on a map and in a table. Sources: WRI Aqueduct, Global Dam Watch.',
      },
      waterstress2050: {
        pick: 'In 2050', title: 'Water stress in 2050', sub: 'projected, by country', measure: 'out of 5', figureLabel: 'Water stress score, 2050',
        legend: () => 'Water stress projected for 2050: share of available water withdrawn each year', ticks: ['Under 10%', '10–20%', '20–40%', '40–80%', 'Over 80%'],
        lede: ({ up, of }) => `On current trends, ${up} of ${of} countries would face extremely high water stress in 2050.`,
        caveat: 'WRI Aqueduct’s projection for 2050 under its business-as-usual scenario, in which emissions and water demand keep growing on current trends. It is a projection, not a forecast.',
        description: () => 'Water stress by country projected for 2050, on a map and in a table. Source: WRI Aqueduct.',
      },
      waterdep: {
        pick: 'From abroad', title: 'Water from abroad', sub: 'share of renewable water', measure: 'from abroad', figureLabel: 'Water from abroad',
        legend: (y) => `Share of renewable water that flows in from other countries, ${y}`,
        lede: ({ topIn, value, year }) => `In ${year}, ${topIn} got the largest share of its renewable water from other countries: ${value}.`,
        caveat: 'FAO AQUASTAT’s dependency ratio: the share of a country’s renewable water that flows in from upstream countries. A high share means the country depends on its neighbours’ use of rivers it shares.',
        description: (y) => `Share of each country’s renewable water that comes from abroad, ${y}, on a map and in a table. Source: FAO AQUASTAT.`,
      },
    },
  },
  'chinese-lending': {
    section: 'Chinese lending',
    pickerLabel: 'Sector',
    layers: {
      lendall: {
        pick: 'All sectors', title: 'Chinese loans and grants', sub: 'by recipient country', period: (y) => `2000–${y}`, measure: 'committed', figureLabel: 'Committed, 2000–2021',
        legend: (y) => `Chinese loans and grants, 2000–${y}, US$ (2021 prices)`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} received ${value} in loans and grants from China between 2000 and ${year}, ${share} of the total${top3 ? `; the top three countries received ${top3}` : ''}.`,
        total: (v, y) => `China committed ${v} in loans and grants to the countries AidData covers between 2000 and ${y}, in 2021 dollars.`,
        bloc: (b, s, y) => `${s} of it went to ${b} members, 2000–${y}.`,
        caveat: 'Loans and grants China committed, in constant 2021 US dollars: what was agreed, not what was paid out or repaid. Counts only the records AidData recommends for totals, 2000–2021. Most of the money is loans at near-market rates rather than aid.',
        description: (y) => `Chinese loans and grants by country, 2000–${y}: commitments from China on a map and in a table, with the largest projects. Source: AidData.`,
      },
      lendenergy: {
        pick: 'Energy', title: 'Chinese lending for energy', sub: 'by recipient country', period: (y) => `2000–${y}`, measure: 'committed', figureLabel: 'Energy, committed',
        legend: (y) => `Chinese lending for energy, 2000–${y}, US$ (2021 prices)`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} received ${value} for energy from China between 2000 and ${year}, ${share} of the total${top3 ? `; the top three countries received ${top3}` : ''}.`,
        total: (v, y) => `China committed ${v} for energy to the countries AidData covers between 2000 and ${y}, in 2021 dollars.`,
        bloc: (b, s, y) => `${s} of it went to ${b} members, 2000–${y}.`,
        caveat: 'Loans and grants China committed, in constant 2021 US dollars: what was agreed, not what was paid out or repaid. Counts only the records AidData recommends for totals, 2000–2021. Energy covers power plants, grids, oil and gas.',
        description: (y) => `Chinese lending for energy by country, 2000–${y}: commitments from China on a map and in a table, with the largest projects. Source: AidData.`,
      },
      lendtransport: {
        pick: 'Transport', title: 'Chinese lending for transport', sub: 'by recipient country', period: (y) => `2000–${y}`, measure: 'committed', figureLabel: 'Transport, committed',
        legend: (y) => `Chinese lending for transport, 2000–${y}, US$ (2021 prices)`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} received ${value} for transport from China between 2000 and ${year}, ${share} of the total${top3 ? `; the top three countries received ${top3}` : ''}.`,
        total: (v, y) => `China committed ${v} for transport to the countries AidData covers between 2000 and ${y}, in 2021 dollars.`,
        bloc: (b, s, y) => `${s} of it went to ${b} members, 2000–${y}.`,
        caveat: 'Loans and grants China committed, in constant 2021 US dollars: what was agreed, not what was paid out or repaid. Counts only the records AidData recommends for totals, 2000–2021. Transport covers roads, railways, ports and airports, and storage.',
        description: (y) => `Chinese lending for transport by country, 2000–${y}: commitments from China on a map and in a table, with the largest projects. Source: AidData.`,
      },
      lendindustry: {
        pick: 'Industry and mining', title: 'Chinese lending for industry and mining', sub: 'by recipient country', period: (y) => `2000–${y}`, measure: 'committed', figureLabel: 'Industry and mining, committed',
        legend: (y) => `Chinese lending for industry and mining, 2000–${y}, US$ (2021 prices)`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} received ${value} for industry, mining and construction from China between 2000 and ${year}, ${share} of the total${top3 ? `; the top three countries received ${top3}` : ''}.`,
        total: (v, y) => `China committed ${v} for industry, mining and construction to the countries AidData covers between 2000 and ${y}, in 2021 dollars.`,
        bloc: (b, s, y) => `${s} of it went to ${b} members, 2000–${y}.`,
        caveat: 'Loans and grants China committed, in constant 2021 US dollars: what was agreed, not what was paid out or repaid. Counts only the records AidData recommends for totals, 2000–2021. Industry and mining follows AidData’s sector for industry, mining and construction.',
        description: (y) => `Chinese lending for industry and mining by country, 2000–${y}: commitments from China on a map and in a table, with the largest projects. Source: AidData.`,
      },
      lendbanking: {
        pick: 'Banking', title: 'Chinese lending to banks', sub: 'by recipient country', period: (y) => `2000–${y}`, measure: 'committed', figureLabel: 'Banking, committed',
        legend: (y) => `Chinese lending to banks, 2000–${y}, US$ (2021 prices)`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} received ${value} for banking and finance from China between 2000 and ${year}, ${share} of the total${top3 ? `; the top three countries received ${top3}` : ''}.`,
        total: (v, y) => `China committed ${v} for banking and finance to the countries AidData covers between 2000 and ${y}, in 2021 dollars.`,
        bloc: (b, s, y) => `${s} of it went to ${b} members, 2000–${y}.`,
        caveat: 'Loans and grants China committed, in constant 2021 US dollars: what was agreed, not what was paid out or repaid. Counts only the records AidData recommends for totals, 2000–2021. Banking covers loans to central and commercial banks, including currency swaps and rescue lending.',
        description: (y) => `Chinese lending to banks by country, 2000–${y}: commitments from China on a map and in a table, with the largest projects. Source: AidData.`,
      },
      lendother: {
        pick: 'Other sectors', title: 'Chinese lending for other sectors', sub: 'by recipient country', period: (y) => `2000–${y}`, measure: 'committed', figureLabel: 'Other sectors, committed',
        legend: (y) => `Chinese lending for other sectors, 2000–${y}, US$ (2021 prices)`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} received ${value} for other sectors from China between 2000 and ${year}, ${share} of the total${top3 ? `; the top three countries received ${top3}` : ''}.`,
        total: (v, y) => `China committed ${v} for other sectors to the countries AidData covers between 2000 and ${y}, in 2021 dollars.`,
        bloc: (b, s, y) => `${s} of it went to ${b} members, 2000–${y}.`,
        caveat: 'Loans and grants China committed, in constant 2021 US dollars: what was agreed, not what was paid out or repaid. Counts only the records AidData recommends for totals, 2000–2021. Other sectors include government budgets, health, education, communications and debt relief.',
        description: (y) => `Chinese lending for other sectors by country, 2000–${y}: commitments from China on a map and in a table, with the largest projects. Source: AidData.`,
      },
    },
  },
  arms: {
    section: 'Arms transfers',
    pickerLabel: 'Side',
    layers: {
      armsexp5: {
        pick: 'Exporters', title: 'Arms exports', sub: 'by supplier, five-year totals', period: armsPeriod, measure: 'exported', figureLabel: 'Major arms exported',
        legend: (y) => `Major arms exported, ${armsPeriod(y)}, SIPRI trend-indicator value (millions)`, worldLabel: 'Total, all suppliers',
        lede: ({ top, share, top3, year }) => `${top} supplied ${share} of the major arms delivered between ${year - 4} and ${year}${top3 ? `; the top three exporters supplied ${top3}` : ''}.`,
        total: (v, y) => `Countries delivered major arms worth ${v} in SIPRI’s trend-indicator value between ${y - 4} and ${y}.`,
        bloc: (b, s, y) => `${b} members supplied ${s} of them, ${armsPeriod(y)}.`,
        caveat: armsCaveat,
        description: (y) => `Arms exports by country, ${armsPeriod(y)}: five-year totals of major weapons delivered, on a map and in a table, with the largest flows. Source: SIPRI.`,
      },
      armsimp5: {
        pick: 'Importers', title: 'Arms imports', sub: 'by recipient, five-year totals', period: armsPeriod, measure: 'imported', figureLabel: 'Major arms imported',
        legend: (y) => `Major arms imported, ${armsPeriod(y)}, SIPRI trend-indicator value (millions)`, worldLabel: 'Total, all recipients',
        lede: ({ top, share, top3, year }) => `${top} received ${share} of the major arms delivered between ${year - 4} and ${year}${top3 ? `; the top three importers received ${top3}` : ''}.`,
        total: (v, y) => `Countries received major arms worth ${v} in SIPRI’s trend-indicator value between ${y - 4} and ${y}.`,
        bloc: (b, s, y) => `${b} members received ${s} of them, ${armsPeriod(y)}.`,
        caveat: armsCaveat,
        description: (y) => `Arms imports by country, ${armsPeriod(y)}: five-year totals of major weapons received, with each country’s main suppliers, on a map and in a table. Source: SIPRI.`,
      },
    },
  },
  internet: {
    section: 'Internet',
    pickerLabel: 'Measure',
    layers: {
      outages: {
        pick: 'Outages', period: () => 'last 12 months', title: 'Internet outages', sub: 'by country, last 12 months', measure: 'outages', figureLabel: 'Outages, last 12 months',
        legend: () => 'Internet outages detected in the last 12 months', worldLabel: 'Total, all countries',
        lede: ({ top, value, share }) => `${top} had ${value} internet outages in the last 12 months, the most of any country and ${share} of those IODA detected.`,
        total: (v) => `IODA detected ${v} country-level internet outages in the last 12 months.`,
        bloc: (b, s) => `${s} of the outages were in ${b} members.`,
        caveat: 'Outages that IODA, at Georgia Tech, detected from drops in internet traffic signals for a whole country. It reports when an outage happened, not why: power cuts, cable damage and shutdowns ordered by governments all count, and one long disruption can show as several outages.',
        description: () => 'Internet outages by country over the last 12 months, on a map and in a table, with each country’s most recent outages. Source: IODA (Georgia Tech).',
      },
    },
  },
  sanctions: {
    section: 'Sanctions',
    pickerLabel: 'List',
    layers: {
      sanctions: {
        pick: 'All three lists', title: 'Sanctions listings', sub: 'US, EU and UK lists', measure: 'listings', figureLabel: 'Listings',
        legend: (y) => `Sanctions listings by country, ${y}`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} had ${value} listings on the US, EU and UK sanctions lists in ${year}, ${share} of those with a country${top3 ? `; the top three countries had ${top3}` : ''}.`,
        total: (v, y) => `The three lists had ${v} listings with a country in ${y}.`,
        bloc: (b, s, y) => `${s} of the listings were in ${b} members in ${y}.`,
        caveat: 'Listings on the US Specially Designated Nationals list, the EU financial sanctions list and the UK Sanctions List. A target on two lists counts once for each. Each listing is a person, company, ship or aircraft, placed by the country of its first address, else its nationality. Counts show how many targets a list names, not how severe the measures are.',
        description: (y) => `Sanctions listings by country, ${y}: how many people, companies, ships and aircraft are listed for each country, on a map and in a table. Source: US Treasury, EU, UK government.`,
      },
      sanctionsus: {
        pick: 'US', title: 'US sanctions listings', sub: 'Specially Designated Nationals list', measure: 'listings', figureLabel: 'Listings',
        legend: (y) => `US sanctions listings by country, ${y}`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} had ${value} listings on the US Specially Designated Nationals list in ${year}, ${share} of those with a country${top3 ? `; the top three countries had ${top3}` : ''}.`,
        total: (v, y) => `The US list had ${v} listings with a country in ${y}.`,
        bloc: (b, s, y) => `${s} of the listings were in ${b} members in ${y}.`,
        caveat: 'The US Treasury’s Specially Designated Nationals list, as published in the US Consolidated Screening List. Export controls such as the Entity List are not included. Each listing is a person, company, ship or aircraft, placed by the country of its first address, else its nationality. Counts show how many targets a list names, not how severe the measures are.',
        description: (y) => `US sanctions listings by country, ${y}: how many people, companies, ships and aircraft are listed for each country, on a map and in a table. Source: US Consolidated Screening List.`,
      },
      sanctionseu: {
        pick: 'EU', title: 'EU sanctions listings', sub: 'consolidated financial sanctions list', measure: 'listings', figureLabel: 'Listings',
        legend: (y) => `EU sanctions listings by country, ${y}`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} had ${value} listings on the EU financial sanctions list in ${year}, ${share} of those with a country${top3 ? `; the top three countries had ${top3}` : ''}.`,
        total: (v, y) => `The EU list had ${v} listings with a country in ${y}.`,
        bloc: (b, s, y) => `${s} of the listings were in ${b} members in ${y}.`,
        caveat: 'The EU’s consolidated list of persons, groups and entities subject to financial sanctions. Each listing is a person, company, ship or aircraft, placed by the country of its first address, else its nationality. Counts show how many targets a list names, not how severe the measures are.',
        description: (y) => `EU sanctions listings by country, ${y}: how many people, companies, ships and aircraft are listed for each country, on a map and in a table. Source: EU financial sanctions files.`,
      },
      sanctionsuk: {
        pick: 'UK', title: 'UK sanctions listings', sub: 'UK Sanctions List', measure: 'listings', figureLabel: 'Listings',
        legend: (y) => `UK sanctions listings by country, ${y}`, worldLabel: 'Total, all countries',
        lede: ({ top, value, share, top3, year }) => `${top} had ${value} listings on the UK Sanctions List in ${year}, ${share} of those with a country${top3 ? `; the top three countries had ${top3}` : ''}.`,
        total: (v, y) => `The UK list had ${v} listings with a country in ${y}.`,
        bloc: (b, s, y) => `${s} of the listings were in ${b} members in ${y}.`,
        caveat: 'The UK government’s Sanctions List of designations under UK law. Each listing is a person, company, ship or aircraft, placed by the country of its first address, else its nationality. Counts show how many targets a list names, not how severe the measures are.',
        description: (y) => `UK sanctions listings by country, ${y}: how many people, companies, ships and aircraft are listed for each country, on a map and in a table. Source: UK Sanctions List.`,
      },
    },
  },
};

/** UNHCR's three groups, in the refugees views' panel and table. */
export const PARTS_TEXT = {
  block: (year: number) => `Who is counted, ${year}`,
  caption: 'UNHCR adds three groups together',
  refugees: 'Refugees',
  asylum: 'Asylum seekers',
  asylumNote: 'claims not yet decided',
  oip: 'Others in need of international protection',
  oipShort: 'Others in need of protection',
  /** Notes worked out from the figures, for the latest year. */
  mostlyAsylum: (share: string, year: number) => `${share} of the ${year} figure are asylum seekers whose claims were not yet decided (UNHCR).`,
  mostlyOip: (share: string, year: number) => `${share} of the ${year} figure are counted as others in need of international protection rather than as refugees (UNHCR).`,
};

/** Notes on single places in the refugees views, by layer: what the figures leave out or why they change sharply. */
export const PLACE_NOTES: Record<string, Record<string, string>> = {
  refout: {
    UKR: 'From 2024, UNHCR’s figures no longer include Ukrainians in Russia, whom it counted until 2023, so the total falls that year.',
    AFG: 'The fall in 2025 follows returns and deportations of Afghans from Iran and Pakistan. From 2025 UNHCR also counts about a million Afghans as others in need of international protection.',
    PSE: 'Palestinian refugees under the mandate of UNRWA, the UN agency for Palestine refugees, are not in UNHCR’s figures; UNRWA counts nearly 6 million.',
  },
  refin: {
    RUS: 'From 2024, UNHCR’s figures no longer include Ukrainians in Russia, who made up most of the earlier total.',
    IRN: 'The fall in 2025 follows returns and deportations of Afghans.',
    PAK: 'The fall in 2025 follows returns and deportations of Afghans.',
    LBN: 'UNHCR’s registered count; Lebanon’s government estimates a much larger number of Syrians in the country.',
  },
};
PLACE_NOTES.refinpc = PLACE_NOTES.refin;
PLACE_NOTES.satellites = {
  RUS: 'Soviet satellites still in orbit count for Russia from 1992, as CelesTrak records them under one owner code.',
  USA: 'Most of the total is SpaceX’s Starlink constellation.',
};
PLACE_NOTES.launches = {
  NZL: 'Launches from Mahia are by Rocket Lab, a US company, and count for New Zealand because the site is there.',
  FRA: 'Launches from Kourou, in French Guiana, count for France; most are European Space Agency or Arianespace missions.',
  RUS: 'Launches from Baikonur, in Kazakhstan, count for Russia, which leases and runs the site.',
};

/** Words every registry map view shares. */
export const VIEWS_TEXT = {
  summary: 'Summary',
  all: 'All countries',
  tableLabel: (title: string) => `${title}, every country`,
  caption: (y: number, prev: number | null) => `Every country and territory with a figure for ${y}${prev ? `, with ${prev} for comparison` : ''}.`,
  country: 'Country',
  share: 'Share of world',
  change: 'Change',
  worldRow: 'World',
  totalRow: 'Total, reporting countries',
  related: 'Related',
  sameView: 'Same view, another measure',
  indicatorPage: 'Ranked table and trend',
  countryPage: 'Country page',
  dossier: 'Full dossier',
  highest: 'Highest',
  importers: 'Consume more than they emit',
  exporters: 'Emit more than they consume',
  coverage: (n: number, y: number | string) => `${n} countries and territories have a figure for ${typeof y === 'number' || /^\d/.test(y) ? y : `the ${y}`}.`,
  changeIn: (pct: string, more: boolean, prev: number | string) => `${pct} ${more ? 'more' : 'less'} than in ${prev}`,
  change2: (pct: string, more: boolean, prev: number | string, value: string) => `${pct} ${more ? 'more' : 'less'} than ${prev} (${value})`,
  points: (n: string) => `${n} pts`,
  pointsLong: (n: string) => `${n} percentage points`,
  periodLabel: (years: number) => `${years}-year period`,
  sameAs: (prev: number | string) => `Same as ${prev}`,
  top: (parts: string[], together: string | null) => `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}${together ? `; together, ${together} of the world total` : ''}.`,
  topPart: (name: string, value: string, share: string | null) => `${name} ${value}${share ? ` (${share})` : ''}`,
  topNoShare: (parts: string[]) => `The highest: ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
  divTop: (names: string[], values: string[]) => `The largest differences: ${names.map((n, i) => `${n} ${values[i]}`).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`,
  blocNone: (bloc: string, year: number) => `No ${bloc} member has a figure for ${year}.`,
  blocCount: (bloc: string, k: number, n: number, year: number) => `${k} of the ${n} ${bloc} members have a figure for ${year}.`,
  notListed: (year: number) => `No figure for ${year}`,
  noData: 'No data',
  rank: (rank: number, of: number) => `${rank} of ${of}`,
  prevYear: (year: number, value: string) => `${year}: ${value}`,
  ofWorld: (share: string) => `${share} of world`,
  ofTotal: (share: string) => `${share} of the total`,
  notes: 'Notes',
};

/** The internet outages panel: a country's latest outages. */
export const OUTAGE_TEXT = {
  recent: 'Latest outages',
  recentCaption: 'Start (UTC) and how long IODA saw the drop.',
  last30: (n: number) => `${n} in the last 30 days`,
  hours: (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`),
  more: (n: number) => `and ${n} earlier`,
};
