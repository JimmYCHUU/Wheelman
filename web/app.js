// Wheelman page. A messaging-app layout: conversations on the left, one open chat,
// and the suggested reply waiting in the message box.
// Two separate sections share the layout: Dashboard (leads and texts) and Marketplace (Facebook chats).
// Customer text is always inserted as text, never as HTML.

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Like append, but skips empty values and accepts lists. The browser's own append would print 'null'. */
function put(parent, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    parent.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return parent;
}

// ---- icons: one drawn set, 24px grid, 1.75 stroke ------------------------------

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  refresh: [['path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }], ['path', { d: 'M21 3v6h-6' }]],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm21 21-4.3-4.3' }]],
  copy: [['rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  alert: [['path', { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],
  info: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  pencil: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z' }]],
  back: [['path', { d: 'M19 12H5' }], ['path', { d: 'm12 19-7-7 7-7' }]],
  image: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['circle', { cx: 8.5, cy: 8.5, r: 1.5 }], ['path', { d: 'm21 15-5-5L5 21' }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  external: [['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }], ['path', { d: 'M15 3h6v6' }], ['path', { d: 'M10 14 21 3' }]],
  chat: [['path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z' }]],
  phone: [['rect', { x: 6, y: 2, width: 12, height: 20, rx: 2.5 }], ['path', { d: 'M11 18h2' }]],
  stop: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'm4.93 4.93 14.14 14.14' }]],
  down: [['path', { d: 'm6 9 6 6 6-6' }]],
};

/** The Wheelman mark: a white steering wheel on a Carbarn-blue disc, like Carbarn's own round icon. */
function wheelMark() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  const el = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); };
  el('circle', { cx: 24, cy: 24, r: 24, fill: '#0073ea' });
  el('circle', { cx: 24, cy: 24, r: 13.5, fill: 'none', stroke: '#fff', 'stroke-width': 4.5 });
  el('path', { d: 'M11.2 21.2h25.6M24 27.5V37', fill: 'none', stroke: '#fff', 'stroke-width': 4.5, 'stroke-linecap': 'round' });
  el('circle', { cx: 24, cy: 24.6, r: 4.6, fill: '#fff' });
  return svg;
}

function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[name] || []) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
  }
  return svg;
}

// ---- state -------------------------------------------------------------------

const state = {
  section: 'dashboard',  // 'dashboard' or 'marketplace'
  sections: { dashboard: 0, marketplace: null }, // waiting in each; null means the section is switched off
  unread: { dashboard: 0, marketplace: null },   // waiting conversations with messages not looked at yet
  listSeq: 0,            // guards against a slow list response landing in the wrong section
  tab: 'waiting',
  hours: 72,
  q: '',
  list: [],
  counts: { waiting: 0, quiet: 0, other: 0 },
  selected: null,
  detail: null,
  edits: new Map(),      // draft id -> what the user has typed
  busy: new Set(),       // conversation keys with a request in flight
  rewriteOpen: false,
  betterOpen: false,
  infoOpen: false,
  copied: null,          // draft id that was just copied
  status: null,
  threadSig: '',
  composerSig: '',
  stuck: true,           // the thread follows its newest message until the user scrolls up
};

const narrow = () => window.matchMedia('(max-width: 860px)').matches;
const inMarketplace = () => state.section === 'marketplace';

// ---- small helpers -----------------------------------------------------------

