// Every section on the new page: its own chips, rows and head line (web/new/js/sections.js), the
// address that keeps the store in step across sections, and the store moving between them. Invented
// data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_CHIPS, chipsFor, validChip, emptyWords, moreLabel, rowChannelWord, sectionRowView, headLine, resultAddress, shownSections, tabInView } from '../web/new/js/sections.js';
import { rowView } from '../web/new/js/model.js';
import { parseRoute, hashFor } from '../web/new/js/route.js';
import { storeStep, addressAfter, offAddress } from '../web/new/js/hashsync.js';
import { setup, row, draft, paths } from './support/newpage-fakes.js';

const labels = (section) => chipsFor(section).map((c) => c.id + ' ' + c.label);
/** The conversations opened, in order: each open marks its conversation seen (a refresh does not). */
const opened = (calls) => paths(calls).map((p) => /^POST \/api\/items\/([^/]+)\/seen$/.exec(p)).filter(Boolean).map((m) => m[1]);
const lists = (calls) => paths(calls).filter((p) => p.startsWith('GET /api/items?'));

/** Auction as the server lists it: two orders and an enquiry, each with its own conversation. */
function withAuction(over = {}) {
  const a = setup({
    sections: {
      auction: { rows: [row('ao:5', { due: 'Send: deposit request', dueKind: 'send', stage: 'Deposit asked' }), row('ao:6', { stage: 'Searching' }), row('c:8')], counts: { waiting: 2, quiet: 1, other: 0 } },
      marketplace: { rows: [row('mp:501', { name: 'Liam Invented' }), row('mp:502')], counts: { all: 2, waiting: 2 } },
    },
    ...over,
  });
  a.data.items['ao:5'] = { key: 'ao:5', anchor: 'a-ao:5', state: 'awaiting', order: { orderNo: 'AS-501', prefers: 'WhatsApp' }, draft: draft(51) };
  a.data.items['ao:6'] = { key: 'ao:6', anchor: 'a-ao:6', state: 'answered', order: { orderNo: 'AS-502', prefers: '' }, draft: null };
  a.data.items['mp:501'] = { key: 'mp:501', anchor: 'a-mp:501', state: 'awaiting', marketplace: { account: 'Carbarn Lidcombe' }, draft: draft(61) };
  a.data.items['mp:502'] = { key: 'mp:502', anchor: 'a-mp:502', state: 'awaiting', marketplace: { account: '' }, draft: null };
  return a;
}

test('every section has its own chips, empty words and Load more', () => {
  assert.deepEqual(labels('dashboard'), ['waiting Needs reply', 'followups Follow-ups', 'all All']);
  assert.deepEqual(labels('marketplace'), ['waiting Needs reply', 'all All']);
  assert.deepEqual(labels('importquery'), ['waiting Needs reply', 'all All']);
  assert.deepEqual(labels('auction'), ['waiting To do', 'quiet In progress', 'other Finished']);
  assert.deepEqual(Object.keys(SECTION_CHIPS), ['dashboard', 'marketplace', 'importquery', 'auction']);
  // A chip the section has stays; any other is the section's first.
  assert.equal(validChip('auction', 'quiet'), 'quiet');
  assert.equal(validChip('auction', 'all'), 'waiting');
  assert.equal(validChip('marketplace', 'followups'), 'waiting');
  assert.equal(validChip('dashboard', 'other'), 'waiting');
  assert.equal(validChip('importquery', undefined), 'waiting');

  assert.equal(emptyWords('dashboard', 'waiting'), 'No one is waiting.');
  assert.equal(emptyWords('dashboard', 'followups'), 'No follow-ups are due.');
  assert.equal(emptyWords('dashboard', 'all'), 'There are no conversations yet.');
  assert.equal(emptyWords('marketplace', 'waiting'), 'No buyer is waiting.');
  assert.equal(emptyWords('marketplace', 'all'), 'There are no Marketplace chats yet.');
  assert.equal(emptyWords('importquery', 'waiting'), 'No one is waiting.');
  assert.equal(emptyWords('importquery', 'all'), 'No import enquiries yet. In Gmail, open one and press Send to Wheelman.');
  assert.equal(emptyWords('auction', 'waiting'), 'Nothing to do.');
  assert.equal(emptyWords('auction', 'quiet'), 'No orders are under way.');
  assert.equal(emptyWords('auction', 'other'), 'No finished orders.');

  assert.equal(moreLabel('dashboard'), 'Load older conversations');
  assert.equal(moreLabel('marketplace'), 'Load older conversations');
  assert.equal(moreLabel('importquery'), 'Load older enquiries');
  assert.equal(moreLabel('auction'), 'Load more orders');
});

