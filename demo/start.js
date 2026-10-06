// The demo: Wheelman on an invented world, against stand-in services on this computer.
//
// Run with `npm run demo` or `Start Wheelman demo.cmd`. With --check it starts, reads the page's
// data once, prints what it found and exits (that is what CI runs).
//
// Nothing here is real and nothing can reach the internet: the environment below overrides any
// .env, every address points at 127.0.0.1, and the database lives under data/demo/, which is
// wiped on every start. A guard refuses to continue if any of that is not so.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTestEnv } from '../test/support/env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Everything the demo writes goes here. The tests point it at a temporary folder.
const demoDir = process.env.WHEELMAN_DEMO_DIR ? path.resolve(process.env.WHEELMAN_DEMO_DIR) : path.join(root, 'data', 'demo');
const check = process.argv.includes('--check');
const PORT = check ? 0 : Number(process.env.DEMO_PORT) || 3211;
const DEMO_LOGIN = 'demo'; // the stand-in dashboard accepts anything; this is not a secret

// 1. The environment, before any src module is loaded. It wins over whatever is already set.
applyTestEnv({
  WHEELMAN_DEMO: '1',
  DB_PATH: path.join(demoDir, 'app.db'),
  EXAMPLES_PATH: path.join(demoDir, 'examples.json'),
  PORT: String(PORT),
  GEMINI_API_KEY: 'demo',
  OPENROUTER_API_KEY: '',
  GEMINI_MODEL: 'demo-model',
  GEMINI_FALLBACK_MODELS: '',
  MARKETPLACE_ENABLED: '1',
  MARKETPLACE_URL: 'http://127.0.0.1:1/inbox', // replaced once the stand-ins are up
  DASHBOARD_API_URL: 'http://127.0.0.1:1',
  AUCTION_API_URL: 'http://127.0.0.1:1',
  DASHBOARD_USERNAME: DEMO_LOGIN,
  DASHBOARD_PASSWORD: DEMO_LOGIN,
  SECONDS_BETWEEN_DRAFTS: '0',
  DAILY_DRAFT_LIMIT: '500',
  SYNC_MINUTES: '3',
});

// 2. A fresh demo folder: no run can inherit anything.
try {
  fs.rmSync(demoDir, { recursive: true, force: true });
} catch (e) {
  console.error(`The demo folder could not be cleared (${e.code || e.message}). Is another demo still running? Close it and try again.`);
  process.exit(2);
}
fs.mkdirSync(demoDir, { recursive: true });

const { world } = await import('../test/support/fixtures.js');
const { startStandins, aiBehaviour } = await import('../test/support/standins.js');
const { pointConfigAt } = await import('../test/support/wire.js');
const { demoReply } = await import('./ai-script.js');

// 3. The stand-ins, and the settings pointed at them.
const now = Date.now();
const standins = await startStandins({ world: world(now), ai: aiBehaviour({ behave: demoReply }) });
const { config } = await import('../src/config.js');
pointConfigAt(config, standins, { sessionPath: path.join(demoDir, '.session.json'), port: PORT });

// 4. The guard: everything local, everything under data/demo/.
const under = (p) => path.resolve(p).startsWith(demoDir + path.sep);
const local = (u) => /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/.test(String(u));
const problems = [
  config.demo ? '' : 'the demo flag is not set',
  under(config.dbPath) ? '' : `the database is not under data/demo (${config.dbPath})`,
  under(config.examplesPath) ? '' : 'the example bank is not under data/demo',
  under(config.sessionPath) ? '' : 'the session file is not under data/demo',
  local(config.dashboard.baseUrl) ? '' : 'the dashboard address is not local',
  local(config.auction.baseUrl) ? '' : 'the auction feed address is not local',
  local(config.marketplace.url) ? '' : 'the Marketplace address is not local',
  local(config.llm.gemini.url) ? '' : 'the AI address is not local',
].filter(Boolean);
if (problems.length) {
  console.error('The demo refuses to start:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  await standins.close();
  process.exit(2);
}

// 5. Fill the page through the real code: one check against the stand-ins, then the suggestions.
const { openDb } = await import('../src/db.js');
const worker = await import('../src/worker.js');
const { startServer } = await import('../src/server.js');
const { validateReport, storePhoneReport } = await import('../src/phone.js');

openDb();
console.log('Wheelman demo: invented customers and cars, stand-in services, nothing real.');
await worker.cycle();
const report = () => {
  const r = standins.world.phoneReport;
  const out = storePhoneReport(validateReport({ ...r, seenAt: Date.now() }));
  worker.notePhoneReport({ ...out, signedOut: false, found: r.found, hidden: true });
};
report();

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;

if (check) {
  const health = await (await fetch(`${base}/api/health`)).json();
  const items = await (await fetch(`${base}/api/items?section=dashboard&tab=waiting`)).json();
  const auction = await (await fetch(`${base}/api/items?section=auction&tab=waiting`)).json();
  const chats = await (await fetch(`${base}/api/items?section=marketplace&tab=waiting`)).json();
  const flagged = items.items.filter((r) => r.flag && r.flag !== 'none').length;
  const withDraft = items.items.filter((r) => r.flag === 'ok' || r.flag === 'input' || r.flag === 'fail').length;
  console.log(`health: ${health.ok ? 'ok' : 'NOT ok'} (demo: ${health.demo}) · dashboard waiting: ${items.items.length}, with a suggestion: ${withDraft}, flagged: ${flagged} · Marketplace waiting: ${chats.items.length} · auction to do: ${auction.items.length}`);
  const wrong = [
    health.ok ? '' : 'health is not ok',
    health.demo ? '' : 'health does not say demo',
    items.items.length >= 6 ? '' : `only ${items.items.length} dashboard conversations waiting`,
    withDraft >= 4 ? '' : `only ${withDraft} suggestions written`,
    chats.items.length >= 2 ? '' : `only ${chats.items.length} Marketplace chats waiting`,
    auction.items.length >= 2 ? '' : `only ${auction.items.length} auction orders to do`,
  ].filter(Boolean);
  worker.stop();
  await new Promise((r) => { server.close(r); server.closeAllConnections?.(); });
  await standins.close();
  if (wrong.length) { console.error('The demo check failed:\n' + wrong.map((w) => `  - ${w}`).join('\n')); process.exit(1); }
  console.log('The demo check passed.');
  process.exit(0);
}

// 6. Keep going: the page polls, the worker checks the stand-ins every few minutes, and the
// "phone add-on" reports every half minute so its line stays alive without a browser.
worker.start();
setInterval(() => { try { report(); } catch { /* the demo must not stop over this */ } }, 30 * 1000).unref();
console.log(`\nOpen this page in your browser:  ${base.replace('127.0.0.1', 'localhost')}`);
console.log('Everything on it is invented. Press Ctrl+C to stop.\n');

const shutdown = async () => { worker.stop(); await standins.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
