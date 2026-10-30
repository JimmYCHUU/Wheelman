// The Playbook's templates and voice rules: wording saved there is what Wheelman writes from, laid
// over its part of the file whenever the file is read, with every version kept in the database. No
// wording file is ever written: every file under voice/ keeps its bytes and its modified time. The
// wording read is the repository's own voice/ files, which are public; every change saved here is
// invented, in an in-memory database. Stand-ins play the dashboard, the website and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
delete process.env.PROMPT_STYLE;

// The stand-in AI gives a template it is asked to fit back as it is, so a suggestion shows the
// wording it was written from.
const ai = aiBehaviour({ behave: (req) => {
  const fit = String(req.messages?.[1]?.content || '').match(/<<<\n([\s\S]*?)\n>>>/);
  return { reply: fit ? fit[1] : 'Hello {{NAME}},\n\nThank you for your message.', next_step: '', rung: '', facts_used: [], needs_human: [], hold: false };
} });

const now = Date.now();
let standins, config, db, items, wording, templates, sectiontemplates, promptModule, playbook, app, base, voiceDir, voiceAtStart;

/** Every file under a folder, with its bytes and its modified time. */
function filesUnder(dir) {
  const out = new Map();
  for (const f of fs.readdirSync(dir, { recursive: true }).map(String)) {
    const file = path.join(dir, f);
    const stat = fs.statSync(file);
    if (stat.isFile()) out.set(file, { bytes: fs.readFileSync(file), mtimeMs: stat.mtimeMs });
  }
  return out;
}
/** Every file under voice/ is byte for byte as it was when this file's tests started, and none was written. */
function assertVoiceUntouched() {
  const seen = filesUnder(voiceDir);
  assert.deepEqual([...seen.keys()].sort(), [...voiceAtStart.keys()].sort(), 'no file added or removed under voice/');
  for (const [file, was] of voiceAtStart) {
    assert.ok(seen.get(file).bytes.equals(was.bytes), `${path.relative(voiceDir, file)} is byte for byte as it was`);
    assert.equal(seen.get(file).mtimeMs, was.mtimeMs, `${path.relative(voiceDir, file)} was not written`);
  }
}

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-wording-session-${process.pid}.json`) });
  voiceDir = config.voiceDir;
  voiceAtStart = filesUnder(voiceDir);
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  wording = await import('../src/wording.js');
  templates = await import('../src/templates.js');
  sectiontemplates = await import('../src/sectiontemplates.js');
  promptModule = await import('../src/prompt.js');
  playbook = await import('../src/playbook.js');
  await (await import('../src/sync.js')).syncAll();
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins?.close();
});

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, ...(await r.json()) }; };
const post = async (p, body = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
const save = (name, part, text) => post('/api/playbook/wording', { name, part, text });
const listedFiles = async () => (await get('/api/playbook/wording')).files;
const partOf = async (name, part) => (await listedFiles()).find((f) => f.name === name).parts.find((p) => p.part === part);
const versionsAsked = (kind, name, part) => get(`/api/playbook/versions?kind=${kind}&name=${encodeURIComponent(name)}&part=${encodeURIComponent(part)}`);
const rows = () => db.countRows('playbook_versions');
const DASHBOARD = 'dashboard-messages.md';
const COMMENT = /<!--[\s\S]*?-->/g;
/** A template file's own lines with its notes taken out, read here on their own. */
const ownLines = (name) => fs.readFileSync(path.join(voiceDir, name), 'utf8').replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => !l.startsWith('#'));
/** A voice file's own text, as a request was sent it before the Playbook. */
const ownText = (name) => fs.readFileSync(path.join(voiceDir, name), 'utf8').replace(/\r/g, '').trim();

// What each test needs of the others. A saved version is never removed, so the first test runs
// before any save, and each later test saves its own parts and checks only those: still_available
// (the second), finance (the third), trade_in and the refused saves (none taken; Safety is put back
// to the file's words), first_estimate (the fifth), the first-reply details (the sixth), Length, the
// voice card and The price question (the seventh), and Marketplace's polite_close (the eighth, in a
// copy of the voice folder).
test('with nothing saved, every wording file reads as before', async () => {
  assert.equal(rows(), 0);
  for (const w of wording.WORDING) {
    if (w.kind === 'template') {
      assert.deepEqual(wording.templateLines(w.name), ownLines(w.name), w.name);
      assert.deepEqual(templates.template(w.name), templates.template(w.name, { playbook: false }), w.name);
    } else {
      assert.equal(wording.voiceText(w.name), ownText(w.name), w.name);
    }
    // Each part laid over its file in the file's own words changes nothing: the parts are the file.
    const parts = wording.fileParts(w.name);
    assert.ok(parts.length > 0, w.name);
    for (const { part, text } of parts) {
      const laid = wording.withPreview({ name: w.name, part, text }, () => (w.kind === 'template' ? templates.template(w.name) : wording.voiceText(w.name)));
      if (w.kind === 'template') assert.deepEqual(laid, templates.template(w.name), `${w.name} "${part}"`);
      else assert.equal(laid.replace(COMMENT, '').trim(), ownText(w.name).replace(COMMENT, '').trim(), `${w.name} "${part}"`);
    }
  }
  // The readers built on them: the whole voice and selling files in a full request, the card without its comment.
  assert.ok(promptModule.systemPrompt('sms').includes(`\n=== VOICE ===\n${ownText('house-voice.md')}\n\n=== SELLING ===\n${ownText('sales-playbook.md')}\n`));
  assert.equal(promptModule.voiceCard(), ownText('compact/voice-card.md').replace(COMMENT, '').trim());

  // A preview's words are read inside it only.
  const asIs = templates.template(DASHBOARD).sections.still_available;
  const changed = wording.fileParts(DASHBOARD).find((p) => p.part === 'still_available').text.replace('is still available', 'is here today');
  assert.match(wording.withPreview({ name: DASHBOARD, part: 'still_available', text: changed }, () => templates.template(DASHBOARD).sections.still_available), /is here today/);
  assert.equal(templates.template(DASHBOARD).sections.still_available, asIs);

  // As the Playbook lists them: every part the file's own, never a note line, never the voice card's comment.
  const files = await listedFiles();
  assert.deepEqual(files.map((f) => [f.name, f.kind, f.group, f.label]), wording.WORDING.map((w) => [w.name, w.kind, w.group, w.label]));
  for (const f of files) {
    for (const p of f.parts) {
      assert.deepEqual([p.text, p.at, p.versions, p.fileChanged], [p.fileText, null, 0, false], `${f.name} "${p.part}"`);
      if (f.kind === 'template') assert.ok(!p.text.split('\n').some((l) => l.startsWith('#')), `${f.name} "${p.part}" holds no note line`);
      assert.ok(!p.text.includes('<!--'), `${f.name} "${p.part}"`);
    }
  }
  const label = (name, part) => files.find((f) => f.name === name).parts.find((p) => p.part === part)?.label;
  assert.equal(label(DASHBOARD, 'still_available'), 'Still available');
  assert.equal(label(DASHBOARD, ''), 'The short pieces');
  assert.equal(label('auction-messages.md', 'first_estimate'), 'Thanks, with estimate and deposit');
  assert.equal(label('auction-messages.md', ''), 'The short pieces');
  assert.equal(label('price-reply.md', ''), 'Price reply');
  assert.equal(label('house-voice.md', 'Length'), 'Length');
  assert.equal(label('house-voice.md', ''), 'The Carbarn voice');
  assert.equal(label('compact/voice-card.md', ''), 'The short voice card, for compact requests');
  // A file with nothing before its first message has no short pieces to edit.
  assert.ok(!files.find((f) => f.name === 'marketplace-messages.md').parts.some((p) => p.part === ''));
  // The auction file's enquiry messages are listed under Imports, where they are offered; the rest under Auction.
  const auction = files.find((f) => f.name === 'auction-messages.md').parts;
  assert.deepEqual(auction.filter((p) => p.group === 'Imports').map((p) => p.part), ['first_estimate', 'lots_coming', 'lot_offer', 'lot_short', 'search_update', 'deposit_reminder']);
  assert.ok(auction.filter((p) => p.group !== 'Imports').every((p) => p.group === 'Auction'));
  assert.equal(rows(), 0, 'reading, listing and a preview saved nothing');
  assert.equal(db.versionsStamp(), 0);
});

test('a template saved in the Playbook is the one Which message? writes, on both pages, and the file is never written', async () => {
  const key = 'c:201'; // Priya asks whether the Noah, at the showroom, is still available
  const own = await partOf(DASHBOARD, 'still_available');
  const text = own.fileText.replace('Yes, the {car} is still available.', 'Yes, the {car} is available today.');
  assert.notEqual(text, own.fileText);
  let composed = await sectiontemplates.composeSectionTemplate(items.itemFromKey(key), 'still_available');
  assert.ok(composed.text.includes('is still available'), composed.text);

  const start = Date.now();
  const out = await save(DASHBOARD, 'still_available', text);
  assert.equal(out.status, 200, out.error);
  assert.deepEqual([out.part.part, out.part.label, out.part.text, out.part.fileText, out.part.versions, out.part.fileChanged], ['still_available', 'Still available', text, own.fileText, 1, false]);
  assert.ok(out.part.at >= start && out.part.at <= Date.now());

  composed = await sectiontemplates.composeSectionTemplate(items.itemFromKey(key), 'still_available');
  assert.ok(composed.text.includes('Yes, the 2021 Toyota Noah X (8 Seater) is available today.'), composed.text);
  assert.ok(!composed.text.includes('still available'), composed.text);
  // Both pages have it written by the server: Which message? on the old page, More messages on the new one.
  const d = (await post(`/api/items/${key}/draft`, { message: 'still_available' })).item.draft;
  assert.equal(d.status, 'ready', d.error);
  assert.equal(d.template, 'still_available');
  assert.ok(d.reply.includes('is available today'), d.reply);
  assertVoiceUntouched();
});

test("every version of a template is kept, and the file's own wording is the first", async () => {
  const own = await partOf(DASHBOARD, 'finance');
  const first = own.fileText.replace('through our lending partners', 'through our finance partners');
  const second = own.fileText.replace('through our lending partners', 'through the lenders we work with');
  const start = Date.now();
  for (const text of [first, second]) {
    const out = await save(DASHBOARD, 'finance', text);
    assert.equal(out.status, 200, out.error);
  }
  const out = await versionsAsked('template', DASHBOARD, 'finance');
  assert.equal(out.status, 200, out.error);
  assert.deepEqual(out.versions.map((v) => v.text), [second, first], 'newest first');
  assert.ok(out.versions.every((v) => Number.isInteger(v.id) && v.at >= start && v.at <= Date.now()));
  assert.ok(out.versions[0].id > out.versions[1].id);
  // The file's own wording is the first version. The file still says it, so it is "In your file".
  assert.equal(out.file, own.fileText);
  assert.ok(!('saidFirst' in out));

  // Kept as rows of the Playbook's versions, each with the file's own words as its base.
  const stored = () => db.versionsOf({ kind: 'template', name: DASHBOARD, part: 'finance' });
  assert.deepEqual(stored().map((r) => [r.text, r.base, r.status]), [[second, own.fileText, null], [first, own.fileText, null]]);
  let listed = await partOf(DASHBOARD, 'finance');
  assert.deepEqual([listed.text, listed.versions, listed.at, listed.fileChanged], [second, 2, stored()[0].at, false]);
  assert.match(templates.template(DASHBOARD).sections.finance, /through the lenders we work with/);

  // The same words again add nothing, at their ends trimmed or not.
  const again = await save(DASHBOARD, 'finance', `  ${second}\n`);
  assert.equal(again.status, 200, again.error);
  assert.equal(stored().length, 2);
  // The file's own words put back are a version of their own, and read as the file again.
  const back = await save(DASHBOARD, 'finance', own.fileText);
  assert.equal(back.status, 200, back.error);
  assert.equal(stored().length, 3);
  listed = await partOf(DASHBOARD, 'finance');
  assert.deepEqual([listed.text, listed.versions], [own.fileText, 3]);
  assert.deepEqual(templates.template(DASHBOARD).sections.finance, templates.template(DASHBOARD, { playbook: false }).sections.finance);

  // A voice section never saved: no versions, and the file's own text.
  const grammar = await versionsAsked('voice', 'house-voice.md', 'Grammar');
  assert.deepEqual([grammar.status, grammar.versions, grammar.file], [200, [], wording.fileParts('house-voice.md').find((p) => p.part === 'Grammar').text]);
  // Wording the Playbook does not list.
  for (const [kind, name, part] of [['voice', DASHBOARD, 'finance'], ['template', 'people.json', ''], ['template', DASHBOARD, 'no_such_message'], ['fact', 'business-facts.md', 'Opening hours']]) {
    const bad = await versionsAsked(kind, name, part);
    assert.deepEqual([bad.status, bad.error], [404, 'That wording is not in the Playbook.'], `${kind} ${name} ${part}`);
  }
});

test('a save that would break the file is refused: a new part, a note line, an unknown fact, a signal no conversation shows, a lost @label or @fits, a lost short piece or the line of dashes', async () => {
  const count = rows();
  const trade = (await partOf(DASHBOARD, 'trade_in')).fileText;
  const short = (await partOf(DASHBOARD, '')).fileText;
  const price = (await partOf('price-reply.md', '')).fileText;
  const grammar = (await partOf('house-voice.md', 'Grammar')).fileText;
  const offer = (await partOf('auction-offer.md', '')).fileText;
  const invite = (await partOf('inspection-invite.md', '')).fileText;
  const ask = (await partOf('import-ask.md', '')).fileText;
  const LABEL = 'Keep the line that starts @label: — it is the name the "Which message?" list shows.';
  const FITS = 'Keep the line that starts @fits: — it says when the message is offered.';
  /** Words of exactly n characters, with nothing to trim, no brace and no heading. */
  const sized = (n) => `${'Plain words for a test. '.repeat(400).slice(0, n - 1)}.`;
  const cases = [
    [[DASHBOARD, 'trade_in', `${trade}\n\n===== trade_in_two =====\n@label: Trade-in again\n@fits: trade_in\nThank you.`], 400, 'A line like ===== name ===== starts a new message. Add a new message in the file itself.'],
    [[DASHBOARD, 'trade_in', `# a note for the team\n${trade}`], 400, 'A line starting with # is a note and is never sent. Take the # off, or remove the line.'],
    // The three section files' own checks, in plain words: no file name, no message name, and a
    // problem named twice is said once.
    [[DASHBOARD, 'trade_in', trade.replace('{sign_off}', '{colour}\n\n{sign_off}')], 400, '{colour} is not a fact Wheelman fills in here.'],
    [[DASHBOARD, 'trade_in', trade.replace('{sign_off}', 'In {colour}, or {colour} again.\n\n{sign_off}')], 400, '{colour} is not a fact Wheelman fills in here.'],
    [[DASHBOARD, 'trade_in', trade.replace('@fits: trade_in', '@fits: trade_in, sunny days')], 400, 'A conversation never shows "sunny days": on the @fits: line, use the words the other messages use.'],
    [[DASHBOARD, 'trade_in', trade.replace('@label: Trade-in\n', '')], 400, LABEL],
    [[DASHBOARD, 'trade_in', trade.replace('@fits: trade_in\n', '')], 400, FITS],
    [[DASHBOARD, 'trade_in', trade.replace('@label: Trade-in\n@fits: trade_in\n', '')], 400, `${LABEL} ${FITS}`],
    // Outside the three section files' messages: only the facts the file already uses.
    [['price-reply.md', '', `${price}\n\nIt comes in {colour}.`], 400, '{colour} is not a fact Wheelman fills in here.'],
    [[DASHBOARD, '', `${short}\n@new_colour: It comes in {colour}.`], 400, '{colour} is not a fact Wheelman fills in here.'],
    // A short piece Wheelman reads by its name, lost or renamed, and the line of dashes.
    [['auction-offer.md', '', offer.replace(/^@own:.*\n/m, '')], 400, 'Keep the line that starts @own: — Wheelman reads it by that name when it writes the message.'],
    [['auction-offer.md', '', offer.replace(/^@suggested:.*\n/m, '').replace(/^@own:.*\n/m, '')], 400, 'Keep the lines that start @suggested: and @own: — Wheelman reads them by those names when it writes the message.'],
    [['inspection-invite.md', '', invite.replace('@onsite:', '@in_person:')], 400, 'Keep the line that starts @onsite: — Wheelman reads it by that name when it writes the message.'],
    [['inspection-invite.md', '', invite.replace(/^@tail:.*$/m, '@tail:')], 400, 'Keep the line that starts @tail: — Wheelman reads it by that name when it writes the message.'],
    [[DASHBOARD, '', short.replace(/^@deposit_offer:.*\n/m, '')], 400, 'Keep the line that starts @deposit_offer: — Wheelman reads it by that name when it writes the message.'],
    [['import-ask.md', '', ask.replace(/\n---\n/, '\n')], 400, 'Keep the line of dashes (---): Wheelman writes the message above it, and always ends with the lines below it.'],
    [['house-voice.md', 'Grammar', `${grammar}\n\n## A new section\nWords.`], 400, 'A line starting with ## starts a new section. Add a new section in the file itself.'],
    [['people.json', '', 'Words.'], 404, 'That wording is not in the Playbook.'],
    [[DASHBOARD, 'no_such_message', 'Words.'], 404, 'That wording is not in the Playbook.'],
    [['marketplace-messages.md', '', '@extra: Words.'], 404, 'That wording is not in the Playbook.'],
    [[DASHBOARD, 'trade_in', ' \n  '], 400, 'Write the wording first.'],
    [['sales-playbook.md', 'Safety', sized(8000)], 400, 'That is too long: keep it under 8,000 characters.'],
  ];
  for (const [[name, part, text], code, error] of cases) {
    const out = await save(name, part, text);
    if (code === 400) assert.notEqual(text, (await partOf(name, part)).fileText, `${name} "${part}": the case changes something`);
    assert.deepEqual([out.status, out.error], [code, error], `${name} "${part}": ${text.slice(0, 60)}`);
    assert.doesNotMatch(out.error, /\.md\b|trade_in|; /, 'no file name, no message name, said once');
  }
  assert.equal(rows(), count, 'nothing was saved');
  assert.equal((await partOf(DASHBOARD, 'trade_in')).text, trade);

  // A message's own optional details (@needs, @not, @fit) may go: only its @label and @fits are kept by its checks.
  const optional = await save(DASHBOARD, 'trade_in', trade.replace('@not: buyer\n', ''));
  assert.equal(optional.status, 200, optional.error);
  assert.equal((await save(DASHBOARD, 'trade_in', trade)).status, 200);

  // Under 8,000 characters is taken, as the words say; then the file's own words are put back.
  const safety = (await partOf('sales-playbook.md', 'Safety')).fileText;
  const longest = await save('sales-playbook.md', 'Safety', sized(7999));
  assert.equal(longest.status, 200, longest.error);
  assert.equal(longest.part.text.length, 7999);
  assert.equal((await save('sales-playbook.md', 'Safety', safety)).status, 200);
  assert.equal(wording.voiceText('sales-playbook.md'), ownText('sales-playbook.md'));
});

