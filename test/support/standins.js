// Stand-in services for the tests: the dealer dashboard, the website's live-auction
// feed and the AI on one local server, the Marketplace content engine on another. They answer in
// the same shapes as the real services, from an invented world (fixtures.js), and nothing in them
// can reach the internet. Every request is recorded so a test can assert what was asked.

import http from 'node:http';
import { lotRow, lotDetail, estimateFor } from './fixtures.js';

const json = (res, status, data, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
const readBody = (req) => new Promise((resolve) => { let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => resolve(body)); });

const DEFAULT_REPLY = { reply: 'Hi {{NAME}},\nNo worries.', needs_human: [], facts_used: [], hold: false };

/**
 * The AI stand-in's behaviour:
 *   script:   replies handed out in order (a test queues what the model "says"); each is the JSON the
 *             model would answer with, or { status, message } for an error answer
 *   behave:   a function (requestBody) => reply JSON, used when the script is empty
 *   usedUp:   model names that answer "today's allowance is used up"
 *   down:     when true, every call answers 503
 */
export function aiBehaviour({ behave = null } = {}) {
  return { script: [], behave, usedUp: new Set(), down: false, seen: [] };
}

function answerAi(ai, body, res) {
  let parsed = {};
  try { parsed = JSON.parse(body); } catch { /* not json */ }
  ai.seen.push(parsed);
  if (ai.down) return json(res, 503, { error: { message: 'The model is overloaded.' } });
  if (ai.usedUp.has(parsed.model)) {
    return json(res, 429, [{ error: { code: 429, message: 'You exceeded your current quota.\nPlease retry in 17h45m56.7s.', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '63956s' }] } }]);
  }
  const next = ai.script.length ? ai.script.shift() : ai.behave ? ai.behave(parsed) : DEFAULT_REPLY;
  if (next && next.status && next.status !== 200) return json(res, next.status, { error: { message: next.message || 'busy' } });
  return json(res, 200, { choices: [{ message: { content: JSON.stringify(next) }, finish_reason: 'stop' }] });
}

/**
 * Starts the stand-ins. `world` is fixtures.world() or any object with the same fields; a test may
 * swap parts of it between tests (they are read on every request).
 * Returns { base, engineBase, calls, engineSeen, ai, world, close }.
 */
