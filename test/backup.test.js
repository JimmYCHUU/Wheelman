// Backups: one dated zip file of everything that lives only on this computer, written by hand,
// when Wheelman closes and once a day, and put back by a restore. All data is invented: the
// database is the in-memory one every test uses, and the folders are scratch folders.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { applyTestEnv } from './support/env.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-backup-test-'));
const dir = path.join(scratch, 'backups');
const root = path.join(scratch, 'Wheelman');
applyTestEnv({ BACKUPS: '1', BACKUP_DIR: dir });

const write = (base, rel, text) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const ENV_TEXT = 'DASHBOARD_USERNAME=tester\nGEMINI_API_KEY=test-key\n';
let config, db, backup, zip, worker;
const names = (file) => zip.readZip(file).map((e) => e.name);
const markIn = (dbFile) => { const d = new DatabaseSync(dbFile, { readOnly: true }); try { return JSON.parse(d.prepare("SELECT value FROM meta WHERE key = 'invented_mark'").get().value); } finally { d.close(); } };

before(async () => {
  ({ config } = await import('../src/config.js'));
  db = await import('../src/db.js');
  backup = await import('../src/backup.js');
  zip = await import('../src/zip.js');
  worker = await import('../src/worker.js');
  db.openDb();
  db.setMeta('invented_mark', 'travels in the copy');
  // An invented Wheelman folder: what must travel, and what can be fetched again.
  write(root, '.env', ENV_TEXT);
  write(root, 'voice/people.json', '{"voices":[{"name":"Sam"}]}');
  write(root, 'voice/house-voice.md', '# Voice\nPlain and polite.');
  write(root, 'knowledge/business-facts.md', 'Holding deposit: $1,000');
  write(root, 'knowledge/website/warranty.md', 'fetched again with fetch-website');
  write(root, 'data/media/photo.jpg', 'fetched again from the dashboard');
  write(root, 'data/wheelman.log', 'not a record');
});

after(() => { db.closeDb(); fs.rmSync(scratch, { recursive: true, force: true }); });

test('a zip file written here reads back the same, another program can open it, and a damaged one is refused', () => {
  const file = path.join(scratch, 'round-trip.zip');
  const big = Buffer.alloc(200000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 7919 + (i >> 3)) & 0xff;
  const entries = [
    { name: 'a/plain.txt', data: 'hello' },
    { name: 'empty.txt', data: '' },
    { name: 'bytes.bin', data: big },
    { name: 'nämé ✓.md', data: 'unicode', mtime: new Date(2026, 9, 8, 17, 32, 5) },
  ];
  zip.writeZip(file, entries);
  const back = zip.readZip(file);
  assert.deepEqual(back.map((e) => e.name), entries.map((e) => e.name));
  assert.equal(back[0].data.toString(), 'hello');
  assert.equal(back[1].data.length, 0);
  assert.ok(back[2].data.equals(big));
  assert.equal(back[3].data.toString(), 'unicode');
  assert.ok(!fs.existsSync(`${file}.part`), 'the temporary name is gone');
  // Another program's view of the same file, when one is on this computer.
  try { execFileSync('unzip', ['-t', file], { stdio: 'pipe' }); } catch (e) { if (e.code !== 'ENOENT') throw e; }

  const bytes = fs.readFileSync(file);
  bytes[Math.floor(bytes.length / 2)] ^= 0xff; // inside the big entry
  const broken = path.join(scratch, 'broken.zip');
  fs.writeFileSync(broken, bytes);
  assert.throws(() => zip.readZip(broken), /damaged/);
  assert.throws(() => zip.readZip(path.join(root, '.env')), /Not a zip/);
});

