// Runs the whole app on invented data, for looking at the page in a browser:
//
//   node test/support/preview.js      then open http://127.0.0.1:3211/new/
//
// The dashboard, the website and the model are stand-ins on this computer, so nothing real is read
// and nothing is sent. Run with plain `node`, so .env is never read. Stop it with Ctrl+C.
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './env.js';
import { startStandins, aiBehaviour } from './standins.js';
import { world } from './fixtures.js';
import { pointConfigAt } from './wire.js';

const PORT = 3211;
applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

// The stand-in model answers every draft with a plain reply that leaves one price blank.
const ai = aiBehaviour({
  behave: () => ({ reply: 'Thanks for your message. The price is [PRICE?], and we can book you in to see it.', needs_human: [{ marker: '[PRICE?]', reason: 'A person decides the price.' }], facts_used: [], hold: false }),
});
const standins = await startStandins({ world: world(Date.now()), ai });
const { config } = await import('../../src/config.js');
pointConfigAt(config, standins, { port: PORT, sessionPath: path.join(os.tmpdir(), `wheelman-preview-session-${process.pid}.json`) });

const worker = await import('../../src/worker.js');
const app = await (await import('../../src/server.js')).startServer();
await worker.runSync();
await worker.draftWaiting();

let closing = false;
process.on('SIGINT', async () => {
  if (closing) return;
  closing = true;
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  process.exit(0);
});
console.log(`Preview: http://127.0.0.1:${PORT}/new/ (invented data)`);
