// What the new page's store does for the message box: a write in flight, the copy time, putting a
// row back, and the template or follow-up a write keeps. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../web/new/js/store.js';
import { mainAction, boxText, boxView } from '../web/new/js/model.js';
import { clock } from '../web/lib/format.js';
import { settle, fakeTimers, setup, draft, row, paths } from './support/newpage-fakes.js';

test('a write in flight is known by its key until it ends, even when it fails', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  const seen = [];
  const off = a.store.subscribe(() => seen.push(a.store.get().writing));
  await a.store.actions.write({});
  off();
  assert.ok(seen.includes('c:1'));
  assert.equal(a.store.get().writing, null);
  a.data.fail.add('/draft');
  await a.store.actions.write({});
  assert.equal(a.store.get().writing, null);
  assert.equal(a.store.get().toast.message, 'Network down');
});

test('writing a follow-up keeps it in hand, so the next refresh asks for it', async () => {
  const a = setup();
  a.data.items['c:2'] = { ...a.data.items['c:2'], followUp: { id: 7, reason: 'x', done: '' } };
  await a.store.actions.open('c:2');
  await a.store.actions.write({ followup: 7 });
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:2?followup=7'));
});

test('a write keeps the template in the box, as the old page did', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], templates: [{ id: 'tpl', label: 'Price reply' }], template: 'tpl' };
  await a.store.actions.open('c:1');
  await a.store.actions.tell('Make it shorter');
  const w = a.calls.find((c) => c.path === '/api/items/c:1/draft');
  assert.deepEqual(w.body, { instruction: 'Make it shorter', message: 'tpl', followup: undefined });
  a.calls.length = 0;
  await a.store.actions.write({ message: '' });
  assert.equal(a.calls.find((c) => c.path === '/api/items/c:1/draft').body.message, '', 'a message named by the caller wins');
});

test('typing says Saving at once, and a write starts the save note afresh', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('Hel');
  assert.equal(a.store.get().save.state, 'saving');
  await a.store.actions.write({});
  assert.deepEqual(a.store.get().save, { state: 'idle', at: null });
  await a.timers.advance(1000);
  assert.equal(a.calls.some((c) => c.path.endsWith('/edit')), false, 'the dropped edit is never sent');
  // With no draft there is nothing to save, so nothing says Saving.
  await a.store.actions.open('c:2');
  a.store.actions.type('Mine');
  assert.equal(a.store.get().save.state, 'idle');
});

test('copy keeps the time it was copied, and Put back clears it too', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  await a.store.actions.copy({});
  assert.equal(a.store.get().doneAt['c:1'], 1000);
  assert.equal(JSON.parse(a.mem.get('wheelman.new.doneAt'))['c:1'], 1000);
  a.store.actions.putBack();
  assert.equal(a.store.get().done['c:1'], undefined);
  assert.equal(a.store.get().doneAt['c:1'], undefined);
  assert.equal(JSON.parse(a.mem.get('wheelman.new.doneAt'))['c:1'], undefined);
});

test('a copied follow-up is put back in Follow-ups, on the server too', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'fu:5', followUp: { id: 5, reason: 'x', done: '' } };
  await a.store.actions.open('c:1', { followup: 5 });
  await a.store.actions.copy({});
  const t = a.store.get().toast;
  assert.equal(t.action.label, 'Put back in Follow-ups');
  await t.action.run();
  assert.ok(a.calls.some((c) => c.path === '/api/followups/5/restore' && c.body !== undefined));
  assert.equal(a.store.get().done['c:1'], undefined);
});

test('restore and restoreFollowUp put the open conversation back and refresh the list', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], followUp: { id: 5, reason: 'x', done: 'dismissed' } };
  await a.store.actions.open('c:1');
  a.calls.length = 0;
  await a.store.actions.restore();
  assert.deepEqual(paths(a.calls).slice(0, 2), ['POST /api/items/c:1/restore', 'GET /api/status']);
  a.calls.length = 0;
  await a.store.actions.restoreFollowUp();
  assert.deepEqual(paths(a.calls).slice(0, 2), ['POST /api/followups/5/restore', 'GET /api/status']);
  a.data.fail.add('/restore');
  await a.store.actions.restore();
  assert.equal(a.store.get().toast.message, 'Network down');
});

