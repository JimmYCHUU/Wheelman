// The enquiry type on the new page: one property of a conversation, with its reason line, in the
// conversation's More menu (Stock enquiry, Import enquiry, Not a customer). Choosing one rules and
// moves it, the page follows it, Undo puts it back, and typed text is never written over. Pure
// functions and the store with a fake server; invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeView, typeRequest, typeUndo, listedWords, typeLine } from '../web/new/js/enquiry.js';
import { goToHash } from '../web/new/js/hashsync.js';
import { boxViewOf } from '../web/new/js/boxsections.js';
import { setup, row, draft, settle, paths } from './support/newpage-fakes.js';

const text = (o = {}) => ({ key: 'c:1', anchor: 'a-c:1', state: 'awaiting', channel: 'sms', section: 'dashboard', home: 'dashboard', moved: null, listed: '',
  isImport: false, judged: null, ruling: null, phone: '0491 570 101', situation: 'Asking about a car', draft: draft(11), ...o });
const chat = (o = {}) => ({ key: 'mp:5', anchor: 'a-mp:5', state: 'awaiting', channel: 'marketplace', section: 'marketplace', home: 'marketplace', moved: null, listed: '',
  isImport: false, judged: null, ruling: null, marketplace: { id: 5, account: 'Yard phone 1' }, draft: draft(15), ...o });
// An email is never ruled: the server reads it as an import enquiry by where it is listed (imports: null).
const email = (o = {}) => ({ key: 'em:1', anchor: 'a-em:1', state: 'awaiting', channel: 'email', section: 'importquery', home: 'importquery', moved: null, listed: '',
  isImport: false, judged: null, ruling: null, mail: { subject: 'Importing a Toyota Hiace GDH206' }, draft: draft(21), ...o });
const order = { key: 'ao:3', anchor: 'a-ao:3', state: 'awaiting', channel: 'whatsapp', section: 'auction', home: 'auction', order: { orderNo: 'A-1003' }, draft: null };

const WORDS = { sign: 'words', why: 'they ask for a car found in Japan', car: '', quote: 'Hi, can you import a Toyota Hiace from Japan for me?' };
const CODE = { sign: 'code', why: 'the model code GDH206 is on our import list (Toyota Hiace GDH206)', car: 'Toyota Hiace GDH206', quote: '' };

/** The store with these conversations on the list, the first one open. */
async function opened(items) {
  const a = setup();
  a.data.rows = items.map((i) => row(i.key));
  Object.assign(a.data.items, Object.fromEntries(items.map((i) => [i.key, i])));
  await a.store.actions.refresh();
  await a.store.actions.open(items[0].key);
  return a;
}

/**
 * The server, for one conversation: a ruling or a move does what it asks (the section, the ruling, an
 * import enquiry when ruled one), and answers with the conversation as it is then. Each post is
 * logged with its body and the beacons that had gone out before it.
 */
function serves(a, key, { writing = false } = {}) {
  const posts = [];
  const natural = a.data.items[key].isImport;
  const change = (path) => (body) => {
    posts.push({ path, body, beacons: [...a.beacons] });
    const was = a.data.items[key];
    const section = body.section || was.section;
    const ruling = body.kind === undefined ? was.ruling : body.kind ? { kind: body.kind } : null;
    const isImport = ruling ? ruling.kind === 'import' : natural;
    a.data.items[key] = { ...was, section, ruling, isImport, moved: section !== was.home ? section : null, listed: section !== was.home ? 'moved' : '', writing: writing && !body.keep };
    return { ok: true, item: a.data.items[key], writing: writing && !body.keep };
  };
  a.data.on = { ...(a.data.on || {}), ['/api/items/' + key + '/ruling']: change('ruling'), ['/api/items/' + key + '/move']: change('move') };
  return posts;
}

const changes = (a) => a.calls.filter((c) => c.body !== undefined && /\/(ruling|move)$/.test(c.path)).map((c) => ({ path: c.path, body: c.body }));

