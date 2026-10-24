import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../worker/index';

const assets = { fetch: async () => new Response('asset', { status: 200 }) } as unknown as Env['ASSETS'];
const env: Env = { ASSETS: assets };
const call = (path: string, method = 'GET') =>
  worker.fetch(new Request(`https://example.test${path}`, { method }) as never, env, {} as never);

describe('worker', () => {
  it('answers the health check without caching or indexing', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('refuses other methods on the health check', async () => {
    expect((await call('/api/health', 'POST')).status).toBe(405);
  });

  it('returns 404 for unknown API paths', async () => {
    expect((await call('/api/nothing')).status).toBe(404);
  });

  it('passes everything else to the static assets', async () => {
    expect(await (await call('/about')).text()).toBe('asset');
  });
});
