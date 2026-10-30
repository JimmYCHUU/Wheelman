// The compact style names only the business facts its request carried: the core topics and at most
// five others (relevantFacts), and every topic with no answer. A fact the AI never saw is never named
// in the trust line, however many words the reply shares with it. The full style is as before. The
// facts are invented, in a scratch folder; a stand-in AI service on this computer plays the model.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { inventedFacts } from './support/facts.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
delete process.env.PROMPT_STYLE;

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
const T = (title, answer) => ({ title, status: 'confirmed', answer });
// Seven topics the question matches equally (one title word each), so the compact request carries
// the first five in the file's order and not the last two; and one with no answer.
const FACTS = [
  T('Car delivery', 'We deliver the car anywhere in the state; a person quotes the cost.'),
  T('Car servicing', 'Every car is serviced before pickup.'),
  T('Car finance', 'Finance is arranged through a lender.'),
  T('Car insurance', 'Insurance can be arranged on the day.'),
  T('Car registration', 'Registration is transferred at pickup.'),
  T('Car detailing', 'Every car is detailed before pickup, inside and out.'),
  T('Car tinting', 'Window tinting can be arranged before pickup; a person quotes the cost.'),
  { title: 'Car covers', status: 'needs_answer', answer: '' },
];
const CARRIED = ['Car delivery', 'Car servicing', 'Car finance', 'Car insurance', 'Car registration'];
const ASKED = 'Can you help with delivery, servicing, finance, insurance, registration, detailing, tinting and car covers?';
// Its words share two or more with servicing, registration, detailing and tinting, and it leaves a blank for the covers.
const REPLY = 'Registration is transferred at pickup. Every car is detailed before pickup, and window tinting can be arranged before pickup too. Whether we can supply a car cover is [CHECK?].';

let standins, dir, db, items, drafter, promptModule, knowledge;

before(async () => {
  standins = await startStandins({ ai: aiBehaviour({ behave: () => ({ reply: REPLY, next_step: '', needs_human: [{ marker: '[CHECK?]', reason: 'Nobody has said whether we sell car covers.' }], facts_used: [], hold: false }) }) });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  dir = inventedFacts(FACTS);
  config.knowledgeDir = dir;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  promptModule = await import('../src/prompt.js');
  knowledge = await import('../src/knowledge.js');
});

after(async () => {
  await standins.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let mid = 1;
function customer(id, first, question) {
  const phone = String(id).padStart(2, '0');
  db.upsertLead({ id, conversationId: id + 500, firstName: first, lastName: 'Test', phone: `0491 570 1${phone}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 30 * HOUR, updatedAt: now - 5 * MIN, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: id + 500, phone: `+614915701${phone}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  db.upsertMessage({ id: mid++, conversationId: id + 500, direction: 'IN', body: question, sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });
  return `c:${id + 500}`;
}

test('in the compact style a fact the request did not carry is never cited, and the full style is as before', async () => {
  const key = customer(61, 'Ivy', ASKED);
  const item = items.itemFromKey(key);
  // Written in the compact style: only the carried facts the reply used are named, not detailing or tinting.
  const d = await drafter.draftFor(item, { now, style: 'compact' });
  assert.equal(d.status, 'ready', d.error);
  const { context } = db.latestDraft(item.itemKey, item.anchorKey);
  assert.deepEqual(context.topics.map((t) => t.title), ['Car servicing', 'Car registration']);
  assert.deepEqual(context.openTopics, ['Car covers'], 'a topic with no answer is still named above the box');

  // The request carries five of the seven, and the topic with no answer: those are the ones it names from.
  const compact = promptModule.buildPrompt(item, { now, style: 'compact' });
  assert.deepEqual(compact.factTopics.map((t) => t.title), [...CARRIED, 'Car covers']);
  assert.ok(!compact.user.includes('Car detailing') && !compact.user.includes('Car tinting'), 'never in the compact request');
  // The full style carries every topic, and names from all of them, as before.
  const full = promptModule.buildPrompt(item, { now, style: 'full' });
  assert.deepEqual(full.factTopics, knowledge.loadBusinessFacts());
});
