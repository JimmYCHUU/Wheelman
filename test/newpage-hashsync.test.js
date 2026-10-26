// Keeping the new page's address and its store in step (web/new/js/hashsync.js). Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addressAfter, storeStep } from '../web/new/js/hashsync.js';
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

test('a section still on the old page: nothing is written and the store does not move', () => {
  assert.equal(addressAfter(null, '#/auction/waiting', S('waiting', null)), null);
  assert.equal(addressAfter(S('waiting', null), '#/marketplace/waiting', S('waiting', 'c:1')), null);
  assert.equal(storeStep(parseRoute('#/auction/waiting'), S('waiting', 'c:1')), null);
  assert.equal(storeStep(parseRoute('#/marketplace/all/c%3A9'), S('waiting', 'c:1')), null);
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
