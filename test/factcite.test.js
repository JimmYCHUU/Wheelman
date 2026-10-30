// Which business facts a suggestion used, for its trust line, and which it needed that have no
// answer, for the line above the box. The topics are invented and passed in: no facts file, no
// database and no server.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

const AT = Date.parse('2026-10-29T01:00:00Z');
const TOPICS = [
  { title: 'Opening hours', status: 'confirmed', answer: 'Open every day of the week.' },
  { title: 'Finance', status: 'confirmed', answer: 'Finance is arranged through a lender; apply on the car page.' },
  { title: 'Tinted windows', status: 'confirmed', answer: 'Yes, we can arrange window tinting before pickup; a person quotes the cost.', at: AT },
  { title: 'Car covers', status: 'needs_answer', answer: '' },
  { title: 'Roof racks', status: 'needs_answer', answer: '' },
];
const TINT = 'Can you tint the windows before I pick it up?';
const USED = 'Yes, we can arrange window tinting before pickup, and we will quote the cost for you.';

let citedTopics, openTopics, knowledge;
before(async () => {
  ({ citedTopics, openTopics } = await import('../src/factcite.js'));
  knowledge = await import('../src/knowledge.js');
});

test('a fact the customer asked about and the reply used is cited; one only given to the AI is not', () => {
  // Asked about tinting, and the reply says what the answer says.
  assert.deepEqual(citedTopics({ asked: TINT, reply: USED, topics: TOPICS }), [{ title: 'Tinted windows', status: 'confirmed', at: AT }]);
  // The same reply to a question about something else: the fact was only in the request.
  assert.deepEqual(citedTopics({ asked: 'Is it still available?', reply: USED, topics: TOPICS }), []);
  // Asked about tinting, answered about finance: the tinting fact was not used.
  assert.deepEqual(citedTopics({ asked: TINT, reply: 'You can apply for finance on the car page, and a lender will be in touch.', topics: TOPICS }), []);
  // One word in common is not enough.
  assert.deepEqual(citedTopics({ asked: TINT, reply: 'Window film is something we can talk about.', topics: TOPICS }), []);
  // A Needs-answer topic is never cited, whatever the reply says.
  assert.deepEqual(citedTopics({ asked: 'Do you sell car covers?', reply: 'We sell fitted car covers for every car.', topics: TOPICS }), []);
  // A topic from the file has no day: `at` is null.
  const fromFile = TOPICS.map(({ at, ...t }) => t);
  assert.deepEqual(citedTopics({ asked: TINT, reply: USED, topics: fromFile }), [{ title: 'Tinted windows', status: 'confirmed', at: null }]);
  // The same rule of asked about as the compact style's (relevantFacts): a title word counts 2, an answer word 1.
  assert.equal(knowledge.topicScore(TOPICS[2], TINT), 3, '"windows" in the title, "before" in the answer');
  assert.equal(knowledge.topicScore(TOPICS[2], TINT, { titleOnly: true }), 2);
  assert.deepEqual(knowledge.factWords('Can you tint the windows before I pick it up?'), ['tint', 'windows', 'before', 'pick']);

  // At most 3, the best asked about first.
  const many = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((w, i) => ({ title: `${w} tinting`, status: i === 1 ? 'working' : 'confirmed', answer: `${w} window tinting before pickup.` }));
  const out = citedTopics({ asked: 'Bravo tinting please, before pickup?', reply: 'Window tinting before pickup is fine.', topics: many });
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((t) => t.title), ['Bravo tinting', 'Alpha tinting', 'Charlie tinting']);
  assert.deepEqual(out[0], { title: 'Bravo tinting', status: 'working', at: null });
  assert.equal(citedTopics({ asked: 'Bravo tinting please, before pickup?', reply: 'Window tinting before pickup is fine.', topics: many, max: 1 }).length, 1);
});

test('a Needs-answer fact the customer asked about is named when the reply has a blank for it', () => {
  const BLANK = 'Thank you for asking. Whether we can supply a car cover is [CHECK?].';
  const COVERS = 'Do you sell car covers for the Noah?';
  assert.deepEqual(openTopics({ asked: COVERS, reply: BLANK, topics: TOPICS }), ['Car covers']);
  // No blank in the reply: nothing to answer.
  assert.deepEqual(openTopics({ asked: COVERS, reply: 'Thank you for asking about car covers.', topics: TOPICS }), []);
  // A blank, but the customer asked about something else.
  assert.deepEqual(openTopics({ asked: 'Is it still available?', reply: BLANK, topics: TOPICS }), []);
  // A topic with an answer is never named here.
  assert.deepEqual(openTopics({ asked: TINT, reply: 'Tinting is [CHECK?].', topics: TOPICS }), []);
  // Two at most, the best asked about first: two title words for roof racks, one for car covers.
  const both = 'Can you fit car covers and roof racks?';
  assert.deepEqual(openTopics({ asked: both, reply: BLANK, topics: TOPICS }), ['Roof racks', 'Car covers']);
  assert.deepEqual(openTopics({ asked: both, reply: BLANK, topics: TOPICS, max: 1 }), ['Roof racks']);
  const three = [...TOPICS, { title: 'Covers for seats', status: 'needs_answer', answer: '' }];
  assert.deepEqual(openTopics({ asked: both, reply: BLANK, topics: three }), ['Roof racks', 'Car covers']);
});
