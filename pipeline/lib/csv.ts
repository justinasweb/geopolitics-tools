// Small RFC 4180 CSV reader and writer: quoted fields, doubled quotes, newlines inside quotes,
// any one-character delimiter, a leading byte-order mark.
import { CheckError } from './source.ts';

export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const quote = (v: string, d: string) => (/["\r\n]/.test(v) || v.includes(d) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: string[][], delimiter = ','): string {
  return rows.map((r) => r.map((v) => quote(v, delimiter)).join(delimiter)).join('\n') + '\n';
}

/** Keep only the named columns, in that order. Throws if any is missing, naming the columns the file does have. */
export function pickColumns(rows: string[][], columns: string[], what: string): string[][] {
  const header = rows[0] ?? [];
  const idx = columns.map((c) => header.indexOf(c));
  const missing = columns.filter((_, i) => idx[i] < 0);
  if (missing.length) throw new CheckError(`${what}: column(s) ${missing.join(', ')} missing; the file has ${header.slice(0, 40).join(', ')}`);
  return rows.map((r) => idx.map((i) => r[i] ?? ''));
}
