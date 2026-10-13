// Sharing with the team: a request that came through the Cloudflare tunnel is let in only when
// sharing is on, a team password is set, and the browser holds the cookie the sign-in sets. The
// tunnel itself is never started here; the address, the password and every other value are invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';

const TEAM_WORD = 'invented-team-word-9';
const HOST = 'team-invented.trycloudflare.com';
applyTestEnv({ SHARE: '1', TEAM_PASSWORD: TEAM_WORD });

let app, base, config, share;

before(async () => {
  ({ config } = await import('../src/config.js'));
  config.port = 0;
  share = await import('../src/share.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); });

// A request as cloudflared hands it on: the shared address as the host, Cloudflare's own headers,
// and whatever else the test wants. tunnel: false is this computer's own browser.
function raw(method, path, { body = null, type = 'application/json', headers = {}, tunnel = true, ip = '203.0.113.5' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    const h = { ...(tunnel ? { host: HOST, 'cf-ray': '8a1b2c3d4e5f-SYD', 'cf-connecting-ip': ip, 'x-forwarded-proto': 'https' } : {}), ...headers };
    if (data) { h['content-type'] = type; h['content-length'] = Buffer.byteLength(data); }
    const req = http.request(`${base}${path}`, { method, headers: h }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* html or nothing */ } resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}
const signin = (password, opts = {}) => raw('POST', '/signin', { body: new URLSearchParams({ password }).toString(), type: 'application/x-www-form-urlencoded', ...opts });
const cookieFrom = (res) => String(res.headers['set-cookie']?.[0] || '').split(';')[0];

test('the tunnel: the address is read from cloudflared\'s output, and the command line fits the kind of tunnel', () => {
  assert.equal(share.tunnelUrlFrom('2026-10-09T05:00:00Z INF |  https://quiet-river-invented.trycloudflare.com  |'), 'https://quiet-river-invented.trycloudflare.com');
  assert.equal(share.tunnelUrlFrom('INF Requesting new quick Tunnel on trycloudflare.com...'), '', 'no address yet');
  assert.equal(share.tunnelUrlFrom(''), '');
  assert.deepEqual(share.tunnelArgs({ port: 3210, token: '' }), ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3210'], 'a free quick tunnel to the page');
  assert.deepEqual(share.tunnelArgs({ port: 3210, token: 'invented-token' }), ['tunnel', '--no-autoupdate', 'run', '--token', 'invented-token'], 'a named tunnel runs by its token; its address is set up at Cloudflare');
});

test('the sign-in cookie is signed with the team password, runs out, and a changed password signs everyone out', () => {
  const now = Date.UTC(2026, 9, 9, 3, 0, 0);
  const token = share.signinToken(TEAM_WORD, { now, days: 30 });
  assert.match(token, /^\d+\.[0-9a-f]{64}$/);
  assert.equal(share.signinToken(TEAM_WORD, { now, days: 30 }), token, 'the same password and time give the same cookie: a restart keeps everyone signed in');
  assert.ok(share.validToken(token, TEAM_WORD, { now }));
  assert.ok(share.validToken(token, TEAM_WORD, { now: now + 29 * 86400e3 }), 'still good on day 29');
  assert.ok(!share.validToken(token, TEAM_WORD, { now: now + 31 * 86400e3 }), 'run out on day 31');
  assert.ok(!share.validToken(token, 'another-invented-word', { now }), 'a changed password signs everyone out');
  assert.ok(!share.validToken(token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), TEAM_WORD, { now }), 'a tampered cookie');
  assert.ok(!share.validToken(`${now + 9e9}.${'0'.repeat(64)}`, TEAM_WORD, { now }), 'an invented cookie');
  assert.ok(!share.validToken(token, '', { now }), 'no password: nothing is valid');
  assert.ok(!share.validToken('', TEAM_WORD, { now }));
  assert.match(share.signinCookie(token, { days: 30 }), /^wheelman_team=\d+\.[0-9a-f]{64}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
  assert.ok(share.checkPassword(TEAM_WORD, TEAM_WORD));
  assert.ok(!share.checkPassword('invented-team-word-8', TEAM_WORD));
  assert.ok(!share.checkPassword('', ''), 'an empty password never matches');
  assert.ok(share.viaTunnel({ headers: { 'cf-ray': 'x' } }));
  assert.ok(!share.viaTunnel({ headers: { host: 'localhost:3210' } }));
});

test('through the tunnel, the page asks for the team password first', async () => {
  const page = await raw('GET', '/');
  assert.equal(page.status, 303);
  assert.equal(page.headers.location, '/signin');
  assert.equal((await raw('GET', '/api/status')).status, 401, 'the data says sign in first');
  assert.equal((await raw('POST', '/api/drafts/1/rating', { body: { rating: 'good' }, headers: { origin: `https://${HOST}` } })).status, 401);
  assert.equal((await raw('GET', '/css/tokens.css')).status, 200, 'the sign-in page\'s own styles are open');
  assert.equal((await raw('GET', '/assets/brand.svg')).status, 200, 'and its mark');
  assert.equal((await raw('GET', '/app.js')).status, 303, 'the page\'s code is not');
  const form = await raw('GET', '/signin');
  assert.equal(form.status, 200);
  assert.match(form.headers['content-type'], /text\/html/);
  assert.match(form.text, /name="password"/);
  assert.match(form.text, /Team password/);
  assert.doesNotMatch(form.text, /\{\{message\}\}/, 'the message slot is filled, with nothing');
  assert.match(form.headers['content-security-policy'], /default-src 'self'/);
});

test('the right password opens the page for a month; a wrong one does not', async () => {
  const wrong = await signin('invented-team-word-8');
  assert.equal(wrong.status, 403);
  assert.equal(wrong.headers['set-cookie'], undefined);
  assert.match(wrong.text, /not the team password/);
  const right = await signin(TEAM_WORD);
  assert.equal(right.status, 303);
  assert.equal(right.headers.location, '/');
  const setCookie = right.headers['set-cookie'][0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=2592000/);
  const cookie = cookieFrom(right);
  assert.ok(share.validToken(cookie.split('=')[1]));

  const status = await raw('GET', '/api/status', { headers: { cookie } });
  assert.equal(status.status, 200);
  assert.equal(status.json.share.on, true);
  assert.equal(status.json.share.url, '', 'no tunnel runs in a test');
  assert.equal((await raw('GET', '/', { headers: { cookie } })).status, 200, 'the page itself');
  const again = await raw('GET', '/signin', { headers: { cookie } });
  assert.equal(again.status, 303, 'signed in already: straight to the page');
  assert.equal(again.headers.location, '/');

  // A POST from the shared page itself gets through (404: no such suggestion, so the route answered);
  // one from any other web page, or without the cookie, or not JSON, does not.
  const post = (opts) => raw('POST', '/api/drafts/999999/rating', { body: { rating: 'good' }, headers: { cookie, origin: `https://${HOST}` }, ...opts });
  assert.equal((await post()).status, 404);
  assert.equal((await post({ headers: { cookie, origin: 'https://evil.example' } })).status, 403, 'another web page');
  assert.equal((await post({ headers: { cookie, origin: `http://${HOST}` } })).status, 403, 'not over https');
  assert.equal((await post({ headers: { cookie } })).status, 403, 'no origin at all');
  assert.equal((await post({ headers: { origin: `https://${HOST}` } })).status, 401, 'no cookie');
  assert.equal((await post({ type: 'text/plain' })).status, 403, 'not JSON');
  assert.equal((await raw('GET', '/api/status', { headers: { cookie: 'wheelman_team=made-up' } })).status, 401, 'an invented cookie');
  assert.equal((await raw('GET', '/api/status', { headers: { cookie: `wheelman_team=${share.signinToken('another-invented-word')}` } })).status, 401, 'a cookie signed with another password');
});

test('ten wrong passwords in a row from one address, and that address waits', async () => {
  const ip = '203.0.113.77';
  for (let i = 0; i < share.TRIES; i++) assert.equal((await signin('invented-team-word-8', { ip })).status, 403);
  const locked = await signin(TEAM_WORD, { ip });
  assert.equal(locked.status, 429, 'even the right password waits now');
  assert.match(locked.text, /Too many tries/);
  assert.equal(locked.headers['set-cookie'], undefined);
  assert.equal((await signin(TEAM_WORD, { ip: '203.0.113.78' })).status, 303, 'another address is not held up');
  share.clearWrong(ip);
  assert.equal((await signin(TEAM_WORD, { ip })).status, 303, 'after the wait');
});

test('sharing switched off, or no team password: the tunnel is refused, cookie or not', async () => {
  const cookie = cookieFrom(await signin(TEAM_WORD));
  const was = { on: config.share.on, password: config.share.password };
  try {
    config.share.on = false;
    const off = await raw('GET', '/', { headers: { cookie } });
    assert.equal(off.status, 403);
    assert.match(off.json.error, /switched off/);
    assert.equal((await raw('GET', '/signin')).status, 403, 'not even the sign-in page');
    assert.equal((await raw('GET', '/css/tokens.css')).status, 403);
    config.share.on = true;
    config.share.password = '';
    assert.equal((await raw('GET', '/', { headers: { cookie } })).status, 403, 'no password set: nothing is shared');
    assert.equal((await signin(TEAM_WORD)).status, 403);
  } finally {
    config.share.on = was.on;
    config.share.password = was.password;
  }
  assert.equal((await raw('GET', '/', { headers: { cookie } })).status, 200, 'back on: the cookie still holds');
});

test('this computer\'s own browser needs no password, as before', async () => {
  const status = await raw('GET', '/api/status', { tunnel: false });
  assert.equal(status.status, 200);
  assert.equal(status.json.share.on, true);
  assert.equal((await raw('GET', '/', { tunnel: false })).status, 200);
  assert.equal((await raw('GET', '/signin', { tunnel: false })).status, 404, 'the sign-in page is only at the shared address');
  assert.equal((await raw('GET', '/', { tunnel: false, headers: { host: 'evil.example' } })).status, 403, 'any other host is still refused');
});
