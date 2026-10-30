// The Playbook's Templates and Voice tabs: the wording in groups (web/new/js/wordingview.js), the
// Playbook store's wording actions (web/new/js/playbookstore.js) with a fake server, the pieces of the
// Templates editor drawn in Node with the page's own Preact and htm, and the source of the tabs.
// Invented data only: the wording below is made up for these tests, and nothing is read from voice/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createPlaybookStore } from '../web/new/js/playbookstore.js';
import { wordingGroups, canSave, versionLines, changedLine, nextVersionLine, previewLabel, previewHead, firstLine } from '../web/new/js/wordingview.js';
import { PLAYBOOK_TABS, playbookRoute } from '../web/new/js/playbookroute.js';
import { menuHint } from '../web/new/js/playbookview.js';
import { unsentWording, keepUnsentWording } from '../web/new/js/unsentanswers.js';
import { settle } from './support/newpage-fakes.js';

const NOW = Date.parse('2026-11-02T02:00:00Z'); // Monday 2 November, 1 pm in Sydney
const TODAY = NOW - 3600e3;
const YESTERDAY = Date.parse('2026-11-01T02:00:00Z');
const THURSDAY = Date.parse('2026-10-29T02:00:00Z');
const src = (f) => fs.readFileSync(new URL('../web/new/js/' + f, import.meta.url), 'utf8');

const STILL = '@label: Still available\n@fits: availability\n{greeting}\n\nYes, the {car} is still here and ready to see.\n\n{sign_off}';
const STILL_FILE = '@label: Still available\n@fits: availability\n{greeting}\n\nYes, the {car} is still available.\n\n{sign_off}';
const DEPOSIT = '@label: First estimate\n@fits: first reply\nThe deposit link is [DEPOSIT LINK?].';
const LENGTH = 'Keep a reply short. If it can be said in fewer words, use fewer.';
const part = (o) => ({ at: null, versions: 0, fileChanged: false, group: undefined, ...o, fileText: o.fileText ?? o.text });
/** The wording list as GET /api/playbook/wording gives it, in the Playbook's order of files. */
const files = () => [
  { name: 'dashboard-messages.md', kind: 'template', group: 'Dashboard', label: 'Dashboard messages', parts: [
    part({ part: '', label: 'The short pieces', group: 'Dashboard', text: '@deposit_offer: A refundable holding deposit takes it off the market.' }),
    part({ part: 'still_available', label: 'Still available', group: 'Dashboard', text: STILL, fileText: STILL_FILE, at: TODAY, versions: 2 }),
    part({ part: 'trade_in', label: 'Trade-in', group: 'Dashboard', text: '@label: Trade-in\n@fits: trade_in\nWe can look at your car when you come in.', fileChanged: true, at: THURSDAY, versions: 1, fileText: '@label: Trade-in\n@fits: trade_in\nBring your car along and we will value it.' }),
  ] },
  { name: 'marketplace-messages.md', kind: 'template', group: 'Marketplace', label: 'Marketplace messages', parts: [
    part({ part: 'mp_available', label: 'Still for sale', group: 'Marketplace', text: '@label: Still for sale\n@fits: availability\nYes, it is still for sale.' }),
  ] },
  { name: 'importquery-messages.md', kind: 'template', group: 'Imports', label: 'Imports messages', parts: [
    part({ part: 'eligible_cost', label: 'Eligible, with the cost', group: 'Imports', text: '@label: Eligible, with the cost\n@fits: eligible\nThe {model} can be imported.' }),
  ] },
  { name: 'auction-messages.md', kind: 'template', group: 'Auction', label: 'Auction messages', parts: [
    part({ part: 'progress_update', label: 'Progress update', group: 'Auction', text: 'Your car is {where}.' }),
    part({ part: 'first_estimate', label: 'First estimate', group: 'Imports', text: DEPOSIT }),
  ] },
  { name: 'price-reply.md', kind: 'template', group: 'Blocks', label: 'Price reply', parts: [
    part({ part: '', label: 'Price reply', group: 'Blocks', text: 'The price includes {inclusions}.' }),
  ] },
  { name: 'first-reply.md', kind: 'template', group: 'Blocks', label: 'First-reply details', parts: [
    part({ part: '', label: 'First-reply details', group: 'Blocks', text: 'Vehicle details:\n{vehicle_url}' }),
  ] },
  { name: 'house-voice.md', kind: 'voice', group: 'Voice', label: 'The Carbarn voice', parts: [
    part({ part: '', label: 'The Carbarn voice', group: 'Voice', text: 'How every reply from Carbarn reads.' }),
    part({ part: 'Length', label: 'Length', group: 'Voice', text: LENGTH, at: YESTERDAY, versions: 1 }),
  ] },
  { name: 'sales-playbook.md', kind: 'voice', group: 'Selling', label: 'Sales playbook', parts: [
    part({ part: 'The price question', label: 'The price question', group: 'Selling', text: 'Answer the price first.' }),
  ] },
  { name: 'compact/voice-card.md', kind: 'voice', group: 'Voice', label: 'The short voice card, for compact requests', parts: [
    part({ part: '', label: 'The short voice card, for compact requests', group: 'Voice', text: 'Short, plain, professional.' }),
  ] },
];
const STILL_VERSIONS = { versions: [{ id: 12, text: STILL, at: TODAY }, { id: 9, text: STILL.replace('still here and ready to see', 'still available, and ready to see'), at: YESTERDAY }], file: STILL_FILE };
/** Three cards as the preview route gives them: the words written for each conversation, with its car put in. */
const three = (text) => ['Dara', 'Ada', 'Priya'].map((name, i) => ({ key: 'c:' + (797 - i), name, section: 'dashboard', car: '2020 Toyota Voxy ZS', fits: i < 2,
  text: 'Hello ' + name + ',\n\n' + text.split('\n').filter((l) => !l.startsWith('@') && !/^\{(greeting|sign_off)\}$/.test(l)).join('\n').trim().replace('{car}', '2020 Toyota Voxy ZS'),
  ...(i === 0 ? { note: 'The first line here is from @onsite, for a visit.' } : {}) }));