test("the enquiry type and its choices follow the conversation's section and channel", () => {
  const choices = (v) => v.choices.map((c) => [c.type, c.label, c.hint, c.checked]);
  // A Dashboard text: a stock enquiry, answered in Dashboard.
  let v = typeView(text());
  assert.deepEqual([v.type, v.label, v.reason], ['stock', 'Stock enquiry', '']);
  assert.deepEqual(choices(v), [
    ['stock', 'Stock enquiry', 'Answered from the cars we have · Dashboard', true],
    ['import', 'Import enquiry', 'Answered with eligibility, landed cost and the deposit · Imports', false],
    ['notcustomer', 'Not a customer', 'Dismissed, with Undo. It stays under All.', false],
  ]);
  // Read as an import enquiry, it is one, though it is still listed in Dashboard.
  v = typeView(text({ isImport: true, judged: WORDS }));
  assert.deepEqual([v.type, v.label, v.choices.map((c) => c.checked)], ['import', 'Import enquiry', [false, true, false]]);
  // A Facebook chat: its stock enquiry is answered in Marketplace. Moved to Imports, it is an import enquiry there.
  v = typeView(chat());
  assert.deepEqual([v.type, v.choices[0].hint, v.choices[0].checked], ['stock', 'Answered from the cars we have · Marketplace', true]);
  v = typeView(chat({ section: 'importquery', moved: 'importquery' }));
  assert.deepEqual([v.type, v.choices[0].hint, v.choices[1].checked], ['import', 'Answered from the cars we have · Marketplace', true]);
  // An Imports email: an import enquiry. Moved to Dashboard, a stock enquiry.
  v = typeView(email());
  assert.deepEqual([v.type, v.label, v.choices.map((c) => c.checked)], ['import', 'Import enquiry', [false, true, false]]);
  assert.equal(v.choices[0].hint, 'Answered from the cars we have · Dashboard');
  assert.equal(typeView(email({ section: 'dashboard', moved: 'dashboard' })).type, 'stock');
  // An order has no type to choose.
  assert.deepEqual(typeView(order), { type: 'order', label: 'Auction order', reason: '', choices: [] });

  // The head line starts with the type only where it is not the section's own.
  assert.equal(typeLine(text()), '');
  assert.equal(typeLine(text({ isImport: true, judged: WORDS })), 'Import enquiry');
  assert.equal(typeLine(chat()), '');
  assert.equal(typeLine(chat({ section: 'importquery', moved: 'importquery' })), '');
  assert.equal(typeLine(email()), '');
  assert.equal(typeLine(email({ section: 'dashboard', moved: 'dashboard' })), '', "a stock enquiry, as Dashboard's own");
  assert.equal(typeLine(text({ section: 'auction', home: 'auction', listed: 'order' })), 'Stock enquiry', 'a text in Auction is not an order');
  assert.equal(typeLine(order), '');

  // Where it is listed, in the Customer tab.
  assert.equal(listedWords(chat({ section: 'importquery', moved: 'importquery', listed: 'moved' })), 'You moved it to Imports. It came in as Marketplace, and the reply still goes out the way it came in.');
  assert.equal(listedWords(email({ section: 'dashboard', moved: 'dashboard', listed: 'moved' })), 'You moved it to Dashboard. It came in as Imports, and the reply still goes out the way it came in.');
  assert.equal(listedWords(text({ section: 'importquery', home: 'importquery', listed: 'imports', isImport: true })), "Listed in Imports: it came from the dashboard's Imports list.");
  assert.equal(listedWords(text({ section: 'auction', home: 'auction', listed: 'order' })), 'Listed in Auction: this customer has an auction order under way.');
  assert.equal(listedWords(text({ ruling: { kind: 'general' } })), 'You said this is not an import enquiry. The reply is written the ordinary way.');
  assert.equal(listedWords(text({ ruling: { kind: 'import' }, isImport: true })), 'You said this is an import enquiry. The reply is written the import way.');
  assert.equal(listedWords(text({ isImport: true, judged: WORDS })), 'Wheelman reads this as an import enquiry: they ask for a car found in Japan.');
  assert.equal(listedWords(text()), '');
  assert.equal(listedWords(chat()), '');
});

