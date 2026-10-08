// Starts the local page and the background loop. Run with: npm start

import fs from 'node:fs';
import path from 'node:path';
import { config, missingSettings } from './config.js';
import { logLine, logFile } from './log.js';
import { openDb, closeDb, countRows } from './db.js';
import { startServer } from './server.js';
import * as worker from './worker.js';
import { providers } from './llm.js';
import { businessFactsForPrompt } from './knowledge.js';
import { backupNow, lastBackup } from './backup.js';
import { formatSydney } from './time.js';

openDb();

console.log('\nWheelman, the Carbarn reply assistant');
console.log('------------------------------------');
console.log(`Stored locally: ${countRows('leads')} leads, ${countRows('conversations')} conversations, ${countRows('vehicles')} vehicles`);
const last = lastBackup();
console.log(config.backup.on
  ? `Backups: written to ${config.backup.dir} when this window closes, and once a day. ${last ? `Last one: ${formatSydney(last.at)}.` : 'None yet.'}`
  : 'Backups: switched off (BACKUPS=0 in .env). "Back up Wheelman.cmd" still writes one.');

if (!fs.existsSync(config.examplesPath)) {
  console.log('\nNote: the example bank has not been built yet. Run "npm run build-voice" once.');
}

const missing = missingSettings();
if (missing.length) {
  console.log('\nStill to fill in (in the .env file):');
  for (const m of missing) console.log(`  - ${m}`);
  if (!providers().length) console.log('The page will open, but no suggestions can be written until an AI key is filled in.');
  else if (missing.some((m) => /dashboard/.test(m))) console.log('New messages will not be fetched until the dashboard login is filled in.\nSuggestions are still written for the conversations already stored on this computer.');
}
const openFacts = businessFactsForPrompt().unanswered;
if (openFacts.length) console.log(`\nBusiness facts still without an answer (knowledge/business-facts.md): ${openFacts.join(', ')}`);
if (providers().length) console.log(`AI models, tried in order: ${providers().map((p) => p.model).join(', ')}`);

try {
  await startServer();
  console.log(`\nOpen this page in your browser:  http://localhost:${config.port}`);
  console.log(`Checking the dashboard${config.marketplace.enabled ? ' and the Marketplace inbox' : ''} every ${config.syncMinutes} minute(s). Nothing is ever sent to customers.`);
  console.log(`Anything that goes wrong is noted in ${logFile()}`);
  console.log('Press Ctrl+C to stop.\n');
  logLine('start', `Wheelman started. AI models, in order: ${providers().map((p) => p.model).join(', ') || 'none'}`);
  worker.start();
} catch (e) {
  if (e.code === 'EADDRINUSE') console.error(`\nPort ${config.port} is already in use. The agent may already be running, or change PORT in the .env file.`);
  else { console.error('\nCould not start:', e.message); logLine('start', `Could not start: ${e.message}`); }
  process.exit(1);
}

// A fault nobody caught is written down before the window closes.
process.on('uncaughtException', (e) => { logLine('fault', `${e.message} | ${String(e.stack || '').split('\n').slice(1, 5).join(' ')}`); console.error(e); process.exit(1); });
process.on('unhandledRejection', (e) => { logLine('fault', `${e?.message || e} | ${String(e?.stack || '').split('\n').slice(1, 5).join(' ')}`); console.error(e); });

// Closing: Ctrl+C, the window's X, or Windows shutting down. Windows gives a closing program a
// few seconds, so the backup is written in one go, before anything else, and then the database
// is closed cleanly (its side file is folded in).
let closing = false;
function shutdown(how) {
  if (closing) return;
  closing = true;
  worker.stop();
  if (config.backup.on) {
    process.stdout.write('Backing up ... ');
    try {
      const b = backupNow({ reason: how });
      console.log(`done: ${b.file}`);
      logLine('backup', `Backed up on closing (${how}) to ${b.file}: ${Math.round(b.bytes / 1024)} KB in ${b.tookMs} ms`);
    } catch (e) {
      console.log(`it could not be written: ${e.message}`);
      logLine('backup', `The backup on closing failed: ${e.message}`);
    }
  }
  try { closeDb(); } catch { /* closing anyway */ }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('Ctrl+C'));
process.on('SIGBREAK', () => shutdown('Ctrl+Break'));
process.on('SIGTERM', () => shutdown('stopped'));
process.on('SIGHUP', () => shutdown('window closed'));
