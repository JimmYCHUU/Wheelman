// An ordinary dashboard enquiry read as an import enquiry: a model code or a make and model from
// the website's import list, or the words themselves, switch the import reply on; a car on the
// yard never does. The owner's ruling on the page wins either way, and a conversation can be
// moved into Import Query and back. Every name, number and car is invented; stand-ins play the
// website, the dashboard and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ MAIL_INTAKE: '1' });

const now = Date.now();
const HOUR = 3600e3, MIN = 60e3;
let standins, config, db, items, judge, drafter, app, base;
let aiImport = false; // what the AI stand-in says under "import_enquiry"
const ai = aiBehaviour({ behave: () => ({
  reply: 'Hi {{NAME}},\nThanks for your enquiry.\nCould you let us know your preferred year range, maximum odometer, grade, landed budget and any colour preferences?',
  next_step: 'asked what they are looking for', rung: '', facts_used: [], needs_human: [], hold: false, import_enquiry: aiImport,
}) });

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0 });
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  judge = await import('../src/importjudge.js');
  drafter = await import('../src/drafter.js');
  const eligible = await import('../src/eligible.js');
  const sync = await import('../src/sync.js');
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* none yet */ }
  // The stand-in website's list: Hiace GDH206, N-Box JF3, Alphard Welcab AGH30W, Copen LA400, Q7 4MC. The yard has Hiaces, a Noah, an Alphard.
  await eligible.refreshEligibleModels({ now });
  await sync.syncVehicles({ force: true });
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* gone */ }
});

const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
const lastPrompt = () => ai.seen[ai.seen.length - 1].messages[1].content;
const settled = async (item) => { for (let i = 0; i < 200 && drafter.writingNow(item.itemKey, item.anchorKey); i++) await new Promise((r) => setTimeout(r, 20)); };

/** A lead from the website's contact page, with what the customer typed, and no conversation yet. */
const lead = (id, first, text, { stocks = [], conversationId = null } = {}) => db.upsertLead({
  id, conversationId, firstName: first, lastName: 'Invented', phone: `0491 570 ${id}`, email: `${first.toLowerCase()}@example.com`, source: 'Contact Us Form', status: 'NEW', platform: 'carbarnau', state: '',
  leadAt: now - HOUR, updatedAt: now - 5 * MIN, stocks, statusHistory: [],
  inquiries: [{ id: id * 10, type: 'Contact Us Page', subject: 'Enquiry from Contact Page', text, stockNo: stocks[0] || '', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }],
});

// ---- the reading -------------------------------------------------------------------------------

test('a model code from the import list makes a contact-page enquiry an import enquiry, answered the import way', async () => {
  // No year, odometer or budget given: the reply asks for them (an enquiry with details goes to the auction search, covered in imports.test.js).
  lead(901, 'Harriet', 'Interested in a Daihatsu Copen LA400, red if possible. Is that something you can do?');
  const item = items.itemFromKey('l:901');
  assert.equal(item.judged.sign, 'code');
  assert.match(item.judged.why, /LA400/);
  assert.equal(item.imports.kind, 'import');
  assert.equal(item.imports.forms[0].car, 'Daihatsu Copen');
  assert.equal(item.situation.primary, 'import_sourcing');

  const { item: shown } = await get('/api/items/l:901');
  assert.deepEqual([shown.section, shown.moved, shown.ruling, shown.canRule, shown.canMove], ['dashboard', null, null, true, true]);
  assert.equal(shown.judged.car, 'Daihatsu Copen LA400');
  assert.equal(shown.looking.car, 'Daihatsu Copen (LA400)');
  assert.equal(shown.situation, 'Importing or sourcing a car from Japan');

  const d = await drafter.draftFor(item);
  assert.equal(d.status, 'ready');
  assert.match(lastPrompt(), /=== IMPORT ENQUIRY ===\nThis customer asked us to find a Daihatsu Copen from Japan\. Before we search the auctions we need to know/);
  assert.match(d.reply, /Regards,\nTeam Carbarn$/, 'the import closing lines are added');
  assert.equal(d.context?.judged ?? db.latestDraft(item.itemKey, item.anchorKey).context.judged, item.judged.why);
});

test('a car on the yard is never read as an import enquiry; a model with its make, or the words themselves, are', () => {
  lead(902, 'Owen', 'Is the 2020 Hiace still available?', { stocks: ['1201'] });
  assert.equal(items.itemFromKey('l:902').imports, null, 'a car in stock: they are asking about that one');
  lead(903, 'Mina', 'Do you have a Toyota Hiace in stock? Looking for a diesel van.');
  assert.equal(items.itemFromKey('l:903').imports, null, 'a Hiace is on the yard, so they may mean that one');
  lead(904, 'Ravi', 'Can you import a Toyota Hiace from Japan for me? Under 80,000 km.');
  const ravi = items.itemFromKey('l:904');
  assert.equal(ravi.judged.sign, 'words');
  assert.equal(ravi.imports.forms[0].modelCode, 'GDH206', 'the car is still read, for the search');
  lead(905, 'Zoe', 'Looking for a Honda N-Box, 2019 onwards.');
  assert.equal(items.itemFromKey('l:905').judged.sign, 'model', 'no N-Box on the yard');
  lead(906, 'Luc', 'Hi, what are your opening hours on Sunday?');
  assert.equal(items.itemFromKey('l:906').imports, null);

  assert.equal(judge.judgeImport(['Is it still available?']), null);
  assert.equal(judge.judgeImport(['Was the Noah imported from Japan originally?']), null, 'a question about where a yard car came from');
  assert.equal(judge.judgeImport(['Just a note, I will be late']), null, 'a model name that is an ordinary word needs its make');
  assert.equal(judge.judgeImport(['I want a Copen from Japan, under 80,000 km']).sign, 'words');
  assert.equal(judge.judgeImport(['Can you find me a Daihatsu Copen?']).car.modelCode, 'LA400');
  assert.equal(judge.judgeImport(['Interested in a Daihatsu Copen LA400'], { stockAttached: true }), null);
});