/** The fake server, as newpage-playbook.test.js has: refuse(path, body) gives the words of a refusal. */
function make({ refuse = () => null } = {}) {
  const calls = [];
  const toasts = [];
  const data = { files: files(), versions: { 'dashboard-messages.md|still_available': STILL_VERSIONS, 'house-voice.md|Length': { versions: [{ id: 5, text: LENGTH, at: YESTERDAY }], file: 'Keep a reply short.' } } };
  const api = async (path, body) => {
    calls.push(body === undefined ? { path } : { path, body });
    const no = refuse(path, body);
    if (no) throw Object.assign(new Error(no), { status: 400, said: true });
    if (path === '/api/playbook/wording') {
      if (body === undefined) return { files: data.files };
      const p = data.files.find((f) => f.name === body.name).parts.find((x) => x.part === body.part);
      return { part: { ...p, text: body.text }, unchanged: p.text === body.text.trim() };
    }
    if (path === '/api/playbook/preview') return body.name === 'price-reply.md' ? { previews: [], none: 'There is no conversation in this section to show it on yet.' } : { previews: three(body.text) };
    if (path.startsWith('/api/playbook/versions?')) {
      const q = new URLSearchParams(path.split('?')[1]);
      return data.versions[q.get('name') + '|' + q.get('part')] || { versions: [], file: '' };
    }
    if (path === '/api/playbook/lessons') return { lessons: [], proposals: [], notRules: [] };
    throw new Error('unexpected ' + path);
  };
  const store = createPlaybookStore({ api, toast: (message, action = null) => toasts.push({ message, action }) });
  return { store, calls, toasts, data };
}
const posts = (calls) => calls.filter((c) => c.body !== undefined);
const lastToast = (toasts) => toasts[toasts.length - 1];
const SAVED = 'Saved. New suggestions use it; suggestions already written keep their words.';

