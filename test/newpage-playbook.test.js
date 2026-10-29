// The Playbook page: its own store (web/new/js/playbookstore.js) beside the main one, and the words it
// shows (web/new/js/playbookview.js). A fake server, as newpage-searchstore.test.js has. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPlaybookStore } from '../web/new/js/playbookstore.js';
import { lessonGroups, lessonLine, historyLines, proposalWords, factGroups, factTag, menuHint, backHref } from '../web/new/js/playbookview.js';
import { settle } from './support/newpage-fakes.js';

const NOW = Date.parse('2026-11-02T02:00:00Z'); // Monday 2 November, 1 pm in Sydney
const TODAY = NOW - 3600e3;
const YESTERDAY = Date.parse('2026-11-01T02:00:00Z');
const THURSDAY = Date.parse('2026-10-29T02:00:00Z');

const kindly = { key: 'sms|remove|kindly|', kind: 'remove', removed: 'kindly', added: '', channel: 'sms', scope: 'any', count: 4, itemKey: 'c:701',
  examples: [{ before: 'Please kindly confirm the day.', after: 'Please confirm the day.', at: TODAY }] };
const assist = { key: 'sms|replace|assist|help', kind: 'replace', removed: 'assist', added: 'help', channel: 'sms', scope: 'any', count: 3, itemKey: 'c:705',
  examples: [{ before: 'Happy to assist.', after: 'Happy to help.', at: TODAY }] };
const finance = { id: 7, n: 0, kind: 'remember', channel: 'sms', scope: 'finance', do: 'Do not mention finance', at: TODAY, off: false, usedCount: 0,
  from: { instruction: 'Do not mention finance' }, history: [{ what: 'made', at: TODAY }] };
const facts = [
  { title: 'Opening hours', status: 'confirmed', answer: 'Open every day of the week.', at: null, from: 'file', earlier: [], file: null },
  { title: 'Roof racks', status: 'working', answer: 'We can fit roof racks before pickup; a person quotes the cost.', at: null, from: 'file', earlier: [], file: null },
  { title: 'Tinted windows', status: 'needs_answer', answer: '', at: null, from: 'file', earlier: [], file: null },
];

/** The fake server: GETs answer data; a POST answers as the server does, or throws its words when refuse(path, body) says so. */
function make({ refuse = () => null, down = false } = {}) {
  const calls = [];
  const toasts = [];
  const data = {
    down,
    lessons: { lessons: [finance], proposals: [kindly, assist], notRules: [] },
    facts: { facts, counts: { confirmed: 1, working: 1, needsAnswer: 1 } },
  };
  const api = async (path, body) => {
    calls.push(body === undefined ? { path } : { path, body });
    if (data.down) throw new Error('Wheelman is not responding. Check that it is running.');
    const no = refuse(path, body);
    if (no) throw Object.assign(new Error(no), { status: 400, said: true });
    if (path === '/api/playbook/lessons') return data.lessons;
    if (path === '/api/playbook/facts') return body === undefined ? data.facts : { fact: { title: body.title, status: body.status, answer: body.answer } };
    if (path === '/api/playbook/proposals') return {};
    const sw = path.match(/^\/api\/lessons\/(\d+)\/switch$/);
    if (sw) return { lesson: { ...finance, id: Number(sw[1]), off: !body.on } };
    throw new Error('unexpected ' + path);
  };
  const store = createPlaybookStore({ api, toast: (message, action = null) => toasts.push({ message, action }) });
  return { store, calls, toasts, data };
}
const posts = (calls) => calls.filter((c) => c.body !== undefined);
const lastToast = (toasts) => toasts[toasts.length - 1];

