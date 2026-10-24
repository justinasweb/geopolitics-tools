// Reading zip files with Node's own zlib: small ones in memory (an xlsx workbook), big ones from
// disk as a stream (FAOSTAT's bulk files, several GB once unpacked). Stored and deflated entries,
// with Zip64 sizes and offsets.
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createInflateRaw, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  /** Offset of the entry's local header. */
  offset: number;
}

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The entries listed in the central directory, given the file's last bytes (or all of it) and where they start. */
export async function listEntries(tail: Uint8Array, tailStart: number, readAt: (offset: number, length: number) => Uint8Array | Promise<Uint8Array>): Promise<ZipEntry[]> {
  const v = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let e = -1;
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 22 - 65_535); i--) if (v.getUint32(i, true) === EOCD) { e = i; break; }
  if (e < 0) throw new Error('not a zip file (no end of central directory)');
  let count = v.getUint16(e + 10, true);
  let cdSize = v.getUint32(e + 12, true);
  let cdOffset = v.getUint32(e + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    // Zip64: the locator just before the end record points at the Zip64 end record.
    const loc = new DataView(tail.buffer, tail.byteOffset + e - 20, 20);
    const at = Number(loc.getBigUint64(8, true));
    const rec = at >= tailStart ? tail.subarray(at - tailStart, at - tailStart + 56) : await readAt(at, 56);
    const r = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    if (r.getUint32(0, true) !== EOCD64) throw new Error('bad Zip64 end record');
    count = Number(r.getBigUint64(32, true));
    cdSize = Number(r.getBigUint64(40, true));
    cdOffset = Number(r.getBigUint64(48, true));
  }
  const cd = cdOffset >= tailStart ? tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize) : await readAt(cdOffset, cdSize);
  const d = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (d.getUint32(p, true) !== CENTRAL) throw new Error('bad central directory');
    const nameLen = d.getUint16(p + 28, true);
    const extraLen = d.getUint16(p + 30, true);
    const commentLen = d.getUint16(p + 32, true);
    let compressedSize = d.getUint32(p + 20, true);
    let size = d.getUint32(p + 24, true);
    let offset = d.getUint32(p + 42, true);
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen));
    // Zip64 extra field: the 64-bit values, in this order, for each field that was 0xFFFFFFFF.
    for (let x = p + 46 + nameLen; x < p + 46 + nameLen + extraLen;) {
      const id = d.getUint16(x, true);
      const len = d.getUint16(x + 2, true);
      if (id === 1) {
        let y = x + 4;
        if (size === 0xffffffff) { size = Number(d.getBigUint64(y, true)); y += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = Number(d.getBigUint64(y, true)); y += 8; }
        if (offset === 0xffffffff) offset = Number(d.getBigUint64(y, true));
      }
      x += 4 + len;
    }
    out.push({ name, method: d.getUint16(p + 10, true), compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Where an entry's data starts: after its local header, whose name and extra lengths may differ from the central copy. */
function dataStart(header: Uint8Array, entry: ZipEntry) {
  const h = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (h.getUint32(0, true) !== LOCAL) throw new Error(`bad local header for ${entry.name}`);
  return entry.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
}

/** Every file in a zip held in memory, unpacked. */
export async function unzip(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  const readAt = (o: number, l: number) => zip.subarray(o, o + l);
  const files = new Map<string, Uint8Array>();
  for (const e of await listEntries(zip, 0, readAt)) {
    if (e.name.endsWith('/')) continue;
    const start = dataStart(readAt(e.offset, 30), e);
    const raw = zip.subarray(start, start + e.compressedSize);
    if (e.method === 0) files.set(e.name, raw);
    else if (e.method === 8) files.set(e.name, new Uint8Array(inflateRawSync(raw)));
    else throw new Error(`${e.name}: unsupported zip method ${e.method}`);
  }
  return files;
}

/** The entries of a zip file on disk. */
export async function listFile(path: string): Promise<ZipEntry[]> {
  const fh = await open(path);
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 65_535 + 22 + 20);
    const read = async (o: number, l: number) => {
      const b = new Uint8Array(l);
      await fh.read(b, 0, l, o);
      return b;
    };
    return await listEntries(await read(size - tailLen, tailLen), size - tailLen, read);
  } finally {
    await fh.close();
  }
}

/** One entry of a zip file on disk, unpacked as a stream. */
export async function openEntry(path: string, entry: ZipEntry): Promise<Readable> {
  const fh = await open(path);
  const header = new Uint8Array(30);
  try {
    await fh.read(header, 0, 30, entry.offset);
  } finally {
    await fh.close();
  }
  const start = dataStart(header, entry);
  if (entry.compressedSize === 0) return Readable.from([]);
  const raw = createReadStream(path, { start, end: start + entry.compressedSize - 1 });
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`${entry.name}: unsupported zip method ${entry.method}`);
  return raw.pipe(createInflateRaw());
}