/** The page's own Preact and htm, as index.html loads them, so the editor's pieces can be drawn in Node. */
async function ui() {
  if (!globalThis.htmPreact) vm.runInThisContext(fs.readFileSync(new URL('../web/new/vendor/htm-preact.umd.js', import.meta.url), 'utf8'));
  return import('../web/new/js/ui/templatestab.js');
}
const nodes = (n) => (Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props && n.props.children)] : []);
const words = (n) => (Array.isArray(n) ? n.map(words).join('') : n && typeof n === 'object' ? words(n.props && n.props.children) : n == null || n === false ? '' : String(n));
const button = (tree, label) => nodes(tree).find((n) => n.type === 'button' && words(n).trim() === label);

test('the Templates tab groups the messages by section, with the blocks last', async () => {
  const g = wordingGroups(files());
  assert.deepEqual(g.map((x) => x.group), ['Dashboard', 'Marketplace', 'Imports', 'Auction', 'Blocks']);
  assert.deepEqual(g[0].parts.map((p) => p.label), ['The short pieces', 'Still available', 'Trade-in'], "each in its file's order");
  // The auction file's enquiry messages are listed under Imports, where they are offered.
  assert.deepEqual(g[2].parts.map((p) => [p.name, p.part]), [['importquery-messages.md', 'eligible_cost'], ['auction-messages.md', 'first_estimate']]);
  assert.deepEqual(g[3].parts.map((p) => p.part), ['progress_update']);
  assert.deepEqual(g[4].parts.map((p) => p.name), ['price-reply.md', 'first-reply.md']);
  const still = g[0].parts[1];
  assert.deepEqual({ name: still.name, part: still.part, label: still.label, text: still.text, at: still.at, versions: still.versions, fileChanged: still.fileChanged },
    { name: 'dashboard-messages.md', part: 'still_available', label: 'Still available', text: STILL, at: TODAY, versions: 2, fileChanged: false });
  assert.equal(still.fileText, STILL_FILE, "the file's own wording, for Use the file's wording");
  // No voice rule is among them; the Voice tab reads Voice and Selling.
  assert.ok(g.every((x) => x.parts.every((p) => p.kind === 'template')));
  const v = wordingGroups(files(), 'voice');
  assert.deepEqual(v.map((x) => x.group), ['Voice', 'Selling']);
  assert.deepEqual(v[0].parts.map((p) => p.label), ['The Carbarn voice', 'Length', 'The short voice card, for compact requests']);
  assert.deepEqual(v[1].parts.map((p) => p.part), ['The price question']);
  assert.deepEqual(wordingGroups(undefined), []);

  // The day a part was changed, in the middle of a line.
  assert.equal(changedLine(TODAY, NOW), 'changed today');
  assert.equal(changedLine(YESTERDAY, NOW), 'changed yesterday');
  assert.equal(changedLine(THURSDAY, NOW), 'changed Thursday 29 October');
  assert.equal(changedLine(null, NOW), '', "the file's own wording has no day");
  assert.equal(nextVersionLine(2), 'Version 3. Every earlier version is kept.');
  assert.equal(nextVersionLine(0), 'Version 1. Every earlier version is kept.');

  // The store reads the wording for both tabs from the one route.
  const { store, calls } = make();
  await store.actions.load('templates', null);
  assert.deepEqual(calls, [{ path: '/api/playbook/wording' }]);
  assert.equal(store.get().state, 'ready');
  assert.equal(store.get().tab, 'templates');
  assert.equal(store.get().wording.length, 9);
  assert.equal(store.get().editing, null);
  assert.equal(store.get().previewed, null);
  await store.actions.load('voice', null);
  assert.equal(store.get().tab, 'voice');
  assert.deepEqual(calls.at(-1), { path: '/api/playbook/wording' });

  // The address, the tabs and the Menu.
  assert.deepEqual(PLAYBOOK_TABS, ['lessons', 'facts', 'templates', 'voice']);
  assert.deepEqual(playbookRoute('#/playbook/templates'), { tab: 'templates', id: null });
  assert.deepEqual(playbookRoute('#/playbook/voice'), { tab: 'voice', id: null });
  assert.equal(menuHint(null), 'Lessons, facts, templates and voice');
  assert.equal(menuHint({ playbook: { toReview: 1 }, facts: { needsAnswer: 0 } }), '1 lesson to review', 'what waits is said as before');
  const page = src('ui/playbook.js');
  assert.match(page, /\{ id: 'templates', label: 'Templates' \}, \{ id: 'voice', label: 'Voice' \}/);
  assert.match(page, /<\$\{TemplatesTab\} pstate=\$\{pstate\} actions=\$\{actions\} now=\$\{now\} \/>/);
  assert.match(page, /<\$\{VoiceTab\} pstate=\$\{pstate\} actions=\$\{actions\} now=\$\{now\} \/>/);
});

