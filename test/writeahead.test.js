// Written ahead: the ten newest waiting Dashboard conversations get a suggestion even when the
// customer's last message is older than the age gate. Every other gate stays. All data is invented
// (phones 0491 570 1xx); the AI is a stand-in on this computer.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '500' });

const HOUR = 3600e3;
const MIN = 60e3;
let server;
let asked = 0;
let worker, items, db, config;
const ids = {}; // name -> conversation id

before(async () => {
  server = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      asked++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: 'Hello {{NAME}},\nYes, it is available.', needs_human: [], facts_used: [], hold: false }) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `http://127.0.0.1:${server.address().port}/chat`;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  worker = await import('../src/worker.js');

  const now = Date.now();
  let n = 0;
  let mid = 1;
  // One waiting customer whose only message is `minsOld` minutes old. kind: 'known', 'stranger' or 'photo'.
  const add = (name, minsOld, kind = 'known') => {
    n++;
    const id = 500 + n;
    const at = now - minsOld * MIN;
    const phone = `+61491570${String(100 + n).padStart(3, '0')}`;
    const leadId = kind === 'stranger' ? null : 600 + n;
    if (leadId) db.upsertLead({ id: leadId, conversationId: id, firstName: name, lastName: 'Test', phone, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: at, updatedAt: at, stocks: [], inquiries: [] });
    db.upsertConversation({ id, phone, channel: 'SMS', status: 'OPEN', leadId, customerName: kind === 'stranger' ? phone : `${name} Test`, latestDirection: 'IN', latestAt: at, latestBody: 'x' });
    if (kind === 'photo') db.upsertMessage({ id: mid++, conversationId: id, direction: 'IN', body: '', sentBy: null, status: 'SENT', mediaType: 'image/jpeg', at, importedAt: at });
    else db.upsertMessage({ id: mid++, conversationId: id, direction: 'IN', body: 'Is it still available?', sentBy: null, status: 'SENT', mediaType: null, at, importedAt: at });
    ids[name] = `c:${id}`;
  };
  // All older than the age gate (24 hours). Newest first: K1, K2, Photo, K3, K4, Stranger, K5..K8
  // are the ten newest; K9 and K10 are the eleventh and twelfth.
  const base = 30 * 60;
  add('K1', base + 1); add('K2', base + 2); add('Photo', base + 3, 'photo');
  add('K3', base + 4); add('K4', base + 5); add('Stranger', base + 6, 'stranger');
  add('K5', base + 7); add('K6', base + 8); add('K7', base + 9); add('K8', base + 10);
  add('K9', base + 11); add('K10', base + 12);
});

after(() => new Promise((r) => server.close(r)));

const draftOf = (name) => { const it = items.itemFromKey(ids[name]); return db.latestDraft(it.itemKey, it.anchorKey); };

test('the newest waiting keys are in the Waiting list order, dismissed ones left out', () => {
  const keys = items.newestWaitingKeys(10);
  assert.deepEqual(keys, ['K1', 'K2', 'Photo', 'K3', 'K4', 'Stranger', 'K5', 'K6', 'K7', 'K8'].map((k) => ids[k]));
  // Nothing is written for any of them by the ordinary queue: they are all past the age gate.
  assert.equal(items.itemFromKey(ids.K1).autoDraft, false);
  assert.equal(items.itemFromKey(ids.K1, { autoDraftMaxAgeHours: Infinity }).autoDraft, true);
});

test('the top ten skip the age gate only', async () => {
  asked = 0;
  const made = await worker.draftWaiting();
  assert.equal(made, 8);
  assert.equal(asked, 8);
  for (const k of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8']) assert.ok(draftOf(k), `${k} should have a draft`);
  assert.equal(draftOf('K9'), undefined, 'the eleventh is past the age gate and outside the ten');
  assert.equal(draftOf('K10'), undefined);
  assert.equal(draftOf('Stranger'), undefined, 'no customer record: still no draft');
  assert.equal(draftOf('Photo'), undefined, 'a photo with no words: still no draft');
});

test('the top ten are written newest first and once', async () => {
  const order = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8'].map((k) => draftOf(k).id);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'drafts were made newest first');
  asked = 0;
  assert.equal(await worker.draftWaiting(), 0);
  assert.equal(asked, 0);
});

test('a dismissed conversation is not in the ten, so the eleventh moves up', async () => {
  const k1 = items.itemFromKey(ids.K1);
  db.dismiss(k1.itemKey, k1.anchorKey);
  assert.ok(items.newestWaitingKeys(10).includes(ids.K9));
  assert.ok(!items.newestWaitingKeys(10).includes(ids.K1));
  asked = 0;
  assert.equal(await worker.draftWaiting(), 1);
  assert.ok(draftOf('K9'));
  assert.equal(draftOf('K10'), undefined);
});

test('the daily limit still stops the pass', async () => {
  // Three newer waiting customers, so there is something to write.
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    const id = 700 + i;
    const at = now - (30 * 60 - 1 - i) * MIN; // newer than the others, still past the age gate
    db.upsertLead({ id: 800 + i, conversationId: id, firstName: `L${i}`, lastName: 'Test', phone: `+61491570${190 + i}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: at, updatedAt: at, stocks: [], inquiries: [] });
    db.upsertConversation({ id, phone: `+61491570${190 + i}`, channel: 'SMS', status: 'OPEN', leadId: 800 + i, customerName: `L${i} Test`, latestDirection: 'IN', latestAt: at, latestBody: 'x' });
    db.upsertMessage({ id: 900 + i, conversationId: id, direction: 'IN', body: 'Is it still available?', sentBy: null, status: 'SENT', mediaType: null, at, importedAt: at });
  }
  const { usage } = await import('../src/llm.js');
  const realLimit = config.llm.dailyLimit;
  config.llm.dailyLimit = usage().total + 2;
  worker.state.pausedUntil = 0;
  asked = 0;
  try {
    assert.equal(await worker.draftWaiting(), 2);
    assert.equal(asked, 2);
    assert.ok(!draftOf('K10'), 'nothing past the limit');
  } finally {
    config.llm.dailyLimit = realLimit;
    worker.state.pausedUntil = 0;
  }
});