/** A store on the given storage, for the storage tests. */
function storeOn(mem) {
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  return createStore({ api: async () => ({}), clipboard: {}, storage, now: () => 0, timers: fakeTimers(), keepalive() {} });
}

test('the done times are read from storage, and a broken one gives none', () => {
  const mem = new Map([['wheelman.new.done', JSON.stringify({ 'c:9': 'x' })], ['wheelman.new.doneAt', JSON.stringify({ 'c:9': 5 })]]);
  assert.deepEqual(storeOn(mem).get().doneAt, { 'c:9': 5 });
  assert.deepEqual(storeOn(new Map([['wheelman.new.doneAt', 'not json']])).get().doneAt, {});
});

test('Instead keeps the pick: back to the reply asks for it by name, and a refresh asks for the pick again', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], templates: [{ id: 'tpl', label: 'Price reply' }], template: '' };
  await a.store.actions.open('c:1');
  await a.store.actions.instead('tpl');
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?message=tpl'));
  a.calls.length = 0;
  await a.store.actions.instead('');
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?message='));
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?message='));
  // Another conversation starts with nothing picked.
  await a.store.actions.open('c:2');
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:2'));
});

test('an override covers one draft: a new draft with a failed check is blocked again', async () => {
  const fail = [{ level: 'fail', code: 'figure', tokens: ['$31,990'], message: 'Check this figure: $31,990 is not in your records.' }];
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], draft: draft(11, { reply: 'It is $31,990.', checks: fail }) };
  const blocked = () => { const s = a.store.get(); return mainAction({ text: s.item.draft.reply, checks: s.item.draft.checks, overridden: s.overridden }).kind; };
  await a.store.actions.open('c:1');
  a.store.actions.override();
  assert.equal(blocked(), 'copy');
  await a.store.actions.refresh();
  assert.equal(blocked(), 'copy', 'the same draft again keeps the override');
  a.data.items['c:1'] = { ...a.data.items['c:1'], draft: draft(12, { reply: 'It is $31,990 now.', checks: fail }) };
  await a.store.actions.refresh();
  assert.equal(blocked(), 'blocked', 'a new draft from a refresh');
  a.store.actions.override();
  a.data.draftReply = () => ({ ok: true, item: { ...a.data.items['c:1'], draft: draft(13, { reply: 'Still $31,990.', checks: fail }) } });
  await a.store.actions.write({});
  assert.equal(blocked(), 'blocked', 'a new draft from a write');
});

test('a failed write keeps the unsaved edit: the note still says Not saved yet and the retry still runs', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.data.fail.add('/edit');
  a.store.actions.type('My words');
  await a.timers.advance(600);
  assert.equal(a.store.get().save.state, 'failed');
  a.data.fail.add('/draft');
  await a.store.actions.tell('Make it shorter');
  assert.equal(a.store.get().save.state, 'failed');
  assert.equal(a.store.get().typed, 'My words');
  const tries = a.calls.filter((c) => c.path.endsWith('/edit')).length;
  a.data.fail.clear();
  await a.timers.advance(5000);
  assert.equal(a.calls.filter((c) => c.path.endsWith('/edit')).length, tries + 1);
  assert.deepEqual(a.calls.filter((c) => c.path.endsWith('/edit')).at(-1).body, { text: 'My words' });
  assert.equal(a.store.get().save.state, 'saved');
});

test('a write that brings a new suggestion drops the edit waiting to be saved', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('My words');
  await a.store.actions.write({});
  assert.equal(a.store.get().typed, null);
  assert.deepEqual(a.store.get().save, { state: 'idle', at: null });
  await a.timers.advance(1000);
  assert.equal(a.calls.some((c) => c.path.endsWith('/edit')), false);
});

