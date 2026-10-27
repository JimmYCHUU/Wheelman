// The new page at /new/: served by the same static handler, behind the same headers and the same
// team sign-in as the old page, which stays as it was. All data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';

const TEAM_WORD = 'invented-team-word-9';
applyTestEnv({ SHARE: '1', TEAM_PASSWORD: TEAM_WORD });

let app, base, config, checkCssBudget;

before(async () => {
  ({ config } = await import('../src/config.js'));
  config.port = 0;
  ({ checkCssBudget } = await import('../scripts/check-css-budget.js'));
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); });

test('the new page is served at /new/', async () => {
  const page = await fetch(`${base}/new/`);
  const old = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.ok((await page.text()).includes('<title>Wheelman</title>'));
  assert.equal(page.headers.get('content-security-policy'), old.headers.get('content-security-policy'));
});

test('/new redirects to /new/', async () => {
  const res = await fetch(`${base}/new`, { redirect: 'manual' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/new/');
});

test('files under /new/ are served and nothing outside web/ is', async () => {
  const js = await fetch(`${base}/new/js/main.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
  assert.equal((await fetch(`${base}/new/vendor/htm-preact.umd.js`)).status, 200);
  assert.equal((await fetch(`${base}/new/..%2f..%2fpackage.json`)).status, 404);
});

test('the old page is unchanged', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), fs.readFileSync(path.join(config.webDir, 'index.html')));
});

test('the team sign-in covers /new/', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request(`${base}/new/`, { headers: { host: 'team-invented.trycloudflare.com', 'cf-ray': '8a1b2c3d4e5f-SYD', 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-proto': 'https' } }, (res) => { res.resume(); res.on('end', () => resolve({ code: res.statusCode, location: res.headers.location })); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status.code, 303);
  assert.equal(status.location, '/signin');
});

test('the CSS check covers the new page', () => {
  const { offenders, over } = checkCssBudget(path.join(config.root, 'web', 'new', 'css'));
  assert.deepEqual(offenders, []);
  assert.deepEqual(over, []);
});