test('the reason line quotes the customer\'s words while it is still in Dashboard, and nothing moves by itself', async () => {
  const reason = (o) => typeView(text(o)).reason;
  assert.equal(reason({ isImport: true, judged: WORDS }), 'Read as an import enquiry: they asked “Hi, can you import a Toyota Hiace from Japan for me?”. Choose Import enquiry in More to list it in Imports.');
  assert.equal(reason({ isImport: true, judged: CODE }), 'Read as an import enquiry: the model code GDH206 is on our import list (Toyota Hiace GDH206). Choose Import enquiry in More to list it in Imports.');
  assert.equal(reason({ draft: draft(11, { aiImport: true }) }), 'The AI thought this might be an import enquiry: a car to find in Japan, not one on the yard.');
  assert.equal(reason({}), '');
  // Once Jim has said (a ruling either way), or it is listed elsewhere, there is no reason line.
  assert.equal(reason({ isImport: true, judged: WORDS, ruling: { kind: 'import' } }), '');
  assert.equal(reason({ ruling: { kind: 'general' }, draft: draft(11, { aiImport: true }) }), '');
  assert.equal(reason({ isImport: true, judged: WORDS, section: 'importquery', moved: 'importquery' }), '');
  assert.equal(typeView(email({ section: 'dashboard', moved: 'dashboard', draft: draft(21, { aiImport: true }) })).reason, '', 'moved to Dashboard by Jim');
  assert.equal(typeView(chat({ draft: draft(15, { aiImport: true }) })).reason, '', 'in Marketplace');

  // Opened, read again and left for a minute: nothing is ruled or moved, and the page stays where it is.
  const a = await opened([text({ isImport: true, judged: WORDS })]);
  for (let i = 0; i < 3; i++) await a.store.actions.refresh();
  await a.timers.advance(60e3);
  assert.deepEqual(changes(a), []);
  const s = a.store.get();
  assert.deepEqual([s.goTo, s.section, s.item.section], [null, 'dashboard', 'dashboard']);
  assert.equal(typeView(s.item).reason, reason({ isImport: true, judged: WORDS }));
});

test('choosing Import enquiry rules and moves a text in one request, and an email or a Facebook chat moves', async () => {
  assert.deepEqual(typeRequest(text(), 'import'), { path: '/api/items/c:1/ruling', body: { kind: 'import', section: 'importquery' } });
  assert.deepEqual(typeRequest(text({ key: 'l:4' }), 'import'), { path: '/api/items/l:4/ruling', body: { kind: 'import', section: 'importquery' } });
  assert.deepEqual(typeRequest(text({ isImport: true, judged: CODE }), 'stock'), { path: '/api/items/c:1/ruling', body: { kind: 'general', section: 'dashboard' } }, 'read as one, and Jim says it is not');
  assert.deepEqual(typeRequest(text({ section: 'importquery', home: 'importquery', listed: 'imports', isImport: true }), 'stock'), { path: '/api/items/c:1/ruling', body: { kind: 'general', section: 'dashboard' } });
  assert.deepEqual(typeRequest(email(), 'stock'), { path: '/api/items/em:1/move', body: { section: 'dashboard' } });
  assert.deepEqual(typeRequest(chat(), 'import'), { path: '/api/items/mp:5/move', body: { section: 'importquery' } });
  assert.deepEqual(typeRequest(chat({ section: 'importquery', moved: 'importquery' }), 'stock'), { path: '/api/items/mp:5/move', body: { section: 'marketplace' } }, 'never into Dashboard: a Facebook chat goes home');
  // Nothing would change: no request.
  assert.equal(typeRequest(text(), 'stock'), null);
  assert.equal(typeRequest(text({ ruling: { kind: 'general' } }), 'stock'), null);
  assert.equal(typeRequest(text({ section: 'importquery', home: 'importquery', listed: 'imports', isImport: true }), 'import'), null);
  assert.equal(typeRequest(email(), 'import'), null);
  assert.equal(typeRequest(chat(), 'stock'), null);
  assert.equal(typeRequest(order, 'import'), null);
  assert.equal(typeRequest(order, 'stock'), null);
  assert.equal(typeRequest(text(), 'notcustomer'), null);

  // In the store: the text is ruled and moved in one request, and is in Imports.
  const a = await opened([text()]);
  serves(a, 'c:1');
  await a.store.actions.setType('import');
  assert.deepEqual(changes(a), [{ path: '/api/items/c:1/ruling', body: { kind: 'import', section: 'importquery' } }]);
  assert.deepEqual([a.store.get().item.section, a.store.get().item.ruling], ['importquery', { kind: 'import' }]);
  // Chosen again, nothing is asked.
  await a.store.actions.setType('import');
  assert.equal(changes(a).length, 1);
  // An email and a Facebook chat move.
  for (const [item, type, body] of [[email(), 'stock', { section: 'dashboard' }], [chat(), 'import', { section: 'importquery' }]]) {
    const b = await opened([item]);
    serves(b, item.key);
    await b.store.actions.setType(type);
    assert.deepEqual(changes(b), [{ path: '/api/items/' + item.key + '/move', body }], item.key);
    assert.equal(b.store.get().item.section, body.section, item.key);
  }
});

