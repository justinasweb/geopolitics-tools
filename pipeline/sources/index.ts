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

export const SOURCES: Source[] = [gdacs, usgsQuakes, ioda, celestrak, csl, euSanctions, worldbank, treasury, epoch, owid, unhcr];
