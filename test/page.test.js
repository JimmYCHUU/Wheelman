// The page's own small modules, run in Node: the wording table, the formatters, the counts, the
// store, the section registry and the list column's pure parts. Nothing here touches the DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, listOf, COPY } from '../web/lib/copy.js';
import { clock, dayLabel, listTime, ago, initials, hue, money, km, plural } from '../web/lib/format.js';
import { newCount, totalNew } from '../web/lib/counts.js';
import { createStore } from '../web/lib/store.js';
import { SECTIONS, SECTION_IDS, sectionOf, TAB_STATE, ORDER_LIST } from '../web/sections/registry.js';
import { visibleRows, rowTags } from '../web/views/ListColumn.js';

// 6 October 2026, 2 pm in Sydney (daylight saving: UTC+11).
const NOW = Date.UTC(2026, 9, 6, 3, 0, 0);
const HOUR = 3600000, DAY = 86400000;

test('the wording table fills in names and picks plurals by the number', () => {
  assert.equal(t('status.checked', { place: 'Dashboard', ago: '2 min ago' }), 'Dashboard checked 2 min ago');
  assert.equal(t('row.unread', { n: 1 }), 'unread message');
  assert.equal(t('row.unread', { n: 2 }), 'unread messages');
  assert.equal(t('learned.changed', { n: 1 }), '1 reply you changed');
  assert.equal(t('learned.changed', { n: 3 }), '3 replies you changed');
  assert.equal(t('welcome.waiting', { n: 2, noun: 'buyers' }), '2 buyers waiting for a reply');
  assert.equal(t('status.ai', { used: 14, limit: 500 }), '14 of 500 AI requests used today');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.equal(t('status.checking', {}), 'Checking ');
  assert.equal(listOf(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listOf(['a']), 'a');
  assert.equal(listOf([]), '');
  for (const [key, value] of Object.entries(COPY)) assert.equal(typeof value, 'string', key);
});

test('the settled words: nothing on a row reads as Send, nothing says agent or chat', () => {
  const text = Object.values(COPY).join('\n');
  assert.doesNotMatch(text, /\bSend:/);
  assert.doesNotMatch(text, /\bthe agent\b/i);
  assert.doesNotMatch(text, /\bNeeds a person\b/);
  assert.equal(t('tag.needsYou'), 'Needs you');
  assert.equal(t('tag.phoneOnly'), 'Phone only');
});

test('times are in Sydney time and in words a person would use', () => {
  assert.match(clock(NOW - HOUR), /^1:00[  ]pm$/);
  assert.equal(clock(0), '');
  assert.equal(dayLabel(NOW, NOW), 'Today');
  assert.equal(dayLabel(NOW - DAY, NOW), 'Yesterday');
  assert.equal(dayLabel(NOW - 2 * DAY, NOW), 'Sunday 4 October');
  assert.match(listTime(NOW - HOUR, NOW), /^1:00[  ]pm$/);
  assert.equal(listTime(NOW - DAY, NOW), 'Yesterday');
  assert.equal(listTime(NOW - 2 * DAY, NOW), 'Sunday');
  assert.match(listTime(NOW - 40 * DAY, NOW), /^27 Aug$/);
  assert.equal(listTime(0, NOW), '');
  assert.equal(ago(NOW, NOW), 'just now');
  assert.equal(ago(NOW - 5 * 60000, NOW), '5 min ago');
  assert.equal(ago(NOW - 3 * HOUR, NOW), '3 h ago');
  assert.equal(ago(NOW - 3 * DAY, NOW), '3 days ago');
});

test('initials, avatar colours, money and counts', () => {
  assert.equal(initials('Priya Raman'), 'PR');
  assert.equal(initials('  priya  '), 'P');
  assert.equal(initials(''), '');
  assert.equal(hue('Priya Raman'), hue('priya raman'));
  assert.ok(hue('Tom Bell') >= 0 && hue('Tom Bell') < 8);
  assert.equal(money(33900), '$33,900');
  assert.equal(money(null), '');
  assert.equal(km(98000), '98,000 km');
  assert.equal(plural(1, 'reply', 'replies'), '1 reply');
  assert.equal(plural(2, 'reply', 'replies'), '2 replies');
});

test('the numbers on the page never count the conversation on screen', () => {
  const state = {
    section: 'dashboard', selected: 'c:1',
    list: [{ key: 'c:1', unread: 2 }, { key: 'c:2', unread: 1 }],
    unread: { dashboard: 3, marketplace: 1, auction: null },
  };
  assert.equal(newCount(state, 'dashboard'), 2);
  assert.equal(newCount(state, 'marketplace'), 1);
  assert.equal(newCount(state, 'auction'), 0);
  const on = (id) => id === 'dashboard' || state.unread[id] !== null;
  assert.equal(totalNew(state, SECTION_IDS, on), 3);
  state.selected = null;
  assert.equal(newCount(state, 'dashboard'), 3);
});

test('the store calls a view once now, then only when what it selected has changed', async () => {
  const state = { a: 1, b: 1 };
  const store = createStore(state);
  const seen = [];
  store.select((s) => ({ a: s.a }), (next, prev) => seen.push([next.a, prev?.a]));
  assert.deepEqual(seen, [[1, undefined]]);
  state.b = 2; store.notify();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(seen.length, 1, 'a change to something unselected is ignored');
  state.a = 2; store.notify(); store.notify(); store.notify();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, [[1, undefined], [2, 1]], 'three notifies in one tick are one pass');
});

