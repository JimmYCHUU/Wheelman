// Learning from the email threads the owner sent from Gmail: what the team really wrote back to
// import enquiries reaches an email request with no name, address, staff name, figure or link of
// the other customer in it, and never reaches a text; what a text taught never reaches an email;
// and Marketplace, the phone and auction orders still teach nothing. All data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ MAIL_INTAKE: '1' });

const now = Date.now();
const HOUR = 3600e3;
const DAY = 24 * HOUR;
let standins, config, db, eligible, importquery, mail, items, drafter, prompt, learn, practice, mailpractice, worker, voicebank;
const ai = aiBehaviour();
const aiSeen = ai.seen;

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0 });
  db = await import('../src/db.js');
  eligible = await import('../src/eligible.js');
  importquery = await import('../src/importquery.js');
  mail = await import('../src/mail.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  prompt = await import('../src/prompt.js');
  learn = await import('../src/learn.js');
  practice = await import('../src/practice.js');
  mailpractice = await import('../src/mailpractice.js');
  worker = await import('../src/worker.js');
  voicebank = await import('../src/voicebank.js');
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* none yet */ }
  await eligible.refreshEligibleModels({ now });
});

after(async () => { await standins.close(); try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* gone */ } });

const page = (slug) => `${config.site.baseUrl}/importing/${slug}`;
let threadNo = 0;
/** One thread as the Gmail button hands it in: the customer's email, then ours (when given). */
function storeThread(subject, customerText, ours = [], { name = 'Priya Raman', email = 'priya@example.com', at = now - 60 * DAY, ref = null } = {}) {
  threadNo++;
  const messages = [{ ref: `m-${threadNo}-1`, fromName: name, fromEmail: email, at, text: customerText, collapsed: false, attachments: 0 }];
  ours.forEach((t, i) => messages.push({ ref: `m-${threadNo}-${i + 2}`, fromName: 'Nadia Okafor', fromEmail: 'nadia@carbarn.com.au', at: at + (i + 1) * 3 * HOUR, text: t, collapsed: false, attachments: 0 }));
  const report = mail.validateMailReport({ v: 1, kind: 'mail', seenAt: now, thread: { ref: ref || `thread-${threadNo}` }, subject, messages }, { now });
  return mail.storeMailThread(report, { now });
}

// Dashboard records, for an SMS item to compare with.
const smsItem = () => {
  db.upsertLead({ id: 801, conversationId: 901, firstName: 'Omar', lastName: 'Haddad', phone: '0491570144', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [] });
  db.upsertConversation({ id: 901, phone: '+61491570144', channel: 'SMS', status: 'OPEN', leadId: 801, customerName: 'Omar Haddad', latestDirection: 'IN', latestAt: now - 600e3, latestBody: 'x' });
  db.upsertMessage({ id: 7001, conversationId: 901, direction: 'IN', body: 'Can you import a Hiace GDH206 for me and what would it cost landed?', sentBy: null, status: 'SENT', mediaType: null, at: now - 600e3, importedAt: now - 600e3 });
  return items.itemFromKey('c:901');
};