test("routes keep each section's own chips", () => {
  assert.deepEqual(parseRoute('#/auction/quiet/ao%3A5'), { section: 'auction', chip: 'quiet', key: 'ao:5' });
  assert.deepEqual(parseRoute('#/marketplace/followups'), { section: 'marketplace', chip: 'waiting', key: null });
  assert.deepEqual(parseRoute('#/importquery/all/em%3A3'), { section: 'importquery', chip: 'all', key: 'em:3' });
  assert.deepEqual(parseRoute('#/auction/all'), { section: 'auction', chip: 'waiting', key: null });
  assert.deepEqual(parseRoute('#/dashboard/other'), { section: 'dashboard', chip: 'waiting', key: null });
  assert.deepEqual(parseRoute('#/dashboard/followups/c%3A2'), { section: 'dashboard', chip: 'followups', key: 'c:2' });
  const r = { section: 'auction', chip: 'other', key: 'ao:9' };
  assert.deepEqual(parseRoute(hashFor(r)), r);
});

test('the address moves the store to another section and opens the conversation there', async () => {
  // Pure: another section in the address is a step of its own, with its list and conversation.
  const s = { section: 'dashboard', chip: 'waiting', key: 'c:1', rows: [] };
  assert.deepEqual(storeStep(parseRoute('#/auction/quiet/ao%3A5'), s), { section: 'auction', chip: 'quiet', key: 'ao:5' });
  assert.deepEqual(storeStep(parseRoute('#/marketplace/waiting'), s), { section: 'marketplace', chip: 'waiting', key: null });

  // The store: the section's own list, then the conversation the address names.
  const a = withAuction();
  await a.store.actions.boot(parseRoute('#/dashboard/waiting/c%3A1'), { wide: true });
  a.calls.length = 0;
  await a.store.actions.setSection('auction', { chip: 'quiet', key: 'ao:5', wide: true });
  let st = a.store.get();
  assert.deepEqual([st.section, st.chip, st.key, st.listState, st.limit], ['auction', 'quiet', 'ao:5', 'ready', 20]);
  assert.deepEqual(lists(a.calls), ['GET /api/items?section=auction&tab=quiet&limit=20']);
  assert.deepEqual(st.rows.map((r) => r.key), ['ao:5', 'ao:6', 'c:8']);
  assert.deepEqual(opened(a.calls), ['ao:5']);
  assert.equal(st.item.order.orderNo, 'AS-501');

  // The one already open is not opened again.
  a.calls.length = 0;
  await a.store.actions.setSection('dashboard', { chip: 'all', key: 'ao:5', wide: true });
  assert.deepEqual(opened(a.calls), []);
  assert.equal(a.store.get().key, 'ao:5');

  // No key on a wide window: the first row opens, and goes in place of the address.
  a.calls.length = 0;
  await a.store.actions.setSection('marketplace', { chip: 'followups', wide: true });
  st = a.store.get();
  assert.deepEqual([st.section, st.chip, st.key], ['marketplace', 'waiting', 'mp:501']);
  assert.deepEqual(opened(a.calls), ['mp:501']);
  const prev = { section: 'marketplace', chip: 'waiting', key: null };
  assert.equal(addressAfter(prev, '#/marketplace/waiting', st), '#/marketplace/waiting/mp%3A501');

  // No key on a phone: the conversation closes, and only the list shows.
  a.calls.length = 0;
  await a.store.actions.setSection('auction', { chip: 'waiting', wide: false });
  st = a.store.get();
  assert.deepEqual([st.section, st.chip, st.key, st.item], ['auction', 'waiting', null, null]);
  assert.deepEqual(opened(a.calls), []);
  assert.deepEqual(lists(a.calls), ['GET /api/items?section=auction&tab=waiting&limit=20']);

  // A reload on another section boots there, with the section's own chip.
  const b = withAuction();
  await b.store.actions.boot(parseRoute('#/marketplace/followups'), { wide: true });
  assert.deepEqual([b.store.get().section, b.store.get().chip, b.store.get().key], ['marketplace', 'waiting', 'mp:501']);
  assert.ok(lists(b.calls).every((p) => p.includes('section=marketplace&tab=waiting')), lists(b.calls).join(', '));
});

