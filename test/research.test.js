// The Import Query research: the website's eligible-models list read once a day and kept on this
// computer, the matchers that find the model an email is about, the research record, and a reply
// that carries the exact figures or a blank, and never "we will check and get back to you".
// All models, figures, names and addresses are invented; stand-ins play the website and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ MAIL_INTAKE: '1' });

const now = Date.now();
let standins, config, db, eligible, importquery, mail, items, drafter, checks, worker;
const ai = aiBehaviour();
const aiSeen = ai.seen;

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0 });
  // The guide pages are not in the repository: the general facts come from whatever is saved here, or nothing.
  db = await import('../src/db.js');
  eligible = await import('../src/eligible.js');
  importquery = await import('../src/importquery.js');
  mail = await import('../src/mail.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  checks = await import('../src/checks.js');
  worker = await import('../src/worker.js');
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* none yet */ }
});

after(async () => { await standins.close(); try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* gone */ } });

const siteCalls = () => standins.calls.filter((c) => /^\/api\/import-eligible/.test(c.path));
const page = (slug) => `${config.site.baseUrl}/importing/${slug}`;

// One email thread as the Gmail button hands it in. Our side signs as "Sam Lee".
let threadNo = 0;
function emailItem(subject, text, { name = 'Priya Raman', email = 'priya@example.com', ours = [] } = {}) {
  threadNo++;
  const messages = [{ ref: `m-${threadNo}-1`, fromName: name, fromEmail: email, at: now - 3600e3, text, collapsed: false, attachments: 0 }];
  ours.forEach((t, i) => messages.push({ ref: `m-${threadNo}-${i + 2}`, fromName: 'Sales', fromEmail: 'sales@carbarn.com.au', at: now - 1800e3 + i * 1000, text: t, collapsed: false, attachments: 0 }));
  const report = mail.validateMailReport({ v: 1, kind: 'mail', seenAt: now, thread: { ref: `thread-${threadNo}` }, subject, messages }, { now });
  const out = mail.storeMailThread(report, { now });
  return items.itemFromKey(out.key);
}

// ---- the client and the daily list ----------------------------------------------------------

test('the website is asked for the list only, with GET, no login, and nothing else', async () => {
  const { models } = eligible.loadEligibleModels(now);
  assert.equal(models.length, 0, 'nothing read yet');
  const r = await eligible.refreshEligibleModels({ now });
  assert.deepEqual([r.ok, r.count], [true, 5]);
  const calls = siteCalls();
  assert.ok(calls.every((c) => c.method === 'GET' && !c.cookie), JSON.stringify(calls));
  assert.deepEqual(calls.map((c) => c.path), ['/api/import-eligible-cars']);
  assert.equal(calls[0].query.size, '100');
  const file = JSON.parse(fs.readFileSync(config.importQuery.modelsPath, 'utf8'));
  assert.equal(file.count, 5);
  assert.ok(!JSON.stringify(file).includes('secret'), 'image addresses and approval ids are not kept');
  const hiace = eligible.loadEligibleModels(now).models.find((m) => m.modelCode === 'GDH206');
  assert.deepEqual([hiace.make, hiace.model, hiace.title, hiace.url, hiace.yearRange.text, hiace.yearRange.fromYear, hiace.yearRange.toYear], ['Toyota', 'Hiace', 'Toyota Hiace GDH206', page('toyota-hiace-gdh206'), '1/2004 to 10/2026', 2004, 2026]);
  assert.deepEqual([hiace.costing.totalAud, hiace.costing.depositAud, hiace.costing.depositJpy, hiace.costing.compliancePackageAud, hiace.priceOnRequest], [57781, 4545, 500000, 1980, false]);
  assert.ok(hiace.costing.lines.some((l) => l.label === 'GST' && l.aud === 5252));
  assert.deepEqual(hiace.engines.sort(), ['1GD', '1KD', '1TR', '2KD', '2TR']);
  assert.deepEqual(hiace.sevs, ['SEV-000933']);
  const copen = eligible.loadEligibleModels(now).models.find((m) => m.modelCode === 'LA400');
  assert.equal(copen.odometerLimitKm, 80000);
  const q7 = eligible.loadEligibleModels(now).models.find((m) => m.modelCode === '4MC');
  assert.deepEqual([q7.priceOnRequest, q7.costing], [true, null]);
});

