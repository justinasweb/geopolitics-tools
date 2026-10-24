// Where the pipeline keeps files between runs. Two buckets, as in docs/deploy.md:
//   raw        gt-raw: every fetched file under <source>/<run>/, plus the runner's state
//   snapshots  gt-snapshots: published data snapshots (which raw files make up a release)
// In GitHub Actions they are the R2 buckets, reached through the Cloudflare API with the same
// token the deploys use. Locally and in tests they are folders.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HttpError } from './http.ts';

export interface Bucket {
  readonly name: string;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, body: Uint8Array | string, contentType?: string): Promise<void>;
}

export class DirBucket implements Bucket {
  readonly name: string;
  private root: string;
  constructor(root: string, name: string) {
    this.root = join(root, name);
    this.name = name;
  }
  async get(key: string) {
    const p = join(this.root, key);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
  }
  async put(key: string, body: Uint8Array | string) {
    const p = join(this.root, key);
    mkdirSync(dirname(p), { recursive: true });
    // Write and rename, so a half-written file is never read.
    writeFileSync(`${p}.tmp`, body);
    renameSync(`${p}.tmp`, p);
  }
}

/** R2 through the Cloudflare REST API (the same calls `wrangler r2 object get/put --remote` makes). */
export class R2Bucket implements Bucket {
  readonly name: string;
  private base: string;
  private token: string;
  private fetchImpl: typeof fetch;
  constructor(name: string, accountId: string, token: string, fetchImpl: typeof fetch = fetch) {
    this.name = name;
    this.base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${name}/objects/`;
    this.token = token;
    this.fetchImpl = fetchImpl;
  }
  private url(key: string) {
    return this.base + key.split('/').map(encodeURIComponent).join('/');
  }
  private async call(method: 'GET' | 'PUT', key: string, init: RequestInit = {}) {
    let last: Error = new Error('no attempt');
    for (let i = 1; i <= 3; i++) {
      try {
        const res = await this.fetchImpl(this.url(key), {
          ...init,
          method,
          headers: { Authorization: `Bearer ${this.token}`, ...(init.headers as Record<string, string>) },
          signal: AbortSignal.timeout(120_000),
        });
        if (res.ok || res.status === 404) return res;
        last = new HttpError(res.status, this.url(key), `R2 ${method} ${this.name}/${key}: ${(await res.text()).slice(0, 200)}`);
        if (res.status < 500 && res.status !== 429) break;
      } catch (e) {
        last = new Error(`R2 ${method} ${this.name}/${key}: ${(e as Error).message}`);
      }
      await new Promise((s) => setTimeout(s, i * 2000));
    }
    throw last;
  }
  async get(key: string) {
    const res = await this.call('GET', key);
    return res.status === 404 ? null : new Uint8Array(await res.arrayBuffer());
  }
  async put(key: string, body: Uint8Array | string, contentType = 'application/octet-stream') {
    await this.call('PUT', key, { body: typeof body === 'string' ? body : new Blob([body as BlobPart]), headers: { 'Content-Type': contentType } });
  }
}

export interface Stores {
  raw: Bucket;
  snapshots: Bucket;
}

/** `dir:<path>` for local folders, `r2` for the Cloudflare buckets (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID). */
export function openStores(spec: string, env = process.env): Stores {
  if (spec === 'r2') {
    const token = env.CLOUDFLARE_API_TOKEN;
    const account = env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !account) throw new Error('--store=r2 needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
    return {
      raw: new R2Bucket(env.R2_RAW_BUCKET ?? 'gt-raw', account, token),
      snapshots: new R2Bucket(env.R2_SNAPSHOTS_BUCKET ?? 'gt-snapshots', account, token),
    };
  }
  if (spec.startsWith('dir:')) {
    const root = spec.slice(4);
    return { raw: new DirBucket(root, 'gt-raw'), snapshots: new DirBucket(root, 'gt-snapshots') };
  }
  throw new Error(`unknown store "${spec}"; use dir:<path> or r2`);
}
