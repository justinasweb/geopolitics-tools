// Test helpers: a fake network answering by URL pattern, and a fetch context over a temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHttp, type Http } from '../../../pipeline/lib/http.ts';
import type { FetchContext } from '../../../pipeline/lib/source.ts';
import { openStores, type Stores } from '../../../pipeline/lib/store.ts';

export type Route = [RegExp, (url: string, init?: RequestInit) => Response | string | object];

/** fetch() that answers from the first matching route; strings and objects become 200 responses. */
export function fakeFetch(routes: Route[], calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response('not found', { status: 404 });
    const out = hit[1](url, init);
    if (out instanceof Response) return out;
    return new Response(typeof out === 'string' ? out : JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
}

export const fakeHttp = (routes: Route[], calls?: string[]): Http => createHttp(fakeFetch(routes, calls), 0);

export const tempStores = (): Stores => openStores(`dir:${mkdtempSync(`${tmpdir()}/gt-`)}`);

export function ctxFor(http: Http, previous: Record<string, string> = {}, now = new Date('2026-10-24T12:00:00Z')): FetchContext {
  return {
    http,
    now,
    log: () => {},
    previous: async (name) => previous[name] ?? null,
    allowShrink: false,
    env: {},
  };
}