test('a past email exchange becomes a lesson with nothing of the customer or the staff in it, and figures and links as labels', async () => {
  storeThread('Importing a Hiace GDH206', 'Hi,\n\nCan you import a Toyota Hiace GDH206 for me? What would it cost landed and what deposit do you need?\n\nThanks,\nPriya', [
    `Hi Priya,\n\nYes, the GDH206 is on our eligible list and lands at around $57,781 all up, with a refundable auction deposit of $4,545 to start sourcing. We inspect the car in Japan before any bid and send you the photos on WhatsApp.\n\nModel details:\n${page('toyota-hiace-gdh206')}\n\nKind regards,\nNadia Okafor\nCarbarn\n0423 840 130\nwww.carbarn.com.au\n\nOn Mon, 5 Oct 2026 at 10:31, Priya Raman <priya@example.com> wrote:\n> Hi,\n> Can you import a Toyota Hiace GDH206 for me?`,
  ]);
  storeThread('N-Box question', 'Hello, is the Honda N-Box JF3 eligible and roughly what does one land for?', ['Hi,\n\nThe N-Box JF3 is eligible and lands around $21,600 with a $1,500 deposit.\n\nRegards,\nSam'], { name: 'Tom Bell', email: 'tom@example.net', at: now - 200 * DAY });
  storeThread('Thanks', 'Thanks for that!', ['No worries, let us know when you are ready.'], { at: now - 10 * DAY });
  const rows = mailpractice.recentMailPractice({ now });
  assert.equal(rows.length, 2, 'a thank-you teaches nothing');
  const hiace = rows.find((r) => r.codes.includes('GDH206'));
  assert.ok(hiace, JSON.stringify(rows));
  for (const secret of ['Nadia', 'Rahman', 'Priya', 'priya@example.com', '0423', 'carbarn.com.au/importing', '57,781', '4,545', 'wrote:']) assert.ok(!hiace.reply.includes(secret), `leaked: ${secret}\n${hiace.reply}`);
  assert.ok(hiace.reply.includes('[amount]') && hiace.reply.includes('[model page link]'), hiace.reply);
  assert.match(hiace.reply, /inspect the car in Japan before any bid/);
  assert.ok(!hiace.customer.includes('Priya') && !hiace.customer.includes('priya@example.com'), hiace.customer);
  assert.equal(hiace.firstReply, true);
  assert.deepEqual(hiace.families, ['toyota hiace']);
  assert.equal(hiace.primary, 'import_sourcing');

  // The matching: the same code first, then the family, then the words.
  const forHiace = mailpractice.mailPracticeFor({ situations: ['import_sourcing'], primary: 'import_sourcing', text: 'Can I import a GDH206 and what does it cost?', firstReply: true, codes: ['GDH206'], families: ['toyota hiace'] }, 3, now);
  assert.equal(forHiace[0].id, hiace.id);
  const forNbox = mailpractice.mailPracticeFor({ situations: ['import_sourcing'], primary: 'import_sourcing', text: 'What does an N-Box JF3 land for?', firstReply: true, codes: ['JF3'], families: ['honda n-box'] }, 3, now);
  assert.ok(forNbox[0].codes.includes('JF3'));
  // The dashboard's own practice never has an email in it.
  assert.ok(practice.recentPractice({ now }).every((r) => !r.itemKey.startsWith('em:')));
});

