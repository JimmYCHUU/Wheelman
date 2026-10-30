// The Playbook's final checks on a template change. A preview says when a card, or none of the
// cards, shows the lines changed; a follow-up message is shown on an open follow-up of its kind,
// with nothing read from outside this computer, its car's photos included. A word in braces that
// Wheelman never fills is refused, and is named on a suggestion that still has one; so is a
// message with only its @ lines, a short piece with nothing after its name, and a line of dashes
// with nothing above or below it. A save whose stand-in writing fails is still answered in words.
// The wording read is the repository's own voice/ files; every change here is invented. Stand-ins
// play the dashboard, the website, the auction and the AI. Every name and number is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world, rawLead, rawConversation, rawMessage } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200', MAIL_INTAKE: '1' });
delete process.env.PROMPT_STYLE;

const ai = aiBehaviour({ behave: () => ({ reply: 'Hello {{NAME}},\n\nThank you for your message.', next_step: '', rung: '', facts_used: [], needs_human: [], hold: false }) });

const now = Date.now();
const MIN = 60e3;
const HOUR = 60 * MIN;
const invented = world(now);
// Three texts about a car we have at the showroom, newer than anyone else in the fixtures'
// Dashboard; Cato is in Brisbane.
for (const [id, who, stock, ask, mins] of [
  [601, ['Arlo', 'Invented', '0491 570 160'], '1159', 'Is the Noah still available?', 1],
  [602, ['Bryn', 'Invented', '0491 570 161'], '1201', 'Is the Hiace still available?', 2],
  [603, ['Cato', 'Invented', '0491 570 162'], '1700', 'Is the Serena still available? I am in Brisbane so I cannot get down to Sydney.', 3],
]) {
  const lead = rawLead(id, id, who, now, { stocks: [stock], agoMs: mins * MIN + MIN });
  invented.leads.carbarnau.push(lead);
  invented.conversations.push({ row: rawConversation(id, lead, who, { direction: 'IN', at: now - mins * MIN, body: ask }), messages: [rawMessage(id * 10, id, 'IN', ask, mins * MIN, now)] });
}
// Three customers on the dashboard's Imports list with no order: Gus gave a target bid.
const GUS_FORM = 'Auction alert request — notify when a matching vehicle enters the Japan auction feed.\n\nMake: Subaru\nModel: XV Hybrid\nGrade: Not provided\nMax odometer: Not provided\nLanded budget: Not provided\n\nAdditional notes: 2014 or newer please. My target bid is ¥450,000.';
for (const [id, who, type, text, mins] of [
  [611, ['Gus', 'Invented', '0491 570 165'], 'Auction', GUS_FORM, 10],
  [612, ['Hal', 'Invented', '0491 570 166'], 'Import', 'Hi, could you import a Honda N-Box for me?', 12],
  [613, ['Ivo', 'Invented', '0491 570 167'], 'Import', 'Could you find me a Daihatsu Copen from Japan?', 14],
]) {
  invented.leads.IMPORTS.push(rawLead(id, null, who, now, { platform: 'IMPORTS', source: type, agoMs: mins * MIN, inquiries: [{ type, subject: type === 'Auction' ? 'Auction alert for Subaru XV Hybrid' : 'Import enquiry', text, agoMs: mins * MIN }] }));
}

let standins, config, db, items, wording, wordingedit, sectiontemplates, templates, app, base, voiceDir, voiceAtStart;

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

