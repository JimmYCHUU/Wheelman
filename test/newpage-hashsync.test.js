// Keeping the new page's address and its store in step (web/new/js/hashsync.js). Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openAction, conversationOnScreen, addressAfter, storeStep, sheetStep, sheetOnPop, isSheetEntry, withSheet, goToHash } from '../web/new/js/hashsync.js';
import { parseRoute } from '../web/new/js/route.js';

/** The store as the sync sees it. */
const S = (chip, key, rows = []) => ({ section: 'dashboard', chip, key, rows });

test('boot without a key on a wide window: the first row goes in place of the address', () => {
  assert.equal(addressAfter(null, '', S('waiting', 'c:1')), '#/dashboard/waiting/c%3A1');
  assert.equal(addressAfter(null, '#/dashboard/waiting', S('waiting', 'c:1')), '#/dashboard/waiting/c%3A1');
  // On a phone nothing is opened: the address is only tidied, or left as it is.
  assert.equal(addressAfter(null, '', S('waiting', null)), '#/dashboard/waiting');
  assert.equal(addressAfter(null, '#/dashboard/all', S('all', null)), null);
});

test('boot with a key leaves the address as it is', () => {
  assert.equal(addressAfter(null, '#/dashboard/followups/c%3A2', S('followups', 'c:2')), null);
  assert.equal(addressAfter(null, '#/dashboard/waiting/c:2', S('waiting', 'c:2')), null, 'a key typed without encoding');
});

test('another section: the store moves there, and nothing is written over the address on its way', () => {
  // The address is ahead of the store, which is on its way to that section.
  assert.equal(addressAfter(null, '#/auction/waiting', S('waiting', null)), null);
  assert.equal(addressAfter(S('waiting', null), '#/marketplace/waiting', S('waiting', 'c:1')), null);
  assert.deepEqual(storeStep(parseRoute('#/auction/waiting'), S('waiting', 'c:1')), { section: 'auction', chip: 'waiting', key: null });
  assert.deepEqual(storeStep(parseRoute('#/marketplace/all/c%3A9'), S('waiting', 'c:1')), { section: 'marketplace', chip: 'all', key: 'c:9' });
  // A chip the section does not have is its first one.
  assert.deepEqual(storeStep(parseRoute('#/auction/followups'), S('followups', null)), { section: 'auction', chip: 'waiting', key: null });
});

test('a chip changed with a conversation open never puts the conversation back in the address', () => {
  // On a phone: ‹ List left the address without a key, then All was tapped.
  const before = S('waiting', 'c:1');
  assert.deepEqual(storeStep(parseRoute('#/dashboard/all'), before), { chip: 'all', key: null });
  assert.equal(addressAfter(before, '#/dashboard/all', S('all', 'c:1')), null);
  // Nor does a poll after it.
  assert.equal(addressAfter(S('all', 'c:1'), '#/dashboard/all', S('all', 'c:1')), null);
});

test('a row opened from the list keeps its own history entry, so Back returns to the list', () => {
  // The list wrote the address, a new entry; the store follows it and nothing is written over it.
  const before = S('waiting', null);
  assert.deepEqual(storeStep(parseRoute('#/dashboard/waiting/c%3A2'), before), { open: 'c:2', followup: undefined });
  assert.equal(addressAfter(before, '#/dashboard/waiting/c%3A2', S('waiting', 'c:2')), null);
  // On a wide window, from another conversation.
  assert.equal(addressAfter(S('waiting', 'c:1'), '#/dashboard/waiting/c%3A2', S('waiting', 'c:2')), null);
  // From the Follow-ups list, with that row's follow-up.
  const fu = S('followups', 'c:1', [{ key: 'c:1', followUp: { id: 5 } }, { key: 'c:2', followUp: { id: 6 } }]);
  assert.deepEqual(storeStep(parseRoute('#/dashboard/followups/c%3A2'), fu), { open: 'c:2', followup: 6 });
});

test('Back from a conversation shows the list and leaves the store as it is', () => {
  const s = S('waiting', 'c:2');
  assert.equal(storeStep(parseRoute('#/dashboard/waiting'), s), null);
  assert.equal(addressAfter(s, '#/dashboard/waiting', s), null);
});

test('Back or forward to a conversation on another chip: the store changes list, then opens it', () => {
  assert.deepEqual(storeStep(parseRoute('#/dashboard/followups/c%3A2'), S('all', 'c:1')), { chip: 'followups', key: 'c:2' });
  assert.equal(storeStep(parseRoute('#/dashboard/waiting/c%3A1'), S('waiting', 'c:1')), null, 'already there');
});

