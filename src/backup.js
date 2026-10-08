// Backups. One dated zip file holds everything that lives only on this computer and cannot be
// fetched again: the database (every conversation, suggestion, lesson, rating and record), the
// .env settings, the staff names, the voice files, the private business facts and the notes.
// One is written when Wheelman closes, once a day while it is open, and by hand with
// "npm run backup". Photos, website pages and the raw history are left out: they can be
// fetched again. The newest few are kept; the rest are removed.
//
// Restoring puts those files back into a Wheelman folder, after keeping what is there as a
// "before restore" backup, so a restore can itself be undone.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { openDb, closeDb, getMeta, setMeta } from './db.js';
import { writeZip, readZip } from './zip.js';
import { sydneyDay } from './time.js';

const DAY = 24 * 3600 * 1000;
export const PREFIX = 'Wheelman backup';
export const BEFORE_RESTORE = 'Wheelman before restore';
const DB_ENTRY = 'data/app.db';
const MANIFEST = 'backup.json';

const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(config.root, 'package.json'), 'utf8')).version || ''; } catch { return ''; } })();

/** The files that live only on this computer, relative to the Wheelman folder. Missing ones are skipped. */
export function filesToBackUp(root = config.root) {
  const out = ['.env', 'Auction.txt', 'PLAN.md', 'knowledge/business-facts.md', 'knowledge/how-carbarn-works.md', 'knowledge/business-facts-evidence.md'];
  try {
    for (const f of fs.readdirSync(path.join(root, 'voice')).sort()) if (fs.statSync(path.join(root, 'voice', f)).isFile()) out.push(`voice/${f}`);
  } catch { /* no voice folder */ }
  return out.filter((f) => fs.existsSync(path.join(root, f)));
}

/** A complete, consistent copy of the database as it stands, with everything not yet folded in from the side file. */
function snapshotDb(dir) {
  const tmp = path.join(dir, `.snapshot-${process.pid}-${Date.now()}.db`);
  openDb().exec(`VACUUM INTO '${tmp.replace(/\\/g, '/').replace(/'/g, "''")}'`);
  try { return fs.readFileSync(tmp); } finally { fs.rmSync(tmp, { force: true }); }
}

const clock = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
/** "2026-10-08 17.32.05": sorts by date, and Windows allows it in a file name. */
export const stamp = (now = Date.now()) => `${sydneyDay(now)} ${clock.format(new Date(now)).replace(/:/g, '.')}`;

/** Removes the oldest files with this prefix beyond `keep`. Returns how many were removed. */
function prune(dir, prefix, keep) {
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${prefix} `) && f.endsWith('.zip')).sort();
  const old = files.slice(0, Math.max(0, files.length - keep));
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return old.length;
}

/**
 * Writes a backup now. Works while Wheelman is open: the database copy is taken as a whole, in
 * one go, so nothing half-written gets in. Returns where it went and what it holds.
 */
export function backupNow({ reason = 'by hand', dir = config.backup.dir, root = config.root, keep = config.backup.keep, prefix = PREFIX, now = Date.now() } = {}) {
  const started = Date.now();
  if (!dir) throw new Error('No backup folder is set (BACKUP_DIR)');
  fs.mkdirSync(dir, { recursive: true });
  const entries = [{ name: DB_ENTRY, data: snapshotDb(dir), mtime: new Date(now) }];
  for (const f of filesToBackUp(root)) {
    const full = path.join(root, f);
    entries.push({ name: f, data: fs.readFileSync(full), mtime: fs.statSync(full).mtime });
  }
  const files = entries.map((e) => e.name);
  entries.push({ name: MANIFEST, data: JSON.stringify({ app: 'Wheelman', version: VERSION, at: new Date(now).toISOString(), reason, files }, null, 1), mtime: new Date(now) });
  let file = path.join(dir, `${prefix} ${stamp(now)}.zip`);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${prefix} ${stamp(now)} (${n}).zip`);
  writeZip(file, entries);
  const removed = prune(dir, prefix, keep);
  const info = { at: now, file, bytes: fs.statSync(file).size, files: files.length, reason, tookMs: Date.now() - started };
  if (prefix === PREFIX) { try { setMeta('last_backup', info); } catch { /* the record is a convenience */ } }
  return { ...info, removed };
}

/** When the last backup was written, where, and how big it was; null when there has been none. */
export const lastBackup = () => getMeta('last_backup', null);

/** Writes a backup when the last one is older than a day. Returns it, or null when none was needed. */
export function backupIfStale(maxAgeMs = DAY, { now = Date.now(), ...opts } = {}) {
  const last = lastBackup();
  if (last && now - (last.at || 0) < maxAgeMs) return null;
  return backupNow({ reason: 'daily', now, ...opts });
}

/** The newest backup file in a folder, or null. */
export function newestBackup(dir = config.backup.dir) {
  try {
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${PREFIX} `) && f.endsWith('.zip')).sort();
    return files.length ? path.join(dir, files[files.length - 1]) : null;
  } catch { return null; }
}

/** What a backup file holds: when it was written, why, and which files. Refuses anything that is not one. */
export function describeBackup(file) {
  const entries = readZip(file);
  const manifest = entries.find((e) => e.name === MANIFEST);
  let m = null;
  try { m = manifest ? JSON.parse(manifest.data.toString('utf8')) : null; } catch { m = null; }
  if (!m || m.app !== 'Wheelman') throw new Error('This is not a Wheelman backup file');
  const files = entries.filter((e) => e.name !== MANIFEST);
  for (const e of files) {
    const bad = path.isAbsolute(e.name) || /^[A-Za-z]:/.test(e.name) || e.name.includes('\\') || e.name.split('/').includes('..') || e.name.split('/').includes('');
    if (bad) throw new Error(`Refused: the backup names a file outside the Wheelman folder (${e.name})`);
  }
  return { at: Date.parse(m.at) || 0, reason: m.reason || '', version: m.version || '', files: files.map((e) => e.name), entries: files };
}

/**
 * Puts a backup back into a Wheelman folder. Wheelman must be closed: the database is replaced
 * whole, and its side files from the old copy are removed with it. What is there now is kept
 * first as a "before restore" backup in the backup folder.
 */
export function restoreFrom(file, { root = config.root, dir = config.backup.dir, dbPath = null, now = Date.now() } = {}) {
  const b = describeBackup(file);
  const kept = backupNow({ reason: 'before restore', dir, root, prefix: BEFORE_RESTORE, keep: 5, now });
  closeDb();
  const target = dbPath || (root === config.root ? config.dbPath : path.join(root, DB_ENTRY));
  const written = [];
  for (const e of b.entries) {
    const dest = e.name === DB_ENTRY ? target : path.join(root, e.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (e.name === DB_ENTRY) for (const side of ['-wal', '-shm', '-journal']) fs.rmSync(dest + side, { force: true });
    fs.writeFileSync(dest, e.data);
    written.push(e.name);
  }
  return { written, kept: kept.file, from: b.at, reason: b.reason };
}