async function api(path, post) {
  const res = await fetch(path, post ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(post.body || {}) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer = null;
function toast(message, action = null) {
  const t = $('#toast');
  t.replaceChildren(message);
  // An optional action, such as Undo. The toast then stays longer and can be clicked.
  if (action) t.append(h('button', { class: 'toast-btn', type: 'button', onclick: () => { clearTimeout(toastTimer); t.classList.remove('is-on', 'has-action'); action.run(); } }, action.label));
  t.classList.toggle('has-action', !!action);
  // Centre it over the open chat, just under the car strip, so it never covers the message box.
  const chat = $('#chat').getBoundingClientRect();
  const under = $('#chat .car-line:not([hidden])') || $('#chat .chat-head');
  const top = under ? under.getBoundingClientRect().bottom + 10 : 16;
  const visible = chat.width > 0;
  t.style.left = `${visible ? chat.left + chat.width / 2 : window.innerWidth / 2}px`;
  t.style.top = `${visible ? top : 16}px`;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  // A longer message, such as a lesson Wheelman has just learned, stays long enough to be read.
  const reading = Math.min(14000, Math.max(2600, String(message).length * 65));
  toastTimer = setTimeout(() => t.classList.remove('is-on', 'has-action'), action ? 9000 : reading);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = h('textarea', { class: 'visually-hidden' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } finally { ta.remove(); }
  return ok;
}

const TZ = 'Australia/Sydney';
const fmtTime = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDay = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'short' });
const fmtWeekday = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long' });
const fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

const clock = (ms) => (ms ? fmtTime.format(new Date(ms)).replace(' ', ' ') : '');
const dayKey = (ms) => fmtKey.format(new Date(ms));
function daysAgo(ms) {
  const a = Date.parse(dayKey(Date.now()) + 'T00:00:00Z');
  const b = Date.parse(dayKey(ms) + 'T00:00:00Z');
  return Math.round((a - b) / 86400000);
}
function dayLabel(ms) {
  const d = daysAgo(ms);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return fmtDay.format(new Date(ms));
}
function listTime(ms) {
  if (!ms) return '';
  const d = daysAgo(ms);
  if (d === 0) return clock(ms);
  if (d === 1) return 'Yesterday';
  if (d < 7) return fmtWeekday.format(new Date(ms));
  return fmtShort.format(new Date(ms));
}
function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

const money = (n) => (n === null || n === undefined || n === '' ? '' : '$' + Number(n).toLocaleString('en-AU'));
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function avatar(name, extra = '') {
  const clean = String(name || '').trim();
  if (!clean) return h('span', { class: `avatar ${extra}`.trim(), 'aria-hidden': 'true' }, icon('user'));
  const parts = clean.split(/\s+/);
  const initials = (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  let hash = 0;
  for (const ch of clean.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return h('span', { class: `avatar h${hash % 8} ${extra}`.trim(), 'aria-hidden': 'true', text: initials });
}

function sender(by) {
  if (!by) return 'Sent from the phone';
  return by;
}

function sourceLabel(source) {
  const s = String(source || '');
  if (!s) return '';
  if (/^carsales$/i.test(s)) return 'Carsales';
  if (/sms connect/i.test(s)) return 'Carsales (text message)';
  if (/call connect/i.test(s)) return 'Carsales (phone call)';
  if (/dealer studio|autotrader/i.test(s)) return 'Autotrader';
  if (/caravancamping/i.test(s)) return 'Caravan Camping Sales';
  if (/finance/i.test(s)) return 'Website, finance application';
  if (/trade.?in/i.test(s)) return 'Website, trade-in request';
  if (/inspection|test drive/i.test(s)) return 'Website, inspection booking';
  if (/purchase/i.test(s)) return 'Website, purchase steps';
  if (/contact/i.test(s)) return 'Website, contact form';
  if (/chat box/i.test(s)) return 'Website, chat box';
  if (/waitlist/i.test(s)) return 'Website, waitlist';
  if (/^(customer|regular user)$/i.test(s)) return 'Website account';
  return s.replace(/_/g, ' ');
}

function viaLabel(via) {
  const v = String(via || '');
  if (!v || /^(sms|marketplace)$/i.test(v)) return '';
  if (/carsales|sms connect/i.test(v)) return 'via Carsales';
  if (/dealer studio|autotrader/i.test(v)) return 'via Autotrader';
  if (/product_page|finance|inspection|test drive|contact|purchase|chat box|website|waitlist/i.test(v)) return 'via the website';
  if (/caravancamping/i.test(v)) return 'via Caravan Camping Sales';
  return `via ${v}`;
}

/** Text with web links made clickable. Only http and https links are linked. */
function linked(text) {
  const out = [];
  const re = /https?:\/\/[^\s<>()"']+/gi;
  let last = 0, m;
  while ((m = re.exec(text))) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
    last = m.index + url.length;
    re.lastIndex = last;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---- status and notices --------------------------------------------------------

function renderStatus() {
  const s = state.status;
  const box = $('#status');
  box.replaceChildren();
  if (!s) { box.append(h('span', { class: 'dot' }), 'The agent is not responding'); return; }
  // The line describes whichever section is on screen.
  const chat = inMarketplace() && s.marketplace?.enabled;
  const last = chat ? s.marketplace.lastSync : s.lastSync;
  const syncing = chat ? s.marketplace.syncing : s.syncing;
  const place = chat ? 'Marketplace' : 'Dashboard';
  const busy = syncing || s.drafting;
  const ok = !!(last && last.ok);
  box.append(h('span', { class: `dot ${busy ? 'busy' : ok ? 'ok' : last ? 'bad' : ''}` }));
  let text;
  if (syncing) text = chat ? 'Checking Marketplace' : 'Checking the dashboard';
  else if (s.drafting) text = 'Writing suggestions';
  else if (ok) text = `${place} checked ${ago(last.at)}`;
  else if (last) text = `${place} not reached`;
  else text = `${place} not checked yet`;
  box.append(`${text} · ${s.ai.usedToday} of ${s.ai.limit} AI requests used today`);
  const models = s.ai.providers.map((p) => `${p.model}${p.restingMinutes ? ' (busy)' : ''}`).join('\n');
  if (models) box.title = `AI models, tried in order:\n${models}`;

  // What Wheelman has learned from replies that were really used.
  const learned = $('#learned');
  const n = (s.learned?.total || 0) + (s.learned?.notes || 0);
  learned.hidden = !n;
  if (n) {
    const bits = [s.learned.changed ? `${plural(s.learned.changed, 'reply', 'replies')} you changed` : '', s.learned.approved ? `${s.learned.approved} you approved` : '', s.learned.notes ? plural(s.learned.notes, 'note') : ''].filter(Boolean);
    learned.textContent = `Learned from ${bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1] : bits[0]}`;
    learned.title = 'Wheelman learns from the replies you change before sending, the ones you mark Good reply, and what you write under Could be better. Only dashboard conversations are used.';
  }
}

function notice(kind, iconName, title, ...body) {
  return h('div', { class: `notice ${kind}` }, icon(iconName), h('div', {}, h('strong', { text: title }), body));
}

function renderNotices() {
  const s = state.status;
  const box = $('#notices');
  box.replaceChildren();
  if (!s) return;
  if (s.missing.length) {
    box.append(notice('is-bad', 'alert', 'Setup is not finished',
      h('p', {}, 'Open the file ', h('code', { text: '.env' }), ', fill in what is listed here, then restart the agent.'),
      h('ul', {}, s.missing.map((m) => h('li', { text: m })))));
  }
  if (s.lastSync && !s.lastSync.ok && !s.missing.some((m) => /dashboard/.test(m))) {
    box.append(notice('is-bad', 'alert', 'The dashboard could not be reached', h('p', { text: s.lastSync.message })));
  }
  if (inMarketplace() && s.marketplace?.enabled && s.marketplace.lastSync && !s.marketplace.lastSync.ok) {
    box.append(notice('is-bad', 'alert', 'The Marketplace inbox could not be reached', h('p', { text: `${s.marketplace.lastSync.message} The Dashboard section is not affected.` })));
  }
  if (s.lastDraftError) box.append(notice('is-bad', 'alert', 'The AI service returned an error', h('p', { text: s.lastDraftError.message })));
  if (s.paused) box.append(notice('is-warn', 'info', 'Suggestions are paused', h('p', { text: 'Today\'s free AI allowance is used up. Suggestions resume by themselves.' })));
}

// ---- conversation list ---------------------------------------------------------

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  if (!q) return state.list;
  const digits = q.replace(/\D/g, '');
  return state.list.filter((r) =>
    [r.name, r.preview.text, r.car, r.situation, r.account].some((f) => String(f || '').toLowerCase().includes(q))
    || (digits.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(digits)));
}

function renderList() {
  const nav = $('#chats');
  const focusedKey = document.activeElement?.closest?.('.row')?.dataset.key || null;
  const rows = visibleRows();
  nav.replaceChildren();

  if (!rows.length) {
    const empty = state.q.trim()
      ? ['Nothing matches', 'Try a name, part of a phone number, or a word from the message.']
      : inMarketplace()
        ? { waiting: ['Nobody is waiting', 'Marketplace chats where the buyer wrote last appear here with a reply ready to check.'],
            quiet: ['Nothing here', 'Buyers who only said thanks, archived chats, and chats you dismissed.'],
            other: ['Nothing here', ''] }[state.tab]
        : { waiting: ['Nobody is waiting', 'New customer messages appear here with a reply ready to check.'],
            quiet: ['Nothing here', 'Customers who only said thanks, opted out, or are no longer looking, and conversations you dismissed.'],
            other: ['Nothing here', 'Texts from suppliers, couriers and marketers.'] }[state.tab];
    nav.append(h('div', { class: 'list-empty' }, h('strong', { text: empty[0] }), empty[1]));
    return;
  }

  for (const r of rows) {
    const chat = r.section === 'marketplace';
    const title = r.name || r.phone || (chat ? 'Marketplace buyer' : 'Unknown number');
    const setAside = r.dismissed && r.state === 'awaiting';
    // The open conversation is being read, so it never shows a number.
    // A dismissed conversation has been dealt with, so it shows no number either.
    const unread = r.key === state.selected || setAside ? 0 : r.unread || 0;
    const flagWords = setAside ? 'Dismissed' : r.flag === 'fail' ? 'Check the reply' : r.flag === 'input' ? 'Blank to fill' : r.needsPerson && r.unanswered ? 'Needs a person' : '';
    const flagClass = r.flag === 'fail' ? 'fail' : 'input';
    const previewText = r.preview.media && !r.preview.text ? 'Photo' : r.preview.text;
    const row = h('button', {
      class: `row ${unread ? 'has-unanswered' : ''}`.trim(),
      type: 'button',
      'data-key': r.key,
      'aria-current': r.key === state.selected ? 'true' : null,
      onclick: () => open(r.key),
    },
      avatar(r.name),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-top' },
          h('span', { class: 'row-name', text: title }),
          h('span', { class: 'row-time', text: listTime(r.lastAt) })),
        chat && r.car ? h('span', { class: 'row-car', text: r.car }) : null,
        h('span', { class: 'row-bottom' },
          h('span', { class: 'row-preview' },
            setAside ? h('span', { class: 'row-tag', text: 'Dismissed' }) : flagWords ? h('span', { class: `row-flag ${flagClass}`, text: `${flagWords}: ` }) : null,
            r.preview.who === 'us' ? h('span', { class: 'you', text: 'You: ' }) : null, previewText),
          unread ? h('span', { class: 'badge' }, String(unread), h('span', { class: 'visually-hidden', text: unread === 1 ? ' unread message' : ' unread messages' })) : null)));
    nav.append(row);
  }
  if (focusedKey) nav.querySelector(`.row[data-key="${CSS.escape(focusedKey)}"]`)?.focus({ preventScroll: true });
}

/**
 * How many waiting conversations in a section have new messages that have not been looked at.
 * The conversation on screen is being read, so it is never counted.
 */
function newCount(section) {
  const open = section === state.section && state.list.some((r) => r.key === state.selected && r.unread) ? 1 : 0;
  return Math.max(0, (state.unread[section] || 0) - open);
}

/** The numbers on the page mean "new, not looked at yet". They go away once the conversation is opened. */
function renderCounts() {
  const here = newCount(state.section);
  $('#count-waiting').textContent = here ? String(here) : '';
  $('#count-quiet').textContent = '';
  $('#count-other').textContent = '';
  const s = state.sections;
  const hasMarketplace = s.marketplace !== null && s.marketplace !== undefined;
  $('#sections').hidden = !hasMarketplace;
  let total = 0;
  for (const k of ['dashboard', 'marketplace']) {
    const badge = $(`#section-${k}`);
    const n = newCount(k);
    total += n;
    badge.hidden = !n;
    badge.replaceChildren(String(n), h('span', { class: 'visually-hidden', text: n === 1 ? ' conversation with new messages' : ' conversations with new messages' }));
  }
  $('.filter[data-tab="other"]').hidden = inMarketplace();
  document.title = total ? `(${total}) Wheelman` : 'Wheelman';
}

// ---- open conversation -----------------------------------------------------------

function renderWelcome() {
  const chat = $('#chat');
  chat.replaceChildren(h('div', { class: 'welcome' },
    h('div', { class: 'welcome-mark' }, wheelMark()),
    h('h2', { text: state.counts.waiting ? `${plural(state.counts.waiting, inMarketplace() ? 'buyer' : 'customer')} waiting for a reply` : 'Nobody is waiting right now' }),
    h('ol', {},
      h('li', {}, h('span', {}, h('b', { text: inMarketplace() ? 'Pick a buyer' : 'Pick a customer' }), ' from the list.')),
      h('li', {}, h('span', {}, h('b', { text: 'Check the reply' }), ' waiting in the message box. Fill in anything highlighted.')),
      h('li', {}, h('span', {}, h('b', { text: 'Copy it' }), inMarketplace() ? ' and paste it into the Marketplace chat.' : ' and send it from the dashboard.'))),
    h('p', { text: 'Nothing is ever sent to a customer from this page.' })));
  state.threadSig = '';
  state.composerSig = '';
}

function chatFrame() {
  const chat = $('#chat');
  if (!$('.chat-head', chat)) {
    chat.replaceChildren(
      h('header', { class: 'chat-head' }),
      h('div', { class: 'car-line', hidden: true }),
      h('div', { class: 'thread-wrap' },
        h('div', { class: 'thread', role: 'log', 'aria-label': 'Conversation', tabindex: '0' }),
        h('button', { class: 'latest', type: 'button', hidden: true, 'aria-label': 'Go to the newest message', onclick: () => pinToLatest(true) }, icon('down'), h('span', { class: 'badge', hidden: true }))),
      h('footer', { class: 'composer' }));
    const thread = $('.thread', chat);
    thread.addEventListener('scroll', () => {
      state.stuck = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 60;
      paintLatest();
    }, { passive: true });
    // The message box grows and shrinks; keep the newest message in view while pinned.
    new ResizeObserver(() => { if (state.stuck) thread.scrollTop = thread.scrollHeight; paintLatest(); }).observe(thread);
  }
  return { head: $('.chat-head', chat), car: $('.car-line', chat), thread: $('.thread', chat), composer: $('.composer', chat) };
}

function pinToLatest(byUser = false) {
  const thread = $('#chat .thread');
  if (!thread) return;
  state.stuck = true;
  thread.scrollTop = thread.scrollHeight;
  paintLatest();
  if (byUser) thread.focus({ preventScroll: true });
}

function paintLatest() {
  const btn = $('#chat .latest');
  if (!btn) return;
  btn.hidden = state.stuck;
  const n = state.detail?.unanswered || 0;
  const badge = $('.badge', btn);
  badge.hidden = !n;
  badge.textContent = n ? String(n) : '';
}

function renderHead(item, els) {
  const chat = item.channel === 'marketplace';
  const listing = item.marketplace || null;
  const title = item.name || item.phone || (chat ? 'Marketplace buyer' : 'Unknown number');
  const writing = state.busy.has(item.key);
  const where = chat ? `Marketplace${listing?.account ? `, ${listing.account}` : ''}` : (item.name ? item.phone : '');
  const sub = writing ? 'writing a suggestion…'
    : [where, item.situation && item.situation !== 'General enquiry' ? `Asking about: ${item.situation.toLowerCase()}` : ''].filter(Boolean).join(' · ');
  const others = newCount(state.section);
  els.head.replaceChildren(
    h('button', { class: 'back', type: 'button', 'aria-label': others ? `Back to conversations. ${plural(others, 'conversation')} with new messages.` : 'Back to conversations', onclick: closeChat },
      icon('back'), others ? h('span', { class: 'badge', 'aria-hidden': 'true', text: String(others) }) : null),
    h('button', { class: 'who', type: 'button', 'aria-expanded': state.infoOpen ? 'true' : 'false', title: 'Customer and car details', onclick: toggleInfo },
      avatar(item.name, 'small'),
      h('span', { class: 'who-text' }, h('span', { class: 'who-name', text: title }), sub ? h('span', { class: `who-sub ${writing ? 'is-writing' : ''}`.trim(), text: sub }) : null)),
    h('div', { class: 'head-actions' },
      item.phone ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Copy phone number', title: 'Copy phone number', onclick: async () => { await copyText(item.phone); toast('Phone number copied'); } }, icon('copy')) : null,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Customer and car details', title: 'Customer and car details', onclick: toggleInfo }, icon('info'))));

  const v = item.vehicle;
  const unmatched = !v && !!listing?.listingTitle;
  els.car.hidden = !v && !unmatched;
  els.car.replaceChildren();
  if (unmatched) {
    put(els.car,
      h('span', { class: 'car-title', text: listing.listingTitle }),
      h('span', { class: 'avail unknown', text: 'Not in the stock list' }),
      listing.listingUrl ? h('a', { href: listing.listingUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open on Facebook', icon('external')) : null);
  }
  if (v) {
    put(els.car,
      h('span', { class: 'car-title', text: v.title || `Stock ${v.stockNo}` }),
      v.availability.code !== 'sold' && v.price ? h('span', { text: money(v.price) }) : null,
      v.odometer ? h('span', { text: `${Number(v.odometer).toLocaleString('en-AU')} km` }) : null,
      h('span', { class: `avail ${v.availability.code}`, text: shortAvailability(v.availability) }),
      v.url ? h('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open listing', icon('external')) : null);
  }
}

function shortAvailability(a) {
  return { available: 'Available at Lidcombe', sold: 'Sold', transit: 'In transit from Japan', japan: 'Still in Japan', arrived: 'Arrived, being prepared', unknown: 'Availability unknown' }[a.code] || a.text;
}

function threadSignature(item) {
  const m = item.marketplace;
  return item.key + '|' + item.thread.map((e) => `${e.key}${e.unanswered ? '*' : ''}`).join(',') + (m ? `|${m.locked}${m.stage}${m.failed}${m.replyComing}${m.queuedAt && Date.now() - m.queuedAt > 15 * 60 * 1000}` : '');
}

function renderThread(item, els, { toBottom = false } = {}) {
  const box = els.thread;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.replaceChildren();

  if (item.earlier > 0) box.append(h('div', { class: 'pill note', text: `${plural(item.earlier, 'earlier message')} not shown` }));

  let lastDay = '';
  let lastSide = '';
  let lastBy = null;
  let markedUnanswered = false;
  const unanswered = item.thread.filter((e) => e.unanswered).length;

  for (const e of item.thread) {
    const day = dayKey(e.at);
    if (day !== lastDay) { box.append(h('div', { class: 'pill', text: dayLabel(e.at) })); lastDay = day; lastSide = ''; lastBy = null; }

    if (e.unanswered && !markedUnanswered) {
      box.append(h('div', { class: 'pill unanswered', text: unanswered === 1 ? '1 unanswered message' : `${unanswered} unanswered messages` }));
      markedUnanswered = true; lastSide = ''; lastBy = null;
    }

    if (e.internal) {
      box.append(h('div', { class: 'pill note' }, `Staff note${e.by ? ` by ${sender(e.by)}` : ''}: ${e.text}`, h('span', { class: 'when', text: clock(e.at) })));
      lastSide = ''; lastBy = null;
      continue;
    }

    if (e.event) {
      box.append(h('div', { class: 'pill event' }, e.event, h('span', { class: 'when', text: clock(e.at) })));
      lastSide = ''; lastBy = null;
      if (!e.text && !e.media) continue;
    }

    const side = e.who === 'us' ? 'out' : 'in';
    const by = side === 'out' ? sender(e.by) : viaLabel(e.via);
    const first = side !== lastSide || by !== lastBy;
    const bubble = h('div', { class: `msg ${side} ${first ? 'first' : ''}`.trim() },
      h('span', { class: 'visually-hidden', text: side === 'out' ? `We wrote, ${by}: ` : 'Customer wrote: ' }),
      first && by ? h('span', { class: 'from', 'aria-hidden': side === 'out' ? 'true' : null, text: by }) : null,
      e.media ? h('span', { class: 'media' }, icon('image'), e.media === 'photo' ? 'Photo' : 'Attachment', e.text ? '\n' : '') : null,
      e.text ? linked(e.text) : null,
      h('span', { class: 'time', text: clock(e.at) }));
    box.append(bubble);
    lastSide = side; lastBy = by;
  }

  // Marketplace: what the engine's own auto-reply is doing with this chat.
  const m = item.marketplace;
  if (m) {
    if (m.locked || m.stage === 'handed_off') box.append(h('div', { class: 'pill event', text: `The auto-reply has handed this chat to a person${m.lockReason ? `: ${m.lockReason}` : ''}.` }));
    if (m.failed) box.append(h('div', { class: 'pill event', text: `${plural(m.failed, 'reply', 'replies')} from the Marketplace system failed to send.` }));
    if (m.replyComing && item.state === 'awaiting') {
      // A queued auto-reply normally goes within a minute or two. One that has sat longer is probably stuck.
      const stuck = m.queuedAt && Date.now() - m.queuedAt > 15 * 60 * 1000;
      box.append(stuck
        ? h('div', { class: 'pill event', text: `The auto-reply wrote an answer ${ago(m.queuedAt)}, but it has not been sent.` })
        : h('div', { class: 'pill note', text: 'An auto-reply is queued for this chat and may answer first.' }));
    }
  }

  state.threadSig = threadSignature(item);
  if (toBottom) state.stuck = true;
  if (state.stuck || nearBottom) box.scrollTop = box.scrollHeight;
  paintLatest();
}

// ---- message box ---------------------------------------------------------------

const BLANK = /\[(PRICE|TRADE-IN VALUE|DELIVERY COST|DATE|CHECK)\?\]/g;
const BLANK_NAME = { PRICE: 'the price', 'TRADE-IN VALUE': 'the trade-in value', 'DELIVERY COST': 'the delivery cost', DATE: 'the date', CHECK: 'something to confirm' };

function blanksIn(text) {
  const found = [];
  const totals = {};
  for (const m of text.matchAll(BLANK)) { totals[m[1]] = (totals[m[1]] || 0) + 1; found.push({ kind: m[1], start: m.index, end: m.index + m[0].length }); }
  const seen = {};
  for (const b of found) {
    seen[b.kind] = (seen[b.kind] || 0) + 1;
    b.label = BLANK_NAME[b.kind] + (totals[b.kind] > 1 ? ` ${seen[b.kind]}` : '');
    const lineStart = text.lastIndexOf('\n', b.start - 1) + 1;
    const lineEnd = text.indexOf('\n', b.end);
    b.line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
  }
  return found;
}

function composerSignature(item) {
  const d = item.draft;
  return [item.key, item.state, item.dismissed, d?.id, d?.status, d?.rating, state.busy.has(item.key), state.rewriteOpen, state.betterOpen, state.copied === d?.id].join('|');
}

function renderComposer(item, els, { arriving = false } = {}) {
  const box = els.composer;
  const d = item.draft;
  const busy = state.busy.has(item.key);
  state.composerSig = composerSignature(item);
  box.replaceChildren();

  if (busy) {
    box.append(
      h('div', { class: 'draft-head' }, h('span', { class: 'draft-tag', text: 'Writing a suggestion' })),
      h('div', { class: 'sheet', role: 'status', 'aria-label': 'Writing a suggestion' }, h('div', { class: 'writing' }, h('i'), h('i'), h('i'))));
    return;
  }

  const writeBtn = (label, kind = 'primary') => h('button', { class: `btn ${kind}`, type: 'button', onclick: () => write(item, '') }, icon('pencil'), label);

  if (item.state === 'optout') {
    box.append(h('div', { class: 'quiet bad' }, icon('stop'), h('p', { text: 'This customer asked not to be contacted. Do not reply.' })));
    return;
  }
  if (item.dismissed && item.state === 'awaiting') {
    box.append(h('div', { class: 'quiet' },
      h('p', { text: 'You dismissed this conversation. It also returns to Waiting by itself if the customer writes again.' }),
      h('button', { class: 'btn primary', type: 'button', onclick: () => restoreItem(item.key) }, 'Put back in Waiting')));
    return;
  }
  if (item.state === 'answered') {
    box.append(h('div', { class: 'quiet' }, icon('check'), h('p', { text: 'We have replied. Nothing is waiting here.' })));
    return;
  }
  if (item.state !== 'awaiting' && !(d && d.status === 'ready')) {
    box.append(h('div', { class: 'quiet' }, h('p', { text: item.note || 'No reply needed.' }), writeBtn('Write a reply anyway', 'outline')));
    return;
  }
  if (!d || d.status !== 'ready') {
    const failed = d && d.status === 'failed';
    box.append(h('div', { class: `quiet ${failed ? 'bad' : ''}`.trim() },
      h('p', { text: failed ? `A suggestion could not be written. ${d.error}` : item.autoReason || 'A suggestion will be written within a few minutes.' }),
      writeBtn(failed ? 'Try again' : 'Write it now')));
    return;
  }

  // A ready suggestion: an unsent draft in the message box.
  const ta = h('textarea', { class: `draft ${arriving ? 'arriving' : ''}`.trim(), rows: '3', spellcheck: 'true', 'aria-label': 'Suggested reply, not sent. Edit it here, then copy it.' });
  ta.value = state.edits.has(d.id) ? state.edits.get(d.id) : d.reply;
  const backdrop = h('div', { class: 'backdrop', 'aria-hidden': 'true' });
  const advice = h('div', { class: 'advice' });
  const count = h('span', { class: 'count' });
  const copyBtn = h('button', { class: 'btn primary', type: 'button', title: 'Copy (Ctrl + Enter)' }, icon('copy'), h('span', { text: 'Copy reply' }));
  const after = h('div', { class: 'after', hidden: state.copied !== d.id });

  const stillThere = (check) => !check.tokens?.length || check.tokens.some((t) => ta.value.includes(t));
  const reasonFor = (kind) => {
    const n = (d.needsHuman || []).find((x) => String(x?.marker || '').includes(kind) && x.reason);
    return n ? String(n.reason).replace(/\s+$/, '').replace(/([^.!?])$/, '$1.') : '';
  };

  function paintBackdrop() {
    const text = ta.value;
    const ranges = blanksIn(text).map((b) => ({ start: b.start, end: b.end, cls: 'blank' }));
    for (const c of d.checks) {
      if (c.level !== 'fail') continue;
      for (const t of c.tokens || []) {
        if (!t || /^\[/.test(t)) continue;
        let i = text.indexOf(t);
        while (i !== -1) { ranges.push({ start: i, end: i + t.length, cls: 'bad' }); i = text.indexOf(t, i + t.length); }
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    const nodes = [];
    let at = 0;
    for (const r of ranges) {
      if (r.start < at) continue;
      if (r.start > at) nodes.push(text.slice(at, r.start));
      nodes.push(h('mark', { class: r.cls, text: text.slice(r.start, r.end) }));
      at = r.end;
    }
    nodes.push(text.slice(at) + '​');
    backdrop.replaceChildren(...nodes);
    backdrop.scrollTop = ta.scrollTop;
  }

  function selectBlank(index) {
    const b = blanksIn(ta.value)[index];
    if (!b) return;
    ta.focus();
    ta.setSelectionRange(b.start, b.end);
    const mark = backdrop.querySelectorAll('mark.blank')[index];
    if (mark) { ta.scrollTop = Math.max(0, mark.offsetTop - 48); backdrop.scrollTop = ta.scrollTop; }
  }

  function paintAdvice() {
    const blanks = blanksIn(ta.value);
    const lines = [];
    for (const c of d.checks.filter((x) => x.level === 'fail' && x.code !== 'placeholder' && stillThere(x))) {
      lines.push(h('div', { class: 'tip fail' }, icon('alert'), h('span', { class: 'tip-text', text: c.message })));
    }
    if (blanks.length) {
      const reasons = [...new Set(blanks.map((b) => reasonFor(b.kind)).filter(Boolean))];
      lines.push(h('div', { class: 'tip blank' }, icon('pencil'),
        h('span', { text: blanks.length === 1 ? 'Replace the highlighted part before sending:' : `Replace the ${blanks.length} highlighted parts before sending:` }),
        blanks.map((b, i) => h('button', { class: 'blank-btn', type: 'button', title: `Select it in the reply: ${b.line}`, onclick: () => selectBlank(i) }, b.label)),
        reasons.length ? h('span', { class: 'tip-why', text: reasons.join(' ') }) : null));
    }
    for (const c of d.checks.filter((x) => x.level === 'input' && x.code !== 'marker')) {
      lines.push(h('div', { class: 'tip input' }, icon('info'), h('span', { class: 'tip-text', text: c.message })));
    }
    for (const c of d.checks.filter((x) => x.level === 'warn' && x.code !== 'bare-marker')) {
      lines.push(h('div', { class: 'tip warn' }, h('span', { class: 'tip-text', text: c.message })));
    }
    // Only claim a match for text that was actually checked.
    if (!lines.length) {
      const edited = ta.value !== d.reply;
      const body = d.reply.replace(/\n+Regards,[\s\S]*$/i, '');
      const hadSomethingToCheck = /\d|https?:\/\//i.test(body);
      if (edited) lines.push(h('div', { class: 'tip warn' }, h('span', { class: 'tip-text', text: 'You have changed the text. Anything you typed has not been checked.' })));
      else if (hadSomethingToCheck) lines.push(h('div', { class: 'tip ok' }, icon('check'), h('span', { class: 'tip-text', text: 'Figures and links match your records.' })));
    }
    advice.replaceChildren(...lines);

    const open = blanks.length > 0;
    copyBtn.classList.toggle('wait', open);
    copyBtn.lastChild.textContent = open ? 'Copy with blanks' : 'Copy reply';
  }

  function paintCount() {
    const t = ta.value;
    const chars = t.length;
    const parts = Math.ceil(chars / 153);
    count.textContent = `${plural((t.trim().match(/\S+/g) || []).length, 'word')}${chars > 160 && item.channel !== 'marketplace' ? ` · about ${parts} texts` : ''}`;
  }

  function grow() {
    const field = ta.parentElement;
    ta.style.height = 'auto';
    const max = parseFloat(getComputedStyle(ta).maxHeight) || Infinity;
    const wanted = ta.scrollHeight + 2;
    field?.classList.toggle('is-scrolling', wanted > max);
    ta.style.height = `${Math.min(wanted, max)}px`;
    backdrop.scrollTop = ta.scrollTop;
  }

  const sync = () => { paintBackdrop(); paintAdvice(); paintCount(); grow(); };

  async function doCopy() {
    const ok = await copyText(ta.value);
    if (!ok) { toast('Copying is blocked by the browser. Select the text and press Ctrl + C.'); return; }
    const left = blanksIn(ta.value).length;
    const chat = item.channel === 'marketplace';
    toast(left ? `Copied, with ${plural(left, 'blank')} still to fill` : chat ? 'Copied. Paste it into the Marketplace chat to send.' : 'Copied. Paste it into the dashboard to send.');
    state.copied = d.id;
    after.hidden = false;
    // Tell Wheelman what was actually used, so it learns from it. Dashboard only:
    // Marketplace chats are never learned from, so their text is not even sent.
    api(`/api/drafts/${d.id}/copied`, { body: { text: chat ? '' : ta.value } }).catch(() => {});
    state.composerSig = composerSignature(item);
  }

  ta.addEventListener('input', () => { state.edits.set(d.id, ta.value); sync(); });
  ta.addEventListener('scroll', () => { backdrop.scrollTop = ta.scrollTop; });
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); doCopy(); } });
  copyBtn.addEventListener('click', doCopy);

  const rewriteInput = h('input', { type: 'text', maxlength: '300', placeholder: 'What should change? For example: offer $27,500, or make it shorter', 'aria-label': 'What should change in the reply' });
  rewriteInput.value = d.instruction || '';
  const rewriteRow = h('div', { class: 'rewrite', hidden: !state.rewriteOpen },
    rewriteInput,
    h('button', { class: 'btn outline', type: 'button', onclick: () => write(item, rewriteInput.value) }, 'Write it again'));
  rewriteInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); write(item, rewriteInput.value); }
    if (ev.key === 'Escape') { state.rewriteOpen = false; rewriteRow.hidden = true; rewriteBtn.classList.remove('is-on'); rewriteBtn.setAttribute('aria-expanded', 'false'); rewriteBtn.focus(); }
  });
  const rewriteBtn = h('button', { class: `btn ${state.rewriteOpen ? 'is-on' : ''}`.trim(), type: 'button', 'aria-expanded': state.rewriteOpen ? 'true' : 'false', onclick: () => {
    state.rewriteOpen = !state.rewriteOpen;
    if (state.rewriteOpen && state.betterOpen) { state.betterOpen = false; betterRow.hidden = true; betterBtn?.classList.remove('is-on'); betterBtn?.setAttribute('aria-expanded', 'false'); }
    rewriteRow.hidden = !state.rewriteOpen;
    rewriteBtn.classList.toggle('is-on', state.rewriteOpen);
    rewriteBtn.setAttribute('aria-expanded', state.rewriteOpen ? 'true' : 'false');
    state.composerSig = composerSignature(item);
    if (state.rewriteOpen) rewriteInput.focus();
  } }, icon('pencil'), 'Rewrite');

  put(after, h('span', { class: 'said' }, icon('check'), 'Copied'));

  // Two ways to teach Wheelman. Marketplace chats are never learned from, so they have neither.
  const teach = item.channel !== 'marketplace';
  const approved = d.rating === 'good';
  const approveBtn = teach ? h('button', { class: `btn ${approved ? 'is-on' : ''}`.trim(), type: 'button', 'aria-pressed': approved ? 'true' : 'false',
    title: approved ? 'You approved this reply. Click to take that back.' : 'This reply is right as it is. Wheelman will write similar replies the same way.',
    onclick: () => approve(item) }, icon('check'), approved ? 'Approved' : 'Good reply') : null;
  const betterInput = h('input', { type: 'text', maxlength: '600', placeholder: 'How should this be handled? For example: too long, or invite them to inspect before talking price', 'aria-label': 'What could be better about this reply' });
  const betterRow = h('div', { class: 'rewrite', hidden: !state.betterOpen },
    betterInput,
    h('button', { class: 'btn outline', type: 'button', onclick: () => improve(item, betterInput.value) }, 'Rewrite and learn'));
  const closeBetter = () => { state.betterOpen = false; betterRow.hidden = true; betterBtn.classList.remove('is-on'); betterBtn.setAttribute('aria-expanded', 'false'); };
  betterInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); improve(item, betterInput.value); }
    if (ev.key === 'Escape') { closeBetter(); betterBtn.focus(); }
  });
  const betterBtn = teach ? h('button', { class: `btn ${state.betterOpen ? 'is-on' : ''}`.trim(), type: 'button', 'aria-expanded': state.betterOpen ? 'true' : 'false',
    title: 'Coach Wheelman on how to handle this kind of message. It rewrites this reply and keeps the lesson, not your words, for similar messages.',
    onclick: () => {
      state.betterOpen = !state.betterOpen;
      if (state.betterOpen && state.rewriteOpen) { state.rewriteOpen = false; rewriteRow.hidden = true; rewriteBtn.classList.remove('is-on'); rewriteBtn.setAttribute('aria-expanded', 'false'); }
      betterRow.hidden = !state.betterOpen;
      betterBtn.classList.toggle('is-on', state.betterOpen);
      betterBtn.setAttribute('aria-expanded', state.betterOpen ? 'true' : 'false');
      state.composerSig = composerSignature(item);
      if (state.betterOpen) betterInput.focus();
    } }, 'Could be better') : null;

  box.append(
    h('div', { class: 'draft-head' },
      h('span', { class: 'draft-tag' }, 'Suggested reply ', h('span', { text: '· not sent' })),
      h('span', { class: 'draft-meta', title: d.model || '', text: `Written ${clock(d.createdAt)}` })),
    advice,
    h('div', { class: 'sheet' },
      h('div', { class: 'field' }, backdrop, ta),
      h('div', { class: 'sheet-foot' },
        rewriteBtn,
        approveBtn,
        betterBtn,
        h('span', { class: 'grow' }),
        count,
        copyBtn)),
    rewriteRow,
    teach ? betterRow : null,
    after);

  sync();
  // The box is as tall as its text, so it must be measured again whenever its width changes.
  let lastWidth = ta.clientWidth;
  const watcher = new ResizeObserver(() => {
    if (!ta.isConnected) { watcher.disconnect(); return; }
    if (ta.clientWidth !== lastWidth) { lastWidth = ta.clientWidth; grow(); }
  });
  watcher.observe(ta.parentElement);
}

