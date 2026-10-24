// Reading one sheet of an Excel workbook (.xlsx) as rows of text, with no dependency: the workbook
// is a zip of XML files. Enough for published data tables; formatting, dates as serial numbers
// and formulas' sources are not interpreted (a formula's cached value is read).
import { unzip } from './zip.ts';

const decode = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : '');

const unescape = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    if (k === 'amp') return '&';
    return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });

/** All <t> texts inside one shared string or inline string, joined (rich text comes in runs). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('');

/** Column letters to a 0-based index: A → 0, Z → 25, AA → 26. */
export const columnIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)?.[0] ?? '') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

export interface Workbook {
  sheets: string[];
  rows(sheet: string): string[][];
}

export async function readXlsx(data: Uint8Array): Promise<Workbook> {
  const files = await unzip(data);
  const workbook = decode(files.get('xl/workbook.xml'));
  if (!workbook) throw new Error('not an xlsx workbook (no xl/workbook.xml)');
  const rels = new Map([...decode(files.get('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
    m[0].match(/\bId="([^"]+)"/)?.[1] ?? '',
    m[0].match(/\bTarget="([^"]+)"/)?.[1] ?? '',
  ]));
  const sheets = new Map([...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = unescape(m[0].match(/\bname="([^"]*)"/)?.[1] ?? '');
    const target = rels.get(m[0].match(/\br:id="([^"]+)"/)?.[1] ?? '') ?? '';
    return [name, target.startsWith('/') ? target.slice(1) : `xl/${target}`];
  }));
  const shared = [...decode(files.get('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));

  return {
    sheets: [...sheets.keys()],
    rows(sheet) {
      const path = sheets.get(sheet);
      const xml = path && decode(files.get(path));
      if (!xml) throw new Error(`no sheet "${sheet}"; the workbook has ${[...sheets.keys()].join(', ')}`);
      const out: string[][] = [];
      for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const r = Number(row[1].match(/\br="(\d+)"/)?.[1] ?? out.length + 1) - 1;
        const cells: string[] = [];
        let next = 0;
        for (const c of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = c[1].match(/\br="([A-Z]+)\d+"/)?.[1];
          const col = ref ? columnIndex(ref) : next;
          next = col + 1;
          const type = c[1].match(/\bt="(\w+)"/)?.[1];
          const inner = c[2] ?? '';
          const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
          let value = '';
          if (type === 's') value = shared[Number(v)] ?? '';
          else if (type === 'inlineStr') value = texts(inner);
          // Numbers keep 15 significant digits, as Excel shows them (70.1, not 70.09999999999999).
          else if (v !== undefined) value = /^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(v) ? String(Number(Number(v).toPrecision(15))) : unescape(v);
          while (cells.length < col) cells.push('');
          cells[col] = value;
        }
        while (out.length < r) out.push([]);
        out[r] = cells;
      }
      return out;
    },
  };
}
