// Test helpers: a fake network answering by URL pattern, and a fetch context over a temp folder.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
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

/** A zip of the given files (deflated), to stand in for an xlsx workbook or a bulk download. */
export function makeZip(files: Record<string, string | Uint8Array>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const packed = deflateRawSync(data);
    const n = enc.encode(name);
    const local = new Uint8Array(30 + n.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(8, 8, true);
    l.setUint32(18, packed.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, n.length, true);
    local.set(n, 30);
    const central = new Uint8Array(46 + n.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(10, 8, true);
    c.setUint32(20, packed.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.set(n, 46);
    locals.push(local, packed);
    centrals.push(central);
    offset += local.length + packed.length;
  }
  const cdSize = centrals.reduce((s, x) => s + x.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, centrals.length, true);
  e.setUint16(10, centrals.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A one-sheet-plus-cover xlsx workbook: numbers as numbers, text as shared strings. */
export function makeXlsx(sheet: string, rows: (string | number | null)[][]): Uint8Array<ArrayBuffer> {
  const strings: string[] = [];
  const col = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
  const body = rows.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => {
    if (v === null) return '';
    if (typeof v === 'number') return `<c r="${col(x)}${y + 1}"><v>${v}</v></c>`;
    strings.push(v);
    return `<c r="${col(x)}${y + 1}" t="s"><v>${strings.length - 1}</v></c>`;
  }).join('')}</row>`).join('');
  return makeZip({
    'xl/workbook.xml': `<workbook><sheets><sheet name="Cover" sheetId="1" r:id="rId1"/><sheet name="${esc(sheet)}" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData/></worksheet>',
    'xl/worksheets/sheet2.xml': `<worksheet><sheetData>${body}</sheetData></worksheet>`,
  });
}