// ---- details panel ---------------------------------------------------------------

function renderInfo() {
  const panel = $('#info');
  const item = state.detail;
  const show = state.infoOpen && !!item;
  panel.hidden = !show;
  $('#app').classList.toggle('has-info', show);
  if (!show) { panel.replaceChildren(); return; }

  const row = (label, value) => (value ? [h('dt', { text: label }), h('dd', {}, value)] : null);
  const v = item.vehicle;
  const d = item.draft;

  panel.replaceChildren(
    h('header', { class: 'info-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close details', onclick: toggleInfo }, icon('x')),
      h('h2', { text: 'Details' })),
    h('div', { class: 'info-body' },
      h('div', { class: 'info-top' },
        avatar(item.name),
        h('h3', { text: item.name || 'Unknown name' }),
        h('p', { text: item.phone || (item.marketplace ? 'Facebook Marketplace' : '') })),
      h('section', {},
        h('h4', { text: item.marketplace ? 'Buyer' : 'Customer' }),
        h('dl', {},
          row('Phone', item.phone ? h('button', { class: 'link-btn', type: 'button', onclick: async () => { await copyText(item.phone); toast('Phone number copied'); } }, `${item.phone} (copy)`) : ''),
          row('Email', item.email),
          row('Came from', sourceLabel(item.source)),
          row('State', item.location),
          row('Lead status', item.leadStatus ? item.leadStatus.replace(/_/g, ' ').toLowerCase() : ''),
          row('Asking about', item.situation)),
        item.noLead ? h('p', { class: 'fine', text: 'This number has no customer record in the dashboard.' }) : null),
      item.marketplace ? marketplaceInfo(item.marketplace, row) : null,
      v ? h('section', {},
        h('h4', { text: 'Car' }),
        h('dl', {},
          row('Vehicle', v.title),
          row('Stock number', v.stockNo),
          row('Availability', v.availability.text),
          row('Price', v.availability.code !== 'sold' && v.price ? `${money(v.price)}, government charges extra` : ''),
          row('Odometer', v.odometer ? `${Number(v.odometer).toLocaleString('en-AU')} km` : ''),
          row('Fuel', v.fuel),
          row('Transmission', v.transmission),
          row('Seats', v.seats),
          row('Colour', v.colour ? String(v.colour).toLowerCase() : ''),
          row('Listing', v.url ? h('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open on the website' }) : '')),
        v.included?.length ? [h('h4', { text: 'Included with this car' }), h('ul', { class: 'facts' }, v.included.map((x) => h('li', { text: x })))] : null)
        : h('section', {}, h('h4', { text: 'Car' }), h('p', { class: 'fine', text: 'No car could be matched to this conversation.' })),
      d && d.status === 'ready' ? h('section', {},
        h('h4', { text: 'What the suggestion relies on' }),
        d.factsUsed.length ? h('ul', { class: 'facts' }, d.factsUsed.map((f) => h('li', { text: f }))) : h('p', { class: 'fine', text: 'No particular facts were listed.' }),
        h('p', { class: 'fine', text: `Written by ${d.model || 'the AI model'} at ${clock(d.createdAt)}.${d.instruction ? ` Your instruction: “${d.instruction}”.` : ''}` })) : null,
      item.state === 'awaiting' && !item.dismissed ? h('section', {},
        h('h4', { text: 'Dismiss' }),
        h('p', { class: 'fine', text: 'Takes this conversation out of Waiting, for example when you have already phoned them. Nothing is deleted: it stays under No reply needed and can be put back.' }),
        h('button', { class: 'btn outline dismiss-btn', type: 'button', onclick: () => dismissItem(item) }, 'Dismiss this conversation')) : null,
      h('section', {}, h('p', { class: 'fine', text: 'All times are Sydney time.' }))));
}