test('the list is read once a day; when the website is down the old file stays and nothing throws', async () => {
  standins.calls.length = 0;
  assert.deepEqual(await eligible.refreshEligibleModelsIfStale({ now }), { ok: true, fresh: true, requests: 0 });
  assert.equal(siteCalls().length, 0, 'fresh: no request');
  assert.equal(eligible.loadEligibleModels(now).stale, false);
  const later = now + 25 * 3600e3;
  assert.equal(eligible.loadEligibleModels(later).stale, true);
  standins.world.siteDown = true;
  const down = await eligible.refreshEligibleModels({ force: true, now: later });
  assert.equal(down.ok, false);
  assert.match(down.error, /503/);
  assert.equal(eligible.loadEligibleModels(later).models.length, 5, 'the old file is kept');
  const again = await eligible.refreshEligibleModels({ now: later + 1000 });
  assert.match(again.error, /short while ago/, 'not tried again at once');
  standins.world.siteDown = false;
  const info = eligible.eligibleModelsInfo(now);
  assert.deepEqual([info.count, info.stale], [5, false]);
  // The address allowlist: nothing but the two addresses, and never a plain-http website.
  const site = config.site.apiUrl;
  config.site.apiUrl = 'http://example.com';
  await assert.rejects(() => eligible.lookupVehicle({ make: 'Toyota', model: 'Hiace', modelCode: 'GDH206' }), /https/);
  config.site.apiUrl = site;
});

// ---- the matchers ---------------------------------------------------------------------------

test('model codes and names are found in a customer\'s words, and look-alikes are not', () => {
  const { models } = eligible.loadEligibleModels(now);
  const c = eligible.modelCodesIn('Hi, can you import a Hiace GDH206 or a KDH201? 2015+, under 100,000 km, budget $35k, 4WD, 2.8L diesel, V6 no thanks, ref AB12345, GST 10%, H1 2026, 1GD engine please', models);
  assert.deepEqual(c.known.map((k) => k.code), ['GDH206']);
  assert.equal(c.known[0].models[0].title, 'Toyota Hiace GDH206');
  assert.deepEqual(c.unknown, ['KDH201']);
  assert.deepEqual(c.engines, ['1GD']);
  assert.deepEqual(eligible.modelCodesIn('is the gdh206 eligible', models).known.map((k) => k.code), ['GDH206'], 'a known code in lower case');
  assert.deepEqual(eligible.modelCodesIn('is the kdh201 eligible', models).unknown, [], 'an unknown code must be written in capitals');
  assert.deepEqual(eligible.modelCodesIn('Audi Q7 and a BMW X5 with 100K on it', models).unknown, [], 'a series name is not a code');

  const fam = (t) => eligible.modelsIn(t, models).map((f) => `${f.make} ${f.model}`);
  assert.deepEqual(fam('what would a honda n box custom cost'), ['Honda N-Box']);
  assert.deepEqual(fam('N-BOX please'), ['Honda N-Box']);
  assert.deepEqual(fam('an nbox'), ['Honda N-Box']);
  assert.deepEqual(fam('the alphard welcab with the lift'), ['Toyota Alphard Welcab']);
  assert.deepEqual(fam('Honda Fit please'), [], 'not on the list');
  assert.deepEqual(fam('a q7'), [], 'a short model name needs its make');
  assert.deepEqual(fam('an Audi Q7'), ['Audi Q7']);
  assert.deepEqual(fam('any hiace van'), ['Toyota Hiace']);
});

// ---- the research record ------------------------------------------------------------------------

