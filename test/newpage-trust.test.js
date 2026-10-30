// The trust line under the message box names the business facts a suggestion used, with their state
// and day, and a fact that needs an answer says so above the box, linked to it in the Playbook (journey
// 6). Pure functions, and the source of the page's own files. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { trustLine, factLine, topicLine, factAsk } from '../web/new/js/trustview.js';
import * as model from '../web/new/js/model.js';
import { PLAYBOOK_TABS, playbookRoute, playbookHash } from '../web/new/js/playbookroute.js';

const NOW = Date.parse('2026-10-31T02:00:00Z'); // Saturday 31 October, 1 pm in Sydney
const THURSDAY = Date.parse('2026-10-29T02:00:00Z');
const FRIDAY = Date.parse('2026-10-30T02:00:00Z');
const figures = [
  { label: 'Price', value: '$31,900', source: 'the stock record', ok: true },
  { label: '', value: 'https://example.test/car/1800', source: 'your wording file', ok: true },
];
const tint = { title: 'Tinted windows', status: 'confirmed', at: NOW - 3600e3 };
const racks = { title: 'Roof racks', status: 'working', at: THURSDAY };
const hours = { title: 'Opening hours', status: 'confirmed', at: null };
const entry = (t) => ({ label: t.title, value: '', source: 'your business facts', ok: true, topic: { status: t.status, at: t.at } });
const ready = (o = {}) => ({ status: 'ready', reply: 'Yes, we can arrange window tinting before pickup.', facts: [], topics: [], checks: [], ...o });
const src = (f) => fs.readFileSync(new URL('../web/new/js/' + f, import.meta.url), 'utf8');

test('the trust line names the business facts a suggestion used, with their state and day', () => {
  // No figure or link: the sentence stands alone, in the line's quiet tone.
  let d = ready({ topics: [tint] });
  assert.deepEqual(trustLine(d, d.reply, NOW), { tone: 'none', text: 'Uses your business fact “Tinted windows”.', facts: [entry(tint)] });
  // With figures, it follows their words, and each fact is one more entry after them; the count is the figures'.
  d = ready({ reply: 'The price is $31,900.', facts: figures, topics: [tint, racks] });
  assert.deepEqual(trustLine(d, d.reply, NOW), {
    tone: 'good', text: '2 facts checked. Uses your business facts “Tinted windows” and “Roof racks”.', facts: [...figures, entry(tint), entry(racks)],
  });
  d = ready({ reply: 'It is $29,990.', facts: [{ label: '', value: '$29,990', source: 'not found in the records', ok: false }], topics: [tint, racks, hours] });
  const bad = trustLine(d, d.reply, NOW);
  assert.deepEqual([bad.tone, bad.text], ['bad', '1 fact not in your records. Uses your business facts “Tinted windows”, “Roof racks” and “Opening hours”.']);
  // The tone rule is the figures': a blank still to fill keeps it from green.
  d = ready({ reply: 'The price is $31,900, tinting is [CHECK?].', facts: figures, topics: [tint] });
  assert.equal(trustLine(d, d.reply, NOW).tone, 'none');
  // Text that is not Wheelman's own is never called checked, and names no fact.
  assert.deepEqual(trustLine(ready({ topics: [tint] }), 'My own words', NOW), { tone: 'none', text: 'Changed since it was checked.' });
  // A draft with no topics is as before.
  d = ready({ reply: 'The price is $31,900.', facts: figures });
  assert.deepEqual(trustLine(d, d.reply, NOW), { tone: 'good', text: '2 facts checked', facts: figures });
  assert.deepEqual(trustLine(ready({ topics: undefined }), ready().reply, NOW), { tone: 'none', text: 'No figures or links to check.' });

  // Each fact in the opened list: where it came from, and its state and day.
  assert.equal(topicLine(entry(tint), NOW), 'Tinted windows · from your business facts, confirmed today');
  assert.equal(topicLine(entry({ ...tint, at: FRIDAY }), NOW), 'Tinted windows · from your business facts, confirmed yesterday');
  assert.equal(topicLine(entry({ ...tint, at: THURSDAY }), NOW), 'Tinted windows · from your business facts, confirmed Thursday 29 October');
  assert.equal(topicLine(entry(racks), NOW), 'Roof racks · from your business facts, still Working');
  assert.equal(topicLine(entry({ ...racks, at: null }), NOW), 'Roof racks · from your business facts, still Working');
  assert.equal(topicLine(entry(hours), NOW), 'Opening hours · from your business facts');
  assert.equal(factLine(entry(tint), NOW), topicLine(entry(tint), NOW));
  assert.equal(factLine(figures[0], NOW), 'Price · $31,900 · from the stock record', 'a figure is as before');
});

