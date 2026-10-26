// Until launch every page carries noindex and robots.txt disallows everything, wherever the site is served.
// The launch build sets SITE_INDEXABLE=true (a repository variable read by the production deploy).
export const indexable = process.env.SITE_INDEXABLE === 'true';

export const siteName = 'geopolitics.tools';

// Until launch the production home page is the holding page. Local and Preview builds get a plain index of the
// built pages instead, so the work in progress can be clicked through. CI sets SITE_HOLDING=true for production
// builds; at launch the repository variable SITE_HOLDING is set to `false` (and the dev index goes).
export const holdingHome = process.env.SITE_HOLDING === 'true';

// Fathom Analytics, cookieless (see the privacy page). The tag goes on every page, but Fathom counts visits only on
// the production domain and ignores every other host (workers.dev, Previews, localhost). Until launch that domain
// serves only the holding page, so only the holding page is counted; after launch, every page is. No ID, no tag.
export const fathomSiteId = 'DNBPMMDA';
export const fathomTag = fathomSiteId
  ? `<script src="https://cdn.usefathom.com/script.js" data-site="${fathomSiteId}" data-included-domains="${siteName}" defer></script>`
  : '';
