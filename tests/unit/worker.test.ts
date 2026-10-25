import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../worker/index';

const assets = { fetch: async () => new Response('asset', { status: 200 }) } as unknown as Env['ASSETS'];
const env: Env = { ASSETS: assets };
const call = (path: string, method = 'GET', e: Env = env, host = 'example.test') =>
  worker.fetch(new Request(`https://${host}${path}`, { method }) as never, e, {} as never);
const holding: Env = { ASSETS: assets, HOLDING: 'true' };

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

  it('keeps the domain on the holding page until launch', async () => {
    const res = await call('/water', 'GET', holding, 'geopolitics.tools');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect((await call('/countries/china', 'GET', holding, 'www.geopolitics.tools')).status).toBe(302);
    for (const path of ['/', '/robots.txt', '/favicon.svg', '/og.png']) {
      expect(await (await call(path, 'GET', holding, 'geopolitics.tools')).text()).toBe('asset');
    }
    expect((await call('/api/health', 'GET', holding, 'geopolitics.tools')).status).toBe(200);
  });

  it('serves every page on workers.dev, in Previews and after launch', async () => {
    expect(await (await call('/water', 'GET', holding, 'geopolitics-tools.example.workers.dev')).text()).toBe('asset');
    expect(await (await call('/water', 'GET', env, 'geopolitics.tools')).text()).toBe('asset');
  });
});