test('the page follows the conversation to its new section', async () => {
  const a = await opened([text()]);
  serves(a, 'c:1');
  await a.store.actions.setType('import');
  let s = a.store.get();
  assert.deepEqual(s.goTo, { section: 'importquery', chip: 'waiting', key: 'c:1', n: 1 });
  assert.deepEqual(goToHash(0, s), { hash: '#/importquery/waiting/c%3A1', n: 1 });
  assert.deepEqual([s.key, s.item.key], ['c:1', 'c:1'], 'the conversation stays open');
  assert.deepEqual([s.toast.message, s.toast.action.label], ['Moved to Imports.', 'Undo']);
  // Back to Dashboard as a stock enquiry: a conversation not waiting is followed to All.
  a.data.items['c:1'] = { ...a.data.items['c:1'], state: 'answered' };
  await a.store.actions.refresh();
  await a.store.actions.setType('stock');
  s = a.store.get();
  assert.deepEqual(s.goTo, { section: 'dashboard', chip: 'all', key: 'c:1', n: 2 });
  assert.equal(s.toast.message, 'Moved to Dashboard.');
  // A Facebook chat goes home to Marketplace.
  const b = await opened([chat({ section: 'importquery', moved: 'importquery' })]);
  serves(b, 'mp:5');
  await b.store.actions.setType('stock');
  assert.deepEqual(b.store.get().goTo, { section: 'marketplace', chip: 'waiting', key: 'mp:5', n: 1 });
  assert.equal(b.store.get().toast.message, 'Moved to Marketplace.');
  // Ruled with no move: it stays where it is, the page too, and the toast says how it is answered now.
  const c = await opened([text({ isImport: true, judged: CODE })]);
  serves(c, 'c:1');
  await c.store.actions.setType('stock');
  assert.deepEqual(changes(c), [{ path: '/api/items/c:1/ruling', body: { kind: 'general', section: 'dashboard' } }]);
  assert.equal(c.store.get().goTo, null);
  assert.equal(c.store.get().toast.message, 'Now answered as a stock enquiry.');
  const d = await opened([text({ section: 'importquery', home: 'importquery', listed: 'imports', ruling: { kind: 'general' } })]);
  serves(d, 'c:1');
  await d.store.actions.setType('import');
  assert.equal(d.store.get().toast.message, 'Now answered as an import enquiry.');
  // A request the server refuses says why, and the page stays.
  const e = await opened([text()]);
  e.data.on = { '/api/items/c:1/ruling': () => { throw new Error('That section is switched off.'); } };
  await e.store.actions.setType('import');
  assert.deepEqual([e.store.get().toast.message, e.store.get().goTo, e.store.get().item.section], ['That section is switched off.', null, 'dashboard']);
});