test('choosing another section ends a reply run quietly', async () => {
  const a = withAuction();
  a.data.rows = [row('c:1', { waitingSince: 2000 }), row('c:2', { waitingSince: 1000 })];
  for (const r of a.data.rows) a.data.items[r.key] = { key: r.key, anchor: r.anchor, state: 'awaiting', draft: draft(10 + Number(r.key.slice(2))) };
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.deepEqual(a.store.get().run, { at: 1, of: 2, key: 'c:2' });
  await a.store.actions.setSection('marketplace', { chip: 'waiting', wide: false });
  assert.equal(a.store.get().run, null);
  assert.equal(a.store.get().runSummary, null, 'quietly: no summary');
  assert.equal(a.store.get().key, null);

  // The run is offered on the Dashboard's Needs reply only: elsewhere Start replying does nothing.
  a.calls.length = 0;
  await a.store.actions.startRun();
  assert.equal(a.store.get().run, null);
  assert.equal(a.store.get().key, null);
  assert.deepEqual(opened(a.calls), []);
  await a.store.actions.setSection('auction', { chip: 'waiting', wide: false });
  await a.store.actions.startRun();
  assert.equal(a.store.get().run, null);
  assert.deepEqual(opened(a.calls), []);
});

test('switching section saves what was typed first', async () => {
  const a = withAuction();
  // When the Marketplace list is asked for, what was typed must already be on its way.
  let savedBeforeList = null;
  const marketplace = a.data.sections.marketplace;
  Object.defineProperty(a.data.sections, 'marketplace', { get() { savedBeforeList = a.beacons.map((x) => x.p + ' ' + x.b.text); return marketplace; } });
  await a.store.actions.boot(parseRoute('#/dashboard/waiting/c%3A1'), { wide: true });
  a.store.actions.type('Hello, the Hiace is still here');
  await a.store.actions.setSection('marketplace', { chip: 'waiting', key: 'mp:502', wide: true });
  assert.deepEqual(savedBeforeList, ['/api/drafts/11/edit Hello, the Hiace is still here']);
  assert.equal(a.store.get().key, 'mp:502');
  assert.equal(a.store.get().typed, null, 'the other conversation starts clean');
  assert.equal(a.timers.pending(), 0, 'no save left waiting to go out later');

  // Back on the Dashboard, the text is there.
  await a.store.actions.setSection('dashboard', { chip: 'waiting', key: 'c:1', wide: true });
  assert.equal(a.store.get().item.draft.edited, 'Hello, the Hiace is still here');
});

