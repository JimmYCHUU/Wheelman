// An auction order on the new page: its message box, the messages it can be written from, the strip
// above the conversation and the Order tab, in the old page's words (web/app.js renderOrderComposer,
// renderHead and orderInfo). Pure functions (no DOM, no globals) beside model.js, which the tests
// import in Node. Nothing is learned from an order, and nothing here sends: an order's reply is copied.
import { clock, listTime, ago, money, km } from '../../lib/format.js';
import { t } from '../../lib/copy.js';

const PUT_BACK = { label: 'Put back in To do', act: 'restore', main: false };
const TRY_AGAIN = { label: 'Try again', act: 'retry', main: true };
const WRITE_NOW = { label: 'Write it now', act: 'write', main: true };

/** An address that is a web page (http or https), else ''. */
const web = (url) => (/^https?:\/\//i.test(String(url || '')) ? String(url) : '');

/** The name of the message in the box, '' for a reply to what they wrote. */
const inBox = (o) => (o.replying ? '' : ((o.messages || []).find((m) => m.type === o.message) || {}).label || '');

/**
 * What the message box shows for an auction order, as boxView does for a conversation: the editor,
 * or one sentence with at most one button (act names what it does) and whether Tell Wheelman goes
 * with it. picked: the message picked from the picker (state.picked), null for none. done: copied
 * from this page (the local mark), at doneAt. The editor view's label is the message's name.
 * Writing first, then typed text (never hidden: a failure is told beside it), then copied here,
 * then the message that was due copied or dismissed (or none due) unless one was picked or they
 * wrote to us, then the suggestion, a failure with Try again, or Write it now.
 */
export function orderBox({ item, picked = null, done = false, doneAt = null, writing = false, typed = false } = {}) {
  if (!item) return { kind: 'none' };
  const o = item.order || {};
  const d = item.draft || null;
  const say = (sentence, button = null, more = {}) => ({ kind: 'quiet', tone: '', sentence, button, tell: false, ...more });
  const failed = !!d && d.status === 'failed';
  const failure = failed ? d.error || 'This message could not be written.' : '';
  const kept = typed || (failed && typeof d.edited === 'string' && d.edited.trim() !== '');

  if (writing) return { kind: 'writing' };
  if (kept) return { kind: 'editor', context: '', label: inBox(o), ...(failure ? { failure: failure + ' Your text is kept.' } : {}) };
  if (done) return say(doneAt ? 'Copied at ' + clock(doneAt) + '.' : 'Copied.', PUT_BACK, { tone: 'good' });
  if (item.writing) return { kind: 'writing' };
  if (!o.replying && !picked && (o.handled || item.state !== 'awaiting')) {
    if (o.handled === 'copied') return say('You copied the message that was due. It is shown in the conversation above.', PUT_BACK);
    if (o.handled === 'dismissed') return say('You dismissed the message that was due.', PUT_BACK);
    if (o.finished) return say('This order is finished. No message is due.');
    return say('No message is due for this order right now. Choose a message to write it anyway.');
  }
  if (d && d.status === 'ready') return { kind: 'editor', context: '', label: inBox(o) };
  if (failed) return say(failure, TRY_AGAIN, { tone: 'bad', tell: true });
  return say(o.replying ? 'They wrote to us. A reply has not been written yet.' : (o.why || 'A message is due.') + ' It is being prepared.', WRITE_NOW, { tell: true });
}

/**
 * The messages an order can be written from, in the server's order (the due one first, its label
 * ending " · due"), as { id, label }. While they wrote to us and another message is in hand, the
 * reply to what they wrote (id '') comes first.
 */
export function orderOptions(item) {
  const o = item.order || {};
  const reply = item.dueKind === 'reply' && !!o.message ? [{ id: '', label: 'A reply to what they wrote' }] : [];
  return [...reply, ...(o.messages || []).map((m) => ({ id: m.type, label: m.label + (m.due ? ' · due' : '') }))];
}

/** The id of a message pasted into an order (what they wrote, or what we sent), which Remove takes out; null for any other. */
export function pastedId(item, m) {
  if (!item || !item.order || !m) return null;
  const k = /^(?:in|po):(\d+)$/.exec(String(m.key || ''));
  return k ? k[1] : null;
}

/** The strip above an order's conversation: the car, where the order has got to, the deposit, and the auction car's page. */
export function orderStrip(item) {
  const o = item.order || {};
  const deposit = o.deposit && o.deposit.state ? 'Deposit: ' + String(o.deposit.state).toLowerCase() : '';
  return { title: item.car || 'No car named yet', stage: o.stage || '', finished: !!o.finished, deposit, url: web(o.lot && o.lot.url) || web(o.found && o.found.url) };
}

/**
 * The Order tab: [{ title, rows: [[label, value]], notes, link, move }], the old page's sections
 * and words. Empty rows are left out, and a section with nothing to show. link: the auction car's
 * page ({ label, text, url }, a web address only); move: Their texts' button ({ label, section }).
 */
export function orderSections(o, now = Date.now()) {
  const day = (ms) => (ms ? listTime(ms, now) : '');
  const yen = (n) => (n ? '¥' + Number(n).toLocaleString('en-AU') : '');
  const page = (url) => (web(url) ? { label: 'Page', text: 'Open on the website', url: web(url) } : null);
  const out = [];
  const add = (title, rows, notes = [], extra = {}) => {
    const s = { title, rows: rows.filter(([, v]) => v !== '' && v !== null && v !== undefined), notes: notes.filter(Boolean), link: null, move: null, ...extra };
    if (s.rows.length || s.notes.length || s.link || s.move) out.push(s);
  };
  const dep = o.deposit || {};
  const dates = o.dates || {};
  const note = o.staffNote ? 'Latest staff note: ' + o.staffNote.text + (o.staffNote.at ? ' (' + day(o.staffNote.at) + ')' : '') : '';
  add('Auction order', [
    ['Order', o.orderNo], ['Stage', o.stage], ['To do', o.due],
    ['Deposit', [dep.state, dep.paid ? money(dep.paid) : dep.asked ? money(dep.asked) + ' asked' : ''].filter(Boolean).join(', ')],
    ['Dashboard says', o.followUp], ['Opened', day(dates.opened)], ['Car secured', day(dates.secured)], ['Completed', day(dates.completed)],
  ], [o.why, note]);
  const w = o.wanted || {};
  add('Looking for, from Japan', [['Car', w.car], ['Variant', w.variant], ['Target bid', yen(w.targetBidYen)], ['Budget', w.budget ? 'about ' + money(w.budget) + ' landed' : '']], [w.notes]);
  const lot = o.lot;
  if (lot) {
    add('Auction car on this order', [['Car', lot.title], ['Odometer', km(lot.km)], ['Auction grade', lot.grade],
      ['Auction', [lot.auctionDate, lot.auctionHouse, lot.lotNumber ? 'lot ' + lot.lotNumber : ''].filter(Boolean).join(', ')]], [], { link: page(lot.url) });
  }
  const f = o.found;
  if (f) {
    add('Found in the coming auctions', [['Car', f.title], ['Odometer', km(f.km)], ['Auction grade', f.grade], ['Auction', f.auctionDate ? String(f.auctionDate).slice(0, 10) : '']],
      [f.seenAt ? 'The best match when the live auction was last looked at, ' + ago(f.seenAt, now) + '.' : ''], { link: page(f.url) });
  }
  const c = o.car;
  if (c) {
    add('Car secured', [['Car', c.title], ['Odometer', km(c.km)], ['Auction grade', c.grade], ['Colour', c.colour ? String(c.colour).toLowerCase() : ''],
      ['Where it is', c.where], ['Stock number', c.stockNo]]);
  }
  const m = o.money || {};
  const lines = m.lines || [];
  const payments = m.payments || [];
  if (lines.length || payments.length) {
    add('Charged and paid', [
      ...lines.map((l) => [l.description, money(l.amount)]),
      ['Total charged', m.total ? money(m.total) : ''], ['Paid', m.paid ? money(m.paid) : ''], ['Still due', m.due > 0 ? money(m.due) : m.total ? 'Nothing' : ''],
    ], [payments.length ? 'Payments: ' + payments.map((p) => money(p.amount) + ' on ' + day(p.at)).join(', ') + '.' : '']);
  }
  // Their own conversation on the dashboard: answered on this order, or in Dashboard.
  if (o.texts) {
    const here = !!o.texts.here;
    add(t('order.texts.title'), [], [t(here ? 'order.texts.here' : 'order.texts.elsewhere')],
      { move: { label: t(here ? 'order.texts.toDashboard' : 'order.texts.toOrder'), section: here ? 'dashboard' : 'auction' } });
  }
  return out;
}