test('the past emails reach an email request, labelled, and never a text; a reply lifted from one is caught', async () => {
  const out = storeThread('Hiace import', 'Hi, can you import a Toyota Hiace GDH206 for me and what would it land for?', [], { name: 'Mina Osei', email: 'mina@example.org', at: now - HOUR });
  const item = items.itemFromKey(out.key);
  const research = await importquery.researchFor(item, { now });
  const p = prompt.buildPrompt(item, { research, now });
  assert.match(p.user, /=== HOW WE ANSWERED SIMILAR IMPORT EMAILS ===/);
  assert.match(p.user, /We replied: .*\[amount\]/);
  assert.match(p.user, /\[model page link\]/);
  for (const secret of ['Nadia', 'Priya', 'priya@example.com', 'Mina', 'mina@example.org', 'Tom Bell']) assert.ok(!p.user.includes(secret), `leaked: ${secret}`);
  assert.ok(p.exampleReplies.some((r) => /\[model page link\]/.test(r)), 'the past emails join the examples the copied check reads');
  assert.ok(!/=== WHAT OUR TEAM REALLY SENT FOR SIMILAR MESSAGES ===/.test(p.user), 'the SMS practice is not shown to an email');

  const sms = prompt.buildPrompt(smsItem(), { now });
  assert.ok(!/HOW WE ANSWERED SIMILAR IMPORT EMAILS/.test(sms.user), 'a text never sees the emails');
  assert.ok(!sms.exampleReplies.some((r) => /\[model page link\]/.test(r)));

  // A reply that lifts the past email almost word for word is caught as copied.
  const lifted = mailpractice.recentMailPractice({ now }).find((r) => r.codes.includes('GDH206')).reply.replace(/\[amount\]/g, '$57,781').replace(/\[model page link\]/g, page('toyota-hiace-gdh206'));
  aiSeen.length = 0;
  ai.script = [{ reply: `Hi {{NAME}},\n\n${lifted}`, needs_human: [], facts_used: [], hold: false }, { reply: `Hi {{NAME}},\n\nYes, the Toyota Hiace GDH206 can be imported: it is approved for builds from 1/2004 to 10/2026. The estimated landed and complied cost is $57,781, GST included, an estimate that depends on the auction result. The refundable auction deposit is $4,545.\n\nModel details:\n${page('toyota-hiace-gdh206')}`, needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(item, { now, save: false });
  assert.equal(aiSeen.length, 2, 'the lifted reply was refused and written again');
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('what an email taught serves emails only, and what a text taught serves texts only', () => {
  const emailRow = { draftId: 501, itemKey: 'em:1', situations: ['import_sourcing'], firstReply: true, customerText: 'Can you import a GDH206?', draftText: 'Yes.', finalText: 'Yes, the GDH206 is eligible and lands around [amount].', source: 'copied', changed: true, similarity: 0.4, at: now };
  const smsRow = { draftId: 502, itemKey: 'c:901', situations: ['import_sourcing'], firstReply: true, customerText: 'Can you import a GDH206?', draftText: 'Yes.', finalText: 'Yes mate, we can source one. Call me.', source: 'copied', changed: true, similarity: 0.4, at: now };
  db.upsertLearned(emailRow);
  db.upsertLearned(smsRow);
  assert.equal(db.getLearned(501).channel, 'email');
  assert.equal(db.getLearned(502).channel, 'sms');
  const q = (channel) => ({ situations: ['import_sourcing'], primary: 'import_sourcing', text: 'Can you import a GDH206 for me?', firstReply: true, channel });
  assert.deepEqual(learn.learnedExamples(q('email'), 5, now).map((x) => x.id), ['learned-501']);
  assert.deepEqual(learn.learnedExamples(q('sms'), 5, now).map((x) => x.id), ['learned-502']);
  assert.deepEqual(learn.learnedExamples(q('marketplace'), 5, now).map((x) => x.id), ['learned-502'], 'a chat reads the text lessons');
  assert.deepEqual(learn.corrections(q('email'), 5, now).map((x) => x.used), [emailRow.finalText]);
  assert.deepEqual(learn.corrections(q('sms'), 5, now).map((x) => x.used), [smsRow.finalText]);
  db.upsertLearned({ ...emailRow, draftId: 503, source: 'approved' });
  db.upsertLearned({ ...smsRow, draftId: 504, source: 'approved' });
  assert.deepEqual(learn.ownerGuidance(q('email'), now).approved.map((r) => r.draft_id), [503]);
  assert.deepEqual(learn.ownerGuidance(q('sms'), now).approved.map((r) => r.draft_id), [504]);
  const emailNote = db.insertAdvice({ draftId: 503, itemKey: 'em:1', situations: ['import_sourcing'], firstReply: true, customerText: 'x', draftText: 'y', note: 'Always give the deposit band', lessons: [{ scope: 'import_sourcing', when: 'an import email', do: 'Give the deposit band.', internal: false }] });
  const smsNote = db.insertAdvice({ draftId: 504, itemKey: 'c:901', situations: ['import_sourcing'], firstReply: true, customerText: 'x', draftText: 'y', note: 'Keep it to two lines', lessons: [{ scope: 'any', when: 'any text', do: 'Keep it to two lines.', internal: false }] });
  assert.ok(emailNote && smsNote);
  assert.deepEqual(learn.ownerGuidance(q('email'), now).lessons.map((l) => l.do), ['Give the deposit band.']);
  assert.deepEqual(learn.ownerGuidance(q('sms'), now).lessons.map((l) => l.do), ['Keep it to two lines.']);
  for (const id of [501, 502, 503, 504]) db.deleteLearned(id);
  db.deleteAdvice(emailNote); db.deleteAdvice(smsNote);
});

test('Marketplace, the phone and auction orders still teach nothing, and the example bank never sees an email', () => {
  for (const k of ['mp:501', 'ph:3', 'ao:70', 'tr:4', 'em:x', 'em:']) assert.equal(learn.canLearnFrom(k), false, k);
  assert.equal(learn.canLearnFrom('em:9'), true);
  assert.throws(() => db.upsertLearned({ draftId: 600, itemKey: 'mp:1', finalText: 'x', source: 'copied' }), /only dashboard conversations and import emails/);
  assert.throws(() => db.upsertLearned({ draftId: 601, itemKey: 'ph:1', finalText: 'x', source: 'copied' }), /only dashboard/);
  assert.throws(() => db.insertAdvice({ draftId: 602, itemKey: 'ao:1', note: 'x' }), /only dashboard/);
  const waiting = db.draftsAwaitingOutcome();
  assert.ok(waiting.every((d) => /^(c|l|em):/.test(d.item_key)));
  const bank = JSON.stringify(voicebank.buildVoiceBank({ write: false }));
  assert.ok(!bank.includes('eligible list') && !bank.includes('nadia') && !bank.includes('GDH206'), 'the SMS example bank never sees an email');
});

test('a reply later sent from Gmail is the outcome of its suggestion, and teaches when it differs; a customer writing first supersedes', async () => {
  const out = storeThread('Alphard Welcab AGH30W', 'Hi, is the Alphard Welcab AGH30W eligible and what deposit do you need?', [], { name: 'Lee Park', email: 'lee@example.com', at: now - 2 * HOUR, ref: 'thread-outcome' });
  const item = items.itemFromKey(out.key);
  ai.script = [{ reply: `Hi {{NAME}},\n\nYes, the Toyota Alphard Welcab AGH30W is eligible for builds from 1/2015 to 5/2023, with a refundable auction deposit of $3,000 to start sourcing.\n\nModel details:\n${page('toyota-alphard-welcab-agh30w')}`, needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(item, { now });
  assert.equal(d.status, 'ready');
  assert.equal(worker.updateOutcomes(), 0, 'nothing sent yet');

  // The owner replied in Gmail, in his own words, and sent the thread again.
  const sentText = 'Hi Lee,\n\nYes, the AGH30W is eligible (2015 to 2023 builds) and the refundable deposit is $3,000. Shall we start looking?\n\nRegards,\nTeam Carbarn';
  storeThread('Alphard Welcab AGH30W', 'Hi, is the Alphard Welcab AGH30W eligible and what deposit do you need?', [sentText], { name: 'Lee Park', email: 'lee@example.com', at: now - 2 * HOUR, ref: 'thread-outcome' });
  assert.equal(worker.updateOutcomes(), 1);
  const after = db.getDraft(d.id);
  assert.equal(after.status, 'answered');
  assert.ok(after.similarity > 0 && after.similarity < 1);
  const learned = db.getLearned(d.id);
  assert.ok(learned, 'the reply differed from the suggestion, so it was learned');
  assert.equal(learned.channel, 'email');
  assert.equal(learned.source, 'sent');
  assert.ok(!learned.final_text.includes('Lee'));

  // Another thread: the customer wrote again before anyone replied.
  const again = storeThread('Copen LA400', 'Is the Daihatsu Copen LA400 eligible?', [], { name: 'Ana Reyes', email: 'ana@example.com', at: now - 3 * HOUR, ref: 'thread-super' });
  ai.script = [{ reply: `Hi {{NAME}},\n\nYes, the Daihatsu Copen LA400 is eligible for builds from 6/2014 to 12/2026; its odometer must be under 80,000 km.\n\nModel details:\n${page('daihatsu-copen-la400')}`, needs_human: [], facts_used: [], hold: false }];
  const d2 = await drafter.draftFor(items.itemFromKey(again.key), { now });
  assert.equal(d2.status, 'ready');
  const r = mail.validateMailReport({ v: 1, kind: 'mail', seenAt: now, thread: { ref: 'thread-super' }, subject: 'Copen LA400', messages: [
    { ref: `m-${threadNo}-1`, fromName: 'Ana Reyes', fromEmail: 'ana@example.com', at: now - 3 * HOUR, text: 'Is the Daihatsu Copen LA400 eligible?', collapsed: false, attachments: 0 },
    { ref: 'm-super-2', fromName: 'Ana Reyes', fromEmail: 'ana@example.com', at: now - HOUR, text: 'Also, does it have to be under 80,000 km?', collapsed: false, attachments: 0 },
  ] }, { now });
  mail.storeMailThread(r, { now });
  worker.updateOutcomes();
  assert.equal(db.getDraft(d2.id).status, 'superseded');
});