test('the deposit link stays a blank: a save without [DEPOSIT LINK?] is refused where the file has it', async () => {
  const BLANK = 'The deposit link stays a blank: keep [DEPOSIT LINK?] in this message.';
  const estimate = (await partOf('auction-messages.md', 'first_estimate')).fileText;
  const offer = (await partOf('auction-offer.md', '')).fileText;
  const search = (await partOf('importquery-messages.md', 'ready_to_search')).fileText;
  assert.ok([estimate, offer, search].every((t) => t.includes('[DEPOSIT LINK?]')));
  const count = rows();
  for (const [name, part, text] of [
    ['auction-messages.md', 'first_estimate', estimate.replace('You can place the deposit using the link below:\n[DEPOSIT LINK?]', 'You can place the deposit by bank transfer.')],
    ['auction-messages.md', 'first_estimate', estimate.replace('[DEPOSIT LINK?]', 'https://pay.example.com/deposit')],
    ['auction-offer.md', '', offer.replace('[DEPOSIT LINK?]', '')],
    ['importquery-messages.md', 'ready_to_search', search.replace(' [DEPOSIT LINK?]', '')],
  ]) {
    const out = await save(name, part, text);
    assert.deepEqual([out.status, out.error], [400, BLANK], `${name} "${part}"`);
  }
  assert.equal(rows(), count, 'nothing was saved');

  // With the blank kept, a change is taken, and a fact the file already uses may be added.
  const kept = estimate.replace('Thank you for your {car_wanted} enquiry.', 'Thank you for your {car_wanted} enquiry, and for asking us about the {model}.');
  const out = await save('auction-messages.md', 'first_estimate', kept);
  assert.equal(out.status, 200, out.error);
  assert.equal(out.part.group, 'Imports');
  const written = templates.template('auction-messages.md').sections.first_estimate;
  assert.match(written, /and for asking us about the \{model\}\./);
  assert.match(written, /\[DEPOSIT LINK\?\]/);
});

