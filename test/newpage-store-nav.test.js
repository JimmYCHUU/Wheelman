// Where the new page's store goes from an address: the boot, Back and forward across the chips, and
// the follow-up in hand. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../web/new/js/route.js';
import { followUpOf } from '../web/new/js/store.js';
import { setup, row, paths } from './support/newpage-fakes.js';

const opened = (calls) => paths(calls).filter((p) => /^GET \/api\/items\/|^POST \/api\/items\/[^/]+\/seen$/.test(p));

test("a reload on another section loads that section's list, on a chip it has, and opens what the address names", async () => {
  const sections = { auction: { rows: [row('ao:5'), row('ao:6')], counts: { waiting: 2 } }, marketplace: { rows: [row('mp:7')], counts: { waiting: 1 } }, importquery: { rows: [row('em:3')], counts: { waiting: 1 } } };
  const items = { 'ao:5': { key: 'ao:5', anchor: 'a-ao:5', draft: null }, 'ao:6': { key: 'ao:6', anchor: 'a-ao:6', draft: null }, 'mp:7': { key: 'mp:7', anchor: 'a-mp:7', draft: null }, 'em:3': { key: 'em:3', anchor: 'a-em:3', draft: null } };
  for (const [hash, want, wide] of [
    ['#/auction/waiting', ['auction', 'waiting', 'ao:5'], true],
    ['#/auction/other/ao%3A6', ['auction', 'other', 'ao:6'], true],
    ['#/marketplace/all', ['marketplace', 'all', null], false],
    ['#/importquery/followups/em%3A3', ['importquery', 'waiting', 'em:3'], false],
  ]) {
    const a = setup({ sections });
    Object.assign(a.data.items, items);
    await a.store.actions.boot(parseRoute(hash), { wide });
    await a.store.actions.refresh();
    const lists = paths(a.calls).filter((p) => p.startsWith('GET /api/items?'));
    assert.ok(lists.length >= 2, hash);
    assert.ok(lists.every((p) => p.includes('section=' + want[0] + '&tab=' + want[1])), hash + ': ' + lists.join(', '));
    const s = a.store.get();
    assert.deepEqual([s.section, s.chip, s.key], want, hash);
    assert.deepEqual(opened(a.calls).filter((p) => p.startsWith('POST')), want[2] ? ['POST /api/items/' + want[2] + '/seen'] : [], hash);
  }
});

test('a reload on Follow-ups opens the conversation with the follow-up in hand, and writes nothing', async () => {
  const a = setup();
  a.data.rows = [row('c:1', { followUp: { id: 5, reason: 'x' } }), row('c:2', { followUp: { id: 6, reason: 'y' } })];
  await a.store.actions.boot(parseRoute('#/dashboard/followups/c%3A2'), { wide: true });
  assert.deepEqual(opened(a.calls), ['GET /api/items/c:2?followup=6', 'POST /api/items/c:2/seen']);
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:2?followup=6'), 'and a refresh asks for it again');
  assert.equal(a.calls.some((c) => c.path.endsWith('/draft')), false);
});

test('followUpOf finds the follow-up on the Follow-ups list only', () => {
  const rows = [row('c:1', { followUp: { id: 5 } }), row('c:2')];
  assert.equal(followUpOf({ chip: 'followups', rows }, 'c:1'), 5);
  assert.equal(followUpOf({ chip: 'followups', rows }, 'c:2'), undefined);
  assert.equal(followUpOf({ chip: 'followups', rows }, 'c:9'), undefined);
  assert.equal(followUpOf({ chip: 'all', rows }, 'c:1'), undefined);
});

test('Back or forward to a follow-up on another chip opens that one with its follow-up, and writes nothing', async () => {
  const a = setup();
  a.data.items['c:2'] = { key: 'c:2', anchor: 'a-c:2', draft: null };
  await a.store.actions.boot(parseRoute('#/dashboard/all/c%3A1'), { wide: true });
  a.data.rows = [row('c:1', { followUp: { id: 5, reason: 'x' } }), row('c:2', { followUp: { id: 6, reason: 'y' } })];
  a.calls.length = 0;
  await a.store.actions.setChip('followups', { key: 'c:2' });
  assert.equal(a.store.get().chip, 'followups');
  assert.ok(paths(a.calls).includes('GET /api/items/c:2?followup=6'));
  assert.equal(paths(a.calls).includes('GET /api/items/c:1?followup=5'), false, 'not the first follow-up');
  assert.equal(a.store.get().key, 'c:2');
  assert.equal(a.calls.some((c) => c.path.endsWith('/draft')), false, 'no paid request spent by Back');
  // The conversation already open, now with its follow-up in hand.
  a.calls.length = 0;
  await a.store.actions.setChip('all', { key: 'c:2' });
  await a.store.actions.setChip('followups', { key: 'c:2' });
  assert.ok(paths(a.calls).includes('GET /api/items/c:2?followup=6'));
});

test('Back to the Follow-ups list without a conversation shows the list, and opens and writes nothing', async () => {
  // On a phone: Follow-ups, ‹ List, All, then Back.
  const a = setup();
  a.data.rows = [row('c:2', { followUp: { id: 5, reason: 'x' } })];
  a.data.items['c:2'] = { key: 'c:2', anchor: 'a-c:2', draft: null };
  await a.store.actions.setChip('followups', { key: null });
  assert.equal(a.store.get().chip, 'followups');
  assert.equal(a.store.get().key, null);
  assert.deepEqual(opened(a.calls), []);
  assert.equal(a.calls.some((c) => c.path.endsWith('/draft')), false);
});

test('Follow-ups writes the first one only when it has no suggestion and none is being written', async () => {
  const a = setup();
  a.data.rows = [row('c:2', { followUp: { id: 5, reason: 'x' } })];
  a.data.items['c:2'] = { key: 'c:2', anchor: 'a-c:2', draft: null, writing: true };
  await a.store.actions.setChip('followups');
  assert.equal(a.store.get().key, 'c:2');
  assert.equal(a.calls.some((c) => c.path.endsWith('/draft')), false);
});

test('a chip chosen while Follow-ups was loading opens nothing from Follow-ups', async () => {
  const a = setup();
  a.data.rows = [row('c:2', { followUp: { id: 5, reason: 'x' } })];
  await Promise.all([a.store.actions.setChip('followups'), a.store.actions.setChip('all')]);
  assert.equal(a.store.get().chip, 'all');
  assert.equal(a.store.get().key, null);
  assert.deepEqual(opened(a.calls), []);
});
