// Counts how Wheelman is used, for the redesign's gates: drafts never used and why, how often a
// draft is sent as written, time from opening to Copy, first answers, tokens, deal stages, teaching.
// Run with: npm run measure. To count from a copy you made yourself: npm run measure -- "D:\path\copy.db"
// The live database is never changed: it is opened read-only, SQLite writes a fresh copy of it
// (VACUUM INTO), the counts are read from that copy, and the copy is deleted at the end.
// Prints counts and times only: no message text, no names, no phone numbers. The result is also
// saved as eval/redesign/measure-<date>.json, which stays on this computer.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = path.join(root, "eval", "redesign");
fs.mkdirSync(folder, { recursive: true });
const given = process.argv[2];
const copy = given ? path.resolve(given) : path.join(folder, "measure-copy.db");
if (copy.toLowerCase() === path.resolve(config.dbPath).toLowerCase()) {
  console.log("That is the live database. Name a copy, or nothing to have one made.");
  process.exit(1);
}
if (!given) {
  if (fs.existsSync(copy)) fs.rmSync(copy);
  const live = new DatabaseSync(config.dbPath, { readOnly: true });
  live.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  live.close();
}
const db = new DatabaseSync(copy, { readOnly: true });
// The copy made here holds real customer data: it goes even when a count fails.
process.on("exit", () => {
  try { db.close(); } catch { /* already closed */ }
  if (!given) fs.rmSync(copy, { force: true });
});
const q = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const H = 3600e3, D = 24 * H;
const out = {};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + "%";
const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const quant = (xs, p) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mins = (ms) => ms == null ? null : Math.round(ms / 60000 * 10) / 10;
const idOf = (key) => Number(key.slice(key.indexOf(":") + 1));
const prefix = (key) => key.slice(0, key.indexOf(":") + 1);

const first = one("select min(created_at) a, max(created_at) b from drafts");
out.window = { from: new Date(first.a).toISOString().slice(0, 10), to: new Date(first.b).toISOString().slice(0, 10) };

/* who sends most on the dashboard: rank senders without naming them */
const senders = q("select sent_by s, count(*) n from messages where direction='OUT' and sent_by is not null group by sent_by order by n desc");
const draftSenders = q("select sent_by s, count(*) n from drafts where status='answered' and sent_by is not null group by sent_by order by n desc");
const owner = draftSenders.length ? draftSenders[0].s : null;
const senderCode = new Map(senders.map((r, i) => [r.s, r.s === owner ? "owner" : "staff " + (i + 1)]));

/* ---------- A. unused drafts by cause ---------- */
const ready = q("select id, item_key, anchor_key, created_at, copied_at, sent_here_at from drafts where status='ready'");
const seenAt = (item, anchor) => one("select at from seen where item_key=? and anchor_key=?", item, anchor);
const causes = {};
const add = (sec, cause) => { causes[sec] = causes[sec] || {}; causes[sec][cause] = (causes[sec][cause] || 0) + 1; };
const lastDraftTime = first.b;
for (const d of ready) {
  const p = prefix(d.item_key);
  const opened = (() => { const s = seenAt(d.item_key, d.anchor_key); return s && s.at >= d.created_at - 60e3; })();
  if (p === "tr:") { add("tr: old Standards scenarios", "removed section, not a customer"); continue; }
  if (d.sent_here_at) { add(p, "USED: sent from Wheelman"); continue; }
  if (d.copied_at) { add(p, "USED: copied from Wheelman"); continue; }
  if (lastDraftTime - d.created_at < D) { add(p, "written in the last day, may still be used"); continue; }
  if (p === "c:" || p === "l:" || p === "ph:") {
    const conv = p === "c:" ? idOf(d.item_key) : null;
    let outMsg = null, inMsg = null;
    if (conv) {
      outMsg = one("select sent_by, at from messages where conversation_id=? and direction='OUT' and at > ? and at < ? order by at limit 1", conv, d.created_at, d.created_at + 2 * D);
      inMsg = one("select at from messages where conversation_id=? and direction='IN' and at > ? and at < ? order by at limit 1", conv, d.created_at, d.created_at + 2 * D);
    }
    if (outMsg) add(p, "replied without it: " + (outMsg.sent_by == null ? "no sender recorded (phone or automation)" : senderCode.get(outMsg.sent_by) === "owner" ? "by you, different words" : "by other staff"));
    else if (inMsg) add(p, "customer wrote again, then nothing");
    else add(p, opened ? "opened, never sent" : "never opened, never sent");
    continue;
  }
  if (p === "mp:") {
    const conv = idOf(d.item_key);
    const o = one("select source, at from mp_messages where conversation_id=? and direction='out' and at > ? and at < ? order by at limit 1", conv, d.created_at, d.created_at + 2 * D);
    if (o) add(p, o.source === "dashboard" ? "answered by a person on the engine's page (not from Wheelman)" : "answered by the engine itself (" + o.source + ")");
    else add(p, opened ? "opened, nobody answered" : "never opened, nobody answered");
    continue;
  }
  if (p === "em:") {
    const o = one("select at from mail_messages where thread_id=? and direction='OUT' and at > ? order by at limit 1", idOf(d.item_key), d.created_at);
    add(p, o ? "answered in Gmail without it" : opened ? "opened, no answer seen" : "never opened");
    continue;
  }
  if (p === "ao:") { add(p, opened ? "opened, message not copied" : "never opened"); continue; }
  add(p, "other");
}
out.unused = causes;
out.draftsBySection = q("select substr(item_key,1,instr(item_key,':')) p, count(*) total, sum(status='answered') answered, sum(status='ready') unused, sum(status='superseded') superseded, sum(status='failed') failed from drafts group by p order by total desc");