test('a block saved in the Playbook is the one code adds under a reply: the first-reply details, read by their own code', async () => {
  const { standardBlock } = await import('../src/firstreply.js');
  const OLD = 'Please call or text before visiting.';
  const NEW = 'Please call or text us before you visit.';
  const before = standardBlock({ vehicleUrl: 'https://example.com/car' });
  assert.ok(before.includes(OLD), before);
  const out = await save('first-reply.md', '', (await partOf('first-reply.md', '')).fileText.replace(OLD, NEW));
  assert.equal(out.status, 200, out.error);
  assert.equal(standardBlock({ vehicleUrl: 'https://example.com/car' }), before.replace(OLD, NEW));
});

test('a voice rule saved in the Playbook goes into the next request, and the compact card and the selling guide follow theirs', async () => {
  // The house voice's Length section, in the full request: only those words change.
  const rules = promptModule.systemPrompt('sms');
  const length = (await partOf('house-voice.md', 'Length')).fileText;
  const OLD = 'If it can be said in fewer words, use fewer.';
  const NEW = 'If it can be said in fewer words, use fewer. A test rule: three short lines at most.';
  assert.equal(rules.split(OLD).length, 2, 'the sentence is in the request once');
  let out = await save('house-voice.md', 'Length', length.replace(OLD, NEW));
  assert.equal(out.status, 200, out.error);
  assert.equal(promptModule.systemPrompt('sms'), rules.replace(OLD, NEW));

  // The voice card, in a compact request, still without its comment.
  const card = promptModule.voiceCard();
  const CARD_OLD = 'Address, hours and phone only when asked.';
  const CARD_NEW = 'Address, hours and phone only when asked, each on a line of its own.';
  out = await save('compact/voice-card.md', '', (await partOf('compact/voice-card.md', '')).fileText.replace(CARD_OLD, CARD_NEW));
  assert.equal(out.status, 200, out.error);
  assert.equal(promptModule.voiceCard(), card.replace(CARD_OLD, CARD_NEW));
  const compact = promptModule.systemPrompt('sms', { style: 'compact' });
  assert.ok(compact.includes(CARD_NEW) && !compact.includes('<!--'), compact.slice(0, 400));

  // The sales playbook's price section, in the selling advice for a price question.
  const PRICE_OLD = "our reply is the owner's standard price reply.";
  const PRICE_NEW = "our reply is the owner's standard price reply, as it is written.";
  assert.ok(!playbook.playbookFor({ situation: 'price' }).includes(PRICE_NEW));
  out = await save('sales-playbook.md', 'The price question', (await partOf('sales-playbook.md', 'The price question')).fileText.replace(PRICE_OLD, PRICE_NEW));
  assert.equal(out.status, 200, out.error);
  assert.ok(playbook.playbookFor({ situation: 'price' }).includes(PRICE_NEW));
  assert.ok(promptModule.systemPrompt('sms').includes(PRICE_NEW), 'and in the full request');
  assertVoiceUntouched();
});