/** The Marketplace part of the details panel: the seller account, the listing, and what the auto-reply noted. */
function marketplaceInfo(m, row) {
  const handed = m.locked || m.stage === 'handed_off';
  return h('section', {},
    h('h4', { text: 'Marketplace' }),
    h('dl', {},
      row('Seller account', m.account),
      row('Listing', m.listingTitle),
      row('Price on Facebook', /^\$?[\d,]+(\.\d+)?$/.test(m.listingPrice || '') ? money(Number(m.listingPrice.replace(/[$,]/g, ''))) : m.listingPrice),
      row('Auto-reply', m.autoReply ? 'On for this chat' : 'Off for this chat'),
      row('Stage', m.stage ? m.stage.replace(/_/g, ' ') : ''),
      row('Handed to a person', handed ? (m.lockReason || 'Yes') : ''),
      row('Why', handed ? m.lockDetail : ''),
      row('Suggested next step', m.nextAction),
      row('Open', m.listingUrl ? h('a', { href: m.listingUrl, target: '_blank', rel: 'noopener noreferrer', text: 'The listing on Facebook' }) : '')),
    m.notes?.length ? [
      h('h4', { text: 'Noted by the auto-reply' }),
      h('ul', { class: 'facts' }, m.notes.map((n) => h('li', { text: n }))),
      h('p', { class: 'fine', text: 'These notes were made automatically and have not been checked.' })] : null);
}

