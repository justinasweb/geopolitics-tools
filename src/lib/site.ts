// Until launch every page carries noindex and robots.txt disallows everything, wherever the site is served.
// The launch build sets SITE_INDEXABLE=true (a repository variable read by the production deploy).
export const indexable = process.env.SITE_INDEXABLE === 'true';

export const siteName = 'geopolitics.tools';