test('the Playbook store loads lessons and facts, and Keep, Not a rule, a switch and a saved answer each offer Undo', async () => {
  const { store, calls, toasts, data } = make();
  assert.equal(store.get().state, 'idle');

  // Lessons: the lessons, the proposals and those marked not a rule, with the count to review.
  await store.actions.load('lessons', null);
  assert.deepEqual(calls, [{ path: '/api/playbook/lessons' }]);
  assert.equal(store.get().state, 'ready');
  assert.equal(store.get().tab, 'lessons');
  assert.deepEqual(store.get().proposals.map((p) => p.key), [kindly.key, assist.key]);
  assert.deepEqual(store.get().lessons.map((l) => l.id), [7]);
  assert.equal(store.get().counts.toReview, 2);

  // Keep: the decision is posted, the toast offers Undo, and the tab is read again.
  calls.length = 0;
  await store.actions.keep(kindly.key);
  assert.deepEqual(calls, [{ path: '/api/playbook/proposals', body: { key: kindly.key, decision: 'keep' } }, { path: '/api/playbook/lessons' }]);
  let t = lastToast(toasts);
  assert.equal(t.message, 'Kept. It applies from the next suggestion.');
  assert.equal(t.action.label, 'Undo');
  calls.length = 0;
  await t.action.run();
  await settle();
  assert.deepEqual(calls, [{ path: '/api/playbook/proposals', body: { key: kindly.key, decision: 'undo' } }, { path: '/api/playbook/lessons' }]);
  assert.equal(lastToast(toasts).message, 'Put back to review.');
  assert.equal(lastToast(toasts).action, null);

  // Not a rule: posted as a reject; Undo puts it back to review.
  calls.length = 0;
  await store.actions.notRule(assist.key);
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/proposals', body: { key: assist.key, decision: 'reject' } }]);
  t = lastToast(toasts);
  assert.equal(t.message, 'Marked as not a rule. Wheelman will not suggest it again.');
  calls.length = 0;
  await t.action.run();
  await settle();
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/proposals', body: { key: assist.key, decision: 'undo' } }]);
  assert.equal(lastToast(toasts).message, 'Put back to review.');

  // Keep it after all, on one marked not a rule: Undo marks it not a rule again, as it was before.
  data.lessons = { ...data.lessons, proposals: [kindly], notRules: [assist] };
  await store.actions.load('lessons', null);
  calls.length = 0;
  await store.actions.keep(assist.key);
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/proposals', body: { key: assist.key, decision: 'keep' } }]);
  assert.equal(lastToast(toasts).message, 'Kept. It applies from the next suggestion.');
  calls.length = 0;
  await lastToast(toasts).action.run();
  await settle();
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/proposals', body: { key: assist.key, decision: 'reject' } }]);
  assert.equal(lastToast(toasts).message, 'Put back as not a rule.');

  // The switch: the lessons route the old page uses; Undo switches it back.
  calls.length = 0;
  await store.actions.switchLesson(7, false);
  assert.deepEqual(calls, [{ path: '/api/lessons/7/switch', body: { on: false } }, { path: '/api/playbook/lessons' }]);
  t = lastToast(toasts);
  assert.equal(t.message, 'Lesson switched off. It no longer shapes suggestions.');
  assert.equal(t.action.label, 'Undo');
  calls.length = 0;
  await t.action.run();
  await settle();
  assert.deepEqual(posts(calls), [{ path: '/api/lessons/7/switch', body: { on: true } }]);
  assert.equal(lastToast(toasts).message, 'Put back as it was.');
  await store.actions.switchLesson(7, true);
  assert.equal(lastToast(toasts).message, 'Lesson switched on.');
  assert.equal(lastToast(toasts).action.label, 'Undo');

  // Business facts, with the fact the address names to focus.
  calls.length = 0;
  await store.actions.load('facts', 'Tinted windows');
  assert.deepEqual(calls, [{ path: '/api/playbook/facts' }]);
  assert.equal(store.get().tab, 'facts');
  assert.equal(store.get().focus, 'Tinted windows');
  assert.equal(store.get().facts.length, 3);
  assert.equal(store.get().counts.needsAnswer, 1);
  assert.equal(store.get().counts.toReview, 1, 'the Lessons count is kept for its tab');

  // A saved answer: posted, true, Undo posts the answer and status it had before.
  calls.length = 0;
  assert.equal(await store.actions.saveFact('Tinted windows', 'Yes, through a partner, quoted per car.', 'confirmed'), true);
  assert.deepEqual(calls, [{ path: '/api/playbook/facts', body: { title: 'Tinted windows', answer: 'Yes, through a partner, quoted per car.', status: 'confirmed' } }, { path: '/api/playbook/facts' }]);
  t = lastToast(toasts);
  assert.equal(t.message, 'Saved as Confirmed. New suggestions use it.');
  assert.equal(t.action.label, 'Undo');
  calls.length = 0;
  await t.action.run();
  await settle();
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/facts', body: { title: 'Tinted windows', answer: '', status: 'needs_answer' } }]);
  assert.equal(lastToast(toasts).message, 'Put back as it was.');
  // Saved as Working: its own words; Undo puts back the working answer.
  calls.length = 0;
  assert.equal(await store.actions.saveFact('Roof racks', 'We fit roof racks; quoted per car.', 'working'), true);
  assert.equal(lastToast(toasts).message, 'Saved as Working.');
  await lastToast(toasts).action.run();
  await settle();
  assert.deepEqual(posts(calls).at(-1), { path: '/api/playbook/facts', body: { title: 'Roof racks', answer: 'We can fit roof racks before pickup; a person quotes the cost.', status: 'working' } });
});