test('the Templates list gives each part its label and first line, and Edit shows all of it', async () => {
  const g = wordingGroups(files());
  for (const p of g.flatMap((x) => x.parts)) {
    assert.ok(p.label, `${p.name} "${p.part}" has a label`);
    assert.ok(p.first, `${p.name} "${p.part}" has a first line`);
    assert.doesNotMatch(p.first, /\n/, 'one line');
  }
  // A message's first line is the first one a customer reads: its @ lines and a line that is only a {word} are passed over.
  assert.equal(g[0].parts[1].first, 'Yes, the {car} is still here and ready to see.');
  assert.equal(g[0].parts[2].first, 'We can look at your car when you come in.');
  // The short pieces, which are all @ lines: the first piece's words, without its name.
  assert.equal(g[0].parts[0].first, 'A refundable holding deposit takes it off the market.');
  assert.equal(g[4].parts[1].first, 'Vehicle details:');
  assert.equal(firstLine('@label: X\n@fits: y\n{greeting}\n\n   Hello there.  \nMore.'), 'Hello there.');
  // A line that is only a greeting is passed over too: the auction file's messages all open with one.
  assert.equal(firstLine('Hello {{NAME}},\n\nThe car you wanted has closed at auction.'), 'The car you wanted has closed at auction.');
  assert.equal(firstLine('Good morning {{NAME}},\nYour car is on the water.'), 'Your car is on the water.');
  assert.equal(firstLine('Hello {{NAME}}, thank you for your {car} enquiry.\nMore.'), 'Hello {{NAME}}, thank you for your {car} enquiry.', 'a greeting with words after it is a line to read');
  assert.equal(firstLine('{greeting}\n{sign_off}'), '{greeting}', 'only words in braces: the first of them');
  assert.equal(firstLine(''), '');
  assert.equal(firstLine(undefined), '');

  // The tab: closed, a part is its label and first line, with Edit; open, its box holds all of it.
  const tab = src('ui/templatestab.js');
  assert.match(tab, /\$\{open \? null : html`<p class="pb-first">\$\{p\.first\}<\/p>`\}/);
  assert.doesNotMatch(tab, /<p class="pb-wording-text">\$\{p\.text\}<\/p>/, 'not the whole part');
  assert.match(tab, /value=\$\{text\}/);
  const { store } = make();
  await store.actions.load('templates', null);
  store.actions.edit('dashboard-messages.md', 'still_available');
  assert.equal(store.get().editing.text, STILL, 'Edit puts all of it in the box');
  store.actions.cancel();
});

