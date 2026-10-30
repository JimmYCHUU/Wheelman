// The Playbook page after its first review: a save that gets no answer keeps what was typed, a
// change on its way holds the buttons, one edit is never shown in two places, each tab's note is
// its own, and the Tell line's words last only the trip to the Playbook. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPlaybookStore } from '../web/new/js/playbookstore.js';
import { lessonGroups, tabNotes, menuHint, needsAnswerWords } from '../web/new/js/playbookview.js';
import { unsentWords, keepUnsent, keepOnlyFor, dropOnOpen } from '../web/new/js/unsent.js';
import { setup, settle } from './support/newpage-fakes.js';

const DOWN = 'Wheelman is not responding. Check that it is running.';
const tint = { title: 'Tinted windows', status: 'needs_answer', answer: '', at: null, from: 'file', earlier: [], file: null };
const kindly = { key: 'sms|remove|kindly|', kind: 'remove', removed: 'kindly', added: '', channel: 'sms', scope: 'any', count: 4, itemKey: 'c:701', examples: [] };

/** A fake server that can go away (no answer at all) for posts, reads, or both. */
function make() {
  const calls = [];
  const toasts = [];
  const net = { posts: true, reads: true };
  const api = async (path, body) => {
    calls.push(body === undefined ? { path } : { path, body });
    if (body === undefined ? !net.reads : !net.posts) throw new Error(DOWN); // as createApi throws: no status
    if (path === '/api/playbook/facts') return body === undefined ? { facts: [tint], counts: { needsAnswer: 1 } } : { fact: body };
    if (path === '/api/playbook/lessons') return { lessons: [], proposals: [kindly], notRules: [] };
    if (path === '/api/playbook/proposals') return {};
    throw new Error('unexpected ' + path);
  };
  const store = createPlaybookStore({ api, toast: (message, action = null) => toasts.push({ message, action }) });
  return { store, calls, toasts, net };
}

test('a save that gets no answer keeps the facts on screen and the typed answer, and reads nothing again', async () => {
  const { store, calls, toasts, net } = make();
  await store.actions.load('facts', null);
  net.posts = false;
  net.reads = false;
  calls.length = 0;
  assert.equal(await store.actions.saveFact('Tinted windows', 'Yes, through a partner.', 'confirmed'), false, 'so the editor keeps its text');
  assert.deepEqual(calls, [{ path: '/api/playbook/facts', body: { title: 'Tinted windows', answer: 'Yes, through a partner.', status: 'confirmed' } }], 'no read after a post with no answer');
  assert.equal(store.get().state, 'ready', 'the tab stays on screen, so the box and its words stay');
  assert.equal(store.get().error, '');
  assert.deepEqual(store.get().facts, [tint]);
  assert.deepEqual(toasts.at(-1), { message: DOWN, action: null });
});

test('a read again that fails after a change keeps what is on screen and says why in a toast', async () => {
  const { store, toasts, net } = make();
  await store.actions.load('lessons', null);
  net.reads = false;
  assert.equal(await store.actions.notRule(kindly.key), true);
  assert.equal(store.get().state, 'ready');
  assert.deepEqual(store.get().proposals, [kindly], 'the lessons as they were last read');
  assert.equal(toasts.at(-1).message, DOWN);
  // A first read of a tab that fails still says so on the page, with Try again.
  const fresh = make();
  fresh.net.reads = false;
  await fresh.store.actions.load('facts', null);
  assert.equal(fresh.store.get().state, 'error');
  assert.equal(fresh.store.get().error, DOWN);
});

test('while a change is on its way the store says so, and a second press posts nothing', async () => {
  const calls = [];
  let land;
  const api = (path, body) => {
    calls.push({ path, body });
    if (body === undefined) return Promise.resolve({ lessons: [], proposals: [kindly], notRules: [] });
    return new Promise((r) => { land = () => r({}); });
  };
  const store = createPlaybookStore({ api, toast: () => {} });
  await store.actions.load('lessons', null);
  assert.equal(store.get().busy, false);
  const first = store.actions.keep(kindly.key);
  assert.equal(store.get().busy, true, 'the page holds its buttons');
  assert.equal(await store.actions.notRule(kindly.key), false, 'a second press is not posted');
  assert.equal(calls.filter((c) => c.body !== undefined).length, 1);
  land();
  assert.equal(await first, true);
  assert.equal(store.get().busy, false);
  // The page's change buttons follow it.
  const src = (f) => fs.readFileSync(new URL('../web/new/js/ui/' + f, import.meta.url), 'utf8');
  for (const [f, n] of [['lessonstab.js', 4], ['factstab.js', 2]]) {
    assert.equal((src(f).match(/aria-disabled=\$\{busy\}/g) || []).length, n, f + ' holds every change button while one is on its way');
  }
});