test('a refused answer keeps the words and says why', async () => {
  const { store, toasts } = make({ refuse: (path, body) => (path === '/api/playbook/facts' && body && !body.answer.trim() ? 'Write the answer first.' : null) });
  await store.actions.load('facts', null);
  assert.equal(await store.actions.saveFact('Tinted windows', '   ', 'confirmed'), false, 'so the editor keeps its text');
  assert.equal(lastToast(toasts).message, 'Write the answer first.');
  assert.equal(lastToast(toasts).action, null, 'nothing to undo');
  // What is on screen is still the facts as they were read.
  assert.equal(store.get().state, 'ready');
  assert.equal(store.get().facts.find((f) => f.title === 'Tinted windows').status, 'needs_answer');
  // A refused decision says the server's words too.
  const other = make({ refuse: (path) => (path === '/api/playbook/proposals' ? 'That proposal is no longer waiting.' : null) });
  await other.store.actions.load('lessons', null);
  await other.store.actions.keep('sms|remove|gone|');
  assert.equal(lastToast(other.toasts).message, 'That proposal is no longer waiting.');
  assert.equal(lastToast(other.toasts).action, null);
});

test('a Playbook page that cannot be read says so with Try again', async () => {
  const { store, calls, data } = make({ down: true });
  await store.actions.load('facts', 'Tinted windows');
  assert.equal(store.get().state, 'error');
  assert.equal(store.get().error, 'Wheelman is not responding. Check that it is running.');
  assert.equal(store.get().tab, 'facts');
  assert.equal(store.get().focus, 'Tinted windows');
  // Try again asks for the same tab, and its answer replaces the failure.
  data.down = false;
  calls.length = 0;
  await store.actions.load(store.get().tab, store.get().focus);
  assert.deepEqual(calls, [{ path: '/api/playbook/facts' }]);
  assert.equal(store.get().state, 'ready');
  assert.equal(store.get().error, '');
  assert.equal(store.get().facts.length, 3);
  // An answer that comes after another tab was asked for is dropped.
  let release;
  const slow = createPlaybookStore({ api: (path) => (path === '/api/playbook/lessons' ? new Promise((r) => { release = () => r({ lessons: [], proposals: [], notRules: [] }); }) : Promise.resolve({ facts, counts: { needsAnswer: 1 } })), toast: () => {} });
  const first = slow.actions.load('lessons', null);
  await slow.actions.load('facts', null);
  release();
  await first;
  assert.equal(slow.get().tab, 'facts');
  assert.equal(slow.get().state, 'ready');
  assert.equal(slow.get().facts.length, 3);
});