before(async () => {
  standins = await startStandins({ world: invented, ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-playbook-final-session-${process.pid}.json`) });
  voiceDir = config.voiceDir;
  voiceAtStart = filesUnder(voiceDir);
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  wording = await import('../src/wording.js');
  wordingedit = await import('../src/wordingedit.js');
  sectiontemplates = await import('../src/sectiontemplates.js');
  templates = await import('../src/templates.js');
  await (await import('../src/sync.js')).syncAll();
  // Three follow-ups due, each of its own kind. Rhea, who asked about the Noah, has been quiet
  // since our reply; Eli's inspection of the Hiace is tomorrow; Priya's inspection was yesterday.
  const due = now - HOUR;
  db.insertFollowUp({ itemKey: 'c:211', kind: 'quiet', occasion: 'quiet:final-1', sinceAt: now - 6 * HOUR, reason: 'Quiet 1 day', template: 'quiet_nudge', dueAt: due, data: {}, now });
  db.insertFollowUp({ itemKey: 'c:208', kind: 'reminder', occasion: 'reminder:final-2', sinceAt: now - 3 * HOUR, reason: 'Inspection tomorrow', template: 'inspection_reminder', dueAt: due, data: { bookedAt: now + 24 * HOUR, where: 'onsite', kind: 'inspection' }, now });
  db.insertFollowUp({ itemKey: 'c:201', kind: 'inspection_passed', occasion: 'inspection:final-3', sinceAt: now - 24 * HOUR, reason: 'Inspection passed', template: 'after_inspection', dueAt: due, data: { bookedAt: now - 24 * HOUR, where: 'onsite', kind: 'inspection', deposit: true }, now });
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins?.close();
});

const post = async (p, body = {}) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let json = {};
  try { json = await r.json(); } catch { /* no words came back */ }
  return { status: r.status, ...json };
};
const preview = (name, part, text) => post('/api/playbook/preview', { name, part, text });
const save = (name, part, text) => post('/api/playbook/wording', { name, part, text });
const own = (name, part) => wording.fileParts(name).find((p) => p.part === part).text;
const rows = () => db.countRows('playbook_versions');
// Every request to any stand-in: the dashboard, its media, the website, the auction, the AI and the content engine.
const anything = () => standins.calls.length + standins.engineSeen.length;
const DASHBOARD = 'dashboard-messages.md';
const AUCTION = 'auction-messages.md';
const UNUSED = 'This conversation does not use the lines you changed.';
const NONE_USES = 'None of these conversations uses the lines you changed.';
const MARK = 'Marked for this test.';
/** A part's own words with the one line that starts with `start` changed: the mark added at its end. */
function changedLine(name, part, start) {
  const lines = own(name, part).split('\n');
  const i = lines.findIndex((l) => l.startsWith(start));
  assert.ok(i >= 0, `${name} "${part}" has a line starting ${start}`);
  lines[i] = `${lines[i]} ${MARK}`;
  return lines.join('\n');
}

test('a changed line is shown on a card, or the card says it does not use it, and with no card showing it the preview says so', async () => {
  const count = rows();
  const n0 = anything();
  // The lines a preview could show on no card: the follow-ups' own lines, a paragraph kept only
  // when a fact applies, and the lines chosen by circumstance.
  const seen = {};
  for (const [name, part, start] of [
    [DASHBOARD, 'inspection_reminder', 'Team Carbarn here. A reminder'],
    [DASHBOARD, 'after_inspection', 'Team Carbarn here. How did you find'],
    [DASHBOARD, 'stock_price', 'Team Carbarn here. The {car} you asked about is now'],
    [DASHBOARD, 'booking_confirmed', 'Team Carbarn here. Your'],
    [DASHBOARD, 'stock_sold', '{if_no_similar_cars}'],
    ['importquery-messages.md', 'eligible_cost', '{if_model_page}'],
    [AUCTION, 'first_estimate', '{if_breakdown}'],
    [AUCTION, '', '@missed:'],
    ['price-reply.md', '', '@no_inclusions:'],
    ['inspection-invite.md', '', '@tail_chat:'],
  ]) {
    const where = `${name} "${part}" ${start}`;
    const out = await preview(name, part, changedLine(name, part, start));
    assert.equal(out.status, 200, `${where}: ${out.error}`);
    assert.ok(out.previews.length > 0, where);
    const shown = out.previews.filter((c) => c.text.includes(MARK));
    // Each card shows the change, or its note says it does not use the lines changed.
    for (const c of out.previews) if (!c.text.includes(MARK)) assert.ok(String(c.note).startsWith(UNUSED), `${where} ${c.key}: ${c.note}`);
    for (const c of shown) assert.ok(!String(c.note || '').includes(UNUSED), `${where} ${c.key}: ${c.note}`);
    // With no card showing it, the preview says so plainly.
    assert.equal(out.none, shown.length ? undefined : NONE_USES, where);
    seen[`${name} ${part} ${start}`] = out;
  }
  // The follow-ups' own lines are shown on the open follow-ups of their kind, written with the follow-up in hand.
  const reminder = seen[`${DASHBOARD} inspection_reminder Team Carbarn here. A reminder`].previews[0];
  assert.deepEqual([reminder.key, reminder.fits], ['c:208', true]);
  assert.match(reminder.text, new RegExp(`Team Carbarn here\\. A reminder of your inspection of the 2020 Toyota Hiace DX tomorrow at \\d{1,2}(:\\d\\d)? (am|pm)\\. ${MARK}`), reminder.text);
  const after = seen[`${DASHBOARD} after_inspection Team Carbarn here. How did you find`].previews[0];
  assert.deepEqual([after.key, after.fits], ['c:201', true]);
  assert.ok(after.text.includes(`How did you find the 2021 Toyota Noah X (8 Seater) yesterday? ${MARK}`), after.text);
  // No follow-up of that kind is open: no card shows the price drop.
  assert.equal(seen[`${DASHBOARD} stock_price Team Carbarn here. The {car} you asked about is now`].none, NONE_USES);
  // The lines chosen by circumstance are named on the card in words.
  for (const c of seen['price-reply.md  @no_inclusions:'].previews) {
    assert.equal(c.note, `${UNUSED} The first line here is the one that says what the price includes. A car with nothing on its Included list gets the line for that instead.`, c.key);
  }
  for (const c of seen['inspection-invite.md  @tail_chat:'].previews) {
    assert.match(c.note, /^This conversation does not use the lines you changed\. The first line here is the line for (a visit to the showroom|a video call)/, c.key);
    assert.ok(c.note.endsWith('The last line here is the one for a text message. A buyer on Facebook Marketplace gets the line for a chat instead.'), c.note);
  }
  assert.match(seen[`${AUCTION}  @missed:`].previews[1].note, /^This conversation does not use the lines you changed\. In "Bid lost, still searching": .*The line for a close miss is used when you type what it sold for/, 'the close miss is named in words');
  // The words in use, shown as they are, say nothing about unchanged lines.
  const same = await preview(DASHBOARD, 'still_available', own(DASHBOARD, 'still_available'));
  assert.equal(same.status, 200, same.error);
  assert.equal(same.none, undefined);
  assert.ok(same.previews.every((c) => !String(c.note || '').includes(UNUSED)));
  assert.equal(rows(), count, 'nothing was saved');
  assert.equal(anything(), n0, 'nothing was asked of any stand-in');
});

test("a quiet follow-up is previewed with its follow-up in hand, and its car's photos are not read from the dashboard", async () => {
  const n0 = anything();
  const media = () => standins.calls.filter((c) => c.path.startsWith('/carbarnau/api/v2/vehicles/media/') || c.path.startsWith('/carbarnau/api/v1/vehicles/chassis/')).length;
  const m0 = media();
  const out = await preview(DASHBOARD, 'quiet_nudge', own(DASHBOARD, 'quiet_nudge').replace('following on from the {car}.', 'following on from the {car} you asked about.'));
  assert.equal(out.status, 200, out.error);
  const rhea = out.previews[0];
  assert.deepEqual([rhea.key, rhea.fits], ['c:211', true]);
  assert.ok(rhea.text.includes('Team Carbarn here, following on from the 2021 Toyota Noah X (8 Seater) you asked about.'), rhea.text);
  assert.equal(anything(), n0, "nothing was asked of any stand-in: the car's photos are not read in a preview");
  // Outside a preview the same follow-up reads the car's photos and documents, as before.
  const quiet = db.openFollowUps().find((r) => r.item_key === 'c:211');
  await sectiontemplates.composeSectionTemplate(items.itemFromKey('c:211', { followUp: quiet.id }), 'quiet_nudge');
  assert.ok(media() > m0, "outside a preview the car's media is read");
});

test('when every conversation is passed over, the preview says so', async () => {
  const on = ['c:601', 'c:602', 'c:603'].map((k) => items.itemFromKey(k));
  const cards = wordingedit.newestFitting(on, () => { throw new Error('an unreadable record'); }, () => 'Words.');
  assert.deepEqual(cards, []);
  const out = await wordingedit.previewCards(cards, 'Words.');
  assert.deepEqual(out, { previews: [], none: 'Wheelman could not read where this message is offered just now, so there is no conversation to show it on.' });
});

test('a word in braces that Wheelman never fills is refused in plain words, and a suggestion that has one says so', async () => {
  const count = rows();
  const still = own(DASHBOARD, 'still_available');
  const price = own('price-reply.md', '');
  const pieces = own(DASHBOARD, '');
  for (const [name, part, text, error] of [
    [DASHBOARD, 'still_available', still.replace('Yes, the {car}', 'Yes, the {Car}'), '{Car} is not a word Wheelman fills. Write it as {car}.'],
    [DASHBOARD, 'still_available', still.replace('{if_car_link}Vehicle details:\n{car_link}', '{if_car_link}Vehicle details:\n{car link}'), '{car link} is not a word Wheelman fills. Write it as {car_link}.'],
    [DASHBOARD, 'still_available', still.replace('Yes, the {car}', 'Yes {{Name}}, the {car}'), '{{Name}} is not a word Wheelman fills. Write it as {{NAME}}.'],
    [DASHBOARD, 'still_available', still.replace('Yes, the {car}', 'Yes {{name}}, the {car}'), '{{name}} is not a word Wheelman fills. Write it as {{NAME}}.'],
    [DASHBOARD, 'still_available', still.replace('Yes, the {car}', 'Yes, the {{car}}'), '{{car}} is not a word Wheelman fills. Write it as {car}.'],
    [DASHBOARD, 'still_available', still.replace('Yes, the {car}', 'Yes, the {colour of the car}'), '{colour of the car} is not a word Wheelman fills, so the customer would see it as written.'],
    ['price-reply.md', '', price.replace('{inclusions}', '{Inclusions}'), '{Inclusions} is not a word Wheelman fills. Write it as {inclusions}.'],
    [AUCTION, 'progress_update', own(AUCTION, 'progress_update').replace('Hello {{NAME}},', 'Hello {NAME},'), '{NAME} is not a word Wheelman fills. Write it as {{NAME}}.'],
    [DASHBOARD, '', pieces.replace('@new_video: There is a walkaround video of it here:', '@new_video: There is a walkaround {Video} of it here:'), '{Video} is not a word Wheelman fills, so the customer would see it as written.'],
  ]) {
    for (const out of [await save(name, part, text), await preview(name, part, text)]) {
      assert.deepEqual([out.status, out.error], [400, error], `${name} "${part}"`);
    }
  }
  assert.equal(rows(), count, 'nothing was saved');
  // {{NAME}} and the facts a message is filled with are taken.
  const fine = await preview(DASHBOARD, 'still_available', still.replace('Yes, the {car}', 'Yes {{NAME}}, the {car}'));
  assert.equal(fine.status, 200, fine.error);

  // A suggestion with one left in it says so, and is never marked as written from the wording alone.
  assert.deepEqual(templates.unfilled('Yes, the {Car} and {car_link}, {car link}, {{Name}}, {{NAME}} and {Car} again.'), ['{Car}', '{car_link}', '{car link}', '{{Name}}']);
  assert.deepEqual(templates.unfilled('Hello {{NAME}},\n\nYes, the 2021 Toyota Noah is here.'), []);
  const { draftFromTemplate } = await import('../src/templatedraft.js');
  const d = await draftFromTemplate(items.itemFromKey('c:601'), { id: 'still_available', label: 'Still available', composed: { text: 'Good morning {{NAME}},\n\nYes, the {Car} is still available.', part: '', values: {}, tail: '' }, save: false, file: DASHBOARD });
  assert.ok(!d.checks.some((c) => c.level === 'ok'), JSON.stringify(d.checks));
  assert.deepEqual(d.checks.find((c) => c.code === 'template').tokens, ['{Car}']);
});

test('a message with only its @ lines is refused; the short pieces, which are all @ lines, are not', async () => {
  const count = rows();
  const ONLY = 'Write the words to send under the lines that start with @: with only those lines, nothing would be sent.';
  const atOnly = (text) => text.split('\n').filter((l) => /^@[a-z0-9_]+:/.test(l)).join('\n');
  // The auction file's messages have no @ lines of their own: one is written in.
  for (const [name, part, text] of [
    [DASHBOARD, 'still_available', atOnly(own(DASHBOARD, 'still_available'))],
    ['marketplace-messages.md', 'polite_close', atOnly(own('marketplace-messages.md', 'polite_close'))],
    [AUCTION, 'progress_update', '@label: Progress update'],
    ['price-reply.md', '', atOnly(own('price-reply.md', ''))],
    ['inspection-invite.md', '', atOnly(own('inspection-invite.md', ''))],
  ]) {
    assert.ok(text.trim(), `${name} "${part}" has @ lines`);
    for (const out of [await save(name, part, text), await preview(name, part, text)]) {
      assert.deepEqual([out.status, out.error], [400, ONLY], `${name} "${part}"`);
    }
  }
  const pieces = await preview(AUCTION, '', own(AUCTION, ''));
  assert.equal(pieces.status, 200, pieces.error);
  assert.equal(rows(), count, 'nothing was saved');
});

test('a short piece emptied to a space, and a line of dashes with nothing above or below it, are refused', async () => {
  const count = rows();
  const emptied = own(AUCTION, '').replace(/^@missed:.*$/m, '@missed: ');
  assert.match(emptied, /^@missed: $/m);
  for (const out of [await save(AUCTION, '', emptied), await preview(AUCTION, '', emptied)]) {
    assert.deepEqual([out.status, out.error], [400, 'Keep the line that starts @missed: — Wheelman reads it by that name when it writes the message.']);
  }
  const DASHES = 'Keep one line of dashes (---), with words above it and below it: Wheelman writes the message above it, and always ends with the lines below it.';
  const ask = own('import-ask.md', '');
  const [above, below] = ask.split(/\n\s*---+\s*\n/);
  for (const text of [`---\n${above}\n\n${below}`, `${above}\n\n${below}\n---`, `---\n---\n${above}\n\n${below}`]) {
    for (const out of [await save('import-ask.md', '', text), await preview('import-ask.md', '', text)]) {
      assert.deepEqual([out.status, out.error], [400, DASHES], text.slice(0, 40));
    }
  }
  // Blank lines around the dashes, as the file has them, are taken.
  const spaced = await preview('import-ask.md', '', `${above}\n\n\n---\n\n${below}`);
  assert.equal(spaced.status, 200, spaced.error);
  assert.equal(rows(), count, 'nothing was saved');
});

test('a save or a preview whose stand-in writing fails is still answered in words', async () => {
  const ask = own('import-ask.md', '').replace('we can keep the search focused', 'we can focus the search');
  const sender = config.firstReplySender;
  // The sender's line cannot be written just now: every block that signs off with it fails to be written.
  config.firstReplySender = { toString() { throw new Error('the sender line could not be read'); } };
  try {
    const shown = await preview('import-ask.md', '', ask);
    assert.equal(shown.status, 200, shown.error);
    assert.ok(shown.previews.length > 0);
    for (const c of shown.previews) assert.equal(c.note, 'Wheelman could not write this one from its records just now, so its facts are left as blanks.');
    const taken = await save('import-ask.md', '', ask);
    assert.equal(taken.status, 200, taken.error);
    // A {word} the file never uses is still refused.
    const stray = await save('import-ask.md', '', ask.replace('your {car} enquiry', 'your {colour} {car} enquiry'));
    assert.deepEqual([stray.status, stray.error], [400, '{colour} is not a fact Wheelman fills in here.']);
  } finally {
    config.firstReplySender = sender;
  }
  // The file's own words back in use.
  assert.equal((await save('import-ask.md', '', own('import-ask.md', ''))).status, 200);
});

test('no wording file under voice/ was written by any test here', () => {
  const seen = filesUnder(voiceDir);
  assert.deepEqual([...seen.keys()].sort(), [...voiceAtStart.keys()].sort());
  for (const [file, was] of voiceAtStart) {
    assert.ok(seen.get(file).bytes.equals(was.bytes), path.relative(voiceDir, file));
    assert.equal(seen.get(file).mtimeMs, was.mtimeMs, path.relative(voiceDir, file));
  }
});
