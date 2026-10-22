// The re-draft script's matching: a judged turn, whose customer details were replaced by bracket
// tokens, is found again among the stored suggestions. No AI, no database. Every text is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();
const { matchTurnToDraft } = await import('../scripts/tone-redraft.js');

test('a turn finds the stored suggestion its redacted words came from', () => {
  const drafts = [{ reply: 'Hello Priya,\nYes, the Noah is here.' }, { reply: 'Hello Priya,\nNo.' }];
  assert.equal(matchTurnToDraft({ suggestion: 'Hello [NAME],\nYes, the Noah is here.' }, drafts), drafts[0]);
});

test('a turn whose words are in no stored suggestion matches nothing', () => {
  const drafts = [{ reply: 'Hello Priya,\nYes, the Noah is here.' }, { reply: 'Hello Priya,\nNo.' }];
  assert.equal(matchTurnToDraft({ suggestion: 'Hello [NAME],\nThe Voxy sold on Tuesday.' }, drafts), null);
  // Every chunk must be there, in order.
  assert.equal(matchTurnToDraft({ suggestion: 'Yes, the Noah is here. [NAME], Hello Priya and welcome' }, [{ reply: 'Hello Priya and welcome. Yes, the Noah is here.' }]), null);
});

test('phone, email, rego, address and number tokens stand for whatever was there', () => {
  const reply = 'Hello Priya,\nThe Noah with rego ABC12D is ready. Call 0491 570 156 or write to priya.w@example.com.\nWe are at 12 Smith Street and the stock number is 4417 for your records.';
  const turn = { suggestion: 'Hello [NAME],\nThe Noah with rego [REGO] is ready. Call [PHONE] or write to [EMAIL].\nWe are at [ADDRESS] and the stock number is [NUMBER] for your records.' };
  const drafts = [{ reply: 'Hello Priya,\nThe Noah is ready.' }, { reply }];
  assert.equal(matchTurnToDraft(turn, drafts), drafts[1]);
});

test('a turn with no stretch of its own words long enough to match is not guessed', () => {
  assert.equal(matchTurnToDraft({ suggestion: 'Yes [NAME].' }, [{ reply: 'Yes Priya.' }]), null);
});

test('the same words written twice for one message are one suggestion; for two customers they are not', () => {
  const first = { item_key: 'mp:7', anchor_key: 'fm:70', reply: 'Hello Priya,\nYes, the Noah is here.' };
  const again = { item_key: 'mp:7', anchor_key: 'fm:70', reply: 'Hello Priya,\nYes, the Noah is here.' };
  const other = { item_key: 'mp:8', anchor_key: 'fm:80', reply: 'Hello Sam,\nYes, the Noah is here.' };
  const turn = { suggestion: 'Hello [NAME],\nYes, the Noah is here.' };
  assert.equal(matchTurnToDraft(turn, [first, again]), first);
  assert.equal(matchTurnToDraft(turn, [first, other]), null);
});
