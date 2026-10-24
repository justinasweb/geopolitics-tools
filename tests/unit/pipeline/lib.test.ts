import { describe, expect, it } from 'vitest';
import { parseCsv, pickColumns, toCsv } from '../../../pipeline/lib/csv.ts';
import { createHttp, getJson, redact } from '../../../pipeline/lib/http.ts';
import { R2Bucket } from '../../../pipeline/lib/store.ts';
import { fakeFetch } from './helpers.ts';

describe('csv', () => {
  it('reads quotes, doubled quotes, newlines in fields, other delimiters and a BOM', () => {
    expect(parseCsv('﻿a,b\n"x, y","say ""hi"""\r\n"two\nlines",3\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', '3']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a;b'], ['1;2']]);
    expect(parseCsv('a;b\n1;2', ';')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('writes what it reads', () => {
    const rows = [['name', 'note'], ['Côte d\'Ivoire', 'has, comma'], ['Q', 'has "quote"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('picks columns and names the ones a changed file lacks', () => {
    const rows = [['a', 'b', 'c'], ['1', '2', '3']];
    expect(pickColumns(rows, ['c', 'a'], 'f')).toEqual([['c', 'a'], ['3', '1']]);
    expect(() => pickColumns(rows, ['a', 'z'], 'f.csv')).toThrow('f.csv: column(s) z missing; the file has a, b, c');
  });
});

describe('http', () => {
  it('keeps query strings, which may hold keys, out of messages', async () => {
    expect(redact('https://api.eia.gov/v2/x?api_key=SECRET')).toBe('api.eia.gov/v2/x?…');
    const http = createHttp(fakeFetch([[/eia/, () => new Response('nope', { status: 403 })]]), 0);
    await expect(http.get('https://api.eia.gov/v2/x?api_key=SECRET')).rejects.toThrow(/^HTTP 403 from api\.eia\.gov\/v2\/x\?…: nope$/);
    await expect(http.get('https://api.eia.gov/v2/x?api_key=SECRET')).rejects.not.toThrow(/SECRET/);
  });

  it('retries server errors but not client errors', async () => {
    const calls: string[] = [];
    let n = 0;
    const http = createHttp(fakeFetch([
      [/flaky/, () => (++n < 3 ? new Response('busy', { status: 503 }) : { ok: true })],
      [/gone/, () => new Response('', { status: 404 })],
    ], calls), 0);
    expect(await getJson(http, 'https://x.test/flaky')).toEqual({ ok: true });
    await expect(http.get('https://x.test/gone')).rejects.toThrow(/HTTP 404/);
    expect(calls.filter((c) => c.endsWith('gone'))).toHaveLength(1);
  });

  it('says when a JSON answer is not JSON', async () => {
    const http = createHttp(fakeFetch([[/./, () => '<html>maintenance</html>']]), 0);
    await expect(getJson(http, 'https://x.test/a')).rejects.toThrow('not JSON from x.test/a: <html>maintenance</html>');
  });
});

describe('R2 bucket', () => {
  it('calls the Cloudflare object API with the token, and reads a missing object as null', async () => {
    const seen: { url: string; method?: string; auth?: string }[] = [];
    const store = new Map<string, string>();
    const f = (async (url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      seen.push({ url, method: init.method, auth });
      if (init.method === 'PUT') { store.set(url, await new Response(init.body).text()); return new Response('{}'); }
      return store.has(url) ? new Response(store.get(url)) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const b = new R2Bucket('gt-raw', 'acc', 'tok', f);
    expect(await b.get('state/status.json')).toBeNull();
    await b.put('a b/x.json', '{"v":1}', 'application/json');
    expect(new TextDecoder().decode((await b.get('a b/x.json'))!)).toBe('{"v":1}');
    expect(seen[1]).toEqual({ url: 'https://api.cloudflare.com/client/v4/accounts/acc/r2/buckets/gt-raw/objects/a%20b/x.json', method: 'PUT', auth: 'Bearer tok' });
  });
});