test('the section registry names every section, its lists and where a key belongs', () => {
  assert.deepEqual(SECTION_IDS, ['dashboard', 'marketplace', 'auction']);
  assert.equal(sectionOf('c:12'), 'dashboard');
  assert.equal(sectionOf('l:12'), 'dashboard');
  assert.equal(sectionOf('ph:0491570101'), 'dashboard');
  assert.equal(sectionOf('mp:abc'), 'marketplace');
  assert.equal(sectionOf('ao:504'), 'auction');
  assert.equal(sectionOf(undefined), 'dashboard');
  assert.equal(SECTIONS.marketplace.tabs[2], null, 'Marketplace has no third list');
  assert.deepEqual(SECTIONS.auction.tabs.map((x) => x.label), ['To do', 'In progress', 'Finished']);
  assert.equal(ORDER_LIST[TAB_STATE.quiet], 'In progress');
  for (const id of SECTION_IDS) {
    const sec = SECTIONS[id];
    for (const list of ['waiting', 'quiet', 'other', 'search']) assert.equal(sec.empty[list].length, 2, `${id} ${list} empty state`);
    assert.ok(sec.search.placeholder.startsWith('Search '), id);
  }
});

test('a search looks at names, words and digits; in Auction it looks through every list', () => {
  const list = [
    { key: 'c:1', name: 'Priya Raman', phone: '0491 570 101', preview: { text: 'Is the Noah still available?' } },
    { key: 'c:2', name: 'Tom Bell', phone: '0491 570 222', preview: { text: 'Best price?' } },
  ];
  const state = { section: 'dashboard', q: '', list, everything: [] };
  assert.equal(visibleRows(state), list);
  state.q = '570 1';
  assert.deepEqual(visibleRows(state).map((r) => r.key), ['c:1']);
  state.q = 'tom';
  assert.deepEqual(visibleRows(state).map((r) => r.key), ['c:2']);
  state.q = 'noah';
  assert.deepEqual(visibleRows(state).map((r) => r.key), ['c:1']);
  const auction = { section: 'auction', q: 'as-504', list: [], everything: [{ key: 'ao:1', name: 'Pia', orderNo: 'AS-504', preview: {} }] };
  assert.deepEqual(visibleRows(auction).map((r) => r.key), ['ao:1']);
});

test('a row carries at most two tags, in the settled words and tones', () => {
  const state = { tab: 'waiting' };
  assert.deepEqual(rowTags({ section: 'auction', state: 'answered', due: 'Send: car secured', dueKind: 'event' }, state),
    [{ text: 'In progress', tone: 'neutral' }, { text: 'Due: car secured', tone: 'warning' }]);
  assert.deepEqual(rowTags({ section: 'auction', state: 'awaiting', due: 'Reply to their message', dueKind: 'reply' }, state),
    [{ text: 'Reply to their message', tone: 'info' }]);
  assert.deepEqual(rowTags({ section: 'dashboard', state: 'awaiting', dismissed: true, phoneOnly: true, flag: 'fail' }, state),
    [{ text: 'Phone only', tone: 'neutral' }, { text: 'Dismissed', tone: 'neutral' }]);
  assert.deepEqual(rowTags({ section: 'dashboard', state: 'awaiting', flag: 'fail' }, state), [{ text: 'Check the reply', tone: 'danger' }]);
  assert.deepEqual(rowTags({ section: 'dashboard', state: 'awaiting', flag: 'input' }, state), [{ text: 'Blank to fill', tone: 'warning' }]);
  assert.deepEqual(rowTags({ section: 'marketplace', state: 'awaiting', needsPerson: true, unanswered: 1 }, state), [{ text: 'Needs you', tone: 'info' }]);
  assert.deepEqual(rowTags({ section: 'dashboard', state: 'answered' }, state), []);
});
