// Wheelman's "Send to Wheelman" button for Gmail. When pressed, it reads the conversation that is
// open on the page (the subject, and each message's sender, time and text) and hands it to Wheelman
// on this computer, for the Import Query section. It reads only when pressed. It never clicks,
// never marks anything read, and never types or sends anything in Gmail.
//
// The element names below are Gmail's own, which Google changes now and then. If the open email
// cannot be read, the button says so, and "Copy page details" copies the shape of the page (element
// names only, no words) so this table can be corrected.
const SEL = {
  main: 'div[role="main"]',
  subject: 'h2[data-thread-perm-id], h2.hP, [data-thread-perm-id] h2',
  threadRef: '[data-thread-perm-id]',
  message: 'div[data-message-id], div.adn',
  from: 'span.gD[email], h3 span[email], span[email][name]',
  to: 'span.g2[email], .hb span[email]',
  date: 'span.g3',
  body: 'div.a3s',
  quoted: '.gmail_quote, blockquote, .gmail_attr, .adL, .im, .h5',
  attachment: 'span.aZo, .aV3',
};
const LABEL = 'Send to Wheelman';
const SHOW_FOR_MS = 8000;

let parse = null;
async function parser() {
  if (!parse) parse = await import(chrome.runtime.getURL('mailparse.js'));
  return parse;
}
let shaper = null;
async function describe() {
  if (!shaper) shaper = await import(chrome.runtime.getURL('shape.js'));
  return shaper;
}

const text = (el) => (el ? String(el.innerText ?? el.textContent ?? '') : '');