test("a row shows its channel only when it differs from its section's own, and an order row says what is due", () => {
  // Each section's own channel goes without saying.
  assert.equal(rowChannelWord(row('c:1'), 'dashboard'), '');
  assert.equal(rowChannelWord(row('l:4'), 'dashboard'), '');
  assert.equal(rowChannelWord(row('mp:1'), 'marketplace'), '');
  assert.equal(rowChannelWord(row('em:1'), 'importquery'), '');
  assert.equal(rowChannelWord(row('ao:1'), 'auction'), '');
  // Anywhere else it is said.
  assert.equal(rowChannelWord(row('c:8'), 'auction'), 'Text');
  assert.equal(rowChannelWord(row('ph:3'), 'auction'), 'Text');
  assert.equal(rowChannelWord(row('mp:1'), 'dashboard'), 'Facebook');
  assert.equal(rowChannelWord(row('em:1'), 'auction'), 'Email');
  assert.equal(rowChannelWord(row('ao:1'), 'dashboard'), 'WhatsApp');
  assert.equal(rowChannelWord(row('c:1'), 'importquery'), 'Text');

  const now = 1000;
  // A row that is not an order is the Dashboard's row, with no channel and no tone of its own.
  const plain = row('c:1', { flag: 'input' });
  assert.deepEqual(sectionRowView(plain, { now }, 'dashboard'), { ...rowView(plain, { now }), channel: '', tone: '' });
  assert.equal(sectionRowView(row('c:8'), { now }, 'auction').channel, 'Text');

  // An order row: what is due, else where it has got to.
  const send = sectionRowView(row('ao:5', { due: 'Send: deposit request', dueKind: 'send', stage: 'Deposit asked' }), { now }, 'auction');
  assert.deepEqual([send.reason, send.tone, send.channel], ['Due: deposit request', 'warn', '']);
  const reply = sectionRowView(row('ao:5', { due: 'Reply to their message', dueKind: 'reply', stage: 'Deposit asked' }), { now }, 'auction');
  assert.deepEqual([reply.reason, reply.tone], ['Reply to their message', 'info']);
  const going = sectionRowView(row('ao:6', { due: '', dueKind: '', stage: 'Searching the auctions' }), { now }, 'auction');
  assert.deepEqual([going.reason, going.tone], ['Searching the auctions', '']);
  // Copied: the copied words stay, and the list's own tone (green) says it. An order is not copied into the dashboard.
  const done = sectionRowView(row('ao:5', { due: 'Send: deposit request', dueKind: 'send' }), { now, doneAnchor: 'a-ao:5' }, 'auction');
  assert.deepEqual([done.reason, done.tone, done.done], ['Copied', '', true]);
});

test('a copied row says where it will show only for a Dashboard text', () => {
  const now = Date.UTC(2026, 9, 28, 1, 0);
  const copied = (key, section) => sectionRowView(row(key), { now, doneAnchor: 'a-' + key }, section);
  // A text is pasted into the dashboard, wherever it is listed (an enquiry in Auction too).
  assert.equal(copied('c:1', 'dashboard').reason, 'Copied, waiting for it to show on the dashboard');
  assert.equal(copied('l:1', 'auction').reason, 'Copied, waiting for it to show on the dashboard');
  assert.equal(copied('ph:1', 'dashboard').reason, 'Copied, waiting for it to show on the dashboard');
  // A Facebook chat, an email and an order go elsewhere, and their row says only that it was copied.
  for (const [key, section] of [['mp:1', 'marketplace'], ['mp:1', 'dashboard'], ['em:1', 'importquery'], ['ao:1', 'auction']]) {
    const v = copied(key, section);
    assert.deepEqual([v.reason, v.tone, v.done, v.unread], ['Copied', '', true, 0], key + ' in ' + section);
  }
  // Not copied: each row as before.
  assert.equal(sectionRowView(row('mp:1'), { now }, 'marketplace').reason, '');
});

