// Starts the local page and the background loop. Run with: npm start

import fs from 'node:fs';
import path from 'node:path';
import { config, missingSettings } from './config.js';
import { logLine, logFile } from './log.js';
import { openDb, countRows } from './db.js';
import { startServer } from './server.js';
import * as worker from './worker.js';
import { providers } from './llm.js';
import { businessFactsForPrompt } from './knowledge.js';

openDb();

console.log('\nWheelman, the Carbarn reply assistant');
console.log('------------------------------------');
console.log(`Stored locally: ${countRows('leads')} leads, ${countRows('conversations')} conversations, ${countRows('vehicles')} vehicles`);

if (!fs.existsSync(path.join(config.voiceDir, 'examples.json'))) {
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

const shutdown = () => { worker.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