/* ---------- B. how close the sent reply was to the draft ---------- */
const band = (rows) => {
  const n = rows.length;
  const c = (f) => rows.filter(f).length;
  return { n, near95: pct(c((r) => r.similarity >= 0.95), n), mostly80: pct(c((r) => r.similarity >= 0.8), n), under50: pct(c((r) => r.similarity < 0.5), n), median: median(rows.map((r) => r.similarity)) };
};
const ans = q("select item_key, anchor_key, similarity, sent_by, instruction, template, edited_at, copied_at, created_at, sent_at, model from drafts where status='answered' and similarity is not null");
out.closeness = {
  all: band(ans),
  bySection: Object.fromEntries(["c:", "l:", "em:"].map((p) => [p, band(ans.filter((r) => prefix(r.item_key) === p))])),
  byKind: {
    "first reply to a new enquiry (i:)": band(ans.filter((r) => r.anchor_key.startsWith("i:"))),
    "answer to a customer message (m:)": band(ans.filter((r) => r.anchor_key.startsWith("m:"))),
    "phone text (pm:)": band(ans.filter((r) => r.anchor_key.startsWith("pm:")))
  },
  bySender: {
    owner: band(ans.filter((r) => r.sent_by != null && senderCode.get(r.sent_by) === "owner")),
    "other staff": band(ans.filter((r) => r.sent_by != null && senderCode.get(r.sent_by) !== "owner")),
    "no sender (phone)": band(ans.filter((r) => r.sent_by == null))
  },
  withInstruction: band(ans.filter((r) => r.instruction)),
  withoutInstruction: band(ans.filter((r) => !r.instruction)),
  withTemplate: band(ans.filter((r) => r.template)),
  editedInBox: band(ans.filter((r) => r.edited_at)),
  notEditedInBox: band(ans.filter((r) => !r.edited_at))
};
out.byModel = Object.entries(ans.reduce((m, r) => { (m[r.model || "none"] = m[r.model || "none"] || []).push(r); return m; }, {})).map(([k, rows]) => ({ model: k, ...band(rows) })).sort((a, b) => b.n - a.n).slice(0, 6);

/* ---------- C. how fast customers were answered (Dashboard texts) ---------- */
const tz = "Australia/Sydney";
const fmt = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false });
const openNow = (ms) => {
  const parts = fmt.formatToParts(new Date(ms));
  const wd = parts.find((p) => p.type === "weekday").value, h = Number(parts.find((p) => p.type === "hour").value);
  if (wd === "Sun") return false;
  if (wd === "Sat") return h >= 9 && h < 16;
  return h >= 9 && h < 18;
};
const since = first.b - 30 * D;
const ins = q("select conversation_id c, at from messages where direction='IN' and at > ? order by c, at", since);
const waits = [], waitsOpen = [], unanswered = [];
let prevConv = null, prevIn = null;
const grouped = new Map();
for (const m of ins) { if (!grouped.has(m.c)) grouped.set(m.c, []); grouped.get(m.c).push(m.at); }
for (const [c, times] of grouped) {
  // the first customer message of each burst (a burst ends with our reply)
  let i = 0;
  while (i < times.length) {
    const t = times[i];
    const o = one("select at from messages where conversation_id=? and direction='OUT' and at > ? order by at limit 1", c, t);
    if (!o || o.at - t > 7 * D) unanswered.push(t);
    else { waits.push(o.at - t); if (openNow(t)) waitsOpen.push(o.at - t); }
    while (i < times.length && (!o || times[i] < o.at)) i++;
  }
}
out.responseTime = {
  bursts: waits.length + unanswered.length,
  answeredWithin7Days: pct(waits.length, waits.length + unanswered.length),
  medianMinutesAllHours: mins(median(waits)),
  medianMinutesOpeningHours: mins(median(waitsOpen)),
  p75MinutesOpeningHours: mins(quant(waitsOpen, 0.75)),
  within10MinOpeningHours: pct(waitsOpen.filter((w) => w <= 10 * 60e3).length, waitsOpen.length)
};
/* first answer to a brand-new lead */
const leads = q("select conversation_id c, lead_at from leads where lead_at > ? and conversation_id is not null", since);
const leadWaits = [];
for (const l of leads) {
  const o = one("select at from messages where conversation_id=? and direction='OUT' and at > ? order by at limit 1", l.c, l.lead_at);
  if (o && o.at - l.lead_at < 7 * D && openNow(l.lead_at)) leadWaits.push(o.at - l.lead_at);
}
out.firstAnswerToNewLead = { leads: leadWaits.length, medianMinutesOpeningHours: mins(median(leadWaits)), p75: mins(quant(leadWaits, 0.75)) };

