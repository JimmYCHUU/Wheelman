// Re-drafts chosen turns of the October 2026 tone judgement with the code as it is now, so a fresh
// reader can label them again: the measure of a change to the voice.
//
//   npm run tone-redraft -- --ids WM-003,WM-058
//   npm run tone-redraft -- --ids-file eval/tone/acceptance-ids.txt
//   add --dry-run to rebuild each conversation and print it, with no AI request
//
// Run it on a copy of the database, never on the one the app has open: set DB_PATH to the copy.
// Each judged turn (eval/tone/turns.json, redacted) is matched to the stored suggestion it came
// from, the conversation is rebuilt as it stood when that suggestion was written, and a new one is
// written in its place without being saved: one AI request per turn, a second when a check fails.
// Nothing is sent to anyone. Output: eval/tone/redraft/turns-new.json, redacted the way the
// judgement was (it holds real customer text: keep it on this computer). A turn that cannot be
// rebuilt is listed under `skipped` with the reason. Running it again for some ids replaces those
// ids in the file and keeps the rest.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';
import { openDb, closeDb } from '../src/db.js';
import { buildItem, buildMarketplaceItem, buildPhoneItem, buildMailItem, buildOrderItem, finishItem } from '../src/items.js';
import { draftOrderMessage, blanksIn } from '../src/ordermessages.js';
import { draftFor } from '../src/drafter.js';
import { providers } from '../src/llm.js';
import { redact, NAME_TOKEN } from '../src/redact.js';
import { labelFor } from '../src/situations.js';