test('the record for a Hiace email: eligibility, the landed total, the deposit, the page, the fit, and few requests', async () => {
  standins.calls.length = 0;
  const item = emailItem('Importing a Toyota Hiace GDH206', 'Hi,\n\nCan you import a Toyota Hiace GDH206 for me? Ideally 2018 or newer, under 100,000 km, budget around $30,000. What would it cost landed, what deposit do you need, and how long does it take?\n\nThanks,\nPriya');
  assert.equal(item.channel, 'email');
  assert.equal(item.mail.car, 'Toyota Hiace GDH206', 'the row names the model from the list, with no request');
  const r = await importquery.researchFor(item, { now });
  assert.deepEqual(r.asked.codes.known, ['GDH206']);
  assert.ok(r.asked.topics.includes('cost') && r.asked.topics.includes('deposit') && r.asked.topics.includes('timeline'), JSON.stringify(r.asked.topics));
  assert.equal(r.models.length, 1);
  const m = r.models[0];
  assert.deepEqual([m.code, m.title, m.url, m.yearRange, m.costing.totalAud, m.costing.depositAud, m.odometerLimitKm], ['GDH206', 'Toyota Hiace GDH206', page('toyota-hiace-gdh206'), '1/2004 to 10/2026', 57781, 4545, 0]);
  assert.ok(m.fit.some((f) => /2018 or newer: inside the approved build range/.test(f)), JSON.stringify(m.fit));
  assert.ok(m.fit.some((f) => /budget of \$30,000 is below the estimated landed total of \$57,781/.test(f)), JSON.stringify(m.fit));
  assert.deepEqual(r.notFound, []);
  assert.ok(r.requests.site <= 2 && siteCalls().length <= 1, 'the list is on this computer: at most one website request');
  assert.ok(m.auction && m.auction.url.endsWith('/live-auction/toyota/hiace/gdh206'), 'a look at the live auction for the model');
  const out = importquery.renderResearch(r);
  assert.match(out.lines.join('\n'), /MODEL: Toyota Hiace GDH206 \(model code GDH206\)/);
  assert.match(out.lines.join('\n'), /Estimated landed and complied cost, GST and duties included: \$57,781/);
  assert.match(out.lines.join('\n'), /Refundable auction deposit[^\n]*\$4,545 \(¥500,000\)/);
  assert.ok(out.trustedText.includes(page('toyota-hiace-gdh206')));
  assert.ok(out.panel.found.some((f) => /Estimated landed total \$57,781/.test(f)));
  assert.equal(out.panel.notFound.length, 0);
});