test('a failed suggestion shown in the box is not told again in a toast; a write that never arrived is', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.data.draftReply = () => ({ ok: false, error: 'The model is overloaded.', item: { ...a.data.items['c:1'], draft: draft(98, { status: 'failed', reply: '', error: 'The model is overloaded.' }) } });
  await a.store.actions.write({});
  assert.equal(a.store.get().item.draft.status, 'failed');
  assert.equal(a.store.get().toast, null);
  a.data.draftReply = null;
  a.data.fail.add('/draft');
  await a.store.actions.write({});
  assert.equal(a.store.get().toast.message, 'Network down');
});

test('a save that lands after a new suggestion leaves the new one\'s note alone', async () => {
  let release = null;
  const old = { id: 1, status: 'ready', reply: 'Old', edited: null, checks: [] };
  const api = async (path) => {
    if (path.endsWith('/edit')) { await new Promise((r) => { release = r; }); return {}; }
    if (path.endsWith('/draft')) return { ok: true, item: { key: 'c:1', anchor: 'a', draft: { ...old, id: 2, reply: 'New' } } };
    return { item: { key: 'c:1', anchor: 'a', draft: old } };
  };
  const timers = fakeTimers();
  const store = createStore({ api, clipboard: {}, storage: { getItem: () => null, setItem() {} }, now: () => 5, timers, keepalive() {} });
  await store.actions.open('c:1');
  store.actions.type('Mine');
  await timers.advance(600);
  assert.ok(release, 'the save is on its way');
  await store.actions.write({});
  release();
  await settle();
  assert.deepEqual(store.get().save, { state: 'idle', at: null });
});

test('a new message while typing offers "Use the new suggestion" only once there is one to use', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('My words');
  a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'a-newer', draft: null, writing: true };
  await a.store.actions.refresh();
  assert.equal(a.store.get().typed, 'My words');
  assert.equal(a.store.get().context.message, 'New message from the customer. Your text is kept.');
  assert.equal(a.store.get().context.action, null);
  a.data.items['c:1'] = { ...a.data.items['c:1'], draft: draft(21, { reply: 'For the new message' }), writing: false };
  await a.store.actions.refresh();
  assert.equal(a.store.get().typed, 'My words');
  assert.equal(a.store.get().context.action.label, 'Use the new suggestion');
});

test('a write that returns a failed suggestion keeps the typed text, its unsaved edit and its retry', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.data.fail.add('/edit');
  a.store.actions.type('My words');
  await a.timers.advance(600);
  assert.equal(a.store.get().save.state, 'failed');
  a.data.draftReply = () => ({ ok: false, error: 'The model is overloaded.', item: { ...a.data.items['c:1'], draft: draft(98, { status: 'failed', reply: '', error: 'The model is overloaded.' }) } });
  await a.store.actions.tell('Make it shorter');
  const s = a.store.get();
  assert.equal(s.item.draft.status, 'failed');
  assert.equal(s.typed, 'My words');
  assert.equal(s.save.state, 'failed', 'still Not saved yet');
  assert.equal(s.toast, null, 'the box shows the failure beside the text');
  const tries = a.calls.filter((c) => c.path.endsWith('/edit')).length;
  a.data.fail.clear();
  await a.timers.advance(5000);
  const edits = a.calls.filter((c) => c.path.endsWith('/edit'));
  assert.equal(edits.length, tries + 1, 'the retry still runs');
  assert.deepEqual([edits.at(-1).path, edits.at(-1).body], ['/api/drafts/98/edit', { text: 'My words' }], 'kept with the suggestion now on screen, so a reload brings it back');
  assert.equal(a.store.get().save.state, 'saved');
});

test('copying typed text beside a failed follow-up tells the server, which closes the follow-up', async () => {
  const a = setup();
  a.data.rows = [row('c:1', { anchor: 'fu:5', followUp: { id: 5, reason: 'Inspection passed', done: '' } })];
  a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'fu:5', followUp: { id: 5, reason: 'Inspection passed', done: '' }, draft: draft(98, { status: 'failed', reply: '', error: 'x' }) };
  await a.store.actions.setChip('followups');
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?followup=5'), 'opened from the Follow-ups chip');
  a.store.actions.type('Team Carbarn here. How did you find the van?');
  await a.store.actions.copy({});
  assert.deepEqual(a.written, ['Team Carbarn here. How did you find the van?']);
  const copied = a.calls.filter((c) => c.path.endsWith('/copied'));
  assert.deepEqual(copied.map((c) => [c.path, c.body]), [['/api/drafts/98/copied', { text: 'Team Carbarn here. How did you find the van?' }]]);
  assert.equal(a.store.get().done['c:1'], 'fu:5');
});