// Every bracketed token in a judged turn stands for whatever was there: [NAME], [PHONE], [EMAIL],
// [REGO], [ADDRESS], [NUMBER] and the rest, and a blank such as [PRICE?] matches itself anyway.
const TOKEN = /\[[A-Z][A-Z0-9 &'/?-]*\]/g;
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');

function containsInOrder(text, chunks) {
  let at = 0;
  for (const c of chunks) {
    const i = text.indexOf(c, at);
    if (i === -1) return false;
    at = i + c.length;
  }
  return true;
}

/**
 * The stored suggestion a judged turn came from, or null. The turn's suggestion is split on its
 * bracket tokens; every piece of 12 characters or more must be in the suggestion, in order. The
 * same words written twice for one message are one suggestion (the first in `drafts` stands); the
 * same words for two customers, or a turn too short to tell, are not guessed at.
 */
export function matchTurnToDraft(turn, drafts) {
  const chunks = flat(turn?.suggestion).split(TOKEN).map((c) => c.trim()).filter((c) => c.length >= 12);
  if (!chunks.length) return null;
  const found = (drafts || []).filter((d) => containsInOrder(flat(d.reply), chunks));
  if (!found.length) return null;
  const one = found.every((d) => d.item_key === found[0].item_key && d.anchor_key === found[0].anchor_key);
  return one ? found[0] : null;
}

// The days the judged suggestions were written (Sydney time): 13 to 21 October 2026.
const JUDGED_FROM = Date.parse('2026-10-13T00:00:00+11:00');
const JUDGED_TO = Date.parse('2026-10-22T00:00:00+11:00');

/**
 * The conversation cut to the moment `at`: what had happened by then, judged as it was then (who
 * was waiting, on which message). This is replaycases.js's itemAt, made general: the channel is the
 * item's own (a Marketplace chat, an email, a text), and what the builder adds on top of finishItem
 * (the section it is listed in, an import reading, the Marketplace listing, the email thread) is
 * kept as it is read today. The builder's own changes to the situation are made again.
 * `anchor`: the message the suggestion answered, the newest one it saw. A suggestion is stored when
 * it is finished, and a text or a queued reply sent while it was being written can carry an earlier
 * time; when such entries follow the anchor, the cut is made at the anchor.
 */
function cutTo(full, at, anchor = '') {
  let timeline = full.timeline.filter((e) => !e.at || e.at <= at);
  const i = anchor ? timeline.findIndex((e) => e.key === anchor) : -1;
  if (i >= 0) timeline = timeline.slice(0, i + 1);
  if (!timeline.length) return null;
  const item = finishItem({
    itemKey: full.itemKey, channel: full.channel, lead: full.lead, hasLeadRecord: full.hasLeadRecord,
    conversation: full.conversation, conversationId: full.conversationId, phone: full.phone,
  }, timeline, { now: at });
  for (const [k, v] of Object.entries(full)) if (!(k in item)) item[k] = v;
  if (item.channel === 'email') {
    // As buildMailItem: every email thread is an import enquiry, and never a new text enquiry.
    item.isNewEnquiry = false;
    item.situation = { ...item.situation, primary: 'import_sourcing', all: ['import_sourcing', ...item.situation.all.filter((s) => s !== 'import_sourcing' && s !== 'general')], label: labelFor('import_sourcing') };
  } else if (/^[cl]:/.test(full.itemKey) && item.imports && !item.deal && !item.situation.all.includes('import_sourcing')) {
    // As buildItem: an import enquiry is about the import first (after a complaint).
    const rest = item.situation.all.filter((s) => s !== 'general');
    item.situation.all = item.situation.primary === 'complaint' ? [...rest, 'import_sourcing'] : ['import_sourcing', ...rest];
    item.situation.primary = item.situation.all[0];
    item.situation.label = labelFor(item.situation.primary);
  }
  return item;
}

/**
 * What a suggestion written under Could be better was given: the owner's note (as kept, redacted)
 * and the suggestion it was about, the latest note on that message before it was written.
 */
function coachingFor(db, d) {
  const row = db.prepare(`SELECT a.note, x.reply FROM advice a JOIN drafts x ON x.id = a.draft_id
    WHERE x.item_key = ? AND x.anchor_key = ? AND a.at <= ? ORDER BY a.at DESC, a.id DESC LIMIT 1`).get(d.item_key, d.anchor_key, d.created_at);
  return row?.note && row.reply ? { note: row.note, draft: row.reply } : null;
}

/** The item a stored suggestion was written for, as it stood then: { item, coaching } or { why } when it cannot be rebuilt. */
function rebuild(db, d) {
  const m = /^(c|l|mp|ph|em|ao):(\d+)$/.exec(d.item_key || '');
  if (!m) return { why: `an item key this script does not know (${d.item_key})` };
  const [, kind, idText] = m;
  const id = Number(idText);
  const at = d.created_at;
  if (/^fu:/.test(d.anchor_key) || d.context?.followUp) return { why: 'a follow-up, not a reply: not re-drafted' };
  if (kind !== 'ao' && d.template) return { why: `written from the template "${d.template}": only replies and auction messages are re-drafted` };
  const coaching = d.context?.coached ? coachingFor(db, d) : null;
  if (d.context?.coached && !coaching) return { why: 'written under Could be better, and the note it was given is not found' };
  if (kind === 'ao') {
    const item = buildOrderItem(id, { message: d.template || '', now: at });
    if (!item) return { why: 'the auction order is gone' };
    if (item.anchorKey !== d.anchor_key) return { why: `the order has moved on: it is at ${item.anchorKey} now, the suggestion was for ${d.anchor_key}` };
    return { item, coaching };
  }
  const full = kind === 'c' ? buildItem({ conversationId: id })
    : kind === 'l' ? buildItem({ leadId: id })
      : kind === 'mp' ? buildMarketplaceItem(id, { now: at })
        : kind === 'ph' ? buildPhoneItem(id, { now: at })
          : buildMailItem(id, { now: at });
  if (!full) return { why: 'the conversation is gone' };
  const item = cutTo(full, at, d.anchor_key);
  if (!item) return { why: 'nothing in the conversation is older than the suggestion' };
  if (item.anchorKey !== d.anchor_key) return { why: `cut at the suggestion's time, the newest message is ${item.anchorKey}, not ${d.anchor_key}` };
  // Our side has the last word: nobody is waiting. A customer's last word that needs no reply (a
  // thank-you, say) was still the message the suggestion answered, and is re-drafted.
  if (item.state === 'answered') return { why: `cut at the suggestion's time, nobody is waiting: our side wrote last (${item.anchorKey})` };
  return { item, coaching };
}

/**
 * Writes the new suggestion as the stored one was written: the same moment, the same Prompt line
 * and Could be better note, nothing saved.
 */
function redraft(item, d, coaching) {
  const now = d.created_at;
  const opts = { save: false, holdOutConversation: true, now };
  // An auction message is the owner's wording with the order's figures. Fitting it to the customer
  // would go through the same drafter, saving nothing; a message that is not saved is written word
  // for word (src/templatedraft.js fits only one it keeps).
  if (item.order && d.template) {
    return draftOrderMessage(item, { type: d.template, facts: d.instruction || '', save: false, now, fitWith: (it, o) => draftFor(it, { ...o, ...opts }) });
  }
  return draftFor(item, { ...opts, instruction: d.instruction || '', coaching });
}

/** The judgement's own labels, when that file is on this computer: id -> label. Any shape it comes in. */
function oldLabels(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw.labels) ? raw.labels
      : Object.entries(raw).map(([id, v]) => (typeof v === 'string' ? { id, label: v } : { id, ...v }));
    return new Map(list.filter((r) => r?.id).map((r) => [r.id, r.label ?? r.primary ?? r.tone ?? '?']));
  } catch { return new Map(); }
}