test('a code that is on no list gets a blank and a note of where it was looked for; a price-on-request model gets a cost blank', async () => {
  const unknown = await importquery.researchFor(emailItem('Nissan question', 'Can I import a ZXY123? What would it land for?'), { now });
  assert.deepEqual(unknown.asked.codes.unknown, ['ZXY123']);
  assert.equal(unknown.models.length, 0);
  assert.equal(unknown.notFound.length, 1);
  assert.match(unknown.notFound[0].what, /ZXY123/);
  assert.equal(unknown.notFound[0].blank, '[ELIGIBILITY?]');
  assert.ok(unknown.notFound[0].looked.some((l) => /eligible-models list \(5 models/.test(l)) && unknown.notFound[0].looked.some((l) => /saved on this computer/.test(l)), JSON.stringify(unknown.notFound[0].looked));
  const lines = importquery.renderResearch(unknown).notFoundLines.join('\n');
  assert.match(lines, /Model code ZXY123: not found in .* Write the sentence with \[ELIGIBILITY\?\]/);

  standins.calls.length = 0;
  const q7 = await importquery.researchFor(emailItem('Audi Q7', 'Hi, what would an Audi Q7 4MC cost to land, roughly?'), { now });
  assert.equal(q7.models.length, 1);
  assert.equal(q7.models[0].priceOnRequest, true);
  assert.equal(q7.models[0].costing, null);
  assert.ok(siteCalls().some((c) => c.path === '/api/import-eligible-vehicle' && c.query.modelCode === '4MC'), 'one try for the figure on the website');
  assert.equal(q7.notFound[0].blank, '[LANDED COST?]');
  assert.match(importquery.renderResearch(q7).lines.join('\n'), /price on request[^\n]*\[LANDED COST\?\]/);
});

// ---- a reply written with the research --------------------------------------------------------

const hiaceReply = () => ({ reply: `Hi {{NAME}},\n\nYes, the Toyota Hiace GDH206 can be imported: it is approved for builds from 1/2004 to 10/2026.\n\nThe estimated landed and complied cost is $57,781, GST and duties included. It is an estimate: the final figure depends on the auction result, grade, odometer, options and the exchange rate. The whole process usually takes 6 to 10 weeks.\n\nTo start sourcing, the refundable auction deposit for this model is $4,545. If no car is secured it is refunded in full.\n\nModel details:\n${page('toyota-hiace-gdh206')}`, needs_human: [], facts_used: ['Estimated landed total $57,781', 'Deposit $4,545'], hold: false });

test('an email reply carries the exact figures and the page link, is greeted and signed, and goes to the better models', async () => {
  const item = emailItem('Importing a Toyota Hiace GDH206', 'Hi,\n\nCan you import a Toyota Hiace GDH206 for me? 2018 or newer. What would it cost landed and what deposit do you need?\n\nThanks,\nPriya');
  aiSeen.length = 0;
  ai.script = [hiaceReply()];
  const d = await drafter.draftFor(item, { now });
  assert.equal(d.status, 'ready', d.error);
  assert.equal(aiSeen.length, 1, 'accepted first time');
  assert.ok(d.reply.startsWith('Hi Priya,\n'), d.reply);
  assert.ok(d.reply.endsWith('\n\nRegards,\nTeam Carbarn'), d.reply);
  assert.ok(d.reply.includes('$57,781') && d.reply.includes('$4,545') && d.reply.includes(page('toyota-hiace-gdh206')));
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
  assert.match(aiSeen[0].messages[0].content, /THIS CHANNEL: EMAIL/);
  assert.match(aiSeen[0].messages[0].content, /Never write that we will check/);
  assert.match(aiSeen[0].messages[1].content, /=== RESEARCH FOR THIS IMPORT QUESTION ===/);
  assert.match(aiSeen[0].messages[1].content, /=== BLANKS FOR AN IMPORT EMAIL ===/);
  assert.match(aiSeen[0].messages[1].content, /CHANNEL: Email/);
  assert.ok(!/=== STANDARD FIRST REPLY ===|=== INSPECTION ===|=== THIS CUSTOMER'S NEXT STEP ===/.test(aiSeen[0].messages[1].content), 'the SMS-only sections are off');
  for (const secret of ['Priya', 'Raman', 'priya@example.com']) assert.ok(!aiSeen[0].messages[1].content.includes(secret), `leaked: ${secret}`);
  assert.equal(aiSeen[0].model, 'model-a', 'the better model, not the Marketplace slice');
  assert.ok(d.research && d.research.found.some((f) => /GDH206/.test(f)), 'the research notes are kept with the suggestion');
  assert.ok(d.factsUsed.some((f) => /GDH206/.test(f)));
  const kept = db.getDraft(d.id);
  assert.ok(kept.research && kept.research.sources.some((s) => s.url === page('toyota-hiace-gdh206')));
  assert.equal(kept.context.channel, 'email');
  assert.deepEqual(kept.context.research.models, ['GDH206']);
});

test('"we will check and come back to you" is refused and written again; an unanswered model code is refused', async () => {
  const item = emailItem('GDH206 eligibility', 'Is the GDH206 eligible for import? What does it cost?');
  aiSeen.length = 0;
  ai.script = [
    { reply: 'Hi {{NAME}},\n\nThanks for your enquiry. We will check the eligibility of the GDH206 and come back to you shortly with the cost.', needs_human: [], facts_used: [], hold: false },
    hiaceReply(),
  ];
  const d = await drafter.draftFor(item, { now, save: false });
  assert.equal(aiSeen.length, 2, 'rejected once, then accepted');
  assert.match(aiSeen[1].messages[1].content, /Never write that we will check, look into, confirm, get back to them or update them later/);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
  assert.ok(d.reply.includes('$57,781'));

  // The checks themselves, on their own.
  const research = await importquery.researchFor(item, { now });
  const vague = checks.emailChecks({ body: 'Hi {{NAME}},\n\nI will confirm the exact deposit and update you shortly.', research });
  assert.equal(vague[0].code, 'vague-answer');
  assert.equal(vague[0].level, 'fail');
  const processOk = checks.emailChecks({ body: `Hi {{NAME}},\n\nThe GDH206 is approved for import, estimated at $57,781 landed. We will share the inspector's photos before any bid, and we lodge the VIA before shipping.\n\nModel details:\n${page('toyota-hiace-gdh206')}`, research });
  assert.deepEqual(processOk.map((c) => c.code), [], 'what the website promises about the process is ours to say');
  const withBlank = checks.emailChecks({ body: 'Hi {{NAME}},\n\nWhether the GDH206 can be imported in that year is [ELIGIBILITY?], and we will confirm the deposit once that is settled.', research });
  assert.ok(!withBlank.some((c) => c.code === 'vague-answer'), 'a sentence with a blank is not a holding line');
  const silent = checks.emailChecks({ body: 'Hi {{NAME}},\n\nThanks for your email. Importing takes 6 to 10 weeks and we inspect before bidding.', research });
  assert.ok(silent.some((c) => c.code === 'model-unanswered'), JSON.stringify(silent));
  const unknown = await importquery.researchFor(emailItem('ZXY123', 'Can the ZXY123 be imported?'), { now });
  const guessed = checks.emailChecks({ body: 'Hi {{NAME}},\n\nYes, the ZXY123 can be imported, no problem.', research: unknown });
  assert.ok(!guessed.some((c) => c.code === 'model-unanswered'), 'it is answered (the figure check catches a made-up figure, and the research says to use a blank)');
  const blanked = checks.emailChecks({ body: 'Hi {{NAME}},\n\nWhether the ZXY123 can be imported is [ELIGIBILITY?]; it is not on our eligible list as it stands.', research: unknown });
  assert.deepEqual(blanked.map((c) => c.code), []);
  const noLink = checks.emailChecks({ body: 'Hi {{NAME}},\n\nThe Toyota Hiace GDH206 is eligible and lands for about $57,781.', research });
  assert.ok(noLink.some((c) => c.code === 'research-link'));
  const hold = checks.emailChecks({ body: 'We will look into your complaint and come back to you.', research: null, hold: true });
  assert.equal(hold[0].level, 'input', 'a holding reply a person decides on is only noted');
});

test('a figure that drifts from the research fails; a long email with a breakdown is allowed; a long one without is noted', async () => {
  const item = emailItem('Hiace cost', 'How much does a Hiace GDH206 land for?');
  ai.script = [{ reply: `Hi {{NAME}},\n\nThe Toyota Hiace GDH206 lands for about $58,000 all up.\n\nModel details:\n${page('toyota-hiace-gdh206')}`, needs_human: [], facts_used: [], hold: false }, hiaceReply()];
  const d = await drafter.draftFor(item, { now, save: false });
  assert.ok(d.reply.includes('$57,781'), 'the drifted figure was refused and the second attempt kept');
  const long = `Hi {{NAME}},\n\n${'The Hiace GDH206 is approved for import. '.repeat(36)}`;
  assert.ok(checks.checkDraft({ reply: long, body: long, channel: 'email', allowedText: 'GDH206' }).some((c) => c.code === 'long'));
  const breakdown = `Hi {{NAME}},\n\n${'The Hiace GDH206 is approved for import. '.repeat(36)}\n\nAverage auction price: $37,249\nJapan agent fee: $2,230\nCarbarn agent fee: $1,500\nShipping: $9,200\nGST: $5,252\nCompliance package: $1,980\nTotal: $57,781`;
  assert.ok(!checks.checkDraft({ reply: breakdown, body: breakdown, channel: 'email', allowedText: breakdown }).some((c) => c.code === 'long'));
});

test('with the website down and no list, a reply is still written: blanks and notes, never a refusal', async () => {
  const kept = fs.readFileSync(config.importQuery.modelsPath);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-pages-'));
  const pagesDir = config.importPagesDir;
  try {
    fs.unlinkSync(config.importQuery.modelsPath);
    standins.world.siteDown = true;
    config.importPagesDir = scratch;
    // A saved page stands in, with the day it was saved.
    fs.writeFileSync(path.join(scratch, 'toyota-hiace-gdh206.md'), '<!-- source: https://www.carbarn.com.au/importing/toyota-hiace-gdh206 | saved: 2026-10-01 -->\n\n# Toyota Hiace GDH206 Import to Australia\n\nGDH206 2004-2026\n\nThe Toyota Hiace GDH206 is approved for import to Australia under the SEVS Campervans and Motorhomes Criterion . Each example carries a 1GD engine.\n\n## Landed Cost Breakdown\n\nEstimated Landed Total — GST & Duties Included\n\n$57,781\n\nRefundable Auction Deposit\n\n###\n\n$4,545\n\nCompliance Package\n\n$1,980\n\nSEV-000933\n');
    const fromPage = await importquery.researchFor(emailItem('Hiace', 'Can I import a GDH206 and what does it cost?'), { now: now + 2 * 24 * 3600e3 });
    assert.equal(fromPage.models.length, 1);
    assert.deepEqual([fromPage.models[0].costing.totalAud, fromPage.models[0].costing.depositAud, fromPage.models[0].savedAt], [57781, 4545, '2026-10-01']);
    assert.ok(fromPage.notes.some((n) => /could not be read|saved on this computer/.test(n)), JSON.stringify(fromPage.notes));
    ai.script = [hiaceReply()];
    const d = await drafter.draftFor(emailItem('Hiace', 'Can I import a GDH206 and what does it cost?'), { now: now + 2 * 24 * 3600e3, save: false });
    assert.equal(d.status, 'ready');
    assert.ok(d.checks.some((c) => c.code === 'research-stale'), JSON.stringify(d.checks));
    assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));

    // No page either: blanks, and the reply is still written.
    fs.unlinkSync(path.join(scratch, 'toyota-hiace-gdh206.md'));
    const nothing = await importquery.researchFor(emailItem('Hiace', 'Can I import a GDH206 and what does it cost?'), { now: now + 3 * 24 * 3600e3 });
    assert.equal(nothing.models.length, 0);
    assert.equal(nothing.notFound[0].blank, '[ELIGIBILITY?]');
    ai.script = [{ reply: 'Hi {{NAME}},\n\nWhether the GDH206 can be imported is [ELIGIBILITY?], and its landed cost is [LANDED COST?].', needs_human: [{ marker: '[ELIGIBILITY?]', reason: 'The list could not be read.' }, { marker: '[LANDED COST?]', reason: 'No figure could be read.' }], facts_used: [], hold: false }];
    const blank = await drafter.draftFor(emailItem('Hiace', 'Can I import a GDH206 and what does it cost?'), { now: now + 3 * 24 * 3600e3, save: false });
    assert.equal(blank.status, 'ready');
    assert.ok(blank.checks.some((c) => c.code === 'marker') && !blank.checks.some((c) => c.level === 'fail'), JSON.stringify(blank.checks));
    assert.ok(blank.research.notFound.length >= 1);
  } finally {
    standins.world.siteDown = false;
    config.importPagesDir = pagesDir;
    fs.writeFileSync(config.importQuery.modelsPath, kept);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('the worker writes for a waiting email thread, researched first', async () => {
  // The stand-in world has dashboard customers waiting too; every request gets the Hiace reply.
  ai.behave = () => hiaceReply();
  try {
    const item = emailItem('A Hiace GDH206', 'Is the GDH206 eligible and what is the deposit?');
    assert.equal(item.autoDraft, true);
    assert.ok((await worker.draftWaiting()) >= 1);
    const d = db.latestDraft(item.itemKey, item.anchorKey);
    assert.equal(d.status, 'ready');
    assert.ok(d.reply.includes('$4,545'));
    assert.ok(d.research && d.research.found.length);
    assert.equal(worker.statusReport().eligibleModels.count, 5);
  } finally { ai.behave = null; }
});