test('a backup is one dated file: the database copy, the settings, the staff names and the voice files, and nothing that can be fetched again', () => {
  const now = Date.UTC(2026, 9, 8, 6, 32, 5); // 5:32:05 pm in Sydney
  const b = backup.backupNow({ root, reason: 'by hand', now });
  assert.equal(path.basename(b.file), 'Wheelman backup 2026-10-08 17.32.05.zip');
  assert.equal(path.dirname(b.file), dir);
  const list = names(b.file);
  assert.deepEqual(list, ['data/app.db', '.env', 'knowledge/business-facts.md', 'voice/house-voice.md', 'voice/people.json', 'backup.json']);
  for (const left of ['knowledge/website/warranty.md', 'data/media/photo.jpg', 'data/wheelman.log']) assert.ok(!list.includes(left), `${left} is fetched again, not backed up`);

  const entries = zip.readZip(b.file);
  const dbCopy = entries.find((e) => e.name === 'data/app.db').data;
  assert.equal(dbCopy.subarray(0, 15).toString(), 'SQLite format 3', 'a whole database file');
  const copyFile = path.join(scratch, 'copy.db');
  fs.writeFileSync(copyFile, dbCopy);
  assert.equal(markIn(copyFile), 'travels in the copy');
  assert.equal(entries.find((e) => e.name === '.env').data.toString(), ENV_TEXT);
  const m = JSON.parse(entries.find((e) => e.name === 'backup.json').data.toString());
  assert.deepEqual([m.app, m.reason, m.files], ['Wheelman', 'by hand', list.slice(0, -1)]);

  assert.deepEqual([b.files, b.reason, b.removed], [5, 'by hand', 0]);
  assert.equal(fs.statSync(b.file).size, b.bytes);
  const last = backup.lastBackup();
  assert.deepEqual([last.at, last.file, last.reason, last.bytes], [now, b.file, 'by hand', b.bytes]);
  assert.deepEqual(worker.statusReport().backup, { on: true, dir, last }, 'the page is told');
  assert.ok(!fs.readdirSync(dir).some((f) => f.startsWith('.snapshot')), 'the temporary database copy is gone');
  const d = backup.describeBackup(b.file);
  assert.deepEqual([d.at, d.reason, d.files], [now, 'by hand', list.slice(0, -1)]);
});

test('once a day while open: nothing within a day of the last one, a new one after', () => {
  const last = backup.lastBackup();
  assert.equal(backup.backupIfStale(undefined, { now: last.at + 23 * 3600e3, root }), null);
  const b = backup.backupIfStale(undefined, { now: last.at + 25 * 3600e3, root });
  assert.equal(b.reason, 'daily');
  assert.equal(backup.lastBackup().at, last.at + 25 * 3600e3);
});

test('the newest twenty are kept, the oldest go, and two in the same second get their own names', () => {
  const base = Date.UTC(2026, 9, 9, 0, 0, 0); // 11:00 am Sydney, the next day
  for (let i = 0; i < 22; i++) backup.backupNow({ root, now: base + i * 60e3 });
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('Wheelman backup ')).sort();
  assert.equal(files.length, config.backup.keep);
  assert.equal(config.backup.keep, 20);
  assert.ok(files.every((f) => f >= 'Wheelman backup 2026-10-09'), 'the one from the day before is gone');
  const twin = backup.backupNow({ root, now: base + 21 * 60e3 });
  assert.equal(path.basename(twin.file), 'Wheelman backup 2026-10-09 11.21.00 (2).zip');
  assert.equal(path.basename(backup.newestBackup(dir)), 'Wheelman backup 2026-10-09 18.32.05.zip', 'the daily one is still the newest by time');
  assert.equal(backup.newestBackup(path.join(scratch, 'nowhere')), null);
});

test('a restore puts a backup into another Wheelman folder, keeps what was there first, and refuses what is not a backup', () => {
  const file = backup.newestBackup(dir);
  const home = path.join(scratch, 'Home');
  write(home, '.env', 'OLD=1\n');
  write(home, 'data/app.db', 'old database');
  write(home, 'data/app.db-wal', 'old side file');

  const r = backup.restoreFrom(file, { root: home, dir });
  assert.deepEqual(r.written, ['data/app.db', '.env', 'knowledge/business-facts.md', 'voice/house-voice.md', 'voice/people.json']);
  assert.equal(fs.readFileSync(path.join(home, '.env'), 'utf8'), ENV_TEXT);
  assert.equal(fs.readFileSync(path.join(home, 'voice/people.json'), 'utf8'), '{"voices":[{"name":"Sam"}]}');
  assert.ok(!fs.existsSync(path.join(home, 'data/app.db-wal')), 'the old side file went with the old database');
  assert.equal(markIn(path.join(home, 'data/app.db')), 'travels in the copy');
  assert.ok(path.basename(r.kept).startsWith('Wheelman before restore '), 'what was there is kept first');
  assert.equal(zip.readZip(r.kept).find((e) => e.name === '.env').data.toString(), 'OLD=1\n');

  const stranger = path.join(scratch, 'stranger.zip');
  zip.writeZip(stranger, [{ name: 'x.txt', data: 'x' }]);
  assert.throws(() => backup.restoreFrom(stranger, { root: home, dir }), /not a Wheelman backup/);
  const evil = path.join(scratch, 'evil.zip');
  zip.writeZip(evil, [{ name: '../outside.txt', data: 'x' }, { name: 'backup.json', data: JSON.stringify({ app: 'Wheelman', at: new Date().toISOString() }) }]);
  assert.throws(() => backup.restoreFrom(evil, { root: home, dir }), /outside the Wheelman folder/);
  assert.ok(!fs.existsSync(path.join(scratch, 'outside.txt')), 'nothing was written');
  db.openDb(); // the restore closed the database
});