test('an empty box tells the server nothing on copy', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('   ');
  await a.store.actions.copy({});
  assert.equal(a.calls.some((c) => c.path.endsWith('/copied')), false);
});

test('"Use the new suggestion" stays used: the server forgets the typed text, so the next poll shows the suggestion', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('My own words');
  await a.timers.advance(700);
  // The customer wrote again: a new suggestion, while the typed text stays.
  a.data.items['c:1'] = { key: 'c:1', anchor: 'a-new', phone: '0491 570 101', draft: draft(12, { reply: 'New suggestion' }) };
  await a.store.actions.refresh();
  a.store.actions.type('My own words, more');
  await a.timers.advance(700);
  assert.equal(a.data.items['c:1'].draft.edited, 'My own words, more', 'the typing went on with the new suggestion');
  a.store.actions.type('My own words, more still');
  a.store.get().context.action.run();
  assert.equal(boxText(a.store.get().item.draft), 'New suggestion', 'at once');
  await a.timers.advance(5000);
  const edits = a.calls.filter((c) => c.path.endsWith('/edit'));
  assert.deepEqual([edits.at(-1).path, edits.at(-1).body], ['/api/drafts/12/edit', { text: 'New suggestion' }]);
  assert.equal(edits.some((c) => c.body.text === 'My own words, more still'), false, 'the edit waiting went with the typed text');
  await a.store.actions.refresh();
  const s = a.store.get();
  assert.equal(s.typed, null);
  assert.equal(boxText(s.item.draft), 'New suggestion');
  assert.equal(s.context, null);
  assert.deepEqual(s.save, { state: 'idle', at: null });
});

test('an Instead option chosen while typing leaves no "Saving…" behind, and the typing is kept with its own suggestion', async () => {
  const a = setup();
  a.data.items['c:1'] = { key: 'c:1', anchor: 'a-c:1', phone: '0491 570 101', draft: draft(11), template: '', templates: [{ id: 't1', label: 'Price' }] };
  await a.store.actions.open('c:1');
  a.store.actions.type('My edit');
  a.data.items['c:1'] = { ...a.data.items['c:1'], draft: draft(21, { reply: 'Template reply' }), template: 't1' };
  await a.store.actions.instead('t1');
  assert.deepEqual(a.store.get().save, { state: 'idle', at: null });
  await a.timers.advance(5000);
  assert.equal(a.store.get().item.draft.id, 21);
  assert.deepEqual(a.store.get().save, { state: 'idle', at: null });
  assert.deepEqual(a.calls.filter((c) => c.path.endsWith('/edit')).map((c) => [c.path, c.body.text]), [['/api/drafts/11/edit', 'My edit']]);
});

test('a poll that swaps the suggestion before or during a save leaves no "Saving…" behind', async () => {
  // Before: the save goes out after the new suggestion arrived.
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('Mine');
  a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'a-new', draft: draft(12, { reply: 'Newer' }) };
  await a.store.actions.refresh();
  await a.timers.advance(600);
  assert.equal(a.store.get().typed, 'Mine');
  assert.deepEqual(a.store.get().save, { state: 'idle', at: null });
  // During: the save is on its way when the new suggestion arrives.
  let release = null;
  let item = { key: 'c:1', anchor: 'a', draft: { id: 1, status: 'ready', reply: 'Old', edited: null, checks: [] } };
  const api = async (path, body) => {
    if (path.endsWith('/edit')) { await new Promise((r) => { release = r; }); return {}; }
    return body === undefined && path.startsWith('/api/items?') ? { items: [], counts: {} } : { item };
  };
  const timers = fakeTimers();
  const store = createStore({ api, clipboard: {}, storage: { getItem: () => null, setItem() {} }, now: () => 5, timers, keepalive() {} });
  await store.actions.open('c:1');
  store.actions.type('Mine');
  await timers.advance(600);
  assert.ok(release, 'the save is on its way');
  item = { key: 'c:1', anchor: 'b', draft: { id: 2, status: 'ready', reply: 'New', edited: null, checks: [] } };
  await store.actions.refresh();
  assert.equal(store.get().item.draft.id, 2);
  release();
  await settle();
  assert.deepEqual(store.get().save, { state: 'idle', at: null });
});

