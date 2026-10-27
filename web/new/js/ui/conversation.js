// The conversation: who it is with, the car, and the messages. Everything from a message is shown as
// text; only an http or https address becomes a link.
import { html, useState, useRef, useLayoutEffect, useEffect } from './html.js';
import { whoLabel } from '../model.js';
import { hashFor } from '../route.js';
import { visibleRows } from '../store.js';
import { MenuButton } from './menu.js';
import { clock, dayKey, dayLabel, money, km, plural } from '../../../lib/format.js';

const WELCOME = 'Choose a customer on the left.';
/** The conversation column's words when it could not be opened; the panel says the same. */
export const OPEN_FAILED = 'This conversation could not be opened.';
const NEAR_BOTTOM = 80;

/** Text in pieces: plain text, and the web addresses in it as links. */
export function linked(text) {
  const out = [];
  let at = 0;
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"]+/g)) {
    const url = m[0].replace(/[.,;:!?)\]'"]+$/, '');
    let ok = false;
    try { ok = /^https?:$/.test(new URL(url).protocol); } catch { ok = false; }
    if (!ok) continue;
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(html`<a href=${url} target="_blank" rel="noopener noreferrer">${url}</a>`);
    at = m.index + url.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : '');

function Head({ state, actions, details }) {
  const item = state.item;
  const name = item.name || item.phone || item.email || 'Unknown number';
  const back = () => { location.hash = hashFor({ section: state.section, chip: state.chip }); };
  const sub = item.writing ? 'Writing a suggestion…' : item.situation || '';
  return html`<div class="chat-head">
    <button type="button" class="btn quiet back" onClick=${back} aria-label="Back to the list">‹ List</button>
    <div class="title">
      <h2 class="name">${name}</h2>
      <div class="line2" role="status">${sub}</div>
    </div>
    <${MenuButton} label="More" items=${[
      { label: 'Dismiss', hint: 'No reply needed. You can undo it.', run: actions.dismiss },
      item.followUp && { label: 'Dismiss this follow-up', run: actions.dismissFollowUp },
      item.phone ? { label: 'Copy number', hint: item.phone, run: actions.copyNumber }
        : item.email && { label: 'Copy email', hint: item.email, run: actions.copyEmail },
    ]} />
    <button type="button" class="btn quiet details" aria-expanded=${details.open} aria-controls="deal-panel" onClick=${details.toggle}>Details</button>
  </div>`;
}

/** The car, with how many photos it has (once read): pressing that opens the panel's Car tab. */
function CarStrip({ vehicle, details }) {
  const v = vehicle;
  const facts = [money(v.price), km(v.odometer), v.availability && v.availability.text].filter(Boolean).join(' · ');
  const url = safeUrl(v.url);
  const m = details.media[String(v.stockNo)];
  const shots = m && m.photos ? m.photos.filter((p) => p.group === 'car').length || m.photos.length : 0;
  return html`<div class="carstrip">
    <div class="info">
      <div class="car-title"><b>${v.title}</b>${v.stockNo ? html` <span class="note">Stock ${v.stockNo}</span>` : null}</div>
      <div class="facts num">${facts}</div>
    </div>
    <button type="button" class="btn small" onClick=${details.photos}>${shots ? plural(shots, 'photo') : 'Photos'}</button>
    ${url ? html`<a class="btn small listing" href=${url} target="_blank" rel="noopener noreferrer">Open listing</a>` : null}
  </div>`;
}

function Photos({ message, side }) {
  if (!message.photos || !/^m:\d+$/.test(message.key)) return null;
  const id = message.key.slice(2);
  return Array.from({ length: message.photos }, (_, i) => {
    const src = '/api/media/' + id + '/' + i;
    return html`<a class="photo-link" key=${i} href=${src} target="_blank" rel="noopener noreferrer" title="Open the photo full size">
      <img class="photo" src=${src} alt=${side === 'us' ? 'Photo we sent' : 'Photo from the customer'} loading="lazy" />
    </a>`;
  });
}

function Message({ m, name }) {
  if (m.internal && m.text) {
    return html`<div class="pill note">Staff note${m.by ? ' by ' + m.by : ''}: ${m.text}<span class="when">${clock(m.at)}</span></div>`;
  }
  const parts = [];
  if (m.event) parts.push(html`<div class="pill event" key="e">${m.event}<span class="when">${clock(m.at)}</span></div>`);
  if (m.event && !m.text && !m.media) return parts;
  const side = m.who === 'us' ? 'us' : 'them';
  const hasPhotos = m.photos && /^m:\d+$/.test(m.key);
  parts.push(html`<div class=${'bubble ' + (m.auto ? 'auto' : side) + (m.phone ? ' phone' : '')} key="b">
    <span class="from">${whoLabel(m, name)}</span>
    <${Photos} message=${m} side=${side} />
    ${m.media && !hasPhotos ? html`<span class="media">${m.media === 'photo' ? 'Photo' : 'Attachment'}</span>` : null}
    ${m.text ? html`<span class="text">${linked(m.text)}</span>` : null}
    <span class="by">${clock(m.at)}</span>
  </div>`);
  return parts;
}

