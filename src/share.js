// Sharing the page with the team: a Cloudflare tunnel from this computer to a web address, and the
// team password everyone types once at that address.
//
// The tunnel is cloudflared, Cloudflare's own program, run by Wheelman as a child process. It
// dials out to Cloudflare, so nothing on this computer is opened to the internet: the page still
// listens on 127.0.0.1 only, and what colleagues send reaches it through Cloudflare and the tunnel.
// Without a Cloudflare account the address is a free trycloudflare.com one that changes each time
// Wheelman starts. A named tunnel's token (CLOUDFLARE_TUNNEL_TOKEN) gives a fixed address of your
// own (SHARE_URL).
//
// A request that came through the tunnel carries Cloudflare's headers. It is let in only when
// sharing is on, a team password is set, and the browser holds the cookie the sign-in page sets.
// The cookie is a signed expiry date, signed with a key derived from the team password: nothing
// is stored, a restart keeps everyone signed in, and changing the password signs everyone out.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, spawnSync } from 'node:child_process';
import { config } from './config.js';
import { logLine } from './log.js';

export const COOKIE = 'wheelman_team';
const DAY = 86400e3;

// ---- the tunnel ----------------------------------------------------------------------------------

export const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

/** The folder Wheelman downloads cloudflared into: this user's local app data, outside the project. */
export function downloadDir() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Wheelman');
}

/** Where cloudflared is: the setting, the folder Wheelman downloads it to, Cloudflare's installer's folders, or the PATH. */
export function findCloudflared() {
  const candidates = [
    config.share.cloudflaredPath,
    path.join(downloadDir(), 'cloudflared.exe'),
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8', windowsHide: true });
    const found = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (r.status === 0 && found) return found;
  } catch { /* not on the path */ }
  return '';
}

/** cloudflared, downloaded from Cloudflare's own releases if it is not on this computer yet. */
export async function ensureCloudflared({ say = () => {} } = {}) {
  const found = findCloudflared();
  if (found) return found;
  if (process.platform !== 'win32') throw new Error('cloudflared is not installed. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/downloads/ or set CLOUDFLARED_PATH in .env.');
  const dir = downloadDir();
  const file = path.join(dir, 'cloudflared.exe');
  fs.mkdirSync(dir, { recursive: true });
  say(`Downloading cloudflared, Cloudflare's tunnel program (about 55 MB), to ${file} ...`);
  const res = await fetch(DOWNLOAD_URL, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`cloudflared could not be downloaded (${res.status}). Check the internet connection, or download it from ${DOWNLOAD_URL} to ${file} yourself.`);
  const part = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
  fs.renameSync(part, file);
  const v = spawnSync(file, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (v.status !== 0) { fs.rmSync(file, { force: true }); throw new Error('The downloaded cloudflared does not run on this computer.'); }
  say(`Downloaded ${String(v.stdout).trim()}.`);
  return file;
}

/** The command line: a named tunnel by its token (its address is set up at Cloudflare), or a free quick one to the page. */
export function tunnelArgs({ port = config.port, token = config.share.tunnelToken } = {}) {
  return token
    ? ['tunnel', '--no-autoupdate', 'run', '--token', token]
    : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];
}

/** The address a quick tunnel was given, from cloudflared's own output. */
export function tunnelUrlFrom(text) {
  const m = String(text || '').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0].toLowerCase() : '';
}

// What the page and the black window show: the address, and whether the tunnel is up.
export const share = { url: config.share.url, running: false, error: '', since: 0 };

let child = null;
let stopping = false;
let restarts = 0;
const RESTART_MS = 15000;
const MAX_RESTARTS = 40;

/**
 * Starts the tunnel and keeps it up: when cloudflared stops on its own (the connection dropped,
 * say) it is started again after a pause. onUrl is called once the address is known.
 */