test('a flush when the page hides says saved once it lands, goes once however often it is asked, and is retried if it fails', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('Half done');
  a.store.actions.flush();
  a.store.actions.flush(); // the page hides, then closes
  assert.equal(a.beacons.length, 1);
  await settle();
  assert.deepEqual(a.store.get().save, { state: 'saved', at: 1000 });
  assert.equal(a.data.items['c:1'].draft.edited, 'Half done');
  a.data.fail.add('/edit');
  a.store.actions.type('Half done, more');
  a.store.actions.flush();
  await settle();
  assert.equal(a.store.get().save.state, 'failed');
  a.data.fail.clear();
  await a.timers.advance(5000);
  assert.equal(a.store.get().save.state, 'saved');
  assert.equal(a.data.items['c:1'].draft.edited, 'Half done, more');
});

test('a copy with blanks still to fill says how many, as the old page did', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  a.store.actions.type('The price is [PRICE?].');
  await a.store.actions.copy({ withBlanks: true });
  assert.equal(a.store.get().toast.message, 'Copied, with 1 blank still to fill');
  assert.equal(a.store.get().toast.action.label, 'Put back in Needs reply');
  a.store.actions.type('The price is [PRICE?], ready on [DATE?].');
  await a.store.actions.copy({ withBlanks: true });
  assert.equal(a.store.get().toast.message, 'Copied, with 2 blanks still to fill');
  a.store.actions.type('The price is $25,990.');
  await a.store.actions.copy({});
  assert.equal(a.store.get().toast.message, 'Copied');
});

const withInstruction = (a, extra = {}) => {
  a.data.items['c:1'] = { ...a.data.items['c:1'], key: 'c:1', situation: 'Price, discount or offer', situationKey: 'price_negotiation', draft: draft(11, { instruction: 'Do not mention finance', ...extra }) };
};

test('remember posts the scope and Undo switches the lesson off', async () => {
  const a = setup();
  withInstruction(a);
  a.data.on = {
    '/api/drafts/11/remember': () => ({ lesson: { id: 4, do: 'Do not mention finance', scope: 'price_negotiation', off: false } }),
    '/api/lessons/4/switch': (b) => ({ lesson: { id: 4, off: !b.on } }),
  };
  await a.store.actions.open('c:1');
  await a.store.actions.remember('price_negotiation');
  const post = a.calls.find((c) => c.path === '/api/drafts/11/remember');
  assert.deepEqual(post.body, { scope: 'price_negotiation' });
  assert.equal(a.store.get().toast.message, 'Remembered for price questions');
  assert.deepEqual(a.store.get().remembered, [11]);
  await a.store.get().toast.action.run();
  const off = a.calls.find((c) => c.path === '/api/lessons/4/switch');
  assert.deepEqual(off.body, { on: false });
  assert.deepEqual(a.store.get().remembered, []);
});

test('remember of a lesson that was already on offers no Undo, so it cannot switch that lesson off', async () => {
  const a = setup();
  withInstruction(a);
  a.data.on = { '/api/drafts/11/remember': () => ({ lesson: { id: 4, do: 'Do not mention finance', scope: 'price_negotiation', off: false }, wasOn: true }) };
  await a.store.actions.open('c:1');
  await a.store.actions.remember('price_negotiation');
  assert.equal(a.store.get().toast.message, 'Already remembered for price questions');
  assert.equal(a.store.get().toast.action, null, 'no Undo');
  assert.deepEqual(a.store.get().remembered, [11], 'the line closes all the same');
  assert.ok(!a.calls.some((c) => c.path === '/api/lessons/4/switch'), 'nothing switched off');

  // Made, or switched back on, by this press (wasOn false): Undo is offered and switches it off.
  a.data.on = {
    '/api/drafts/11/remember': () => ({ lesson: { id: 4, do: 'Do not mention finance', scope: 'price_negotiation', off: false }, wasOn: false }),
    '/api/lessons/4/switch': (b) => ({ lesson: { id: 4, off: !b.on } }),
  };
  await a.store.actions.remember('price_negotiation');
  assert.equal(a.store.get().toast.action.label, 'Undo');
  await a.store.get().toast.action.run();
  assert.deepEqual(a.calls.find((c) => c.path === '/api/lessons/4/switch').body, { on: false });
});