test('a type change that keeps the section keeps the chip and the open follow-up', async () => {
  // Opened from Follow-ups, with its follow-up in hand.
  const a = setup();
  a.data.rows = [row('c:1', { followUp: { id: 5, reason: 'Their inspection was yesterday' } })];
  a.data.items['c:1'] = text({ isImport: true, judged: CODE, anchor: 'fu:5', followUp: { id: 5, reason: 'Their inspection was yesterday' } });
  await a.store.actions.setChip('followups');
  const opens = () => paths(a.calls).filter((p) => p === 'POST /api/items/c:1/seen').length;
  assert.deepEqual([a.store.get().chip, a.store.get().key, opens()], ['followups', 'c:1', 1]);
  // Ruled not an import enquiry: it stays in Dashboard, so the page stays on Follow-ups with it open.
  serves(a, 'c:1');
  await a.store.actions.setType('stock');
  assert.deepEqual(changes(a), [{ path: '/api/items/c:1/ruling', body: { kind: 'general', section: 'dashboard' } }]);
  let s = a.store.get();
  assert.deepEqual([s.goTo, s.chip, s.key, s.item.ruling, opens()], [null, 'followups', 'c:1', { kind: 'general' }, 1]);
  assert.equal(s.toast.message, 'Now answered as a stock enquiry.');
  // Still asked for with its follow-up: nothing reopened it without.
  assert.equal(paths(a.calls).filter((p) => p.startsWith('GET /api/items/c:1')).at(-1), 'GET /api/items/c:1?followup=5');
  // Undo keeps them too.
  s.toast.action.run();
  await settle();
  s = a.store.get();
  assert.deepEqual([s.goTo, s.chip, s.key, s.item.ruling, opens()], [null, 'followups', 'c:1', null, 1]);
  assert.equal(paths(a.calls).filter((p) => p.startsWith('GET /api/items/c:1')).at(-1), 'GET /api/items/c:1?followup=5');
});

test('Undo puts the enquiry type and the section back as they were', async () => {
  assert.deepEqual(typeUndo(text()), { path: '/api/items/c:1/ruling', body: { kind: '', section: 'dashboard' } });
  assert.deepEqual(typeUndo(text({ ruling: { kind: 'general' } })), { path: '/api/items/c:1/ruling', body: { kind: 'general', section: 'dashboard' } });
  assert.deepEqual(typeUndo(email()), { path: '/api/items/em:1/move', body: { section: 'importquery' } });
  assert.deepEqual(typeUndo(chat()), { path: '/api/items/mp:5/move', body: { section: 'marketplace' } });

  // Ruled not an import enquiry before: Undo rules it so again, back in Dashboard, and the page goes with it.
  const a = await opened([text({ ruling: { kind: 'general' } })]);
  serves(a, 'c:1');
  await a.store.actions.setType('import');
  a.store.get().toast.action.run();
  await settle();
  assert.deepEqual(changes(a).at(-1), { path: '/api/items/c:1/ruling', body: { kind: 'general', section: 'dashboard' } });
  let s = a.store.get();
  assert.deepEqual([s.item.section, s.item.ruling, s.item.isImport], ['dashboard', { kind: 'general' }, false]);
  assert.equal(s.toast.message, 'Put back as it was.');
  assert.deepEqual(s.goTo, { section: 'dashboard', chip: 'waiting', key: 'c:1', n: 2 });
  // An email moved to Dashboard goes back to Imports.
  const b = await opened([email()]);
  serves(b, 'em:1');
  await b.store.actions.setType('stock');
  b.store.get().toast.action.run();
  await settle();
  assert.deepEqual(changes(b), [{ path: '/api/items/em:1/move', body: { section: 'dashboard' } }, { path: '/api/items/em:1/move', body: { section: 'importquery' } }]);
  assert.deepEqual([b.store.get().item.section, b.store.get().goTo.section, b.store.get().goTo.n], ['importquery', 'importquery', 2]);

  // Undo after another conversation was opened: put back on the server, and the page stays where Jim is.
  const c = await opened([text(), text({ key: 'c:2', anchor: 'a-c:2', draft: draft(12) })]);
  serves(c, 'c:1');
  await c.store.actions.setType('import');
  const undo = c.store.get().toast.action;
  await c.store.actions.open('c:2');
  undo.run();
  await settle();
  assert.deepEqual(changes(c).at(-1), { path: '/api/items/c:1/ruling', body: { kind: '', section: 'dashboard' } });
  assert.deepEqual([c.data.items['c:1'].section, c.data.items['c:1'].ruling], ['dashboard', null]);
  s = c.store.get();
  assert.deepEqual([s.key, s.item.key, s.goTo.n, s.goTo.section], ['c:2', 'c:2', 1, 'importquery']);
  assert.equal(s.toast.message, 'Put back as it was.');
});