function Thread({ item, name, now, older }) {
  const box = useRef(null);
  const keep = useRef({ key: null, first: null, fromBottom: 0, stuck: true });
  const [busy, setBusy] = useState(false);
  const thread = item.thread || [];
  const first = thread.length ? thread[0].key : null;

  // After every draw: a new conversation goes to the bottom; older messages arriving in front leave
  // what was on screen where it was; otherwise stay at the bottom unless the person scrolled up.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const k = keep.current;
    if (k.key !== item.key) { el.scrollTop = el.scrollHeight; k.stuck = true; }
    else if (k.first !== first && k.first !== null && first !== null && thread.some((m) => m.key === k.first)) el.scrollTop = el.scrollHeight - k.fromBottom;
    else if (k.stuck) el.scrollTop = el.scrollHeight;
    k.key = item.key;
    k.first = first;
    k.fromBottom = el.scrollHeight - el.scrollTop;
  });

  const onScroll = () => {
    const el = box.current;
    if (!el) return; // a scroll that arrives as the conversation is being replaced
    const k = keep.current;
    k.stuck = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    k.fromBottom = el.scrollHeight - el.scrollTop;
  };
  // A photo that finishes loading makes the thread taller: stay at the bottom if we were there.
  const onImage = () => { if (keep.current.stuck && box.current) box.current.scrollTop = box.current.scrollHeight; };
  const loadOlder = async () => { setBusy(true); try { await older(); } finally { setBusy(false); } };

  const out = [];
  let day = '';
  for (const m of thread) {
    const d = m.at ? dayKey(m.at) : '';
    if (d !== day) { day = d; if (m.at) out.push(html`<div class="day" key=${'d' + m.key}>${dayLabel(m.at, now)}</div>`); }
    out.push(html`<${Message} key=${m.key} m=${m} name=${name} />`);
  }
  return html`<div class="thread" ref=${box} role="log" aria-label="Messages" onScroll=${onScroll} onLoadCapture=${onImage}>
    ${item.earlier > 0 ? html`<button type="button" class="btn more-older" disabled=${busy} onClick=${loadOlder}>Load older messages<span class="num">${item.earlier} more</span></button>` : null}
    ${out}
  </div>`;
}

/** The reply run, above the conversation: where it is (announced as it changes), Skip and End run. */
function RunBar({ run, actions }) {
  return html`<div class="runbar" role="group" aria-label="Reply run">
    <span class="run-place" role="status">Reply run · <span class="num">${run.at} of ${run.of}</span></span>
    <button type="button" class="btn small quiet" onClick=${() => actions.skipRun()}>Skip</button>
    <button type="button" class="btn small quiet" onClick=${() => actions.endRun()}>End run</button>
  </div>`;
}

/**
 * The end of a reply run: its one sentence, Start again while more are waiting on the list, and Back
 * to the list. The first button takes the focus and reads the sentence with its name, once.
 */
function RunEnd({ state, actions }) {
  const first = useRef(null);
  useEffect(() => { if (first.current) first.current.focus(); }, []);
  const again = state.runMore > 0 && visibleRows(state).length > 0;
  const back = () => { actions.endRun(); location.hash = hashFor({ section: state.section, chip: state.chip }); };
  return html`<div class="chat-body run-end">
    <p class="run-words" id="run-words">${state.runSummary}</p>
    <div class="run-acts">
      ${again ? html`<button type="button" class="btn" ref=${first} aria-describedby="run-words" onClick=${() => actions.startRun()}>Start again</button>` : null}
      <button type="button" class="btn" ref=${again ? null : first} aria-describedby=${again ? null : 'run-words'} onClick=${back}>Back to the list</button>
    </div>
  </div>`;
}

/** details: the panel as the conversation sees it: { open, media, toggle(), photos() } (web/new/js/ui/app.js). */
export function Conversation({ state, actions, now, details }) {
  if (state.runSummary) return html`<${RunEnd} state=${state} actions=${actions} />`;
  // The run bar comes first whatever is below it, so it stays on screen while the next customer opens.
  const bar = state.run ? html`<${RunBar} run=${state.run} actions=${actions} />` : null;
  if (!state.key) return html`${bar}<div class="chat-body"><p class="empty">${WELCOME}</p></div>`;
  if (state.itemState === 'error') return html`${bar}<div class="chat-body"><p class="empty" role="alert">${OPEN_FAILED}</p></div>`;
  const item = state.item;
  if (!item) return html`${bar}<div class="chat-body"><p class="empty" role="status">Opening…</p></div>`;
  const name = item.name || item.phone || item.email || 'Customer';
  return html`${bar}<${Head} state=${state} actions=${actions} details=${details} />
    ${item.vehicle ? html`<${CarStrip} vehicle=${item.vehicle} details=${details} />` : null}
    <${Thread} item=${item} name=${name} now=${now} older=${actions.older} key=${state.key} />`;
}
