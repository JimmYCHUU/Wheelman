// Writes a backup now. Works while Wheelman is open. Run with: npm run backup
// The same thing happens by itself when Wheelman closes, and once a day while it is open.

import { config } from '../src/config.js';
import { backupNow } from '../src/backup.js';
import { closeDb } from '../src/db.js';

try {
  const b = backupNow({ reason: 'by hand' });
  console.log(`Backed up to: ${b.file}`);
  console.log(`${b.files} files, ${(b.bytes / 1024 / 1024).toFixed(1)} MB, ${(b.tookMs / 1000).toFixed(1)} seconds. The folder keeps the newest ${config.backup.keep}.`);
  console.log('The file holds the dashboard password and the AI keys from .env: keep it where only you can open it.');
  console.log('To use Wheelman on another computer, copy this file there and double-click "Restore Wheelman.cmd".');
} catch (e) {
  console.log(`The backup could not be written: ${e.message}`);
  process.exitCode = 1;
}
closeDb();