/* ---------- D. time from opening to copying ---------- */
const copied = q("select item_key, anchor_key, copied_at, created_at from drafts where copied_at is not null");
const openToCopy = [];
for (const d of copied) {
  const s = seenAt(d.item_key, d.anchor_key);
  if (s && d.copied_at >= s.at && d.copied_at - s.at < 2 * H) openToCopy.push(d.copied_at - s.at);
}
out.openToCopy = { pairs: openToCopy.length, medianSeconds: openToCopy.length ? Math.round(median(openToCopy) / 1000) : null, p75Seconds: openToCopy.length ? Math.round(quant(openToCopy, 0.75) / 1000) : null };
const draftToSent = ans.filter((r) => r.sent_at && r.sent_at >= r.created_at).map((r) => r.sent_at - r.created_at);
out.draftWaitsBeforeSent = { n: draftToSent.length, medianMinutes: mins(median(draftToSent)) };

/* ---------- E. AI size and cost drivers ---------- */
out.tokensPerRequest = q("select model, sum(requests) requests, sum(tokens_in) tin, sum(tokens_out) tout from llm_usage_models group by model order by requests desc").map((r) => ({ model: r.model, requests: r.requests, inPerRequest: r.requests ? Math.round(r.tin / r.requests) : null, outPerRequest: r.requests ? Math.round(r.tout / r.requests) : null }));

/* ---------- F. checks that fired ---------- */
const checkCodes = {};
let withProblem = 0, checked = 0;
for (const r of q("select checks_json from drafts where checks_json is not null")) {
  let arr; try { arr = JSON.parse(r.checks_json); } catch { continue; }
  checked++;
  let bad = false;
  for (const c of arr) { if (c.level && c.level !== "ok") { bad = true; const k = c.level + ":" + c.code; checkCodes[k] = (checkCodes[k] || 0) + 1; } }
  if (bad) withProblem++;
}
out.checks = { draftsChecked: checked, withAProblemShown: withProblem, share: pct(withProblem, checked), top: Object.entries(checkCodes).sort((a, b) => b[1] - a[1]).slice(0, 12) };

/* ---------- G. deal stages in the records ---------- */
const stageOf = (s) => ({ NEW: "enquiry", New: "enquiry", CONTACTED: "enquiry", FOLLOW_UP: "enquiry", IN_PROGRESS: "enquiry", HOT: "enquiry", WARM: "enquiry", FINANCE_APPLIED: "enquiry (finance applied)", INSPECTION: "inspection booked", INSPECTION_DONE: "seen the car", DEPOSIT_RECEIVED: "deposit", CAR_SOLD: "sold", FAILED: "lost", DISQUALIFIED: "lost", COLD: "gone quiet" })[s] || "other";
const recent = q("select status, status_history_json h from leads where lead_at > ?", since);
const stageCounts = {};
let withHistory = 0;
for (const l of recent) { const k = stageOf(l.status); stageCounts[k] = (stageCounts[k] || 0) + 1; if (l.h && l.h !== "[]") withHistory++; }
out.dealStages = { leadsLast30Days: recent.length, byStage: stageCounts, withStatusHistory: pct(withHistory, recent.length), salesRecords: one("select count(*) n from sales").n };

/* ---------- H. teaching ---------- */
out.teaching = {
  ratings: q("select substr(item_key,1,instr(item_key,':')) p, rating, count(*) n from drafts where rating is not null group by p, rating order by p"),
  learned: one("select count(*) n from learned").n,
  instructionsBySection: q("select substr(item_key,1,instr(item_key,':')) p, count(*) n from drafts where instruction is not null group by p")
};

const file = path.join(folder, `measure-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out, null, 1));
console.log(`Saved to ${path.relative(root, file)}. ${given ? "Your copy was left where it was." : "The copy of the database was deleted."}`);
