// Until launch every page carries noindex and robots.txt disallows everything, wherever the site is served.
// The launch build sets SITE_INDEXABLE=true (a repository variable read by the production deploy). Even then only the
// production domain, geopolitics.tools, is ever indexable: the Worker (worker/index.ts) sends X-Robots-Tag: noindex
// on every other host (workers.dev, Previews, www), whatever this build says.
export const indexable = process.env.SITE_INDEXABLE === 'true';

export const siteName = 'geopolitics.tools';

/** Search results show about this many characters of a <title>. */
export const TITLE_MAX = 65;

/** The <title>: the page's title with " | geopolitics.tools" when the whole stays within TITLE_MAX characters, else the
 *  page's title on its own (og:title is always the page's own title). */
export function fullTitle(title: string): string {
  const withSite = `${title} | ${siteName}`;
  return title === siteName || withSite.length > TITLE_MAX ? title : withSite;
}

// Until launch the production home page is the holding page. Local and Preview builds get the homepage instead,
// and the index of the built pages at /dev, so the work in progress can be clicked through. CI sets SITE_HOLDING=true
// for production builds; at launch the repository variable SITE_HOLDING is set to `false`.
export const holdingHome = process.env.SITE_HOLDING === 'true';

// Fathom Analytics, cookieless (see the privacy page). The tag goes on every page, but Fathom counts visits only on
// the production domain and ignores every other host (workers.dev, Previews, localhost). Until launch that domain
// serves only the holding page, so only the holding page is counted; after launch, every page is. No ID, no tag.
export const fathomSiteId = 'DNBPMMDA';
export const fathomTag = fathomSiteId
  ? `<script src="https://cdn.usefathom.com/script.js" data-site="${fathomSiteId}" data-included-domains="${siteName}" defer></script>`
  : '';