function toggleInfo() {
  state.infoOpen = !state.infoOpen;
  renderInfo();
  $('.who')?.setAttribute('aria-expanded', state.infoOpen ? 'true' : 'false');
  if (state.infoOpen) $('#info .icon-btn')?.focus({ preventScroll: true });
}

// ---- actions ---------------------------------------------------------------------

function renderChat({ toBottom = false, arriving = false } = {}) {
  const item = state.detail;
  if (!item) { renderWelcome(); renderInfo(); return; }
  const els = chatFrame();
  renderHead(item, els);
  renderThread(item, els, { toBottom });
  renderComposer(item, els, { arriving });
  renderInfo();
  if (toBottom) pinToLatest();
}

/** Opening a conversation marks its messages as read: the number on its row goes away until a new message arrives. */
function markRead(item) {
  if (!item || !item.unread) return;
  item.unread = 0;
  const row = state.list.find((r) => r.key === item.key);
  if (row) row.unread = 0;
  // One fewer conversation with new messages: the numbers on the chip, the switch and the browser tab drop.
  const section = item.key.startsWith('mp:') ? 'marketplace' : 'dashboard';
  if (item.state === 'awaiting' && !item.dismissed && state.unread[section]) state.unread[section] -= 1;
  renderList();
  renderCounts();
  api(`/api/items/${item.key}/seen`, { body: {} }).catch(() => {});
}