// The body as plain text, with line breaks where the page breaks lines, and without the quoted
// history. Done by walking the nodes, so it needs no layout and changes nothing on the page.
const BLOCK = /^(div|p|li|tr|h[1-6]|blockquote|pre|table|ul|ol|section|article|address)$/;
function walk(node, out) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out.push(n.nodeValue); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || n.matches(SEL.quoted)) continue;
    if (tag === 'br') { out.push('\n'); continue; }
    const block = BLOCK.test(tag);
    if (block) out.push('\n');
    walk(n, out);
    if (block) out.push('\n');
  }
}
function bodyText(el) {
  const out = [];
  walk(el, out);
  return out.join('').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function messageContainers() {
  const main = document.querySelector(SEL.main) || document;
  const seen = new Set();
  const out = [];
  for (const el of main.querySelectorAll(SEL.message)) {
    // A container inside another container is the same message drawn twice.
    if ([...seen].some((s) => s.contains(el))) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

function readMessage(el) {
  const ref = el.getAttribute('data-message-id') || el.querySelector('[data-message-id]')?.getAttribute('data-message-id') || '';
  const fromEl = el.querySelector(SEL.from);
  const dateEl = el.querySelector(SEL.date);
  const bodyEl = el.querySelector(SEL.body);
  return {
    ref,
    fromText: text(fromEl),
    fromEmail: (fromEl && fromEl.getAttribute('email')) || '',
    fromName: (fromEl && fromEl.getAttribute('name')) || '',
    to: [...el.querySelectorAll(SEL.to)].map((r) => ({ text: r.textContent, email: r.getAttribute('email') || '' })),
    dateTitle: (dateEl && (dateEl.getAttribute('title') || dateEl.getAttribute('data-tooltip'))) || '',
    dateText: text(dateEl),
    bodyText: bodyEl ? bodyText(bodyEl) : '',
    collapsed: !bodyEl,
    attachments: el.querySelectorAll(SEL.attachment).length,
  };
}

/** The conversation open on the page, as mailparse.js wants it. */
function readOpenThread() {
  const containers = messageContainers();
  const subjectEl = document.querySelector(SEL.subject);
  const refEl = document.querySelector(SEL.threadRef);
  const threadRef = (refEl && (refEl.getAttribute('data-thread-perm-id') || refEl.getAttribute('data-legacy-thread-id'))) || (location.hash.match(/[A-Za-z0-9_-]{12,}$/) || [])[0] || '';
  return { threadRef, subject: text(subjectEl), containers: containers.length, messages: containers.map(readMessage) };
}

// ---- the button -------------------------------------------------------------------------------

let host = null, button = null, link = null, busy = false, revert = null;

function mount() {
  if (host) return;
  host = document.createElement('div');
  host.id = 'wheelman-send';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
            font: 600 14px/1.3 system-ui, "Segoe UI", Arial, sans-serif; }
    button { border: 0; border-radius: 999px; padding: 10px 16px; background: #0073ea; color: #fff; cursor: pointer; font: inherit; box-shadow: 0 2px 8px rgba(0, 0, 0, .25); }
    button:disabled { opacity: .75; cursor: default; }
    button.ok { background: #1b7f3b; }
    button.bad { background: #b3261e; }
    a { color: #0b3d7a; background: #fff; border-radius: 6px; padding: 4px 8px; font-size: 12px; text-decoration: underline; cursor: pointer; box-shadow: 0 1px 4px rgba(0, 0, 0, .2); }
    a[hidden] { display: none; }`;
  button = document.createElement('button');
  button.type = 'button';
  button.textContent = LABEL;
  button.addEventListener('click', send);
  link = document.createElement('a');
  link.textContent = 'Copy page details';
  link.hidden = true;
  link.addEventListener('click', copyShape);
  root.append(style, button, link);
  document.documentElement.append(host);
}

function show(words, tone = '', { stay = false, help = false } = {}) {
  clearTimeout(revert);
  button.textContent = words;
  button.className = tone;
  button.disabled = stay;
  link.hidden = !help;
  if (!stay) revert = setTimeout(() => { button.textContent = LABEL; button.className = ''; link.hidden = true; }, SHOW_FOR_MS);
}

function problemWords(out) {
  if (!out) return 'The add-on did not answer. Reload the add-on and try again';
  if (out.problem === 'no-wheelman') return 'Wheelman is not running on this computer';
  if (out.problem === 'refused') return `Wheelman refused it: ${out.error || 'no reason given'}`;
  return `Something went wrong: ${out.error || 'no detail'}`;
}

async function send() {
  if (busy) return;
  busy = true;
  show('Sending…', '', { stay: true });
  try {
    const p = await parser();
    const raw = readOpenThread();
    if (!raw.messages.length) { show('Could not read this email', 'bad', { help: true }); return; }
    const report = p.buildMailReport(raw, { now: Date.now() });
    const out = await chrome.runtime.sendMessage({ type: 'sendMail', report });
    if (!out || !out.ok) { show(problemWords(out), 'bad', { help: out && out.problem === 'refused' }); return; }
    const n = report.messages.length;
    const folded = report.found.collapsed;
    show(`Sent to Wheelman · ${n} message${n === 1 ? '' : 's'}${folded ? ` · ${folded} folded: press Expand all and send again` : ''}`, 'ok');
  } catch (e) {
    show(`Could not read this email (${String((e && e.message) || e)})`, 'bad', { help: true });
  } finally {
    busy = false;
    button.disabled = false;
  }
}

async function pageShape() {
  const containers = messageContainers();
  const root = containers[0] || document.querySelector(SEL.main) || document.body;
  return (await describe()).pageShape(root, { hash: location.hash.replace(/[A-Za-z0-9_-]{12,}/g, 'ID'), containers: containers.length });
}

async function copyShape() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(await pageShape(), null, 1));
    show('Copied the page details. Paste them where the reader is being fixed', 'ok');
  } catch {
    show('The clipboard could not be used', 'bad');
  }
}

// The button is there only while a conversation is open. Gmail is one page that changes under us,
// so a light check once a second decides, with no watching of Gmail's whole tree.
function tick() {
  mount();
  host.style.display = document.querySelector(SEL.message) ? '' : 'none';
}
setInterval(tick, 1000);
window.addEventListener('hashchange', tick);
tick();

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'mailShape') { pageShape().then(reply, (e) => reply({ error: String((e && e.message) || e) })); return true; }
  return false;
});