test('a refused remember shows its sentence', async () => {
  const a = setup();
  withInstruction(a);
  a.data.on = { '/api/drafts/11/remember': () => { throw new Error('Marketplace chats, phone-only texts and auction orders do not teach Wheelman.'); } };
  await a.store.actions.open('c:1');
  await a.store.actions.remember('any');
  assert.equal(a.store.get().toast.message, 'Marketplace chats, phone-only texts and auction orders do not teach Wheelman.');
  assert.deepEqual(a.store.get().remembered, []);
});

test('Just this once closes the line and sends nothing', async () => {
  const a = setup();
  withInstruction(a);
  await a.store.actions.open('c:1');
  a.calls.length = 0;
  a.store.actions.justOnce();
  assert.deepEqual(a.store.get().closedNotes, [11]);
  assert.equal(a.calls.length, 0);
});

test('answered elsewhere while open: the suggestion that was there is kept to show, and typed text is kept without a new-message line', async () => {
  const answered = { how: 'phone', by: '', at: 5000 };
  const a = setup();
  await a.store.actions.open('c:1');
  a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'a-after', state: 'answered', answered, draft: null };
  await a.store.actions.refresh();
  assert.equal(a.store.get().item.lastSuggestion, 'Hello from Wheelman');
  await a.store.actions.refresh();
  assert.equal(a.store.get().item.lastSuggestion, 'Hello from Wheelman', 'it stays through the next refresh');

  const b = setup();
  await b.store.actions.open('c:1');
  b.store.actions.type('My own words');
  b.data.items['c:1'] = { ...b.data.items['c:1'], anchor: 'a-after', state: 'answered', answered, draft: null };
  await b.store.actions.refresh();
  assert.equal(b.store.get().typed, 'My own words');
  assert.equal(b.store.get().context, null, 'the box says the customer was answered elsewhere, not that a message arrived');
});

test("a reply copied from Wheelman and sent: the next refresh says so, with nothing under it, and what was typed stays in the store", async () => {
  const at = Date.parse('2026-10-26T23:00:00Z'); // 10:00 am in Sydney
  const view = (s) => boxView({ item: s.item, writing: s.writing === s.key, done: s.done[s.key] === s.item.anchor, doneAt: s.doneAt[s.key], typed: s.typed !== null, now: at + 600000 });
  const sent = (a) => { a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'a-after', state: 'answered', answered: { how: 'wheelman', by: '', at }, draft: null }; };
  const words = "Answered with Wheelman's suggestion " + clock(at) + '. No reply needed.';

  // Copied as written, then sent on the dashboard or the phone.
  const a = setup();
  await a.store.actions.open('c:1');
  await a.store.actions.copy();
  sent(a);
  await a.store.actions.refresh();
  const v = view(a.store.get());
  assert.equal(v.kind, 'quiet');
  assert.equal(v.sentence, words);
  assert.ok(!v.suggestion, 'the reply that went out is not shown again as a suggestion');

  // Edited, copied, sent: the same line, and the edit is not thrown away.
  const b = setup();
  await b.store.actions.open('c:1');
  b.store.actions.type('Hello from Wheelman, and the price is $9,990');
  await b.store.actions.copy();
  sent(b);
  await b.store.actions.refresh();
  assert.equal(view(b.store.get()).kind, 'quiet');
  assert.equal(view(b.store.get()).sentence, words);
  assert.equal(b.store.get().typed, 'Hello from Wheelman, and the price is $9,990');
});