test('the first follow-up, opened by the store, goes in place of the Follow-ups address', () => {
  assert.equal(addressAfter(S('followups', 'c:1'), '#/dashboard/followups', S('followups', 'c:2')), '#/dashboard/followups/c%3A2');
  // No follow-up due: the address stays without a conversation.
  assert.equal(addressAfter(S('followups', 'c:1'), '#/dashboard/followups', S('followups', null)), null);
});

test('an address ahead of the store is left for the store to follow', () => {
  // Back pressed while the store was still opening the first follow-up.
  assert.equal(addressAfter(S('followups', 'c:1'), '#/dashboard/waiting/c%3A5', S('followups', 'c:2')), null);
  // Another row pressed while the store was still opening the last one.
  assert.equal(addressAfter(S('waiting', 'c:1'), '#/dashboard/waiting/c%3A3', S('waiting', 'c:2')), null);
});

test('the panel closes on Escape and Back', () => {
  // On a phone, Details opens the sheet as a history entry of its own, so Back has it to close.
  assert.equal(sheetStep({ narrow: true, open: true, entry: false }), 'push');
  assert.equal(isSheetEntry(withSheet(null)), true);
  assert.deepEqual(withSheet({ kept: 1 }), { kept: 1, sheet: true });
  assert.equal(isSheetEntry(null), false);
  // Back: the entry before is the conversation's. The sheet closes, and the address is the
  // conversation's own, so the store does not move.
  assert.equal(sheetOnPop({ narrow: true, entry: isSheetEntry(null) }), false);
  assert.equal(storeStep(parseRoute('#/dashboard/waiting/c%3A1'), S('waiting', 'c:1')), null);
  // Forward again: the sheet's entry, so it opens.
  assert.equal(sheetOnPop({ narrow: true, entry: true }), true);
  // Escape, Close or Add to reply on the sheet's entry: the entry is taken back too, so the next
  // Back leaves the conversation as it would without the sheet.
  assert.equal(sheetStep({ narrow: true, open: false, entry: true }), 'back');
  // Not on the sheet's entry (the page was reloaded): closed where it is, history untouched.
  assert.equal(sheetStep({ narrow: true, open: false, entry: false }), 'set');
  // Already on the sheet's entry: no second one.
  assert.equal(sheetStep({ narrow: true, open: true, entry: true }), 'set');
  // Wider windows: a column or a drawer, never a history entry, and Back leaves it as it is.
  assert.equal(sheetStep({ narrow: false, open: true, entry: false }), 'set');
  assert.equal(sheetStep({ narrow: false, open: false, entry: true }), 'set');
  assert.equal(sheetOnPop({ narrow: false, entry: false }), null);
  assert.equal(sheetOnPop({ narrow: false, entry: true }), null);
});

test('choosing the open conversation never reopens it', () => {
  assert.equal(openAction('c:1', 'c:1', 'c:1'), 'none'); // on screen already
  assert.equal(openAction('c:1', null, 'c:1'), 'view'); // a phone showing the list: only the address moves
  assert.equal(openAction('c:1', 'c:1', 'c:2'), 'open'); // another conversation
  assert.equal(openAction(null, null, 'c:2'), 'open');
  assert.equal(storeStep(parseRoute('#/dashboard/waiting/c%3A1'), { section: 'dashboard', chip: 'waiting', key: 'c:1' }), null);
});

test('the open conversation is on screen beside the list, and on a phone only when the address names it', () => {
  // From 900 px the list and the conversation are side by side.
  assert.equal(conversationOnScreen({ narrow: false, storeKey: 'c:1', routeKey: null }), true);
  // A phone showing the list (‹ List): the store keeps the conversation open, hidden.
  assert.equal(conversationOnScreen({ narrow: true, storeKey: 'c:1', routeKey: null }), false);
  assert.equal(conversationOnScreen({ narrow: true, storeKey: 'c:1', routeKey: 'c:1' }), true);
  // The address is ahead of the store, which is opening another one: not this one yet.
  assert.equal(conversationOnScreen({ narrow: true, storeKey: 'c:1', routeKey: 'c:2' }), false);
  assert.equal(conversationOnScreen({ narrow: false, storeKey: null, routeKey: null }), false);
});

test('a move the store asks for becomes a new address once', () => {
  // An enquiry type changed: the store asks to follow the conversation to Imports.
  const s = { ...S('waiting', 'c:7'), goTo: { section: 'importquery', chip: 'waiting', key: 'c:7', n: 1 } };
  assert.deepEqual(goToHash(0, s), { hash: '#/importquery/waiting/c%3A7', n: 1 });
  // Written once: the same request is not followed again, so Back stays where Jim put it.
  assert.equal(goToHash(1, s), null);
  assert.equal(goToHash(0, S('waiting', 'c:7')), null, 'nothing asked');
  assert.deepEqual(goToHash(1, { ...s, goTo: { ...s.goTo, section: 'dashboard', n: 2 } }), { hash: '#/dashboard/waiting/c%3A7', n: 2 }, 'and Undo asks again');
  // The store follows that address to the section, with the conversation it has open, and nothing is written over it.
  assert.deepEqual(storeStep(parseRoute('#/importquery/waiting/c%3A7'), s), { section: 'importquery', chip: 'waiting', key: 'c:7' });
  assert.equal(addressAfter(S('waiting', 'c:7'), '#/importquery/waiting/c%3A7', s), null);
});