test('lessonGroups puts proposals to review first, then lessons in use, switched off and not a rule', () => {
  const older = { ...finance, id: 3, at: THURSDAY };
  const off = { ...finance, id: 4, at: YESTERDAY, off: true };
  const offOlder = { ...finance, id: 5, at: THURSDAY, off: true };
  const g = lessonGroups({ lessons: [older, offOlder, finance, off], proposals: [kindly], notRules: [assist] });
  assert.deepEqual(Object.keys(g), ['review', 'on', 'off', 'notRules']);
  assert.deepEqual(g.review, [kindly]);
  assert.deepEqual(g.on.map((l) => l.id), [7, 3], 'newest first');
  assert.deepEqual(g.off.map((l) => l.id), [4, 5]);
  assert.deepEqual(g.notRules, [assist]);
  assert.deepEqual(lessonGroups({}), { review: [], on: [], off: [], notRules: [] });
});

test("a lesson's line says its channel, scope, where it came from, its day and its use", () => {
  const remember = { ...finance, scope: 'price_negotiation', at: YESTERDAY, usedCount: 4 };
  assert.equal(lessonLine(remember, NOW), 'Texts · price questions · from your instruction · Yesterday · used in 4 suggestions');
  const note = { id: 8, kind: 'note', channel: 'email', scope: 'any', do: 'Keep it to three lines.', at: THURSDAY, usedCount: 1 };
  assert.equal(lessonLine(note, NOW), 'Emails · every reply · from your Could be better note · Thursday 29 October · used in 1 suggestion');
  const edit = { id: 9, kind: 'edit', channel: 'sms', scope: 'any', do: 'Leave out “kindly”.', at: TODAY, usedCount: 0 };
  assert.equal(lessonLine(edit, NOW), 'Texts · every reply · from your repeated edits · Today · not used yet');

  // Its history, one line for each thing that happened to it, oldest first.
  assert.deepEqual(historyLines({ ...remember, history: [{ what: 'made', at: THURSDAY }, { what: 'again', at: YESTERDAY }, { what: 'off', at: TODAY }, { what: 'on', at: TODAY }] }, NOW), [
    'Made from your instruction, Thursday 29 October',
    'Remembered again, yesterday',
    'Switched off, today',
    'Switched on, today',
  ]);
  assert.deepEqual(historyLines({ ...note, history: [{ what: 'made', at: THURSDAY }] }, NOW), ['Made from your Could be better note, Thursday 29 October']);
  // An edit lesson is made as it is kept, so that is one line; kept again after an Undo is its own.
  assert.deepEqual(historyLines({ ...edit, history: [{ what: 'made', at: THURSDAY }, { what: 'kept', at: THURSDAY }, { what: 'undone', at: YESTERDAY }, { what: 'kept', at: TODAY }] }, NOW), [
    'Kept from your repeated edits, Thursday 29 October',
    'Undone, yesterday',
    'Kept again, today',
  ]);
  assert.deepEqual(historyLines({ ...edit, history: undefined }, NOW), []);
});

test('a proposal says what was edited, how often and where it would apply, with (name) for a customer', () => {
  assert.deepEqual(proposalWords(kindly).headline, 'You removed “kindly”, 4 times');
  assert.deepEqual(proposalWords(kindly).applies, 'Would apply to texts · every reply');
  assert.equal(proposalWords(assist).headline, 'You changed “assist” to “help”, 3 times');
  const added = { ...kindly, kind: 'add', removed: '', added: 'Please call before visiting.', count: 3, channel: 'email', scope: 'inspection_booking',
    examples: [{ before: 'Hello {{NAME}}, the car is here.', after: 'Hello {{NAME}}, the car is here. Please call before visiting.', at: TODAY }] };
  const w = proposalWords(added);
  assert.equal(w.headline, 'You added “Please call before visiting.”, 3 times');
  assert.equal(w.applies, 'Would apply to emails · inspection and test drive requests');
  assert.deepEqual(w.examples, [{ before: 'Hello (name), the car is here.', after: 'Hello (name), the car is here. Please call before visiting.' }]);
  // Back to the conversation as it was left.
  assert.equal(backHref({ section: 'dashboard', chip: 'waiting', key: 'c:797', rows: [] }), '#/dashboard/waiting/c%3A797');
  assert.equal(backHref({ section: 'importquery', chip: 'all', key: null }), '#/importquery/all');
});

