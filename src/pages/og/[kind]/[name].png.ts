// Share images for every live page that names one in the route registry (og:image), plus the site default. What each
// card says is in src/lib/og-cards.ts; src/lib/og.ts draws it.
// GT_FAST=1 (npm run build:fast, for local work) builds only the default, since rendering every card is the slowest part of a build.
import type { APIRoute, GetStaticPaths } from 'astro';
import { shareImage } from '../../../lib/og';
import { card } from '../../../lib/og-cards';
import { routes, type Route } from '../../../lib/routes';

export const getStaticPaths = (() => {
  if (process.env.GT_FAST === '1') return [{ params: { kind: 'page', name: 'default' }, props: { route: null } }];
  const out = routes().filter((r) => r.live && r.image).map((r) => {
    const [, , kind, file] = r.image!.split('/');
    return { params: { kind, name: file.replace(/\.png$/, '') }, props: { route: r as Route | null } };
  });
  return [...out, { params: { kind: 'page', name: 'default' }, props: { route: null } }];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await shareImage(card((props as { route: Route | null }).route));
  return new Response(png as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': 'image/png' } });
};