test('the Needs-answer line links to the fact, and offers Write it again only while the box is untouched', () => {
  const item = (open, draft = {}) => ({ key: 'c:1', draft: ready({ openTopics: open, edited: null, ...draft }) });
  const needs = factAsk(item([{ title: 'Tinted windows', answered: false }]), null);
  assert.deepEqual(needs, {
    words: '“Tinted windows” needs your answer in the Playbook, so the reply has a blank for it.',
    href: '#/playbook/facts/Tinted%20windows', rewrite: false, answered: false,
  });
  assert.deepEqual(playbookRoute(needs.href), { tab: 'facts', id: 'Tinted windows' });

  const answered = item([{ title: 'Tinted windows', answered: true }, { title: 'Car covers', answered: false }]);
  assert.deepEqual(factAsk(answered, null), {
    words: '“Tinted windows” has your answer now. Write the reply again to use it.',
    href: '#/playbook/facts/Tinted%20windows', rewrite: true, answered: true,
  });
  // Typed words, a cleared box, or an edit saved before a reload: Write it again would write over them.
  assert.equal(factAsk(answered, 'My own words').rewrite, false);
  assert.equal(factAsk(answered, '').rewrite, false);
  assert.equal(factAsk(item([{ title: 'Tinted windows', answered: true }], { edited: 'Saved words' }), null).rewrite, false);
  assert.equal(factAsk(item([{ title: 'Tinted windows', answered: false }]), 'My own words').words, needs.words, 'the line itself stays');

  // No open topic, or no suggestion: no line.
  assert.equal(factAsk(item([]), null), null);
  assert.equal(factAsk(item(undefined), null), null);
  assert.equal(factAsk({ key: 'c:1', draft: null }, null), null);
  assert.equal(factAsk(null, null), null);

  // The box shows it under the context line: Answer it opens the fact, Write it again writes the reply again.
  const box = src('ui/messagebox.js');
  assert.match(box, /<\$\{Context\}[^\n]*\/>\n\s*<\$\{FactAsk\} item=\$\{item\} typed=\$\{state\.typed\} actions=\$\{actions\} locked=\$\{locked\} \/>/);
  const trust = src('ui/trust.js');
  assert.match(trust, /factAsk\(item, typed\)/);
  assert.match(trust, /href=\$\{ask\.href\}>Answer it<\/a>/);
  assert.match(trust, /onClick=\$\{\(\) => actions\.write\(\{ instruction: \(item\.draft && item\.draft\.instruction\) \|\| undefined \}\)\}>Write it again<\/button>/);
});

test("Write it again writes the reply again with the Prompt it was written with, as Try again does", async () => {
  // The page's own Preact and htm, as index.html loads them, so the box's line can be drawn in Node:
  // what it draws is plain objects, and its button's press is called as a click would.
  vm.runInThisContext(fs.readFileSync(new URL('../web/new/vendor/htm-preact.umd.js', import.meta.url), 'utf8'));
  const { FactAsk } = await import('../web/new/js/ui/trust.js');
  const nodes = (n) => (Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props && n.props.children)] : []);
  const words = (n) => (Array.isArray(n) ? n.map(words).join('') : n && typeof n === 'object' ? words(n.props && n.props.children) : n == null ? '' : String(n));
  const asked = [];
  const press = (draft) => {
    const item = { key: 'c:1', draft: ready({ openTopics: [{ title: 'Tinted windows', answered: true }], edited: null, ...draft }) };
    const button = nodes(FactAsk({ item, typed: null, actions: { write: (o) => asked.push(o) } })).find((n) => n.type === 'button');
    assert.equal(words(button), 'Write it again');
    button.props.onClick();
  };
  press({ instruction: 'Keep it short and friendly.' });
  press({ instruction: '' });
  press({});
  assert.deepEqual(asked, [{ instruction: 'Keep it short and friendly.' }, { instruction: undefined }, { instruction: undefined }]);
  // The same call as the failure line's Try again in the box.
  assert.match(src('ui/messagebox.js'), /onClick=\$\{\(\) => actions\.write\(\{ instruction: \(item\.draft && item\.draft\.instruction\) \|\| undefined \}\)\}/);
});

test("the Playbook's address", () => {
  assert.deepEqual(PLAYBOOK_TABS, ['lessons', 'facts', 'templates', 'voice']);
  assert.equal(playbookHash('facts', 'Tinted windows'), '#/playbook/facts/Tinted%20windows');
  assert.equal(playbookHash('lessons'), '#/playbook/lessons');
  assert.deepEqual(playbookRoute('#/playbook/lessons'), { tab: 'lessons', id: null });
  assert.deepEqual(playbookRoute('#/playbook'), { tab: 'lessons', id: null });
  assert.deepEqual(playbookRoute('#/playbook/nothing-here'), { tab: 'lessons', id: null }, 'an unknown tab is Lessons');
  assert.deepEqual(playbookRoute('#/playbook/facts/%E0%A4%A'), { tab: 'facts', id: '%E0%A4%A' }, 'an address that cannot be decoded is kept as it is');
  assert.equal(playbookRoute('#/dashboard/waiting/c%3A1'), null);
  assert.equal(playbookRoute('#/playbooks'), null);
  assert.equal(playbookRoute(''), null);
  assert.doesNotMatch(src('playbookroute.js'), /^\s*import\s/m, 'it imports nothing');
});

test('the trust line lives in trustview.js, and model.js passes it on', () => {
  assert.equal(model.trustLine, trustLine);
  assert.equal(model.factLine, factLine);
  const own = src('model.js');
  assert.doesNotMatch(own, /function trustLine|function factLine/);
  assert.match(own, /export \{ trustLine, factLine \} from '\.\/trustview\.js';/);
  // trustview.js needs nothing from model.js, so model.js can pass it on with no import cycle.
  assert.doesNotMatch(src('trustview.js'), /from '\.\/model\.js'/);
});