async function open(key) {
  if (state.selected === key && state.detail) { $('#app').dataset.view = 'chat'; return; }
  state.selected = key;
  state.rewriteOpen = false;
  state.betterOpen = false;
  state.copied = null;
  $('#app').dataset.view = 'chat';
  renderList();
  renderCounts();
  try {
    const { item } = await api(`/api/items/${key}`);
    if (state.selected !== key) return;
    state.detail = item;
    markRead(item);
    renderChat({ toBottom: true });
    if (narrow()) $('.thread')?.focus({ preventScroll: true });
  } catch (e) {
    toast(e.message);
  }
}

function closeChat() {
  $('#app').dataset.view = 'list';
  $(`.row[data-key="${CSS.escape(state.selected || '')}"]`)?.focus({ preventScroll: true });
}

async function write(item, instruction) {
  if (state.busy.has(item.key)) return;
  state.busy.add(item.key);
  state.rewriteOpen = false;
  state.betterOpen = false;
  if (state.selected === item.key) { renderHead(state.detail, chatFrame()); renderComposer(state.detail, chatFrame()); }
  try {
    const out = await api(`/api/items/${item.key}/draft`, { body: { instruction } });
    state.busy.delete(item.key);
    if (state.selected === item.key) {
      state.detail = out.item;
      state.copied = null;
      renderHead(out.item, chatFrame());
      renderComposer(out.item, chatFrame(), { arriving: true });
      renderInfo();
    }
    toast(out.ok ? 'A new suggestion is ready' : 'A suggestion could not be written');
  } catch (e) {
    state.busy.delete(item.key);
    if (state.selected === item.key) { renderHead(state.detail, chatFrame()); renderComposer(state.detail, chatFrame()); }
    toast(e.message);
  }
  refreshList();
  refreshStatus();
}

