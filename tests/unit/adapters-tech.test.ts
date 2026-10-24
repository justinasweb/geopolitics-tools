import { beforeEach, describe, expect, it } from 'vitest';
import { matcher, matchReports, rawDir, resetMatchers } from '../../src/adapters/core.ts';
import { orbitClass, parseSatcat, space } from '../../src/adapters/celestrak.ts';
import { ai, computeAt, countriesIn } from '../../src/adapters/epoch.ts';
import { parseEu, parseUk, sanctions, typeOf } from '../../src/adapters/sanctions.ts';
import { registry } from '../../src/data/indicators.ts';

const PROTOTYPE = new URL('../fixtures/prototype/', import.meta.url).pathname;
/** The prototype's sanctions samples, converted into the formats the live fetchers save (tests/fixtures/live/README.md). */
const LIVE = new URL('../fixtures/live/', import.meta.url).pathname;

beforeEach(() => resetMatchers());

describe('CelesTrak', () => {
  const raw = rawDir(PROTOTYPE);

  it('counts payloads in orbit by owner country and launches by site, with every owner and site matched', () => {
    const s = space(raw);
    const last = Number(s.asOf.slice(0, 4));
    expect(s.inOrbit.USA[last]).toBeGreaterThan(s.inOrbit.CHN[last]);
    expect(s.launches.USA[last]).toBeGreaterThan(0);
    // International bodies are listed but belong to no country.
    expect(s.owners.ESA.place).toBeNull();
    expect(s.owners.ESA.active).toBeGreaterThanOrEqual(0);
    expect(Object.keys(s.unknownSites)).toEqual([]);
    expect(matchReports()).toEqual(['celestrak: every code matched']);
  });

  it('counts each launch once, gives Soviet-era payloads to the Soviet Union and Baikonur to Russia after 1991', () => {
    const head = 'OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE';
    const s = parseSatcat([head,
      'A,1990-001A,1,PAY,-,CIS,1990-01-05,TYMSC,,1436,0,1,1',
      'B,1990-001B,2,PAY,-,CIS,1990-01-05,TYMSC,1993-02-01,95,0,1,1',
      'C,1995-010A,3,PAY,+,CIS,1995-03-01,TYMSC,,95,0,1,1',
      'R,1995-010B,4,R/B,-,CIS,1995-03-01,TYMSC,,95,0,1,1',
      'D,1995-011A,5,PAY,+,ESA,1995-04-01,FRGUI,,700,0,1,1'].join('\n'));
    // Counted at the end of each year: the Soviet Union ended on 26 December 1991.
    expect(s.inOrbit.SUN).toEqual({ 1990: 2 });
    expect(s.inOrbit.RUS).toEqual({ 1991: 2, 1992: 2, 1993: 1, 1994: 1, 1995: 2 });
    expect(s.launches).toEqual({ SUN: { 1990: 1 }, RUS: { 1995: 1 }, FRA: { 1995: 1 } });
    expect(s.owners.CIS.place).toBe('RUS');
    expect(s.owners.CIS.active).toBe(1);
    expect(s.owners.ESA.orbits.meo).toBe(1);
    expect(orbitClass(1436)).toBe('geo');
  });
});

describe('Epoch AI', () => {
  const raw = rawDir(PROTOTYPE);

  it('reads clusters and models with every country matched; shares of compute add up to one', () => {
    const a = ai(raw);
    expect(a.clusters.length).toBeGreaterThan(40);
    expect(Object.keys(a.models)).toContain('CHN');
    const c = computeAt(a.clusters, a.lastYear);
    expect(c.by.USA / c.total).toBeGreaterThan(0.3);
    const share = registry(raw).get('aicompute');
    expect(Object.values(share).reduce((t, y) => t + y[a.lastYear], 0)).toBeCloseTo(1);
    expect(matchReports().every((r) => r.includes('every'))).toBe(true);
  });

  it('splits a cell of several countries, but not a name with a comma in it', () => {
    expect(countriesIn('United States of America, United Kingdom of Great Britain and Northern Ireland')).toEqual(['USA', 'GBR']);
    expect(countriesIn('Korea, Republic of')).toEqual(['KOR']);
    expect(countriesIn('USA;CHN;USA')).toEqual(['USA', 'CHN']);
    expect(matcher('epoch', 'name').unmatched()).toEqual([]);
  });
});

describe('sanctions', () => {
  const raw = rawDir(LIVE);

  it('counts US SDN, EU and UK listings by place, each target once, with every country matched', () => {
    const s = sanctions(raw);
    expect(s.lists.US).toBeGreaterThan(400);
    expect(s.lists.EU).toBeGreaterThan(300);
    expect(s.lists.UK).toBeGreaterThan(300);
    expect(s.byPlace.RUS.total).toBe(s.byPlace.RUS.byList.US + s.byPlace.RUS.byList.EU + s.byPlace.RUS.byList.UK);
    expect(Object.keys(s.entityList)).toContain('CHN');
    // The Denied Persons List record is neither a sanction nor on the Entity List.
    expect(s.byPlace.RUS.byList.US).toBe(240);
    expect(matchReports().every((r) => r.includes('every'))).toBe(true);
    const v = registry(raw).load('sanctions');
    expect(v.values.RUS[v.years[0]]).toBe(s.byPlace.RUS.total);
  });

  it('groups the EU and UK exports by target and places them by address, else nationality', () => {
    const eu = parseEu('Entity_LogicalId,Entity_SubjectType_ClassificationCode,Entity_Regulation_Programme,Entity_Regulation_PublicationDate,Address_CountryIso2Code,Citizenship_CountryIso2Code\n'
      + '1,person,RUS,2023-05-02,,RU\n1,person,RUS,2022-03-01,,RU\n2,enterprise,BLR,15/03/2022,BY,\n');
    expect(eu).toEqual([
      { list: 'EU', place: 'RUS', programme: 'RUS', type: 'person', year: 2022 },
      { list: 'EU', place: 'BLR', programme: 'BLR', type: 'entity', year: 2022 },
    ]);
    const uk = parseUk('Unique ID,Designation Type,Regime Name,Date Designated,Nationality(/ies),Address Country\nRUS0001,Ship,Russia,2024-01-02,,\nRUS0001,Ship,Russia,2024-01-02,,Russia\nIRN0002,Individual,Iran,2019-06-01,Iran,\n');
    expect(uk.map((e) => [e.place, e.type, e.year])).toEqual([['RUS', 'vessel', 2024], ['IRN', 'person', 2019]]);
    expect(typeOf('Aircraft')).toBe('aircraft');
  });
});