test("factGroups lists Needs your answer, Working and Confirmed, each in the file's order", () => {
  const file = [
    { title: 'Opening hours', status: 'confirmed' },
    { title: 'Tinted windows', status: 'needs_answer' },
    { title: 'Roof racks', status: 'working' },
    { title: 'Holding deposit', status: 'confirmed' },
    { title: 'Car covers', status: 'needs_answer' },
  ];
  const g = factGroups(file);
  assert.deepEqual(Object.keys(g), ['needs', 'working', 'confirmed']);
  assert.deepEqual(g.needs.map((f) => f.title), ['Tinted windows', 'Car covers']);
  assert.deepEqual(g.working.map((f) => f.title), ['Roof racks']);
  assert.deepEqual(g.confirmed.map((f) => f.title), ['Opening hours', 'Holding deposit']);
  assert.deepEqual(factGroups(undefined), { needs: [], working: [], confirmed: [] });

  // Each state in words as well as colour.
  assert.deepEqual(factTag({ status: 'needs_answer', at: null }, NOW), { text: 'Needs answer', tone: 'warn' });
  assert.deepEqual(factTag({ status: 'working', at: TODAY }, NOW), { text: 'Working', tone: 'info' });
  assert.deepEqual(factTag({ status: 'confirmed', at: TODAY }, NOW), { text: 'Confirmed today', tone: 'good' });
  assert.deepEqual(factTag({ status: 'confirmed', at: YESTERDAY }, NOW), { text: 'Confirmed yesterday', tone: 'good' });
  assert.deepEqual(factTag({ status: 'confirmed', at: THURSDAY }, NOW), { text: 'Confirmed Thursday 29 October', tone: 'good' });
  assert.deepEqual(factTag({ status: 'confirmed', at: null }, NOW), { text: 'Confirmed in your file', tone: 'good' });
});

test("the Menu's Playbook hint counts what waits for Jim, and says nothing when nothing waits", () => {
  assert.equal(menuHint(null), 'Lessons and business facts');
  assert.equal(menuHint({ playbook: { toReview: 0 }, facts: { needsAnswer: 0 } }), 'Lessons and business facts');
  assert.equal(menuHint({ playbook: { toReview: 2 }, facts: { needsAnswer: 1 } }), '2 lessons to review · 1 fact needs an answer');
  assert.equal(menuHint({ playbook: { toReview: 1 }, facts: { needsAnswer: 0 } }), '1 lesson to review');
  assert.equal(menuHint({ playbook: { toReview: 0 }, facts: { needsAnswer: 2 } }), '2 facts need an answer');
  assert.equal(menuHint({ facts: { needsAnswer: 1 } }), '1 fact needs an answer', 'a status from before the Playbook counts');
});