export async function startTunnel({ port = config.port, onUrl = () => {}, say = () => {} } = {}) {
  const exe = await ensureCloudflared({ say });
  const run = () => {
    stopping = false;
    let buffer = '';
    let announced = false;
    child = spawn(exe, tunnelArgs({ port }), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    share.running = true;
    share.error = '';
    const onText = (chunk) => {
      const text = String(chunk);
      buffer = (buffer + text).slice(-4000);
      if (!announced) {
        if (!config.share.tunnelToken) {
          const url = tunnelUrlFrom(buffer);
          if (url) { announced = true; restarts = 0; share.url = url; share.since = Date.now(); onUrl(url); }
        } else if (/Registered tunnel connection/i.test(buffer)) {
          announced = true; restarts = 0; share.since = Date.now(); onUrl(share.url);
        }
      }
      for (const line of text.split(/\r?\n/)) if (/ ERR /.test(line)) logLine('share', line.trim().slice(0, 300));
    };
    child.stdout.on('data', onText);
    child.stderr.on('data', onText);
    child.on('error', (e) => { share.running = false; share.error = e.message; logLine('share', `The tunnel could not run: ${e.message}`); });
    child.on('exit', (code) => {
      child = null;
      share.running = false;
      if (stopping) return;
      share.error = 'The tunnel stopped. It is being started again.';
      logLine('share', `The tunnel stopped (code ${code}). Starting it again in ${RESTART_MS / 1000} seconds.`);
      if (++restarts <= MAX_RESTARTS) setTimeout(run, RESTART_MS).unref();
      else share.error = 'The tunnel keeps stopping. Close Wheelman and start it again.';
    });
  };
  run();
}

export function stopTunnel() {
  stopping = true;
  if (child) { try { child.kill(); } catch { /* already gone */ } child = null; }
  share.running = false;
}

// ---- the sign-in ---------------------------------------------------------------------------------

/** Came through Cloudflare and the tunnel (Cloudflare marks every request it forwards). */
export const viaTunnel = (req) => !!(req.headers['cf-ray'] || req.headers['cf-connecting-ip']);

const signingKey = (password) => crypto.createHmac('sha256', 'wheelman team sign-in').update(password).digest();
const sign = (password, exp) => crypto.createHmac('sha256', signingKey(password)).update(String(exp)).digest('hex');

/** The cookie's value: when the sign-in runs out, signed with the team password. */
export function signinToken(password = config.share.password, { now = Date.now(), days = config.share.days } = {}) {
  const exp = now + Math.max(1, days) * DAY;
  return `${exp}.${sign(password, exp)}`;
}

export function validToken(token, password = config.share.password, { now = Date.now() } = {}) {
  if (!password || typeof token !== 'string') return false;
  const m = token.match(/^(\d{10,16})\.([0-9a-f]{64})$/);
  if (!m || Number(m[1]) <= now) return false;
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(password, m[1])));
}

export function cookieOf(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1].trim() : '';
}

export const signedIn = (req) => validToken(cookieOf(req));

/** The Set-Cookie header after a sign-in: the browser alone keeps it, over https only, for this many days. */
export function signinCookie(token, { days = config.share.days } = {}) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${Math.round(Math.max(1, days) * 86400)}; HttpOnly; Secure; SameSite=Lax`;
}

export function checkPassword(given, password = config.share.password) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(String(password || ''));
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Wrong passwords: this many in a quarter of an hour from one address, and that address waits.
export const TRIES = 10;
export const TRIES_WINDOW_MS = 15 * 60e3;
const wrong = new Map();

export function tooManyTries(ip, { now = Date.now() } = {}) {
  const w = wrong.get(ip);
  return !!(w && now - w.since < TRIES_WINDOW_MS && w.count >= TRIES);
}

export function noteWrong(ip, { now = Date.now() } = {}) {
  const w = wrong.get(ip);
  if (!w || now - w.since >= TRIES_WINDOW_MS) wrong.set(ip, { since: now, count: 1 });
  else w.count++;
  if (wrong.size > 1000) wrong.clear();
}

export function clearWrong(ip) { wrong.delete(ip); }
