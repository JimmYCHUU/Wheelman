// The full stock-list link the prompt always offers ("Full stock list: .../used-cars") is ours, so a
// draft that quotes it passes the link check in both prompt styles, while a made-up page on the same
// site still fails. All data is invented; a stand-in AI service on this computer plays the model.
// Numbers 0491 570 5xx are this file's.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
delete process.env.PROMPT_STYLE;

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

let standins, db, items, drafter, sync, config;
const ai = aiBehaviour();

before(async () => {
  standins = await startStandins({ ai });
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `${standins.base}/chat`;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  sync = await import('../src/sync.js');
  sync.storeVehicles([{ id: 1, stockNo: '5501', year: '2019', title: '2019 Toyota Noah Hybrid', make: 'TOYOTA', model: 'Noah', modelCode: 'ZWR80', auPublishPrice: 33500, odometer: 52000, seats: 8, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'] }]);
});

after(async () => { await standins.close(); });

let mid = 1;
const customer = (n, first, history) => {
  const id = 500 + n;
  db.upsertLead({ id, conversationId: id, firstName: first, lastName: 'Test', phone: `0491 570 5${String(n).padStart(2, '0')}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * DAY, updatedAt: now - HOUR, stocks: ['5501'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id, phone: `+614915705${String(n).padStart(2, '0')}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
  for (const [direction, body, ago] of history) db.upsertMessage({ id: mid++, conversationId: id, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - ago, importedAt: now - ago });
  return () => items.buildItem({ conversationId: id });
};
// One answer per attempt: a draft that fails a hard check gets a second attempt, so each case queues its reply twice.
const script = (...texts) => { ai.script = texts.map((text) => ({ reply: text, needs_human: [], facts_used: [], hold: false })); };
const linkFails = (checks) => checks.filter((c) => c.level === 'fail' && c.code === 'link');

for (const style of ['full', 'compact']) {
  test(`the stock-list link we offer is ours in the ${style} style, and a made-up page on the site still fails`, async () => {
    const item = customer(style === 'full' ? 1 : 2, style === 'full' ? 'Mia' : 'Ruby', [['IN', 'Do you have any other Noah wagons?', 5 * MIN]])();
    const stockList = `${config.site.baseUrl}/used-cars`;

    const good1 = `Hello Mia,
You can see all our vehicles at ${stockList}
We would be pleased to help you choose one.`;
    script(good1, good1);
    const good = await drafter.draftFor(item, { save: false, style: style === 'compact' ? 'compact' : undefined });
    assert.deepEqual(linkFails(good.checks), [], JSON.stringify(good.checks));

    const madeUp = `Hello Mia,
You can see it at ${config.site.baseUrl}/no-such-page
We would be pleased to help you choose one.`;
    script(madeUp, madeUp);
    const made = await drafter.draftFor(item, { save: false, style: style === 'compact' ? 'compact' : undefined });
    assert.ok(linkFails(made.checks).length > 0, JSON.stringify(made.checks));
  });
}
