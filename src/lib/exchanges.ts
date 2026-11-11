// The extras on the exchange points view, from PeeringDB (../adapters/peeringdb.ts): each country's exchanges by
// networks connected, and the marks for the map.
import { type Exchange, exchanges } from '../adapters/peeringdb.ts';
import { shared } from './data.ts';

const pdb = shared(exchanges);

/** Every exchange point PeeringDB lists with a country, most networks first. */
export const exchangeList = (): Exchange[] => pdb()?.list ?? [];

/** A country's exchange points, most networks first. */
export const exchangesIn = (place: string): Exchange[] => exchangeList().filter((x) => x.place === place);

/** How many listed exchanges have no facility with coordinates, so no mark. */
export const unplaced = (): number => exchangeList().filter((x) => !x.at).length;