export async function startStandins({ world, ai = aiBehaviour() } = {}) {
  const calls = [];
  const engineSeen = [];
  const row = () => lotRow(world.now);
  const detail = () => lotDetail(world.now);

  const main = await listen(async (req, res) => {
    const body = await readBody(req);
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const q = Object.fromEntries(url.searchParams);
    calls.push({ method: req.method, path: p, query: q, cookie: !!req.headers.cookie, body });

    if (p === '/chat') return answerAi(ai, body, res);

    // The dashboard. Sign-in sets the one cookie the client keeps; every read needs it.
    if (p === '/carbarnau/auth/v1/api/user/signin') return json(res, 200, { username: 'tester' }, { 'set-cookie': 'carbarn_session=stand-in; Path=/' });
    if (p === '/carbarnau/auth/v1/api/user/refreshtoken') return json(res, 200, { ok: true });
    if (p === '/carbarnau/auth/v1/api/user/validate-session') return json(res, 200, { username: 'tester' });
    // The notification feed, newest first, as many as asked for. A world can take it down.
    if (p === '/carbarnau/api/notifications') {
      if (world?.notificationsDown) return json(res, 503, { error: 'Service Unavailable' });
      const rows = [...((world && world.notifications) || [])].sort((a, b) => b.id - a.id);
      return json(res, 200, rows.slice(0, Number(q.limit) || 80));
    }
    if (p === '/core/user/api/v1/lead/paginated') {
      const list = (world.leads || {})[q.platform] || [];
      const page = Number(q.page) || 1, size = Number(q.size) || 50;
      return json(res, 200, { leadDtoList: list.slice((page - 1) * size, page * size) });
    }
    if (p === '/core/user/api/v1/lead/conversations') {
      const rows = (world.conversations || []).map((c) => c.row).sort((a, b) => String(b.latestMessageAt).localeCompare(String(a.latestMessageAt)));
      const page = Number(q.page) || 0, size = Number(q.size) || 50;
      return json(res, 200, { content: rows.slice(page * size, page * size + size), last: (page + 1) * size >= rows.length });
    }
    let m = p.match(/^\/core\/user\/api\/v1\/lead\/conversations\/(\d+)\/messages$/);
    if (m) {
      const c = (world.conversations || []).find((x) => x.row.id === Number(m[1]));
      return c ? json(res, 200, { content: c.messages, totalPages: 1 }) : json(res, 404, { error: 'Not Found' });
    }
    if (p === '/carbarnau/api/v1/vehicles') {
      const page = Number(q.page) || 0;
      return json(res, 200, { content: page === 0 ? world.vehicles || [] : [], page: { totalPages: 1 } });
    }
    if (p === '/carbarnau/api/v1/sales/auction') {
      const rows = world.orders || [];
      const page = Number(q.page) || 0, size = Number(q.size) || 50;
      return json(res, 200, { content: rows.slice(page * size, page * size + size), page: { size, number: page, totalElements: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / size)) } });
    }

    // The website's live-auction feed. The list is filtered by make and model, as the real one is.
    if (p === '/auc/api/public/auction-vehicles') {
      const make = String(q.make || '').toLowerCase(), model = String(q.model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rows = (world.lots || []).filter((l) => l[1].toLowerCase() === make && (!model || l[2].toLowerCase().replace(/[^a-z0-9]/g, '').includes(model))).map(row());
      return json(res, 200, { vehicles: Number(q.page) === 0 ? rows : [], total: rows.length });
    }
    m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)$/);
    if (m) { const lot = (world.lots || []).find((l) => l[0] === m[1]); return lot ? json(res, 200, detail()(lot)) : json(res, 404, { error: 'Not Found' }); }
    m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)\/sold-comparables$/);
    if (m && req.method === 'GET') {
      const sold = (world.sold || {})[m[1]];
      const lot = (world.lots || []).find((l) => l[0] === m[1]);
      return sold ? json(res, 200, { sampleCount: sold.length, matchLevel: 'EXACT_VARIANT', benchmarkYen: lot ? lot[9] : 0, comparables: sold.map(([grade, odometerKm, soldPriceYen]) => ({ year: lot ? lot[5] : 2015, odometerKm, grade, variant: lot ? lot[4] : '', soldPriceYen, soldPriceAud: Math.round(soldPriceYen * 0.009138) })) }) : json(res, 404, { error: 'Not Found' });
    }
    m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)\/price-estimate$/);
    if (m && req.method === 'POST') { let bid = 0; try { bid = Number(JSON.parse(body).bidYen); } catch { /* bad body */ } return json(res, 200, estimateFor(bid)); }

    return json(res, 404, { error: 'Not Found' });
  });

  // The content engine: GET only, no redirects followed by the client.
  const engine = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    engineSeen.push({ method: req.method, path: url.pathname });
    if (req.method !== 'GET') return json(res, 405, { error: 'no' });
    if (url.pathname === '/inbox/devices') { res.writeHead(302, { location: '/inbox/conversations' }); return res.end(); }
    const chats = world.chats || new Map();
    if (url.pathname === '/inbox/conversations') {
      const all = [...chats.values()].map((c) => c.row).sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at));
      const offset = Number(url.searchParams.get('offset')) || 0;
      const limit = Number(url.searchParams.get('limit')) || 50;
      return json(res, 200, { conversations: all.slice(offset, offset + limit), total: all.length, limit, offset });
    }
    const m = url.pathname.match(/^\/inbox\/conversations\/(\d+)$/);
    if (m && chats.has(Number(m[1]))) {
      const c = chats.get(Number(m[1]));
      return json(res, 200, { conversation: c.row, messages: c.messages, phone: '0491 570 199', will_send_via: 'device' });
    }
    return json(res, 404, { error: 'not found' });
  });

  const close = async () => { for (const s of [main, engine]) await new Promise((r) => { s.close(r); s.closeAllConnections?.(); }); };
  return { base: `http://127.0.0.1:${main.address().port}`, engineBase: `http://127.0.0.1:${engine.address().port}`, calls, engineSeen, ai, world, close };
}