test('on a Playbook address the store is left where it was and nothing is written over the address', async () => {
  const { playbookRoute } = await import('../web/new/js/playbookroute.js');
  // The store opened a conversation by itself (the boot's first row on a wide window, a poll, the
  // first follow-up): the Playbook's address is never written over with it.
  assert.equal(addressAfter(S('waiting', null), '#/playbook/lessons', S('waiting', 'c:1')), null);
  assert.equal(addressAfter(null, '#/playbook/lessons', S('waiting', 'c:1')), null, 'the boot');
  assert.equal(addressAfter(null, '#/playbook/facts', S('waiting', null)), null, 'the boot on a phone');
  // A reply run's next step does not write over it either.
  const run = { key: 'c:2' };
  assert.equal(addressAfter(S('waiting', 'c:1'), '#/playbook/lessons', { ...S('waiting', 'c:2'), run }), null);
  // The address names the Playbook's tab and the fact on it, never a conversation.
  assert.deepEqual(playbookRoute('#/playbook/facts/Tinted%20windows'), { tab: 'facts', id: 'Tinted windows' });
  assert.equal(playbookRoute('#/dashboard/waiting'), null);
  assert.equal(playbookRoute('#/dashboard/waiting/c%3A1'), null);
  assert.deepEqual(playbookRoute('#/playbook/nonsense'), { tab: 'lessons', id: null });
  // Back from it: the conversation the store kept open is on its address already, so the store stays.
  assert.equal(storeStep(parseRoute('#/dashboard/waiting/c%3A1'), S('waiting', 'c:1')), null);
  assert.equal(addressAfter(S('waiting', 'c:1'), '#/dashboard/waiting/c%3A1', S('waiting', 'c:1')), null);
});

test('Back from the Playbook returns to what was on screen: the list on a phone showing it, else the conversation', async () => {
  const { backHref } = await import('../web/new/js/playbookview.js');
  const open = S('waiting', 'c:1');
  // On a phone showing the list (‹ List), the store keeps the conversation open, hidden: Back is the list.
  assert.equal(backHref(open, parseRoute('#/dashboard/waiting')), '#/dashboard/waiting');
  // The conversation was on screen (a phone showing it, or any wider window): Back is the conversation.
  assert.equal(backHref(open, parseRoute('#/dashboard/waiting/c%3A1')), '#/dashboard/waiting/c%3A1');
  // Nothing on screen before it (a boot on the Playbook's address): the store's list.
  assert.equal(backHref(S('waiting', null), null), '#/dashboard/waiting');
  assert.equal(backHref(open, null), '#/dashboard/waiting/c%3A1');
  // The store has moved on since (another list): where the store is.
  assert.equal(backHref(S('all', 'c:2'), parseRoute('#/dashboard/waiting/c%3A1')), '#/dashboard/all/c%3A2');
});

test('a boot on a Playbook address opens no conversation behind it, so nothing is marked seen', async () => {
  const { bootFor } = await import('../web/new/js/hashsync.js');
  const { setup } = await import('./support/newpage-fakes.js');
  // On a wide window too: the Dashboard's first list, with no conversation, whatever the width.
  const b = bootFor('#/playbook/lessons', true);
  assert.deepEqual(b, { route: { section: 'dashboard', chip: 'waiting', key: null }, wide: false });
  assert.deepEqual(bootFor('#/playbook/facts/Tinted%20windows', true).route.key, null, "a fact's title is never read as a key");
  const { store, calls } = setup();
  await store.actions.boot(b.route, { wide: b.wide });
  assert.equal(store.get().key, null);
  assert.equal(store.get().item, null);
  assert.ok(!calls.some((c) => /^\/api\/items\/[^?]/.test(c.path)), 'no conversation asked for');
  assert.ok(!calls.some((c) => c.path.endsWith('/seen')), 'nothing marked seen');
  // Any other address boots as before: on a wide window the first row opens, and is seen.
  assert.deepEqual(bootFor('#/dashboard/all', true), { route: parseRoute('#/dashboard/all'), wide: true });
  const control = setup();
  const c = bootFor('#/dashboard/waiting', true);
  await control.store.actions.boot(c.route, { wide: c.wide });
  assert.equal(control.store.get().key, 'c:1');
  assert.ok(control.calls.some((x) => x.path === '/api/items/c:1/seen'));
});