test('Save waits for a preview of the words in the editor', async () => {
  assert.equal(canSave(null, STILL), false, 'before a preview');
  assert.equal(canSave({ text: STILL, previews: [] }, STILL + ' Today.'), false, 'after a change');
  assert.equal(canSave({ text: STILL, previews: [] }, STILL), true, 'after a preview of the same words');
  assert.equal(canSave({ text: STILL, previews: [], none: 'There is no conversation in this section to show it on yet.' }, STILL), true, 'a preview with nothing to show it on was still asked for');
  assert.equal(previewLabel(null, STILL), 'Show how it reads');
  assert.equal(previewLabel({ text: STILL }, STILL), 'Show how it reads');
  assert.equal(previewLabel({ text: STILL }, STILL + '!'), 'Show how it reads again');
  assert.equal(previewHead({ name: 'Dara', car: '2020 Toyota Voxy ZS' }), 'Dara · 2020 Toyota Voxy ZS');
  assert.equal(previewHead({ name: 'Imani', car: '' }), 'Imani');

  const { store, calls, toasts } = make();
  await store.actions.load('templates', null);
  const name = 'dashboard-messages.md';
  const sp = 'still_available';
  store.actions.edit(name, sp);
  assert.deepEqual(store.get().editing, { name, part: sp, text: STILL }, 'the editor starts with the wording in use');
  // Not previewed: nothing is posted.
  calls.length = 0;
  assert.equal(await store.actions.saveWording(name, sp, STILL), false);
  assert.deepEqual(calls, []);

  const changed = STILL.replace('ready to see', 'ready to see today');
  store.actions.type(changed);
  assert.equal(store.get().editing.text, changed);
  assert.equal(await store.actions.preview(name, sp, changed), true);
  assert.deepEqual(calls, [{ path: '/api/playbook/preview', body: { name, part: sp, text: changed } }]);
  assert.equal(store.get().previewed.text, changed);
  assert.equal(store.get().previewed.previews.length, 3);
  assert.equal(canSave(store.get().previewed, store.get().editing.text), true);

  // The words change after their preview: Save waits again, and the store posts nothing.
  const again = changed + '\n\nSee you soon.';
  store.actions.type(again);
  assert.equal(canSave(store.get().previewed, store.get().editing.text), false);
  assert.equal(previewLabel(store.get().previewed, store.get().editing.text), 'Show how it reads again');
  calls.length = 0;
  assert.equal(await store.actions.saveWording(name, sp, again), false);
  assert.deepEqual(calls, []);
  // Words previewed for another part do not count for this one.
  store.actions.edit(name, 'trade_in');
  assert.equal(store.get().previewed, null, 'another part: its own preview');
  store.actions.edit(name, sp);
  assert.equal(store.get().editing.text, again, 'the words typed for Still available were kept');
  assert.equal(await store.actions.saveWording(name, sp, again), false);

  // Previewed again: Save posts the very words, the toast offers Undo, the editor closes and the list is read again.
  await store.actions.preview(name, sp, again);
  calls.length = 0;
  assert.equal(await store.actions.saveWording(name, sp, again), true);
  assert.deepEqual(calls, [{ path: '/api/playbook/wording', body: { name, part: sp, text: again } }, { path: '/api/playbook/wording' }]);
  let t = lastToast(toasts);
  assert.equal(t.message, SAVED);
  assert.equal(t.action.label, 'Undo');
  assert.equal(store.get().editing, null);
  assert.equal(store.get().previewed, null);
  assert.equal(unsentWording(name, sp), null, 'saved: the typed words are forgotten');
  // Undo saves the version before as a new one.
  calls.length = 0;
  await t.action.run();
  await settle();
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/wording', body: { name, part: sp, text: STILL } }]);
  assert.equal(lastToast(toasts).message, 'Put back as it was.');
  assert.equal(lastToast(toasts).action, null);

  // The editor's pieces: Save this version is disabled until the words in the editor were previewed.
  const { SaveRow, Previews } = await ui();
  const p = wordingGroups(files())[0].parts[1];
  const row = (previewed, text, busy = false) => SaveRow({ p, text, previewed, busy, save: () => {}, cancel: () => {} });
  assert.equal(button(row(null, changed), 'Save this version').props.disabled, true);
  assert.equal(button(row({ text: STILL }, changed), 'Save this version').props.disabled, true);
  assert.equal(button(row({ text: changed }, changed), 'Save this version').props.disabled, false);
  assert.match(button(row({ text: changed }, changed), 'Save this version').props.class, /\bmain\b/);
  assert.equal(button(row({ text: changed }, changed, true), 'Save this version').props['aria-disabled'], true, 'held while a change is on its way');
  assert.ok(button(row(null, changed), 'Cancel'));
  assert.match(words(row(null, changed)), /Version 3\. Every earlier version is kept\./);
  // Three conversations, each headed by the customer's name and car, "Not offered here" where it is not, and the card's note.
  const shown = Previews({ previewed: { text: changed, previews: three(changed) } });
  const isCard = (n) => n.props && /(^|\s)pb-preview(\s|$)/.test(n.props.class || '');
  const cards = nodes(shown).filter(isCard);
  assert.equal(cards.length, 3);
  assert.match(words(cards[0]), /^Dara · 2020 Toyota Voxy ZS/);
  assert.doesNotMatch(words(cards[0]), /Not offered here/);
  assert.match(words(cards[2]), /Priya · 2020 Toyota Voxy ZS\s*Not offered here/);
  assert.match(words(cards[0]), /The first line here is from @onsite, for a visit\./, 'the note is shown');
  assert.match(words(cards[1]), /Hello Ada,\n\nYes, the 2020 Toyota Voxy ZS is still here and ready to see today\./);
  // Cards that repeat a conversation's key are each drawn.
  const twice = Previews({ previewed: { text: changed, previews: [three(changed)[0], three(changed)[0]] } });
  assert.equal(nodes(twice).filter(isCard).length, 2);
  assert.match(src('ui/templatestab.js'), /key=\$\{i \+ '-' \+ c\.key\}/, 'never the key alone');
  // With nothing to show it on, the sentence says so.
  assert.match(words(Previews({ previewed: { text: 'x', previews: [], none: 'There is no conversation in this section to show it on yet.' } })), /There is no conversation in this section to show it on yet\./);
});

