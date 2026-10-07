// Read-only client for the Carbarn dashboard.
//
// Safety: this module can only log in and READ. The list below is the complete set of
// addresses it is able to call. It has no way to send a message, change a lead,
// mark anything as read, or trigger the dashboard's own drafts.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const READ_ALLOWLIST = [
  /^\/core\/user\/api\/v1\/lead\/paginated$/,
  /^\/core\/user\/api\/v1\/lead\/conversations$/,
  /^\/core\/user\/api\/v1\/lead\/conversations\/\d+\/messages$/,
  /^\/carbarnau\/api\/v1\/vehicles$/,
  // The auction orders: who asked us to buy a car at auction, what they want, and how far it has got.
  /^\/carbarnau\/api\/v1\/sales\/auction$/,
  // The dashboard's notification feed: read to hear about a new lead sooner. Never marked as read.
  /^\/carbarnau\/api\/notifications$/,
  /^\/carbarnau\/auth\/v1\/api\/user\/validate-session$/,
];
const SIGNIN = '/carbarnau/auth/v1/api/user/signin';
const REFRESH = '/carbarnau/auth/v1/api/user/refreshtoken';

export class DashboardError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

let jar = null; // { cookieName: value }

function loadJar() {
  if (jar) return jar;
  try { jar = JSON.parse(fs.readFileSync(config.sessionPath, 'utf8')); } catch { jar = {}; }
  return jar;
}

function saveJar() {
  fs.mkdirSync(path.dirname(config.sessionPath), { recursive: true });
  fs.writeFileSync(config.sessionPath, JSON.stringify(jar), { mode: 0o600 });
}

function absorbCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  let changed = false;
  for (const line of list) {
    const first = line.split(';')[0];
    const eq = first.indexOf('=');
    if (eq < 1) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!/carbarn/i.test(name)) continue;
    if (value === '' || /max-age=0/i.test(line)) delete jar[name]; else jar[name] = value;
    changed = true;
  }
  if (changed) saveJar();
}

function headers(extra = {}) {
  loadJar();
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    accept: 'application/json, text/plain, */*',
    origin: config.dashboard.origin,
    referer: config.dashboard.origin + '/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Wheelman/0.2',
    ...(cookie ? { cookie } : {}),
    ...extra,
  };
}

async function post(pathname, body) {
  if (pathname !== SIGNIN && pathname !== REFRESH) throw new DashboardError(`Blocked: this app never posts to ${pathname}`);
  const res = await fetch(config.dashboard.baseUrl + pathname, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  loadJar();
  absorbCookies(res);
  return res;
}

export async function login() {
  const { username, password } = config.dashboard;
  if (!username || !password) throw new DashboardError('Dashboard login is not filled in. Add DASHBOARD_USERNAME and DASHBOARD_PASSWORD to the .env file.', 0);
  const res = await post(SIGNIN, { username, password });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new DashboardError(`Dashboard login failed (${res.status}). Check the username and password in .env. ${text.slice(0, 120)}`, res.status);
  }
  const user = await res.json().catch(() => ({}));
  if (!Object.keys(loadJar()).length) throw new DashboardError('Dashboard login succeeded but no session was returned.', res.status);
  return { username: user?.username || username, roles: user?.roles || [] };
}

async function refresh() {
  try { const res = await post(REFRESH); return res.ok; } catch { return false; }
}

/** GET a JSON resource. Re-authenticates once if the session has expired. */
export async function get(pathname, params = {}) {
  if (!READ_ALLOWLIST.some((re) => re.test(pathname))) throw new DashboardError(`Blocked: ${pathname} is not on the read-only list`);
  const url = new URL(config.dashboard.baseUrl + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));

  const attempt = () => fetch(url, { method: 'GET', headers: headers(), signal: AbortSignal.timeout(60000) });

  if (!Object.keys(loadJar()).length) await login();
  let res = await attempt();
  if (res.status === 401 || res.status === 403) {
    if (!(await refresh())) await login();
    res = await attempt();
  }
  absorbCookies(res);
  if (!res.ok) throw new DashboardError(`Dashboard returned ${res.status} for ${pathname}`, res.status);
  return res.json();
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** One page of leads. `platform` picks the list: the usual one, or the import and auction enquiries. */
export async function fetchLeadsPage(page, size = 50, platform = config.dashboard.platform) {
  return get('/core/user/api/v1/lead/paginated', { page, size, platform });
}

/**
 * One page of the auction orders: every customer who asked us to buy a car at auction, at every
 * stage, including orders that were cancelled or refunded (so an order that ends is seen to end).
 */
export async function fetchAuctionOrdersPage(page = 0, size = 50) {
  const j = await get('/carbarnau/api/v1/sales/auction', { page, size });
  return { rows: Array.isArray(j?.content) ? j.content : [], totalPages: Number(j?.page?.totalPages ?? j?.totalPages) || 1 };
}

export async function fetchConversationsPage(page, size = 50) {
  return get('/core/user/api/v1/lead/conversations', { page, size, channel: config.dashboard.channel });
}

export async function fetchAllMessages(conversationId) {
  const out = [];
  let page = 0, totalPages = 1;
  while (page < totalPages && page < 50) {
    const j = await get(`/core/user/api/v1/lead/conversations/${conversationId}/messages`, { page, size: 200 });
    totalPages = j.totalPages ?? 1;
    out.push(...(j.content || []));
    page++;
    if (page < totalPages) await pause(150);
  }
  return out;
}

export async function fetchAllVehicles() {
  const out = [];
  let page = 0, totalPages = 1;
  while (page < totalPages && page < 20) {
    const j = await get('/carbarnau/api/v1/vehicles', { page, size: 500 });
    totalPages = j.page?.totalPages ?? 1;
    out.push(...(j.content || []));
    page++;
    if (page < totalPages) await pause(300);
  }
  return out;
}

/** The newest entries of the dashboard's notification feed, as the dashboard's own bell shows them. */
export async function fetchNotifications(limit = 80) {
  const j = await get('/carbarnau/api/notifications', { limit });
  return Array.isArray(j) ? j : Array.isArray(j?.content) ? j.content : [];
}

export async function whoAmI() {
  return get('/carbarnau/auth/v1/api/user/validate-session');
}