async function dismissItem(item) {
  try {
    await api(`/api/items/${item.key}/dismiss`, { body: {} });
    const rows = visibleRows();
    const i = rows.findIndex((r) => r.key === item.key);
    const next = rows[i + 1] || rows[i - 1] || null;
    state.list = state.list.filter((r) => r.key !== item.key);
    state.counts.waiting = Math.max(0, state.counts.waiting - (item.state === 'awaiting' ? 1 : 0));
    if (item.state === 'awaiting' && state.sections[state.section]) state.sections[state.section] -= 1;
    renderCounts();
    toast('Dismissed. It is kept under No reply needed.', { label: 'Undo', run: () => restoreItem(item.key, true) });
    if (next && !narrow()) { state.selected = null; state.detail = null; await open(next.key); }
    else { state.selected = null; state.detail = null; renderList(); renderChat(); $('#app').dataset.view = 'list'; }
    refreshList();
  } catch (e) { toast(e.message); }
}

/** Undoes Dismiss. The conversation returns to Waiting and its suggestion is written again if needed. */
async function restoreItem(key, reopen = false) {
  try {
    const out = await api(`/api/items/${key}/restore`, { body: {} });
    await refreshList();
    const here = (key.startsWith('mp:') ? 'marketplace' : 'dashboard') === state.section;
    if (state.selected === key) { state.detail = out.item; renderChat(); }
    else if (reopen && here && !narrow()) { state.selected = null; state.detail = null; await open(key); }
    toast('Back in Waiting');
  } catch (e) { toast(e.message); }
}

