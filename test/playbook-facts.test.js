// The Playbook's business facts: every fact listed with its state, an answer saved there used in the
// next request, and every version kept in the database while the facts file is never written. The
// facts are invented (test/support/facts.js), in a scratch folder: no test here reads the real facts
// file. A stand-in AI service on this computer plays the model; the page's own routes are called.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { inventedFacts, INVENTED_FACTS } from './support/facts.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
delete process.env.PROMPT_STYLE;

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
const NAME = 'business-facts.md';
let standins, app, base, db, items, knowledge, promptModule, sydneyDay, dir;

before(async () => {
  standins = await startStandins({ ai: aiBehaviour() });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  dir = inventedFacts();
  config.knowledgeDir = dir;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  knowledge = await import('../src/knowledge.js');
  promptModule = await import('../src/prompt.js');
  ({ sydneyDay } = await import('../src/time.js'));
  const sync = await import('../src/sync.js');
  sync.storeVehicles([{ id: 1, stockNo: '1300', year: '2021', title: '2021 Toyota Noah X', make: 'TOYOTA', model: 'Noah', modelCode: 'ABC10', auPublishPrice: 21900, odometer: 60000, seats: 8, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'] }]);
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let mid = 1;
/** A customer who asked about the Noah (stock 1300) five minutes ago. */
function customer(id, first, question) {
  const phone = String(id).padStart(2, '0');
  db.upsertLead({ id, conversationId: id + 500, firstName: first, lastName: 'Test', phone: `0491 570 1${phone}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 30 * HOUR, updatedAt: now - 5 * MIN, stocks: ['1300'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: id + 500, phone: `+614915701${phone}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  db.upsertMessage({ id: mid++, conversationId: id + 500, direction: 'IN', body: question, sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });
  return `c:${id + 500}`;
}
const post = async (p, body = {}) => { const res = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, ...(await res.json()) }; };
const get = async (p) => (await fetch(base + p)).json();
const factsListed = async () => (await get('/api/playbook/facts')).facts;
const listed = async (title) => (await factsListed()).find((f) => f.title === title);
/** The request Wheelman would send for this conversation now. */
const asked = (key) => promptModule.buildPrompt(items.itemFromKey(key), { now: Date.now(), style: 'full' }).user;
/** One section of a request: the lines from its heading to the next heading, each after a line break. */
const section = (user, heading) => `\n${(user.match(new RegExp(`\\n=== ${heading} ===\\n([\\s\\S]*?)(?=\\n=== |$)`)) || [])[1] || ''}`;
const versions = (part) => db.versionsOf({ kind: 'fact', name: NAME, part });
const factsFile = () => path.join(dir, NAME);
const fileAnswer = (title) => INVENTED_FACTS.find((f) => f.title === title).answer;

// First, while nothing is saved: every later test saves something.
test('with nothing saved in the Playbook, the facts are the file\'s, as before', () => {
  assert.equal(db.countRows('playbook_versions'), 0);
  const laid = knowledge.loadBusinessFacts();
  assert.deepEqual(laid, knowledge.loadBusinessFacts(undefined, { playbook: false }));
  // Exactly the file's topics: no `at` key on any of them.
  assert.deepEqual(laid, INVENTED_FACTS);
  const forPrompt = knowledge.businessFactsForPrompt();
  assert.equal(forPrompt.text, [
    '- Opening hours: Open every day of the week.',
    '- Holding deposit: A refundable holding deposit takes a car off the market.',
    '- Roof racks: We can fit roof racks before pickup; a person quotes the cost.',
  ].join('\n'));
  assert.deepEqual(forPrompt.unanswered, ['Tinted windows', 'Car covers']);
  assert.equal(db.versionsStamp(), 0);
});

test('the Playbook lists every business fact with its state, and an answer saved there is used in the next request', async () => {
  const key = customer(1, 'Ava', 'Can you tint the windows on the Noah before I pick it up?');
  assert.match(section(asked(key), 'TOPICS WITH NO CONFIRMED ANSWER'), /^- Tinted windows$/m, 'before the answer, it is a topic with no answer');

  const before = await get('/api/playbook/facts');
  assert.deepEqual(before.facts.map((f) => [f.title, f.status, f.answer, f.from]), INVENTED_FACTS.map((f) => [f.title, f.status, f.answer, 'file']));
  assert.deepEqual(before.counts, { confirmed: 2, working: 1, needsAnswer: 2 });
  assert.deepEqual(before.facts[2], { title: 'Roof racks', status: 'working', answer: fileAnswer('Roof racks'), at: null, from: 'file', earlier: [], file: null });

  const start = Date.now();
  const TINT = 'Yes, we can arrange window tinting before pickup, and a person quotes the cost.';
  const out = await post('/api/playbook/facts', { title: 'Tinted windows', answer: `  ${TINT}\n` });
  assert.equal(out.status, 200, out.error);
  assert.deepEqual([out.fact.title, out.fact.status, out.fact.answer, out.fact.from], ['Tinted windows', 'confirmed', TINT, 'playbook']);
  assert.ok(out.fact.at >= start && out.fact.at <= Date.now());
  assert.equal(sydneyDay(out.fact.at), sydneyDay(), 'saved today');
  assert.deepEqual(out.fact.earlier, [{ answer: '', status: 'needs_answer', at: null, from: 'file' }]);
  assert.equal(out.fact.file, null);
  assert.deepEqual(out.fact, await listed('Tinted windows'), 'the fact as the Playbook lists it');
  assert.ok(db.versionsStamp() > 0);

  const user = asked(key);
  assert.ok(section(user, 'BUSINESS FACTS').includes('\n- Tinted windows: Yes, we can arrange window tinting'), 'under BUSINESS FACTS');
  assert.doesNotMatch(section(user, 'TOPICS WITH NO CONFIRMED ANSWER'), /^- Tinted windows$/m);

  const status = await get('/api/status');
  assert.equal(status.facts.needsAnswer, 1);
  assert.deepEqual(status.facts.unanswered, ['Car covers']);
  assert.deepEqual((await get('/api/playbook/facts')).counts, { confirmed: 3, working: 1, needsAnswer: 1 });
});

test('saving a fact never writes the facts file, and every version is kept', async () => {
  const bytes = fs.readFileSync(factsFile());
  const { mtimeMs } = fs.statSync(factsFile());
  const words = [
    'A refundable holding deposit holds a car for you.',
    'A refundable holding deposit holds the car until pickup.',
    'A refundable holding deposit takes the car off the market until pickup.',
  ];
  for (const answer of words) {
    const out = await post('/api/playbook/facts', { title: 'Holding deposit', answer, status: 'confirmed' });
    assert.equal(out.status, 200, out.error);
  }
  assert.ok(fs.readFileSync(factsFile()).equals(bytes), 'the file is byte for byte as it was');
  assert.equal(fs.statSync(factsFile()).mtimeMs, mtimeMs);

  const rows = versions('Holding deposit');
  assert.deepEqual(rows.map((r) => r.text), [...words].reverse(), 'three rows, newest first');
  const fileOwn = { status: 'confirmed', answer: fileAnswer('Holding deposit') };
  assert.ok(rows.every((r) => r.status === 'confirmed' && r.base === JSON.stringify(fileOwn)), 'each keeps the file\'s own words as its base');

  const fact = await listed('Holding deposit');
  assert.deepEqual([fact.answer, fact.from, fact.at], [words[2], 'playbook', rows[0].at]);
  assert.deepEqual(fact.earlier, [
    { answer: words[1], status: 'confirmed', at: rows[1].at, from: 'playbook' },
    { answer: words[0], status: 'confirmed', at: rows[2].at, from: 'playbook' },
    { answer: fileOwn.answer, status: 'confirmed', at: null, from: 'file' },
  ]);

  // The same answer and state again adds nothing.
  const again = await post('/api/playbook/facts', { title: 'Holding deposit', answer: words[2], status: 'confirmed' });
  assert.equal(again.status, 200, again.error);
  assert.equal(versions('Holding deposit').length, 3);
  assert.ok(fs.readFileSync(factsFile()).equals(bytes));
});

test('a fact saved as Working is used and listed to confirm; one put back to Needs answer is not used', async () => {
  const key = customer(2, 'Ben', 'Do you sell car covers for the Noah?');
  const COVER = 'We can supply a fitted car cover; a person quotes the cost.';
  let out = await post('/api/playbook/facts', { title: 'Car covers', answer: COVER, status: 'working' });
  assert.equal(out.status, 200, out.error);
  assert.deepEqual([out.fact.status, out.fact.answer], ['working', COVER]);
  let status = await get('/api/status');
  assert.ok(status.facts.toConfirm.includes('Car covers'), 'listed to confirm');
  assert.ok(section(asked(key), 'BUSINESS FACTS').includes(`\n- Car covers: ${COVER}`), 'used in the request');

  out = await post('/api/playbook/facts', { title: 'Car covers', answer: '', status: 'needs_answer' });
  assert.equal(out.status, 200, out.error);
  assert.deepEqual([out.fact.status, out.fact.answer, out.fact.from], ['needs_answer', '', 'playbook']);
  assert.deepEqual(out.fact.earlier.map((e) => [e.answer, e.status, e.from]), [[COVER, 'working', 'playbook'], ['', 'needs_answer', 'file']]);
  const user = asked(key);
  assert.match(section(user, 'TOPICS WITH NO CONFIRMED ANSWER'), /^- Car covers$/m);
  assert.ok(!section(user, 'BUSINESS FACTS').includes('Car covers'));
  status = await get('/api/status');
  assert.ok(!status.facts.toConfirm.includes('Car covers'));
  assert.ok(status.facts.unanswered.includes('Car covers'));
});

test('a fact the file does not have is refused, and an empty or overlong answer is refused', async () => {
  const rows = db.countRows('playbook_versions');
  const cases = [
    [{ title: 'Free floor mats', answer: 'Yes, with every car.' }, 404, 'That fact is not in the Playbook.'],
    [{ answer: 'Open every day.' }, 404, 'That fact is not in the Playbook.'],
    [{ title: 'Opening hours', answer: 'Open every day.', status: 'maybe' }, 400, 'Say whether the answer is Confirmed or Working.'],
    [{ title: 'Opening hours', answer: '   ', status: 'confirmed' }, 400, 'Write the answer first.'],
    [{ title: 'Opening hours', answer: '', status: 'working' }, 400, 'Write the answer first.'],
    [{ title: 'Opening hours', answer: 'Open every day. '.repeat(130) }, 400, 'That answer is too long: keep it under 2,000 characters.'],
  ];
  for (const [body, code, error] of cases) {
    const out = await post('/api/playbook/facts', body);
    assert.deepEqual([out.status, out.error], [code, error], JSON.stringify(body).slice(0, 80));
  }
  assert.equal(db.countRows('playbook_versions'), rows, 'nothing was saved');
  assert.equal((await listed('Opening hours')).answer, fileAnswer('Opening hours'));
});

test('a file changed by hand after a Playbook answer says so, and its answer can be used', async () => {
  const key = customer(3, 'Cai', 'Can you fit roof racks to the Noah?');
  const MINE = 'Roof racks can be fitted before pickup, and a person quotes the cost.';
  let out = await post('/api/playbook/facts', { title: 'Roof racks', answer: MINE, status: 'confirmed' });
  assert.equal(out.status, 200, out.error);
  assert.equal(out.fact.file, null);

  const HAND = 'We fit roof racks before pickup; a person quotes the cost and the day.';
  const text = fs.readFileSync(factsFile(), 'utf8');
  assert.ok(text.includes(fileAnswer('Roof racks')));
  fs.writeFileSync(factsFile(), text.replace(fileAnswer('Roof racks'), HAND));

  const user = asked(key);
  assert.ok(section(user, 'BUSINESS FACTS').includes(`\n- Roof racks: ${MINE}`), 'the Playbook\'s answer is still the one used');
  assert.ok(!user.includes(HAND));
  const fact = await listed('Roof racks');
  assert.deepEqual([fact.status, fact.answer, fact.from], ['confirmed', MINE, 'playbook']);
  assert.deepEqual(fact.file, { status: 'working', answer: HAND }, 'the file now differs, and its answer is offered');

  out = await post('/api/playbook/facts', { title: 'Roof racks', answer: HAND, status: 'working' });
  assert.equal(out.status, 200, out.error);
  assert.deepEqual([out.fact.status, out.fact.answer, out.fact.from, out.fact.file], ['working', HAND, 'playbook', null]);
  assert.ok(section(asked(key), 'BUSINESS FACTS').includes(`\n- Roof racks: ${HAND}`));
});

test('a topic the file no longer has keeps its saved answer, listed after the file\'s', async () => {
  const text = fs.readFileSync(factsFile(), 'utf8');
  fs.writeFileSync(factsFile(), text.replace(/## Tinted windows\n[^#]*/, ''));
  assert.ok(!knowledge.loadBusinessFacts(undefined, { playbook: false }).some((t) => t.title === 'Tinted windows'));

  const laid = knowledge.loadBusinessFacts();
  assert.deepEqual(laid.map((t) => t.title), ['Opening hours', 'Holding deposit', 'Roof racks', 'Car covers', 'Tinted windows']);
  assert.equal(laid.at(-1).status, 'confirmed');
  const fact = await listed('Tinted windows');
  assert.deepEqual([fact.status, fact.from, fact.earlier, fact.file], ['confirmed', 'playbook', [], null]);
  const out = await post('/api/playbook/facts', { title: 'Tinted windows', answer: 'Window tinting is arranged before pickup; a person quotes the cost.', status: 'working' });
  assert.equal(out.status, 200, out.error);
  assert.equal(out.fact.earlier.length, 1);
});

test('no statement changes or removes a saved version', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const files = fs.readdirSync(src, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(src, f)).isFile());
  assert.ok(files.length > 10, 'the source was read');
  for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(src, f), 'utf8'), /(UPDATE|DELETE FROM)\s+playbook_versions/i, f);
});
