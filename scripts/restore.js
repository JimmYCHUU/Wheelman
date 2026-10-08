// Puts a backup back into this Wheelman folder. Close Wheelman first.
//   npm run restore                     the newest backup in the backup folder
//   npm run restore -- "C:\path\Wheelman backup 2026-10-08 17.32.05.zip"
// What is here now is kept first, as a "Wheelman before restore" file in the backup folder.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from '../src/config.js';
import { describeBackup, restoreFrom, newestBackup } from '../src/backup.js';
import { formatSydney } from '../src/time.js';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const named = args.find((a) => !a.startsWith('--'));
const file = named ? path.resolve(named) : newestBackup();

if (!file || !fs.existsSync(file)) {
  console.log(named ? `There is no file at ${file}` : `No backup was found in ${config.backup.dir}`);
  console.log('Give the backup file to restore: npm run restore -- "C:\\path\\Wheelman backup ....zip", or drop the file onto "Restore Wheelman.cmd".');
  process.exit(1);
}

// Wheelman keeps the database open while it runs; a restore while it is open would be undone.
const running = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok || r.status === 503).catch(() => false);
if (running) {
  console.log('Wheelman is open. Close its black window first, then run this again.');
  process.exit(1);
}

let b;
try { b = describeBackup(file); } catch (e) { console.log(`${file}\n${e.message}`); process.exit(1); }
console.log(`Backup: ${file}`);
console.log(`Written ${formatSydney(b.at)} (${b.reason}), ${b.files.length} files${b.version ? `, Wheelman ${b.version}` : ''}.`);
console.log(`This replaces the database, the .env settings, the voice files and the private notes in\n  ${config.root}\nwith what is in the backup. What is here now is kept first, in ${config.backup.dir}, as "Wheelman before restore".`);
if (!yes) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('Type yes to continue: ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'yes') { console.log('Nothing was changed.'); process.exit(0); }
}

try {
  const r = restoreFrom(file);
  console.log(`\nRestored ${r.written.length} files. What was here before is in ${r.kept}`);
  console.log('Start Wheelman as usual: double-click "Start Wheelman.cmd".');
} catch (e) {
  console.log(`\nThe restore stopped: ${e.message}`);
  process.exit(1);
}
