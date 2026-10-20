// Follow-ups: a conversation we replied to last is put in front of the owner again when there is a
// reason to write: an inspection's booked time has passed, or the customer has gone quiet after
// our reply. The follow-up is written when the conversation is opened from the Follow-ups list,
// copied by a person, and never learned from. Every name, number and car here is invented; the
// phone numbers are in the 0491 570 1xx range reserved for fiction.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

let config, db;

before(async () => {
  ({ config } = await import('../src/config.js'));
  db = await import('../src/db.js');
});

// ---- the table ----------------------------------------------------------------------------------

test('a follow-up occasion is raised once, closed, reopened, and moves with a rekeyed lead', () => {
  const id = db.insertFollowUp({ itemKey: 'l:900', leadId: 900, kind: 'quiet', occasion: 'quiet:m:1', sinceAt: 1000, reason: 'Quiet 3 days', template: 'quiet_nudge', dueAt: 2000, data: { a: 1 } });
  assert.ok(id > 0);
  assert.equal(db.insertFollowUp({ itemKey: 'l:900', leadId: 900, kind: 'quiet', occasion: 'quiet:m:1', sinceAt: 1000, reason: 'x', template: 'quiet_nudge', dueAt: 2000 }), null, 'the same occasion is never raised twice');
  assert.deepEqual([db.getFollowUp(id).data, db.openFollowUpFor('l:900').id, db.openFollowUps().map((r) => r.id), db.followUpsFor('l:900').length], [{ a: 1 }, id, [id], 1]);
  db.closeFollowUp(id, 'copied', { draftId: 7 });
  assert.deepEqual([db.getFollowUp(id).done_how, db.getFollowUp(id).draft_id, db.openFollowUpFor('l:900')], ['copied', 7, null]);
  db.reopenFollowUp(id);
  assert.deepEqual([db.getFollowUp(id).done_how, db.getFollowUp(id).done_at], [null, null]);
  db.upsertLead({ id: 900, conversationId: 901, firstName: 'Quin', lastName: 'Marsh', phone: '0491570121', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: 1, updatedAt: 1, stocks: [], inquiries: [] });
  db.rekeyLeadItems();
  assert.equal(db.getFollowUp(id).item_key, 'c:901', 'the row follows the lead into its text conversation');
  assert.equal(db.lastDismissedAt('c:901'), 0);
  db.dismiss('c:901', 'm:5');
  assert.ok(db.lastDismissedAt('c:901') > 0);
  assert.equal(db.getFollowUp(999), null);
});

test('a follow-up draft is never waiting for an outcome', () => {
  const a = db.insertDraft({ itemKey: 'c:901', anchorKey: 'fu:1', status: 'ready', reply: 'x' });
  const b = db.insertDraft({ itemKey: 'c:901', anchorKey: 'm:5', status: 'ready', reply: 'y' });
  assert.deepEqual(db.draftsAwaitingOutcome().map((d) => d.id).filter((x) => x === a || x === b), [b]);
});