test('the head names the account, the subject or the order', () => {
  assert.equal(headLine({ key: 'c:1', situation: 'Asking about the price' }), 'Asking about the price');
  assert.equal(headLine({ key: 'c:1' }), '');
  assert.equal(headLine({ key: 'c:1', situation: 'Asking about the price', writing: true }), 'Writing a suggestion…');
  assert.equal(headLine({ key: 'mp:1', situation: 'General enquiry', marketplace: { account: 'Carbarn Lidcombe' } }), 'Marketplace · Carbarn Lidcombe');
  assert.equal(headLine({ key: 'mp:1', marketplace: { account: '' } }), 'Marketplace');
  assert.equal(headLine({ key: 'em:1', situation: 'General enquiry', mail: { subject: 'Importing a Toyota Alphard' } }), 'Email · Importing a Toyota Alphard');
  assert.equal(headLine({ key: 'em:1', mail: { subject: '' } }), 'Email');
  assert.equal(headLine({ key: 'ao:5', situation: 'Deposit asked', order: { orderNo: 'AS-501', prefers: 'WhatsApp' } }), 'Order AS-501 · prefers WhatsApp');
  assert.equal(headLine({ key: 'ao:6', order: { orderNo: 'AS-502', prefers: '' } }), 'Order AS-502');
  assert.equal(headLine({ key: 'ao:5', writing: true, order: { orderNo: 'AS-501', prefers: 'WhatsApp' } }), 'Writing a suggestion…');
});

test('a search result opens in its own section, on the list it is on', async () => {
  // Waiting is Needs reply (To do in Auction); anything else is All, or Auction's own list by its state.
  assert.deepEqual(resultAddress({ key: 'mp:501', section: 'marketplace', state: 'awaiting' }), { section: 'marketplace', chip: 'waiting', key: 'mp:501' });
  assert.deepEqual(resultAddress({ key: 'mp:502', section: 'marketplace', state: 'answered' }), { section: 'marketplace', chip: 'all', key: 'mp:502' });
  assert.deepEqual(resultAddress({ key: 'em:3', section: 'importquery', state: 'closed' }), { section: 'importquery', chip: 'all', key: 'em:3' });
  assert.deepEqual(resultAddress({ key: 'c:1', section: 'dashboard', state: 'awaiting' }), { section: 'dashboard', chip: 'waiting', key: 'c:1' });
  assert.deepEqual(resultAddress({ key: 'c:2', section: 'dashboard' }), { section: 'dashboard', chip: 'all', key: 'c:2' }, 'a message found: no state');
  assert.deepEqual(resultAddress({ key: 'ao:5', section: 'auction', state: 'awaiting' }), { section: 'auction', chip: 'waiting', key: 'ao:5' });
  assert.deepEqual(resultAddress({ key: 'ao:6', section: 'auction', state: 'answered' }), { section: 'auction', chip: 'quiet', key: 'ao:6' });
  assert.deepEqual(resultAddress({ key: 'ao:7', section: 'auction', state: 'closed' }), { section: 'auction', chip: 'other', key: 'ao:7' });
  // A dismissed one is no longer waiting; a message found in Auction opens on its first list.
  assert.deepEqual(resultAddress({ key: 'mp:503', section: 'marketplace', state: 'awaiting', dismissed: true }), { section: 'marketplace', chip: 'all', key: 'mp:503' });
  assert.deepEqual(resultAddress({ key: 'c:8', section: 'auction', state: 'awaiting', dismissed: true }), { section: 'auction', chip: 'quiet', key: 'c:8' });
  assert.deepEqual(resultAddress({ key: 'c:8', section: 'auction' }), { section: 'auction', chip: 'waiting', key: 'c:8' });

  // From the Dashboard, a Marketplace result's address moves the store there and opens it.
  const a = withAuction();
  await a.store.actions.boot(parseRoute('#/dashboard/waiting/c%3A1'), { wide: true });
  const route = parseRoute(hashFor(resultAddress({ key: 'mp:502', section: 'marketplace', state: 'awaiting' })));
  const step = storeStep(route, a.store.get());
  assert.deepEqual(step, { section: 'marketplace', chip: 'waiting', key: 'mp:502' });
  a.calls.length = 0;
  await a.store.actions.setSection(step.section, { chip: step.chip, key: step.key, wide: true });
  assert.deepEqual([a.store.get().section, a.store.get().chip, a.store.get().key], ['marketplace', 'waiting', 'mp:502']);
  assert.deepEqual(opened(a.calls), ['mp:502'], 'the result, not the first row');
});