test('the Menu opens the Playbook, which stands in place of the work grid and keeps the conversation', () => {
  const src = (f) => fs.readFileSync(new URL('../web/new/' + f, import.meta.url), 'utf8');
  // The Menu's first item, with its hint.
  assert.match(src('js/ui/topbar.js'), /items=\$\{\[\s*\{ label: 'Playbook', hint: menuHint\(state\.status\), run: \(\) => \{ location\.hash = playbookHash\('lessons'\); \} \}/);
  // The page's stylesheet, after the viewer's.
  const index = src('index.html');
  assert.ok(index.indexOf('css/playbook.css') > index.indexOf('css/viewer.css'));
  assert.match(src('css/playbook.css'), /@layer views/);
  // A Playbook address: the main store is only flushed, and the boot never reads that address as a conversation.
  const main = src('js/main.js');
  assert.match(main, /if \(book\) \{ actions\.flush\(\); playbook\.actions\.load\(book\.tab, book\.id\); return; \}/);
  assert.match(main, /const boot = bootFor\(location\.hash, innerWidth >= 1280\);\nactions\.boot\(boot\.route, \{ wide: boot\.wide \}\)/);
  // The What Wheelman used tab links to every lesson.
  assert.match(src('js/ui/usedtab.js'), /See every lesson in the Playbook/);
});

test('an edit lesson whose edit waits for review again is shown only under To review', () => {
  // Kept, then Undo: the lesson is off and its edit is proposed again. Only the proposal is shown.
  const undone = { id: 12, n: 0, kind: 'edit', channel: 'sms', scope: 'any', do: 'Leave out “kindly”.', at: TODAY, off: true, usedCount: 0, from: { examples: [], count: 4, key: kindly.key } };
  // Another edit lesson, switched off by Jim, whose edit is not waiting: still under Switched off.
  const other = { ...undone, id: 13, do: 'Write “car”, not “vehicle”.', from: { examples: [], count: 3, key: 'sms|replace|vehicle|car' } };
  const g = lessonGroups({ lessons: [undone, other, finance], proposals: [kindly], notRules: [] });
  assert.deepEqual(g.review, [kindly]);
  assert.deepEqual(g.off.map((l) => l.id), [13]);
  assert.deepEqual(g.on.map((l) => l.id), [7]);
  // An edit lesson with no key recorded, and a lesson of another kind, are never taken out.
  const noKey = { ...undone, id: 14, from: { examples: [], count: 4 } };
  assert.deepEqual(lessonGroups({ lessons: [noKey], proposals: [kindly] }).off.map((l) => l.id), [14]);
});

test("words typed in the Tell line or an order's paste box are kept for their conversation while the box is away", async () => {
  const { unsentWords, keepUnsent } = await import('../web/new/js/unsent.js');
  assert.equal(unsentWords('c:901', 'tell'), null, 'nothing kept yet');
  keepUnsent('c:901', 'tell', 'Mention the warranty');
  keepUnsent('c:902', 'tell', 'Offer a video call');
  keepUnsent('ao:903', 'paste', 'Any news on the XV?');
  assert.equal(unsentWords('c:901', 'tell'), 'Mention the warranty');
  assert.equal(unsentWords('c:902', 'tell'), 'Offer a video call', 'each conversation its own');
  assert.equal(unsentWords('c:901', 'paste'), null, 'each field its own');
  assert.equal(unsentWords('ao:903', 'paste'), 'Any news on the XV?');
  // An open paste box with nothing in it yet is kept as open.
  keepUnsent('ao:904', 'paste', '');
  assert.equal(unsentWords('ao:904', 'paste'), '');
  // Sent, emptied or closed: nothing is kept.
  keepUnsent('c:901', 'tell', null);
  keepUnsent('ao:904', 'paste', null);
  assert.equal(unsentWords('c:901', 'tell'), null);
  assert.equal(unsentWords('ao:904', 'paste'), null);
  assert.equal(unsentWords(null, 'tell'), null, 'no conversation, nothing');
  keepUnsent(null, 'tell', 'lost');
  assert.equal(unsentWords(null, 'tell'), null);

  // The Tell line and the paste box start from what was kept, and keep what is in them; the Tell
  // line holds Wheelman back again when it brings words back.
  const src = (f) => fs.readFileSync(new URL('../web/new/js/' + f, import.meta.url), 'utf8');
  const box = src('ui/messagebox.js');
  assert.match(box, /const \[value, setRaw\] = useState\(\(\) => unsentWords\(at, 'tell'\) \|\| ''\);/);
  assert.match(box, /const setValue = \(v\) => \{ setRaw\(v\); keepUnsent\(at, 'tell', v \|\| null\); \};/);
  assert.match(box, /if \(value\.trim\(\)\) holdTell\(true\);/);
  assert.equal((box.match(/<\$\{Tell\} at=\$\{state\.key\}/g) || []).length, 2, 'both Tell lines name their conversation');
  assert.match(box, /usePaste\(actions\.paste, state\.key\)/);
  const order = src('ui/orderbox.js');
  assert.match(order, /const kept = unsentWords\(key, 'paste'\);/);
  assert.match(order, /keepUnsent\(key, 'paste', o \? t : null\)/);
});