test('Not a customer dismisses it with Undo', async () => {
  const a = await opened([text()]);
  await a.store.actions.setType('notcustomer');
  assert.ok(a.calls.some((c) => c.path === '/api/items/c:1/dismiss' && c.body !== undefined));
  assert.deepEqual(changes(a), [], 'neither ruled nor moved');
  assert.deepEqual([a.store.get().toast.message, a.store.get().toast.action.label], ['Dismissed as not a customer', 'Undo']);
  a.store.get().toast.action.run();
  await settle();
  assert.ok(a.calls.some((c) => c.path === '/api/items/c:1/restore' && c.body !== undefined));
  // The More menu's own Dismiss is run with nothing, and says only Dismissed.
  await a.store.actions.dismiss();
  assert.equal(a.store.get().toast.message, 'Dismissed');
});

test('a type change with typed text keeps the text and writes nothing again', async () => {
  const a = await opened([text()]);
  a.store.actions.type('Hello, my own words');
  const posts = serves(a, 'c:1', { writing: true });
  await a.store.actions.setType('import');
  // The edit went out at once with keepalive, before the ruling; the ruling says keep.
  assert.deepEqual(posts[0].beacons, [{ p: '/api/drafts/11/edit', b: { text: 'Hello, my own words' } }]);
  assert.deepEqual(posts[0].body, { kind: 'import', section: 'importquery', keep: true });
  let s = a.store.get();
  assert.deepEqual([s.typed, s.item.section, s.item.writing], ['Hello, my own words', 'importquery', false]);
  assert.equal(boxViewOf(s, 1000).kind, 'editor');
  assert.equal(s.toast.message, 'Moved to Imports.', 'nothing is being written again');
  // Undo keeps it too.
  s.toast.action.run();
  await settle();
  assert.deepEqual(posts[1].body, { kind: '', section: 'dashboard', keep: true });
  assert.equal(a.store.get().typed, 'Hello, my own words');
  // With nothing typed, keep is not sent: an untouched reply is written again the new way.
  const b = await opened([text()]);
  const asked = serves(b, 'c:1');
  await b.store.actions.setType('import');
  b.store.get().toast.action.run();
  await settle();
  assert.deepEqual(asked.map((p) => p.body), [{ kind: 'import', section: 'importquery' }, { kind: '', section: 'dashboard' }]);
  assert.deepEqual(b.beacons, []);
});

test('a rewrite after a type change is shown once it is written', async () => {
  const a = await opened([text()]);
  serves(a, 'c:1', { writing: true });
  await a.store.actions.setType('import');
  let s = a.store.get();
  assert.equal(s.toast.message, 'Moved to Imports. The reply is being written again.');
  assert.equal(boxViewOf(s, 1000).kind, 'writing');
  // Still being written 2 s on; written by the next check, it is in the box and the checks stop.
  await a.timers.advance(2000);
  assert.equal(boxViewOf(a.store.get(), 1000).kind, 'writing');
  a.data.items['c:1'] = { ...a.data.items['c:1'], writing: false, draft: draft(12, { reply: 'Written the import way' }) };
  await a.timers.advance(2000);
  s = a.store.get();
  assert.deepEqual([s.item.draft.reply, boxViewOf(s, 1000).kind], ['Written the import way', 'editor']);
  const checks = (x) => paths(x.calls).filter((p) => p === 'GET /api/items/c:1').length;
  const n = checks(a);
  await a.timers.advance(20e3);
  assert.equal(checks(a), n, 'no more checks once it is written');

  // Never written: checked every 2 s, at most 15 times (30 s).
  const b = await opened([text()]);
  serves(b, 'c:1', { writing: true });
  await b.store.actions.setType('import');
  const m = checks(b);
  await b.timers.advance(60e3);
  assert.equal(checks(b) - m, 15);
  // Undo writes an untouched reply again, and is checked the same way.
  const c = await opened([text()]);
  serves(c, 'c:1', { writing: true });
  await c.store.actions.setType('import');
  c.data.items['c:1'] = { ...c.data.items['c:1'], writing: false, draft: draft(12, { reply: 'Written the import way' }) };
  c.store.get().toast.action.run();
  await settle();
  assert.equal(boxViewOf(c.store.get(), 1000).kind, 'writing');
  c.data.items['c:1'] = { ...c.data.items['c:1'], writing: false, draft: draft(13, { reply: 'Written the ordinary way' }) };
  await c.timers.advance(2000);
  assert.equal(c.store.get().item.draft.reply, 'Written the ordinary way');
});
