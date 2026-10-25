// English words for the extras on the space views (/space, /space/launches): each owner's working satellites by
// orbit and constellation, and the launch sites. Same rules as views.en.ts.

export const SPACE_TEXT = {
  working: 'Working satellites now',
  workingCaption: (date: string) => `Satellites CelesTrak lists as working on ${date}, by orbit.`,
  orbit: { leo: 'Low Earth orbit', meo: 'Medium Earth orbit', geo: 'Geostationary orbit' } as Record<string, string>,
  constellations: 'Largest constellations',
  constellationsCaption: (date: string) => `Working satellites in each named constellation on ${date}, counted by the name CelesTrak gives them. Owners are the countries CelesTrak records.`,
  constellation: 'Constellation',
  owner: 'Owner',
  count: 'Working satellites',
  /** Constellation names as written in prose. */
  names: { STARLINK: 'Starlink', KUIPER: 'Kuiper', ONEWEB: 'OneWeb', QIANFAN: 'Qianfan', GUOWANG: 'Guowang', YAOGAN: 'Yaogan' } as Record<string, string>,
  sitesMark: 'Launch site (size: launches that year)',
  sitesLabel: (y: number) => `Launch sites, ${y}`,
  siteTip: (site: string, n: string, y: number) => `${site}: ${n} launch${n === '1' ? '' : 'es'} in ${y}`,
  sites: 'Launch sites',
  sitesCaption: (y: number) => `Launches from each site in ${y} and since the first launch; a site counts for the country it is in, except Baikonur, which counts for Russia.`,
  site: 'Site',
  country: 'Counts for',
  since: 'All years',
  intl: 'International',
};
