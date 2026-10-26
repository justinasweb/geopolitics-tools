// Every source the runner knows, in run order (quick, frequent ones first).
import type { Source } from '../lib/source.ts';
import gdacs from './gdacs.ts';
import usgsQuakes from './usgs-quakes.ts';
import ioda from './ioda.ts';
import celestrak from './celestrak.ts';
import csl from './csl.ts';
import euSanctions from './eu-sanctions.ts';
import worldbank from './worldbank.ts';
import treasury from './treasury.ts';
import epoch from './epoch.ts';
import owid from './owid.ts';
import unhcr from './unhcr.ts';
import ukSanctions from './uk-sanctions.ts';
import pinksheet from './pinksheet.ts';
import cables from './cables.ts';
import faostat from './faostat.ts';
import imfWeo from './imf-weo.ts';
import portwatch from './portwatch.ts';
import eia from './eia.ts';
import comtrade from './comtrade.ts';
import ember from './ember.ts';
import ucdp from './ucdp.ts';
import ipc from './ipc.ts';

export const SOURCES: Source[] = [
  gdacs, usgsQuakes, ioda, portwatch, celestrak, csl, euSanctions, ukSanctions, worldbank, pinksheet, treasury, epoch,
  owid, unhcr, imfWeo, cables, faostat, eia, comtrade, ember, ucdp, ipc,
];