// ---- the owner's rulings ----------------------------------------------------------------------

test("the owner's ruling wins: not an import enquiry, one after all, moved to Import Query and back, and it follows the lead", async () => {
  // "Not an import enquiry": the ordinary reply, written again since the suggestion was untouched.
  let out = await post('/api/items/l:901/ruling', { kind: 'general' });
  assert.equal(out.status, 200);
  assert.deepEqual([out.json.item.ruling, out.json.item.judged, out.json.item.section, out.json.writing], [{ kind: 'general', section: 'dashboard' }, null, 'dashboard', true]);
  let item = items.itemFromKey('l:901');
  assert.equal(item.imports, null);
  await settled(item);
  assert.ok(!/=== IMPORT ENQUIRY ===/.test(lastPrompt()), 'written the ordinary way');
  assert.equal(db.latestDraft(item.itemKey, item.anchorKey).context.judged, null);

  // Moved to Import Query: listed there, gone from the dashboard, and in the worker's queue for that section.
  out = await post('/api/items/l:901/ruling', { kind: 'import', section: 'importquery' });
  assert.equal(out.status, 200);
  assert.deepEqual([out.json.item.section, out.json.item.moved, out.json.item.judged.sign], ['importquery', 'importquery', 'code']);
  assert.ok((await get('/api/items?section=importquery&tab=waiting')).items.some((r) => r.key === 'l:901' && r.section === 'importquery'));
  assert.ok(!(await get('/api/items?section=dashboard&tab=waiting')).items.some((r) => r.key === 'l:901'));
  assert.ok(items.listItems({ source: 'importquery', states: ['awaiting'] }).some((x) => x.itemKey === 'l:901'));
  assert.ok(!items.listItems({ states: ['awaiting'] }).some((x) => x.itemKey === 'l:901'));

  // Back to the dashboard, still an import enquiry; then the ruling taken away, and Wheelman's own reading applies.
  out = await post('/api/items/l:901/ruling', { kind: 'import', section: 'dashboard' });
  assert.deepEqual([out.json.item.section, out.json.item.moved], ['dashboard', null]);
  assert.ok((await get('/api/items?section=dashboard&tab=waiting')).items.some((r) => r.key === 'l:901'));
  out = await post('/api/items/l:901/ruling', { kind: '' });
  assert.deepEqual([out.json.item.ruling, out.json.item.judged.sign], [null, 'code']);

  // One Wheelman missed: the owner says so, and the import way applies with no car known yet.
  out = await post('/api/items/l:906/ruling', { kind: 'import' });
  assert.equal(out.status, 200);
  item = items.itemFromKey('l:906');
  assert.deepEqual([item.judged.sign, item.judged.why, item.imports.kind, item.imports.forms], ['owner', 'you said so', 'import', []]);
  await settled(item);

  // The ruling follows the lead into the text conversation that starts later.
  db.upsertConversation({ id: 9906, phone: '+61491570906', channel: 'SMS', status: 'OPEN', leadId: 906, customerName: 'Luc Invented', latestDirection: 'IN', latestAt: now - MIN, latestBody: 'Any news?', leadPlatform: 'carbarnau', leadStatus: 'NEW', leadEmail: '' });
  db.upsertMessage({ id: 990601, conversationId: 9906, direction: 'IN', body: 'Any news?', sentBy: null, status: 'RECEIVED', mediaType: null, at: now - MIN, importedAt: now - MIN });
  lead(906, 'Luc', 'Hi, what are your opening hours on Sunday?', { conversationId: 9906 });
  const conv = items.itemFromKey('c:9906');
  assert.deepEqual([conv.ruling.kind, conv.imports.kind], ['import', 'import']);

  // What is refused.
  assert.equal((await post('/api/items/l:999999/ruling', { kind: 'import' })).status, 404);
  assert.equal((await post('/api/items/l:901/ruling', { kind: 'maybe' })).status, 400);
  assert.equal((await post('/api/items/l:901/ruling', { kind: 'general', section: 'importquery' })).status, 400, 'only an import enquiry can be moved');
});

test("the AI's own reading is offered on the page and changes nothing by itself", async () => {
  lead(907, 'Pia', 'Hi, do you deliver to Perth?');
  aiImport = true;
  try {
    const item = items.itemFromKey('l:907');
    assert.equal(item.imports, null);
    const d = await drafter.draftFor(item);
    assert.equal(d.status, 'ready');
    assert.match(ai.seen[ai.seen.length - 1].messages[0].content, /"import_enquiry": false/, 'the AI is asked, in the shape of its answer');
    const { item: shown } = await get('/api/items/l:907');
    assert.deepEqual([shown.draft.aiImport, shown.judged, shown.imports], [true, null, undefined]);
    assert.equal(items.itemFromKey('l:907').imports, null, 'nothing changes until the owner chooses');
  } finally { aiImport = false; }
});