/** A scratch copy of the wording files: no file under voice/ is ever written. */
function copyOfWording(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, 'compact'));
  for (const w of wording.WORDING) fs.copyFileSync(path.join(voiceDir, w.name), path.join(dir, w.name));
  return dir;
}

// Runs after the test above: the Playbook holds saved versions of Length, the voice card, The price
// question, Still available and the first-reply details.
test("a voice folder a script gives as its own is read as written: the Playbook's wording is laid over Wheelman's own folder only", async () => {
  const SAVED = 'A test rule: three short lines at most.';
  assert.ok((await partOf('house-voice.md', 'Length')).text.includes(SAVED), 'a saved version is in use');
  // As scripts/review.js does with --b-voice: config.voiceDir points at another folder for one side,
  // here a copy with side B's own Length rule.
  const dir = copyOfWording('wheelman-voice-b-');
  const B_RULE = 'If it can be said in fewer words, use fewer. Side B: two short lines at most.';
  const own = path.join(dir, 'house-voice.md');
  fs.writeFileSync(own, fs.readFileSync(own, 'utf8').replace('If it can be said in fewer words, use fewer.', B_RULE));
  const written = (name) => fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r/g, '').trim();
  const { standardBlock } = await import('../src/firstreply.js');
  config.voiceDir = dir;
  try {
    assert.equal(wording.voiceText('house-voice.md'), written('house-voice.md'));
    const rules = promptModule.systemPrompt('sms');
    assert.ok(rules.includes(`\n=== VOICE ===\n${written('house-voice.md')}\n\n=== SELLING ===\n${written('sales-playbook.md')}\n`), 'both files as written');
    assert.ok(rules.includes(B_RULE) && !rules.includes(SAVED) && !rules.includes(', as it is written.'));
    assert.equal(promptModule.voiceCard(), written('compact/voice-card.md').replace(COMMENT, '').trim());
    assert.ok(!playbook.playbookFor({ situation: 'price' }).includes(', as it is written.'));
    for (const w of wording.WORDING.filter((x) => x.kind === 'template')) assert.deepEqual(templates.template(w.name), templates.template(w.name, { playbook: false }), w.name);
    assert.match(templates.template(DASHBOARD).sections.still_available, /is still available\./);
    assert.ok(standardBlock({}).includes('Please call or text before visiting.'));
  } finally {
    config.voiceDir = voiceDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // Back in Wheelman's own folder, the Playbook's wording is in use again.
  assert.ok(promptModule.systemPrompt('sms').includes(SAVED));
  assert.match(templates.template(DASHBOARD).sections.still_available, /is available today/);
});