/** "Good reply": this suggestion is right as written. Wheelman keeps it as a model for similar messages. */
async function approve(item) {
  const d = item.draft;
  const next = d.rating === 'good' ? '' : 'good';
  try {
    const out = await api(`/api/drafts/${d.id}/rating`, { body: { rating: next } });
    d.rating = next;
    if (state.selected === item.key) renderComposer(item, chatFrame());
    toast(!next ? 'Approval taken back' : out.learned ? 'Approved. Wheelman will write similar replies this way.' : 'Approved');
    refreshStatus();
  } catch (e) { toast(e.message); }
}

/**
 * "Could be better": you coach Wheelman on how to handle this kind of message. It takes a lesson
 * from what you wrote, keeps the lesson (not your words) for similar messages, and writes this
 * reply again.
 */
async function improve(item, note) {
  const said = String(note || '').trim();
  if (!said) { toast('Say what could be better first'); return; }
  if (state.busy.has(item.key)) return;
  state.busy.add(item.key);
  state.betterOpen = false;
  state.rewriteOpen = false;
  if (state.selected === item.key) { renderHead(state.detail, chatFrame()); renderComposer(state.detail, chatFrame()); }
  try {
    const out = await api(`/api/drafts/${item.draft.id}/advice`, { body: { note: said } });
    state.busy.delete(item.key);
    if (out.item && state.selected === item.key) {
      state.detail = out.item;
      state.copied = null;
      renderHead(out.item, chatFrame());
      renderComposer(out.item, chatFrame(), { arriving: true });
      renderInfo();
    } else if (state.selected === item.key) { renderHead(state.detail, chatFrame()); renderComposer(state.detail, chatFrame()); }
    const lesson = (out.lessons || [])[0];
    toast(!out.learned ? 'That could not be saved' : lesson ? `Learned: ${lesson.do}` : out.pending ? 'Noted. The lesson will be worked out when the AI is free.' : 'Noted for this reply. Nothing to reuse was found in it.');
  } catch (e) {
    state.busy.delete(item.key);
    if (state.selected === item.key) { renderHead(state.detail, chatFrame()); renderComposer(state.detail, chatFrame()); }
    toast(e.message);
  }
  refreshList();
  refreshStatus();
}

// ---- refreshing ------------------------------------------------------------------

async function refreshStatus() {
  try { state.status = await api('/api/status'); } catch { state.status = null; }
  renderStatus();
  renderNotices();
}

async function refreshList() {
  const seq = ++state.listSeq;
  try {
    const data = await api(`/api/items?section=${state.section}&tab=${state.tab}&hours=${state.hours}`);
    if (seq !== state.listSeq) return false; // a newer request has replaced this one
    state.list = data.items;
    state.counts = data.counts;
    if (data.sections) state.sections = data.sections;
    if (data.unread) state.unread = data.unread;
    renderCounts();
    renderList();
    if (!state.detail && !state.selected) renderWelcome();
    return true;
  } catch {
    if (seq !== state.listSeq) return false;
    $('#chats').replaceChildren(h('div', { class: 'list-empty' }, h('strong', { text: 'The agent is not responding' }), 'Check that it is still running in its terminal window, then reload this page.'));
    return false;
  }
}

async function refreshDetail() {
  const key = state.selected;
  if (!key || state.busy.has(key)) return;
  try {
    const { item } = await api(`/api/items/${key}`);
    if (state.selected !== key) return;
    const previous = state.detail;
    state.detail = item;
    // A new message in the conversation on screen counts as read, as long as the page is being looked at.
    if (document.visibilityState === 'visible') markRead(item);
    const els = chatFrame();
    if (!els.head.contains(document.activeElement)) renderHead(item, els);
    if (threadSignature(item) !== state.threadSig) renderThread(item, els);
    const typing = els.composer.contains(document.activeElement) && ['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName);
    if (composerSignature(item) !== state.composerSig && !typing) {
      renderComposer(item, els, { arriving: !!item.draft && item.draft.id !== previous?.draft?.id });
    }
    if (!$('#info').contains(document.activeElement)) renderInfo();
  } catch { /* keep what is on screen */ }
}

async function refreshAll() {
  await Promise.all([refreshStatus(), refreshList()]);
  await refreshDetail();
}

// ---- wiring ----------------------------------------------------------------------

$('#brand-mark').append(wheelMark());
$('#search-icon').append(icon('search'));
$('#sync').append(icon('refresh'));

for (const f of document.querySelectorAll('.filter')) {
  f.addEventListener('click', async () => {
    if (state.tab === f.dataset.tab) return;
    state.tab = f.dataset.tab;
    for (const t of document.querySelectorAll('.filter')) { t.classList.toggle('is-on', t === f); t.setAttribute('aria-pressed', t === f ? 'true' : 'false'); }
    await refreshList();
  });
}

/** Switches between the Dashboard and Marketplace sections. Each starts on its Waiting list with nothing open. */
async function showSection(section) {
  if (state.section === section) return;
  state.section = section;
  state.tab = 'waiting';
  state.q = '';
  $('#q').value = '';
  $('#q').placeholder = section === 'marketplace' ? 'Search name, car or message' : 'Search name, number or message';
  state.selected = null; state.detail = null; state.rewriteOpen = false; state.betterOpen = false; state.copied = null;
  state.list = [];
  state.counts = { waiting: state.sections[section] || 0, quiet: 0, other: 0 };
  for (const b of document.querySelectorAll('.section')) { const on = b.dataset.section === section; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  for (const f of document.querySelectorAll('.filter')) { const on = f.dataset.tab === 'waiting'; f.classList.toggle('is-on', on); f.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  $('#app').dataset.view = 'list';
  $('#chats').replaceChildren();
  renderStatus(); renderNotices(); renderCounts(); renderChat();
  const ok = await refreshList();
  if (ok && state.section === section && !narrow() && state.list.length && !state.selected) await open(state.list[0].key);
}
for (const b of document.querySelectorAll('.section')) b.addEventListener('click', () => showSection(b.dataset.section));

$('#q').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
$('#hours').addEventListener('change', (e) => { state.hours = Number(e.target.value); refreshList(); });

$('#sync').addEventListener('click', async () => {
  const b = $('#sync');
  b.disabled = true; b.classList.add('is-busy');
  try {
    state.status = await api('/api/sync', { body: {} });
    renderStatus(); renderNotices();
    await refreshList(); await refreshDetail();
    const last = inMarketplace() ? state.status.marketplace?.lastSync : state.status.lastSync;
    toast(last?.ok ? (inMarketplace() ? 'Marketplace checked' : 'Dashboard checked') : inMarketplace() ? 'The Marketplace inbox could not be reached' : 'The dashboard could not be reached');
  } catch (e) { toast(e.message); }
  finally { b.disabled = false; b.classList.remove('is-busy'); }
});

// Arrow keys move through the list, as in any messaging app. No motion on keyboard moves.
$('#chats').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = [...document.querySelectorAll('#chats .row')];
  const i = rows.indexOf(document.activeElement);
  const next = rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)];
  if (next) { e.preventDefault(); next.focus(); }
});

document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    if (state.infoOpen && (window.matchMedia('(max-width: 1180px)').matches || $('#info').contains(document.activeElement))) { toggleInfo(); $('.who')?.focus(); return; }
    if (!typing && narrow() && $('#app').dataset.view === 'chat') closeChat();
    return;
  }
  if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
});

(async function start() {
  await refreshStatus();
  const ok = await refreshList();
  if (ok && !narrow() && state.list.length) await open(state.list[0].key);
  else renderChat();
  setInterval(refreshAll, 20000);
  setInterval(renderStatus, 30000);
})();
