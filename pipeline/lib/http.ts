// HTTP for fetchers: a polite user agent, timeouts, a few retries on network errors and 5xx, and
// error messages without query strings, so a key in a URL never reaches a log or status.json.

const UA = 'geopolitics.tools data fetcher (+https://geopolitics.tools)';

export interface GetOptions {
  /** Milliseconds before one attempt is abandoned. Default 60 s. */
  timeout?: number;
  tries?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

export interface Http {
  get(url: string, opts?: GetOptions): Promise<Response>;
}

/** The URL as it may appear in logs: host and path only. */
export const redact = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}${u.search ? '?…' : ''}`;
  } catch {
    return '(bad URL)';
  }
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string, detail = '') {
    super(`HTTP ${status} from ${redact(url)}${detail ? `: ${detail}` : ''}`);
    this.status = status;
  }
}

const wait = (ms: number) => new Promise((s) => setTimeout(s, ms));

export function createHttp(fetchImpl: typeof fetch = fetch, retryDelay = 2000): Http {
  return {
    async get(url, { timeout = 60_000, tries = 3, headers = {}, method = 'GET', body } = {}) {
      let last: Error = new Error('no attempt');
      for (let i = 1; i <= tries; i++) {
        try {
          const res = await fetchImpl(url, {
            method,
            body,
            headers: { 'User-Agent': UA, ...headers },
            signal: AbortSignal.timeout(timeout),
            redirect: 'follow',
          });
          if (res.ok) return res;
          const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
          last = new HttpError(res.status, url, text);
          // Client errors will not fix themselves; 429 might, after a pause.
          if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        } catch (e) {
          const err = e as Error;
          last = new Error(`${err.name === 'TimeoutError' ? `timed out after ${timeout / 1000} s` : err.message} (${redact(url)})`);
        }
        if (i < tries) await wait(i * retryDelay);
      }
      throw last;
    },
  };
}

export async function getJson<T = unknown>(http: Http, url: string, opts?: GetOptions): Promise<T> {
  const res = await http.get(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`not JSON from ${redact(url)}: ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
}

export async function getText(http: Http, url: string, opts?: GetOptions): Promise<string> {
  return (await http.get(url, opts)).text();
}

export async function getBytes(http: Http, url: string, opts?: GetOptions): Promise<Uint8Array> {
  return new Uint8Array(await (await http.get(url, opts)).arrayBuffer());
}
