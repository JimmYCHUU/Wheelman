// Imports on the new page: Copy for Gmail, the research notes, every message behind More messages,
// and the email's own facts. Pure functions; invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mainFor, copiedWords } from '../web/new/js/channel.js';
import { messageOptions } from '../web/new/js/messages.js';
import { researchView, emailRows } from '../web/new/js/emailview.js';
import { sectionBox } from '../web/new/js/boxsections.js';
import { sectionRowView } from '../web/new/js/sections.js';
import { listTime, clock } from '../web/lib/format.js';

const NOW = Date.UTC(2026, 9, 28, 3, 0, 0);
const mail = (o = {}) => ({ subject: 'Importing a Toyota Hiace GDH206', customerEmail: 'hollis@example.com', car: 'Toyota Hiace GDH206', messages: 5, collapsed: 0, firstAt: NOW - 86400e3, lastAt: NOW - 3600e3, draftsOff: false, ...o });
const email = (o = {}) => ({ key: 'em:1', channel: 'email', state: 'awaiting', anchor: 'a1', mail: mail(), draft: { id: 1, status: 'ready', reply: 'Hello', edited: null }, ...o });

test("an email's main button is Copy for Gmail and its toast says to paste it into Gmail", () => {
  const a = mainFor({ item: email(), text: 'Thanks for asking.', checks: [], overridden: false });
  assert.deepEqual([a.kind, a.label], ['copy', 'Copy for Gmail']);
  assert.equal(copiedWords(email(), 0), 'Copied. Paste it into your reply in Gmail.');
});

test('research notes list what was found, what was not and where it was read', () => {
  assert.equal(researchView(null), null);
  const r = { found: ['Toyota Hiace GDH206: can be imported'], notFound: ['The landed cost'], notes: ['The list was read earlier.'],
    sources: [{ url: 'https://example.com/a', label: 'Hiace on our website' }], readAt: NOW, listReadAt: NOW - 2 * 86400e3 };
  const v = researchView(r);
  assert.equal(v.count, 2);
  assert.deepEqual([v.found, v.notFound, v.notes], [r.found, r.notFound, r.notes]);
  assert.deepEqual(v.sources, [{ url: 'https://example.com/a', label: 'Hiace on our website' }]);
  assert.equal(v.when, 'Looked up ' + clock(NOW) + ', from the eligible-models list read ' + listTime(r.listReadAt) + '.');
  // Nothing found is still told: a count of 0 and no invented model.
  assert.deepEqual(researchView({ found: [], notFound: [], notes: [], sources: [], readAt: NOW }).found, []);
  assert.equal(researchView({ readAt: NOW }).when, 'Looked up ' + clock(NOW) + '.');
});

test('More messages lists every message past the three on the Instead line', () => {
  const templates = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id, label: id.toUpperCase(), best: id === 'b' }));
  // Nothing in the box: the three shown (best first), then the rest in the server's order.
  let o = messageOptions({ template: '', templates });
  assert.deepEqual(o.shown.map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(o.more.map((x) => x.id), ['d', 'e', 'f', 'g', 'h']);
  // One in the box is neither shown nor in More; the reply to what they wrote is on the line.
  o = messageOptions({ template: 'd', templates });
  assert.deepEqual(o.shown.map((x) => x.id), ['', 'b', 'a']);
  assert.deepEqual(o.more.map((x) => x.id), ['c', 'e', 'f', 'g', 'h']);
  // Three or fewer: no More.
  assert.deepEqual(messageOptions({ template: '', templates: templates.slice(0, 3) }).more, []);
  assert.deepEqual(messageOptions({ template: '' }), { shown: [], more: [] });
});

test('a folded email says so on its row and in the panel', () => {
  const row = { key: 'em:1', anchor: 'a1', state: 'awaiting', collapsed: 1, unread: 0, lastAt: NOW, preview: { who: 'customer', text: 'Hi' } };
  assert.deepEqual([sectionRowView(row, { now: NOW }, 'importquery').reason, sectionRowView(row, { now: NOW }, 'importquery').tone], ['Folded in Gmail', 'warn']);
  assert.equal(sectionRowView({ ...row, collapsed: 0 }, { now: NOW }, 'importquery').reason, '');
  assert.notEqual(sectionRowView(row, { now: NOW, doneAnchor: 'a1' }, 'importquery').reason, 'Folded in Gmail');
  const { rows, folded } = emailRows(mail({ collapsed: 1 }));
  assert.deepEqual(rows.map((r) => r.label), ['Subject', 'From', 'Model asked about', 'Messages', 'First message', 'Latest']);
  assert.equal(rows.find((r) => r.label === 'Messages').value, '5, 1 folded in Gmail');
  assert.equal(rows.find((r) => r.label === 'From').value, 'hollis@example.com');
  assert.equal(folded, 'Part of this thread could not be read because Gmail had folded it. In Gmail, press Expand all, then Send to Wheelman again.');
  assert.equal(emailRows(mail()).folded, '');
  assert.equal(emailRows(mail()).rows.find((r) => r.label === 'Messages').value, '5');
});

test('an email with suggestions switched off says so and offers nothing to copy', () => {
  const off = email({ mail: mail({ draftsOff: true }), draft: null });
  const v = sectionBox({ item: off, now: NOW });
  assert.deepEqual([v.kind, v.sentence, v.button, v.tell], ['quiet', 'Suggested replies for emails are switched off.', null, false]);
  assert.ok(!v.copy);
  assert.equal(sectionBox({ item: { ...off, autoReason: 'Email suggestions are paused.' }, now: NOW }).sentence, 'Email suggestions are paused.');
  // A ready suggestion is shown as before, and with drafts on there is still a Write it now.
  assert.equal(sectionBox({ item: { ...off, draft: { id: 2, status: 'ready', reply: 'Hi', edited: null } }, now: NOW }).kind, 'editor');
  assert.equal(sectionBox({ item: email({ draft: null }), now: NOW }).button.label, 'Write it now');
});