test('an earlier version goes into the editor, and is saved only after its preview', async () => {
  // Every saved version, newest first, then the file's own.
  assert.deepEqual(versionLines(STILL_VERSIONS, NOW).map((l) => l.label), ['Version 2, today', 'Version 1, yesterday', 'In your file']);
  assert.deepEqual(versionLines(STILL_VERSIONS, NOW).map((l) => !!l.inUse), [true, false, false], 'the newest is the wording in use');
  assert.equal(versionLines(STILL_VERSIONS, NOW)[2].text, STILL_FILE);
  assert.deepEqual(versionLines({ ...STILL_VERSIONS, saidFirst: true }, NOW).map((l) => l.label).at(-1), 'What your file said first');
  assert.deepEqual(versionLines({ versions: [{ id: 3, text: 'a', at: THURSDAY }], file: 'b' }, NOW).map((l) => l.label), ['Version 1, Thursday 29 October', 'In your file']);

  const { store, calls, toasts } = make();
  await store.actions.load('templates', null);
  const name = 'dashboard-messages.md';
  const sp = 'still_available';
  // Earlier versions are read when they are opened.
  calls.length = 0;
  await store.actions.versions(name, sp);
  assert.deepEqual(calls, [{ path: '/api/playbook/versions?kind=template&name=dashboard-messages.md&part=still_available' }]);
  const earlier = store.get().earlier[name + '\n' + sp];
  assert.equal(earlier.state, 'ready');
  assert.deepEqual(earlier.out, STILL_VERSIONS);

  // Use this version puts it in the editor; it is saved only after its own preview.
  store.actions.edit(name, sp);
  await store.actions.preview(name, sp, STILL);
  const first = versionLines(earlier.out, NOW)[1];
  store.actions.edit(name, sp, first.text);
  assert.deepEqual(store.get().editing, { name, part: sp, text: first.text });
  assert.equal(canSave(store.get().previewed, store.get().editing.text), false, 'the words in the editor were not previewed');
  calls.length = 0;
  assert.equal(await store.actions.saveWording(name, sp, first.text), false);
  assert.deepEqual(calls, []);
  await store.actions.preview(name, sp, first.text);
  assert.equal(canSave(store.get().previewed, store.get().editing.text), true);
  calls.length = 0;
  assert.equal(await store.actions.saveWording(name, sp, first.text), true);
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/wording', body: { name, part: sp, text: first.text } }]);
  assert.equal(lastToast(toasts).message, SAVED);
  assert.equal(store.get().earlier[name + '\n' + sp], undefined, 'read again when next opened');

  // A part whose file was changed by hand since: the file's wording goes into the editor, to preview first.
  store.actions.edit(name, 'trade_in', files()[0].parts[2].fileText);
  assert.equal(store.get().editing.text, '@label: Trade-in\n@fits: trade_in\nBring your car along and we will value it.');
  assert.equal(await store.actions.saveWording(name, 'trade_in', store.get().editing.text), false);
  store.actions.cancel();

  // A voice rule's earlier versions are read with its own kind.
  await store.actions.load('voice', null);
  calls.length = 0;
  await store.actions.versions('sales-playbook.md', 'The price question');
  assert.deepEqual(calls, [{ path: '/api/playbook/versions?kind=voice&name=sales-playbook.md&part=The+price+question' }]);
  // One that cannot be read says so where it is, and Try again reads it.
  const down = createPlaybookStore({ api: async (path) => { if (path.startsWith('/api/playbook/versions')) throw new Error('Wheelman is not responding. Check that it is running.'); return { files: files() }; }, toast: () => {} });
  await down.actions.load('templates', null);
  await down.actions.versions(name, sp);
  assert.deepEqual(down.get().earlier[name + '\n' + sp], { state: 'error', error: 'Wheelman is not responding. Check that it is running.' });

  // The editor's Earlier versions: a closed details with the count, each with Use this version.
  const tab = src('ui/templatestab.js');
  assert.match(tab, /<details class="pb-more"[^>]*><summary>Earlier versions \(\$\{p\.versions\}\)<\/summary>/);
  assert.match(tab, /Use this version<\/button>/);
  assert.match(tab, /versionLines\(entry\.out, now\)\.filter\(\(l\) => !l\.inUse\)/);
  assert.match(tab, /Your file has other wording for this part since you saved yours\./);
  assert.match(tab, /Use the file's wording<\/button>/);
});

test('the Voice tab saves a rule with no preview and says new suggestions follow it', async () => {
  const { store, calls, toasts } = make();
  await store.actions.load('voice', null);
  store.actions.edit('house-voice.md', 'Length');
  assert.equal(store.get().editing.text, LENGTH);
  const rule = LENGTH + ' Three short paragraphs at most.';
  store.actions.type(rule);
  calls.length = 0;
  assert.equal(await store.actions.saveWording('house-voice.md', 'Length', rule), true);
  assert.deepEqual(calls, [{ path: '/api/playbook/wording', body: { name: 'house-voice.md', part: 'Length', text: rule } }, { path: '/api/playbook/wording' }], 'no preview is asked for');
  const t = lastToast(toasts);
  assert.equal(t.message, SAVED);
  assert.equal(t.action.label, 'Undo');
  assert.equal(store.get().editing, null);
  calls.length = 0;
  await t.action.run();
  await settle();
  assert.deepEqual(posts(calls), [{ path: '/api/playbook/wording', body: { name: 'house-voice.md', part: 'Length', text: LENGTH } }]);
  // The same words as those in use: nothing is saved, and the toast says so, with nothing to undo.
  const same = make();
  await same.store.actions.load('voice', null);
  same.store.actions.edit('house-voice.md', 'Length');
  assert.equal(await same.store.actions.saveWording('house-voice.md', 'Length', LENGTH + '\n'), true);
  assert.equal(lastToast(same.toasts).message, 'Nothing changed: these are the words in use already.');
  assert.equal(lastToast(same.toasts).action, null);
  assert.equal(same.store.get().editing, null);

  // The tab: its intro, Edit, Save and Cancel, the same Earlier versions, and no preview.
  const voice = src('ui/voicetab.js');
  assert.match(voice, /How every reply sounds and sells\. A change here goes into the next suggestion; there is no preview, because only the AI can show it\./);
  assert.match(voice, />Edit<\/button>/);
  assert.match(voice, />Save<\/button>/);
  assert.match(voice, />Cancel<\/button>/);
  assert.match(voice, /<\$\{EarlierVersions\}/);
  assert.doesNotMatch(voice, /Show how it reads|actions\.preview/);
  assert.match(voice, /wordingGroups\(pstate\.wording, 'voice'\)/);
});

test('a save the server refuses keeps the words in the editor and says why', async () => {
  const NO_DEPOSIT = 'The deposit link stays a blank: keep [DEPOSIT LINK?] in this message.';
  const NEW_SECTION = 'A line starting with ## starts a new section. Add a new section in the file itself.';
  const { store, calls, toasts } = make({
    refuse: (path, body) => (path === '/api/playbook/wording' && body && body.part === 'first_estimate' ? NO_DEPOSIT
      : path === '/api/playbook/wording' && body && body.part === 'Length' ? NEW_SECTION : null),
  });
  await store.actions.load('templates', null);
  const name = 'auction-messages.md';
  const without = '@label: First estimate\n@fits: first reply\nThe deposit link is on its way.';
  store.actions.edit(name, 'first_estimate');
  store.actions.type(without);
  await store.actions.preview(name, 'first_estimate', without);
  calls.length = 0;
  assert.equal(await store.actions.saveWording(name, 'first_estimate', without), false);
  assert.equal(lastToast(toasts).message, NO_DEPOSIT, "the server's own words");
  assert.equal(lastToast(toasts).action, null, 'nothing to undo');
  assert.deepEqual(store.get().editing, { name, part: 'first_estimate', text: without }, 'the words stay in the editor');
  assert.equal(store.get().previewed.text, without, 'and their preview');
  assert.equal(unsentWording(name, 'first_estimate'), without, 'kept for when the tab comes back');
  assert.equal(store.get().state, 'ready');
  assert.deepEqual(calls, [{ path: '/api/playbook/wording', body: { name, part: 'first_estimate', text: without } }, { path: '/api/playbook/wording' }], 'read again, as it may have moved on');
  assert.equal(store.get().editing.text, without, 'the read again keeps the words');

  // Another tab and back (or Back and the Menu): the editor is still open with the words.
  await store.actions.load('lessons', null);
  await store.actions.load('templates', null);
  assert.deepEqual(store.get().editing, { name, part: 'first_estimate', text: without });

  // A voice rule refused: the same.
  await store.actions.load('voice', null);
  store.actions.edit('house-voice.md', 'Length');
  const heading = LENGTH + '\n## Another section';
  store.actions.type(heading);
  assert.equal(await store.actions.saveWording('house-voice.md', 'Length', heading), false);
  assert.equal(lastToast(toasts).message, NEW_SECTION);
  assert.equal(store.get().editing.text, heading);
  // The template's words are kept too, for when it is opened again.
  assert.equal(unsentWording(name, 'first_estimate'), without);
  store.actions.edit(name, 'first_estimate');
  assert.equal(store.get().editing.text, without);

  // A preview the server refuses says why, and keeps the words.
  const bid = make({ refuse: (path) => (path === '/api/playbook/preview' ? '{bid} is not filled in this message, so the customer would see it as written.' : null) });
  await bid.store.actions.load('templates', null);
  bid.store.actions.edit('auction-messages.md', 'progress_update');
  bid.store.actions.type('Your car is {where}. The bid is {bid}.');
  assert.equal(await bid.store.actions.preview('auction-messages.md', 'progress_update', 'Your car is {where}. The bid is {bid}.'), false);
  assert.equal(lastToast(bid.toasts).message, '{bid} is not filled in this message, so the customer would see it as written.');
  assert.equal(bid.store.get().previewed, null);
  assert.equal(bid.store.get().editing.text, 'Your car is {where}. The bid is {bid}.');
  bid.store.actions.cancel();

  // Cancel forgets them.
  store.actions.cancel();
  assert.equal(store.get().editing, null);
  assert.equal(unsentWording(name, 'first_estimate'), null);
  keepUnsentWording('house-voice.md', 'Length', null);
});

test('a preview that comes back after the editor moved on is dropped, and one change or preview goes at a time', async () => {
  let release;
  const calls = [];
  const api = (path, body) => {
    calls.push(body === undefined ? { path } : { path, body });
    if (path === '/api/playbook/preview') return new Promise((r) => { release = () => r({ previews: three(body.text) }); });
    return Promise.resolve({ files: files() });
  };
  const store = createPlaybookStore({ api, toast: () => {} });
  await store.actions.load('templates', null);
  store.actions.edit('dashboard-messages.md', 'still_available');
  const asked = store.actions.preview('dashboard-messages.md', 'still_available', STILL);
  assert.equal(store.get().busy, true, 'the buttons wait while it is written');
  assert.equal(await store.actions.preview('dashboard-messages.md', 'still_available', STILL), false, 'a second press is not posted');
  store.actions.edit('dashboard-messages.md', 'trade_in');
  release();
  assert.equal(await asked, false);
  assert.equal(store.get().previewed, null, "Still available's preview is not Trade-in's");
  assert.equal(store.get().busy, false);
  assert.equal(calls.filter((c) => c.path === '/api/playbook/preview').length, 1);
  store.actions.cancel();
});
