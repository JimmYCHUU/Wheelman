// Wheelman phone reader: reads the conversation list of Google Messages for web, and nothing else.
// It never clicks, types or sends, and it never opens a conversation, so nothing is marked read on
// the phone. What it reads goes to Wheelman on this computer through background.js.
//
// The element names below are the page's own. Google changes them now and then. If the list cannot
// be read, the add-on's popup says so, and "Copy page details" gives the shape of the page (element
// names only, no words) so this table can be corrected.
const SEL = {
  listItem: 'mws-conversation-list-item',
  link: 'a[href*="/conversations/"]',
  name: '[data-e2e-conversation-name], .name',
  snippet: '[data-e2e-conversation-snippet], .snippet-text, .snippet',
  when: 'mws-relative-timestamp, [data-e2e-conversation-timestamp]',
  unread: '[data-e2e-is-unread="true"], .unread',
  signedOut: 'mw-qr-code, mw-authentication-container, mw-google-sign-in, mw-landing-page, [data-e2e-qr-code]',
};
const MAX_ITEMS = 100;

let parse = null;
async function parser() {
  if (!parse) parse = await import(chrome.runtime.getURL('parse.js'));
  return parse;
}

const text = (el) => (el ? String(el.innerText ?? el.textContent ?? '') : '').replace(/\s+/g, ' ').trim();

/** The conversations the page has drawn. The list is long only on screen: the newest ones are at the top. */
function listItems() {
  const items = [...document.querySelectorAll(SEL.listItem)];
  if (!items.length) {
    // The page may have renamed its list item: fall back to the links that lead to conversations.
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href*="/web/conversations/"]')) {
      const box = a.closest('[role="listitem"], li') || a;
      if (!seen.has(box)) { seen.add(box); items.push(box); }
    }
  }
  return items.slice(0, MAX_ITEMS);
}

function readItem(el) {
  const link = el.matches(SEL.link) ? el : el.querySelector(SEL.link);
  const href = (link && link.getAttribute('href')) || '';
  const ref = (href.match(/conversations\/([^/?#]+)/) || [])[1] || '';
  const nameEl = el.querySelector(SEL.name);
  const snippetEl = el.querySelector(SEL.snippet);
  const whenEl = el.querySelector(SEL.when);
  let name = text(nameEl);
  let snippet = text(snippetEl);
  const when = text(whenEl);
  const whenTitle = (whenEl && (whenEl.getAttribute('title') || whenEl.getAttribute('aria-label'))) || '';
  if (!name || !snippet) {
    // Without the expected parts: the lines of text in order, the name first, the message after, the time apart.
    const lines = String(el.innerText || '').split('\n').map((s) => s.trim()).filter((s) => s && s !== when);
    if (!name) name = lines.shift() || '';
    if (!snippet) snippet = lines.join(' ');
  }
  const label = (link && link.getAttribute('aria-label')) || '';
  const unread = !!(el.querySelector(SEL.unread) || el.matches(SEL.unread) || /\bunread\b/i.test(el.className) || /\bunread\b/i.test(label));
  return { ref, name, snippet, when, whenTitle, unread };
}

async function readAll() {
  const p = await parser();
  const now = Date.now();
  const items = listItems();
  const threads = [];
  for (const el of items) {
    const raw = readItem(el);
    if (!raw.name || !raw.snippet) continue;
    threads.push(p.parseListItem(raw, { now }));
  }
  return {
    v: 1,
    seenAt: now,
    hidden: document.hidden,
    path: location.pathname,
    signedOut: /^\/web\/(authentication|welcome|signin)/.test(location.pathname) || !!document.querySelector(SEL.signedOut),
    found: { listItems: items.length, parsed: threads.length },
    threads,
  };
}

/** The shape of the page: element names and the attributes that name things. No words from any message. */
function shape(el, depth = 0) {
  if (!el || depth > 7) return '';
  const attrs = [...el.attributes].map((a) => {
    if (a.name === 'class') return `class=${a.value.split(/\s+/).filter(Boolean).slice(0, 4).join('.')}`;
    if (/^(data-e2e-|role$|aria-)/.test(a.name)) return a.name;
    return a.name;
  }).join(' ');
  const kids = [...el.children].slice(0, 12).map((k) => shape(k, depth + 1)).filter(Boolean);
  return `${el.tagName.toLowerCase()}${attrs ? ` [${attrs}]` : ''}${kids.length ? ` { ${kids.join(' ; ')} }` : ''}`;
}

function pageShape() {
  const items = listItems();
  const root = items[0] || document.querySelector('main, mw-main-container, mw-app') || document.body;
  return { path: location.pathname, listItems: items.length, shape: shape(root).slice(0, 8000) };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'read') { readAll().then(reply, (e) => reply({ v: 1, seenAt: Date.now(), error: String(e && e.message || e), found: { listItems: 0, parsed: 0 }, threads: [] })); return true; }
  if (msg && msg.type === 'shape') { reply(pageShape()); return false; }
  return false;
});