test('a wording file changed by hand after a Playbook save says so', async () => {
  const NAME = 'marketplace-messages.md';
  // A copy of the wording files standing in for Wheelman's own voice folder, changed by hand there.
  const dir = copyOfWording('wheelman-wording-');
  const ownFolder = config.playbookVoiceDir;
  config.voiceDir = dir;
  config.playbookVoiceDir = dir;
  try {
    const original = (await partOf(NAME, 'polite_close')).fileText;
    const mine = original.replace('All the best with your search', 'Good luck with your search');
    let out = await save(NAME, 'polite_close', mine);
    assert.equal(out.status, 200, out.error);
    assert.equal(out.part.fileChanged, false);

    // Changed by hand after the save: the Playbook's wording stays in use, and the part says the file now differs.
    const file = path.join(dir, NAME);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('and we are here if anything changes.', 'and we are here whenever you need us.'));
    const hand = original.replace('and we are here if anything changes.', 'and we are here whenever you need us.');
    let part = await partOf(NAME, 'polite_close');
    assert.deepEqual([part.text, part.fileText, part.fileChanged], [mine, hand, true]);
    assert.match(templates.template(NAME).sections.polite_close, /Good luck with your search/);
    // The first version is what the file said when the part was first saved, and says so.
    let versions = await versionsAsked('template', NAME, 'polite_close');
    assert.deepEqual([versions.versions.map((v) => v.text), versions.file, versions.saidFirst], [[mine], original, true]);

    // Saving the file's wording makes it the one in use, and the file no longer differs.
    out = await save(NAME, 'polite_close', part.fileText);
    assert.equal(out.status, 200, out.error);
    assert.deepEqual([out.part.text, out.part.fileChanged, out.part.versions], [hand, false, 2]);
    assert.match(templates.template(NAME).sections.polite_close, /whenever you need us/);
    versions = await versionsAsked('template', NAME, 'polite_close');
    assert.deepEqual([versions.versions.map((v) => v.text), versions.file, versions.saidFirst], [[hand, mine], original, true]);
  } finally {
    config.voiceDir = voiceDir;
    config.playbookVoiceDir = ownFolder;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a voice file that starts with a byte-order mark reads without it, and its first heading is a section', async () => {
  // An invented voice file in a copy standing in for Wheelman's own folder, saved with a byte-order
  // mark as some editors do. Its sections are its own, so nothing saved earlier is laid over them.
  const dir = copyOfWording('wheelman-voice-bom-');
  const ownFolder = config.playbookVoiceDir;
  fs.writeFileSync(path.join(dir, 'house-voice.md'), '﻿## Opening\nFirst words.\n\n## Closing\nLast words.\n');
  config.voiceDir = dir;
  config.playbookVoiceDir = dir;
  try {
    assert.deepEqual(wording.fileParts('house-voice.md'), [{ part: 'Opening', text: 'First words.' }, { part: 'Closing', text: 'Last words.' }]);
    assert.equal(wording.voiceText('house-voice.md'), '## Opening\nFirst words.\n\n## Closing\nLast words.');
    assert.ok(!promptModule.systemPrompt('sms').includes('﻿'));
    const out = await save('house-voice.md', 'Opening', 'Saved words.');
    assert.equal(out.status, 200, out.error);
    assert.equal(wording.voiceText('house-voice.md'), '## Opening\nSaved words.\n\n## Closing\nLast words.');
  } finally {
    config.voiceDir = voiceDir;
    config.playbookVoiceDir = ownFolder;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no wording file under voice/ was written by any test here', () => {
  assertVoiceUntouched();
});
