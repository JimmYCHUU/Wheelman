// The Playbook page after the whole branch's review: an answer typed but not saved comes back when
// its card is drawn again, and a return visit whose read fails says so on the page. Pure modules and
// the source of the page's own files, with a fake server. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPlaybookStore } from '../web/new/js/playbookstore.js';
import { unsentAnswer, keepUnsentAnswer, answerBox } from '../web/new/js/unsentanswers.js';

const DOWN = 'Wheelman is not responding. Check that it is running.';
const tint = { title: 'Tinted windows', status: 'needs_answer', answer: '', at: null, from: 'file', earlier: [], file: null };
const src = (f) => fs.readFileSync(new URL('../web/new/js/' + f, import.meta.url), 'utf8');

test('an answer typed in the Playbook but not saved comes back when its card is drawn again, and goes once saved or cancelled', () => {
  assert.deepEqual(answerBox('Tinted windows', ''), { editing: false, text: '' }, 'nothing kept: closed and empty');
  keepUnsentAnswer('Tinted windows', 'Yes, through a partner.');
  assert.equal(unsentAnswer('Tinted windows'), 'Yes, through a partner.');
  // Drawn again (Lessons and back, Back, the Menu): the box is open with the words.
  assert.deepEqual(answerBox('Tinted windows', ''), { editing: true, text: 'Yes, through a partner.' });
  assert.equal(unsentAnswer('Roof racks'), null, 'each fact its own');
  // A box opened with Change the answer and emptied is kept as open.
  keepUnsentAnswer('Roof racks', '');
  assert.deepEqual(answerBox('Roof racks', 'We can fit roof racks before pickup; a person quotes the cost.'), { editing: true, text: '' });
  // Saved: the words are now the answer in use, so a card drawn again starts closed, and they are forgotten.
  assert.deepEqual(answerBox('Tinted windows', 'Yes, through a partner.'), { editing: false, text: '' });
  assert.equal(unsentAnswer('Tinted windows'), null);
  keepUnsentAnswer('Car covers', '  We supply fitted covers. ');
  assert.deepEqual(answerBox('Car covers', 'We supply fitted covers.'), { editing: false, text: '' }, 'as the server trims it');
  // Cancelled, or saved from the card itself: forgotten.
  keepUnsentAnswer('Roof racks', null);
  assert.equal(unsentAnswer('Roof racks'), null);
  assert.equal(unsentAnswer(''), null);

  // The tab draws each card from what is kept, keeps what is typed or put in the box, and forgets it on save or Cancel.
  const tab = src('ui/factstab.js');
  assert.match(tab, /import \{ keepUnsentAnswer, answerBox \} from '\.\.\/unsentanswers\.js';/);
  assert.match(tab, /const \[start\] = useState\(\(\) => answerBox\(f\.title, f\.answer\)\);/);
  assert.match(tab, /const \[editing, setEditing\] = useState\(start\.editing\);/);
  assert.match(tab, /const \[text, setRaw\] = useState\(start\.text\);/);
  assert.match(tab, /const setText = \(v\) => \{ setRaw\(v\); keepUnsentAnswer\(f\.title, v\); \};/);
  assert.match(tab, /const use = \(answer\) => \{ setText\(answer\);/);
  assert.match(tab, /const close = \(\) => \{ setEditing\(false\); setRaw\(''\); keepUnsentAnswer\(f\.title, null\); \};/);
  assert.match(tab, /onInput=\$\{\(e\) => setText\(e\.currentTarget\.value\)\}/);
  assert.match(tab, /if \(await actions\.saveFact\(f\.title, text, 'confirmed'\)\) close\(\);/);
  assert.doesNotMatch(src('unsentanswers.js'), /^\s*import\s/m, 'it imports nothing');
});

test('a return visit to a tab whose read fails says so on the page with Try again; only a read after a change keeps what is on screen', async () => {
  const net = { reads: true };
  const toasts = [];
  const api = async (path, body) => {
    if (body === undefined && !net.reads) throw new Error(DOWN);
    if (path === '/api/playbook/facts') return body === undefined ? { facts: [tint], counts: { needsAnswer: 1 } } : { fact: body };
    throw new Error('unexpected ' + path);
  };
  const store = createPlaybookStore({ api, toast: (message) => toasts.push(message) });
  await store.actions.load('facts', null);
  assert.equal(store.get().state, 'ready');

  // Back to the conversation, then the Playbook again on the same tab: its read fails.
  net.reads = false;
  await store.actions.load('facts', null);
  assert.equal(store.get().state, 'error', "the earlier visit's facts are not shown as they are now");
  assert.equal(store.get().error, DOWN);
  assert.deepEqual(toasts, [], 'said on the page, with Try again, not in a toast');

  // Try again reads it; then a change lands and the read after it fails: what is on screen stays, and a toast says why.
  net.reads = true;
  await store.actions.load('facts', null);
  assert.equal(store.get().state, 'ready');
  net.reads = false;
  assert.equal(await store.actions.saveFact('Tinted windows', 'Yes, through a partner.', 'confirmed'), true);
  assert.equal(store.get().state, 'ready');
  assert.deepEqual(store.get().facts, [tint]);
  assert.equal(toasts.at(-1), DOWN);
});