test('an edit marked not a rule after its lesson was kept and undone is shown once, under Not a rule', () => {
  // Keep, Undo, then Not a rule: the server leaves the kept lesson switched off and lists the edit as not a rule.
  const lesson = { id: 12, n: 0, kind: 'edit', channel: 'sms', scope: 'any', do: 'Leave out “kindly”.', at: 1, off: true, usedCount: 0, from: { examples: [], count: 4, key: kindly.key } };
  const g = lessonGroups({ lessons: [lesson], proposals: [], notRules: [kindly] });
  assert.deepEqual(g.off, []);
  assert.deepEqual(g.on, []);
  assert.deepEqual(g.notRules.map((p) => p.key), [kindly.key]);
});

test("each Playbook tab's note uses that tab's own count only while it is on screen", () => {
  const status = { playbook: { toReview: 3 }, facts: { needsAnswer: 2 } };
  // On Lessons: its own count, just read; the facts tab's from the status.
  assert.deepEqual(tabNotes({ tab: 'lessons', counts: { toReview: 1, needsAnswer: 5 } }, status), { lessons: '1 to review', facts: '2 need an answer' });
  // On Business facts: the other way round.
  assert.deepEqual(tabNotes({ tab: 'facts', counts: { toReview: 1, needsAnswer: 1 } }, status), { lessons: '3 to review', facts: '1 needs an answer' });
  // Not read yet: the status. Nothing waiting: no note.
  assert.deepEqual(tabNotes({ tab: 'lessons', counts: { toReview: null, needsAnswer: null } }, status), { lessons: '3 to review', facts: '2 need an answer' });
  assert.deepEqual(tabNotes({ tab: 'lessons', counts: { toReview: 0, needsAnswer: null } }, null), { lessons: '', facts: '' });
  // One set of words for a fact that needs an answer, in the Menu and on the tab.
  assert.equal(needsAnswerWords(1), 'needs an answer');
  assert.equal(needsAnswerWords(2), 'need an answer');
  assert.equal(menuHint({ facts: { needsAnswer: 2 } }), '2 facts ' + needsAnswerWords(2));
  const view = fs.readFileSync(new URL('../web/new/js/playbookview.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../web/new/js/ui/playbook.js', import.meta.url), 'utf8');
  assert.equal((view + page).match(/need an answer'/g).length, 1, 'written once');
  // The unused words for a save back to Needs answer are gone.
  assert.doesNotMatch(fs.readFileSync(new URL('../web/new/js/playbookstore.js', import.meta.url), 'utf8'), /needs_answer:/);
});

test("the Tell line's words last only the trip to the Playbook: opening another conversation forgets them", async () => {
  keepUnsent('c:1', 'tell', 'Mention the warranty');
  keepUnsent('c:1', 'paste', 'They asked about rego');
  keepUnsent('c:9', 'tell', 'An old one');
  keepOnlyFor('c:1');
  assert.equal(unsentWords('c:1', 'tell'), 'Mention the warranty');
  assert.equal(unsentWords('c:1', 'paste'), 'They asked about rego');
  assert.equal(unsentWords('c:9', 'tell'), null, "another conversation's words go");
  keepOnlyFor(null);
  assert.equal(unsentWords('c:1', 'tell'), null, 'no conversation open: nothing is kept');

  // The open path: with the store's conversation still open (the Playbook on screen) the words stay;
  // another conversation opened, they go, so a forgotten instruction never comes back holding writing.
  const { store } = setup();
  await store.actions.open('c:1');
  const stop = dropOnOpen(store);
  keepUnsent('c:1', 'tell', 'Mention the warranty');
  await store.actions.refresh();
  await settle();
  assert.equal(unsentWords('c:1', 'tell'), 'Mention the warranty', 'a poll, or the Playbook, keeps them');
  await store.actions.open('c:2');
  await settle();
  assert.equal(unsentWords('c:1', 'tell'), null);
  stop();
  const main = fs.readFileSync(new URL('../web/new/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /dropOnOpen\(store\);/);
});

test('the link to every lesson in the Playbook is a 44 px target on a phone', () => {
  const used = fs.readFileSync(new URL('../web/new/js/ui/usedtab.js', import.meta.url), 'utf8');
  assert.match(used, /<a class="fine used-playbook" href=\$\{playbookHash\('lessons'\)\}>See every lesson in the Playbook<\/a>/);
  const css = fs.readFileSync(new URL('../web/new/css/panel.css', import.meta.url), 'utf8');
  assert.match(css, /\.used-playbook \{[^}]*min-height: var\(--touch\);/);
});
