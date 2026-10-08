// A zip file, written and read with nothing but Node's own zlib. Enough for Wheelman's backups:
// each entry is deflated, names are UTF-8, and a file that is damaged is noticed when read back.
// Files of 4 GB or more (zip64) are not supported; a backup is a few megabytes.

import fs from 'node:fs';
import zlib from 'node:zlib';

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** The CRC-32 of a buffer, as zip files record it. */
export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const MAX32 = 0xffffffff;

// Zip files keep a file's time in the old MS-DOS shape: two-second steps, from 1980.
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/**
 * Writes a zip file. Each entry is { name, data, mtime }: the path inside the zip (with forward
 * slashes), a Buffer or a string, and an optional Date. The file is written under a temporary
 * name and renamed once complete, so a half-written one is never mistaken for a backup.
 */
export function writeZip(file, entries, { level = 6 } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(String(e.name).replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data ?? ''), 'utf8');
    const packed = zlib.deflateRawSync(data, { level });
    const deflated = packed.length < data.length;
    const body = deflated ? packed : data;
    if (data.length >= MAX32 || body.length >= MAX32 || offset >= MAX32) throw new Error(`${e.name} is too large for a zip file`);
    const method = deflated ? 8 : 0;
    const when = e.mtime instanceof Date && !Number.isNaN(e.mtime.getTime()) ? e.mtime : new Date();
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);        // version needed: 2.0
    local.writeUInt16LE(0x0800, 6);    // flags: names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime(when), 10);
    local.writeUInt16LE(dosDate(when), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(CENTRAL, 0);
    cd.writeUInt16LE(20, 4);           // made by: version 2.0, MS-DOS attributes
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime(when), 12);
    cd.writeUInt16LE(dosDate(when), 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);           // extra field
    cd.writeUInt16LE(0, 32);           // comment
    cd.writeUInt16LE(0, 34);           // disk number
    cd.writeUInt16LE(0, 36);           // internal attributes
    cd.writeUInt32LE(0, 38);           // external attributes
    cd.writeUInt32LE(offset, 42);

    parts.push(local, name, body);
    central.push(cd, name);
    offset += local.length + name.length + body.length;
  }
  const cdBytes = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBytes, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  const part = `${file}.part`;
  fs.writeFileSync(part, Buffer.concat([...parts, ...central, end]));
  fs.renameSync(part, file);
  return { entries: entries.length, bytes: offset + cdBytes + end.length };
}

/**
 * Reads every entry of a zip file back as { name, data }. Each one's size and checksum are
 * compared with what the file recorded, so a damaged backup is refused rather than restored.
 */
export function readZip(file) {
  const buf = fs.readFileSync(file);
  const floor = Math.max(0, buf.length - 22 - 0xffff);
  let i = buf.length - 22;
  while (i >= floor && buf.readUInt32LE(i) !== END) i--;
  if (i < floor) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new Error('The zip file is damaged');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL) throw new Error(`${name}: the zip file is damaged`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + csize > buf.length) throw new Error(`${name}: the zip file is cut short`);
    const body = buf.subarray(start, start + csize);
    let data;
    if (method === 8) { try { data = zlib.inflateRawSync(body); } catch { throw new Error(`${name}: damaged`); } }
    else if (method === 0) data = Buffer.from(body);
    else throw new Error(`${name}: packed in a way this reader does not know`);
    if (data.length !== usize || crc32(data) !== crc) throw new Error(`${name}: damaged`);
    out.push({ name, data });
  }
  return out;
}