test('a switched-off section has no tab, and its address opens Dashboard', async () => {
  // The signal is the old page's: the server's `sections`, null for a section that is switched off.
  const off = { dashboard: 3, marketplace: null, importquery: null, auction: 2 };
  assert.deepEqual(shownSections(off).map((s) => s.id), ['dashboard', 'auction']);
  assert.deepEqual(shownSections({ dashboard: 3, marketplace: 0, importquery: 1, auction: 0 }).map((s) => s.id), ['dashboard', 'marketplace', 'importquery', 'auction']);
  assert.deepEqual(shownSections({}).map((s) => s.id), ['dashboard', 'marketplace', 'importquery', 'auction'], 'before the first answer every tab stays');
  // An address on a switched-off section goes to the Dashboard; any other is left as it is.
  assert.equal(offAddress(parseRoute('#/marketplace/all/mp%3A501'), off), '#/dashboard/waiting');
  assert.equal(offAddress(parseRoute('#/importquery/waiting'), off), '#/dashboard/waiting');
  assert.equal(offAddress(parseRoute('#/auction/quiet/ao%3A5'), off), null);
  assert.equal(offAddress(parseRoute('#/dashboard/all'), off), null);
  assert.equal(offAddress(parseRoute('#/marketplace/waiting'), {}), null, 'not known yet');

  // The store: the server answers a switched-off section with the Dashboard's list. None of it is
  // shown under that section, and nothing is opened there, not even the conversation the address names.
  const a = withAuction();
  a.data.off.add('marketplace');
  await a.store.actions.boot(parseRoute('#/marketplace/waiting/mp%3A501'), { wide: true });
  let st = a.store.get();
  assert.equal(st.section, 'marketplace');
  assert.deepEqual([st.rows, st.total, st.key, st.listState], [[], 0, null, 'ready']);
  assert.equal(st.sections.marketplace, null);
  assert.deepEqual(opened(a.calls), []);
  assert.equal(paths(a.calls).some((p) => p.startsWith('GET /api/items/')), false);
  // A refresh while there takes none of it either.
  await a.store.actions.refresh();
  assert.deepEqual(a.store.get().rows, []);

  // The address then goes to the Dashboard, and the store follows it there.
  const to = offAddress(parseRoute('#/marketplace/waiting/mp%3A501'), st.sections);
  const step = storeStep(parseRoute(to), st);
  assert.deepEqual(step, { section: 'dashboard', chip: 'waiting', key: null });
  await a.store.actions.setSection(step.section, { chip: step.chip, key: step.key, wide: true });
  st = a.store.get();
  assert.deepEqual([st.section, st.rows.map((r) => r.key), st.key], ['dashboard', ['c:1', 'c:2'], 'c:1']);
});

test('the chosen tab is scrolled into the tab track', () => {
  // A track 200 px wide from x = 10, scrolled 0: a tab cut off on the right comes in by its overflow,
  // one cut off on the left by its own, and one in view leaves the track where it is.
  const track = { left: 10, right: 210 };
  assert.equal(tabInView({ left: 180, right: 260 }, track, 0), 50);
  assert.equal(tabInView({ left: -30, right: 60 }, track, 120), 80);
  assert.equal(tabInView({ left: 40, right: 120 }, track, 30), null);
  // A tab wider than the track shows its start.
  assert.equal(tabInView({ left: 100, right: 400 }, track, 0), 90);
});
