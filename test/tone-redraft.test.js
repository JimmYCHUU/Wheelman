// The re-draft script's matching: a judged turn, whose customer details were replaced by bracket
// tokens, is found again among the stored suggestions. No AI, no database. Every text is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyTestEnv } from './support/env.js';

applyTestEnv();
const { matchTurnToDraft, isLiveDatabase } = await import('../scripts/tone-redraft.js');

test('the re-draft script never runs on the live database: a file named app.db in a folder named data', () => {
  assert.equal(isLiveDatabase(path.join(os.tmpdir(), 'somewhere', 'data', 'app.db')), true);
  assert.equal(isLiveDatabase(path.join('data', 'app.db')), true, 'a relative path is resolved first');
  assert.equal(isLiveDatabase(path.join(os.tmpdir(), 'somewhere', 'Data', 'APP.DB')), true, 'Windows ignores case');
  assert.equal(isLiveDatabase(path.join(os.tmpdir(), 'copies', 'app-copy.db')), false);
  assert.equal(isLiveDatabase(path.join(os.tmpdir(), 'copies', 'data', 'app-2026-10-21.db')), false);
  assert.equal(isLiveDatabase(path.join(os.tmpdir(), 'copies', 'app.db')), false);
  // The script itself refuses before it opens anything.
  const script = fileURLToPath(new URL('../scripts/tone-redraft.js', import.meta.url));
  const live = path.join(os.tmpdir(), `wheelman-redraft-${process.pid}`, 'data', 'app.db');
  const run = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', script, '--ids', 'WM-001', '--dry-run'], { env: { ...process.env, DB_PATH: live }, encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /live database/);
  assert.match(run.stdout, /copy/);
});

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