function idsFrom(args) {
  const after = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || '' : null; };
  const list = after('--ids');
  if (list !== null) return list.split(/[\s,]+/).filter(Boolean);
  const file = after('--ids-file');
  if (file !== null) return fs.readFileSync(path.resolve(config.root, file), 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  const ids = [...new Set(idsFrom(args))];
  const dry = args.includes('--dry-run');
  if (!ids.length) {
    console.log('Name the turns to re-draft: --ids WM-003,WM-058 or --ids-file eval/tone/acceptance-ids.txt');
    process.exit(1);
  }
  // The app keeps its database open and opening one runs its changes: this works on a copy only.
  if (!process.env.DB_PATH) {
    console.log('Set DB_PATH to a copy of the database first: this script never runs on the one the app has open.');
    process.exit(1);
  }
  console.log(`Database: ${config.dbPath}`);
  if (!dry && !providers().length) {
    console.log('No AI key is filled in, so nothing can be re-drafted. Fill in GEMINI_API_KEY in .env first.');
    process.exit(1);
  }

  const dir = path.join(config.root, 'eval', 'tone');
  const turns = JSON.parse(fs.readFileSync(path.join(dir, 'turns.json'), 'utf8'));
  const byId = new Map(turns.map((t) => [t.id, t]));
  const labels = oldLabels(path.join(dir, 'labels.json'));

  const db = openDb();
  const drafts = db.prepare('SELECT * FROM drafts WHERE created_at >= ? AND created_at < ? AND reply IS NOT NULL ORDER BY created_at, id').all(JUDGED_FROM, JUDGED_TO)
    .map((r) => ({ ...r, context: r.context_json ? JSON.parse(r.context_json) : null }));
  const requests = () => Number(db.prepare('SELECT COALESCE(SUM(requests), 0) AS n FROM llm_usage_models').get().n);
  const before = requests();
  if (!dry) {
    const first = (role) => { const p = providers({ role })[0]; return p ? `${p.name} ${p.model}` : 'none'; };
    console.log(`AI: replies ${first('write')}; Marketplace ${first('marketplace')}`);
  }
  console.log(`${drafts.length} stored suggestions from the judged days; ${ids.length} turns to re-draft.\n`);

  const written = [];
  const skipped = [];
  const skip = (id, section, why) => { skipped.push({ id, why }); console.log(`${id}  ${section}  skipped: ${why}`); };
  for (const [n, id] of ids.entries()) {
    const turn = byId.get(id);
    if (!turn) { skip(id, '?', 'not in eval/tone/turns.json'); continue; }
    const d = matchTurnToDraft(turn, drafts);
    if (!d) { skip(id, turn.section, 'no stored suggestion matches its words'); continue; }
    let rebuilt;
    try { rebuilt = rebuild(db, d); } catch (e) { rebuilt = { why: `it could not be rebuilt: ${e.message}` }; }
    const { item, coaching, why } = rebuilt;
    if (!item) { skip(id, turn.section, why); continue; }
    if (dry) { console.log(`${id}  ${turn.section}  rebuilt ${item.itemKey} at ${item.anchorKey} (${item.state}, ${item.situation.primary})${d.instruction ? ', with its Prompt line' : ''}${coaching ? ', with its Could be better note' : ''}`); continue; }
    let nd;
    try { nd = await redraft(item, d, coaching); } catch (e) { nd = { status: 'failed', error: e.message }; }
    if (nd.status !== 'ready' || !nd.reply) {
      skip(id, turn.section, `the new suggestion could not be written: ${nd.error || nd.status}`);
      if (nd.daily) {
        console.log('\nThe AI allowance for the day is used up. Stopping here.');
        for (const rest of ids.slice(n + 1)) skipped.push({ id: rest, why: 'not reached: the AI allowance for the day ran out' });
        break;
      }
      continue;
    }
    const checks = (nd.checks || []).map((c) => ({ code: c.code, level: c.level }));
    const suggestion = redact(nd.reply, item.lead).replaceAll(NAME_TOKEN, '[NAME]');
    written.push({ ...turn, suggestion, blanks: blanksIn(suggestion), checks, model: nd.model || '' });
    const warnings = checks.filter((c) => c.level === 'warn').map((c) => c.code);
    const fails = checks.filter((c) => c.level === 'fail').map((c) => c.code);
    console.log(`${id}  ${turn.section}  old: ${labels.get(id) || '?'}  warnings: ${warnings.length ? warnings.join(', ') : 'none'}${fails.length ? `  fails: ${fails.join(', ')}` : ''}`);
  }
  const used = requests() - before;
  closeDb();
  if (dry) { console.log('\nDry run: nothing was written.'); return; }

  // Ids run again replace what the file had for them; the others stay.
  const out = path.join(dir, 'redraft', 'turns-new.json');
  let kept = { turns: [], skipped: [] };
  try { kept = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { /* the first run */ }
  const ran = new Set(ids);
  const byOrder = (a, b) => String(a.id).localeCompare(String(b.id));
  const result = {
    turns: [...(kept.turns || []).filter((t) => !ran.has(t.id)), ...written].sort(byOrder),
    skipped: [...(kept.skipped || []).filter((s) => !ran.has(s.id)), ...skipped].sort(byOrder),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`\n${written.length} re-drafted, ${skipped.length} skipped; ${used} AI requests answered.`);
  console.log(`Written: ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
