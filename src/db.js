import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER,
  first_name TEXT, last_name TEXT, phone TEXT, email TEXT,
  source TEXT, status TEXT, platform TEXT, state TEXT,
  lead_at INTEGER, updated_at INTEGER,
  stocks_json TEXT, inquiries_json TEXT
);
CREATE INDEX IF NOT EXISTS leads_conv ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  phone TEXT, channel TEXT, status TEXT,
  lead_id INTEGER, customer_name TEXT,
  latest_direction TEXT, latest_at INTEGER, latest_body TEXT,
  messages_synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  direction TEXT NOT NULL,
  body TEXT, sent_by TEXT, status TEXT,
  media_type TEXT,
  at INTEGER, imported_at INTEGER
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, at);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  stock_no TEXT, year INTEGER, make TEXT, model TEXT, model_code TEXT,
  status TEXT, sold_status TEXT, stock_in TEXT,
  data_json TEXT, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS vehicles_stock ON vehicles(stock_no);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL,
  anchor_key TEXT NOT NULL,
  situation TEXT,
  reply TEXT,
  needs_human_json TEXT, facts_used_json TEXT, checks_json TEXT,
  provider TEXT, model TEXT,
  status TEXT NOT NULL,
  instruction TEXT, error TEXT,
  created_at INTEGER,
  rating TEXT,
  sent_text TEXT, sent_by TEXT, sent_at INTEGER, similarity REAL
);
CREATE INDEX IF NOT EXISTS drafts_item ON drafts(item_key, created_at);

CREATE TABLE IF NOT EXISTS dismissed (
  item_key TEXT NOT NULL, anchor_key TEXT NOT NULL, at INTEGER,
  PRIMARY KEY (item_key, anchor_key)
);

-- Conversations the user has opened. Keyed by the newest customer message, so a new message counts as unread again.
CREATE TABLE IF NOT EXISTS seen (
  item_key TEXT NOT NULL, anchor_key TEXT NOT NULL, at INTEGER,
  PRIMARY KEY (item_key, anchor_key)
);

CREATE TABLE IF NOT EXISTS llm_usage (
  day TEXT NOT NULL, provider TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- What Wheelman has learned from replies that were really used. Customer details are removed before storing.
CREATE TABLE IF NOT EXISTS learned (
  draft_id INTEGER PRIMARY KEY,
  item_key TEXT NOT NULL,
  situations_json TEXT,
  first_reply INTEGER,
  customer_text TEXT,
  draft_text TEXT,
  final_text TEXT NOT NULL,
  source TEXT NOT NULL,
  changed INTEGER NOT NULL DEFAULT 0,
  similarity REAL,
  at INTEGER
);
CREATE INDEX IF NOT EXISTS learned_at ON learned(at);

-- Facebook Marketplace chats, read from the content engine. Kept apart from the dashboard tables:
-- nothing here is ever used for learning or for the example bank.
CREATE TABLE IF NOT EXISTS mp_conversations (
  id INTEGER PRIMARY KEY,
  account TEXT, buyer_name TEXT, stock_id TEXT,
  last_direction TEXT, last_message_at INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  sig TEXT, messages_synced_at INTEGER,
  data_json TEXT
);
CREATE INDEX IF NOT EXISTS mp_conversations_latest ON mp_conversations(last_message_at);

CREATE TABLE IF NOT EXISTS mp_messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  direction TEXT NOT NULL,
  source TEXT, text TEXT, status TEXT,
  has_media INTEGER NOT NULL DEFAULT 0,
  at INTEGER
);
CREATE INDEX IF NOT EXISTS mp_messages_conv ON mp_messages(conversation_id, seq);

-- One row per vehicle that has a sale recorded on the dashboard: which car, the stage, when, and
-- whether a deposit or the full amount is recorded. No amount and no buyer name is kept. The
-- buyer's phone and email are stored only as scrambled match keys, never in readable form.
CREATE TABLE IF NOT EXISTS sales (
  vehicle_id INTEGER PRIMARY KEY,
  sale_id TEXT, stock_no TEXT,
  stage TEXT, sold_at INTEGER, paid TEXT,
  phone_hash TEXT, email_hash TEXT,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS sales_phone ON sales(phone_hash);
CREATE INDEX IF NOT EXISTS sales_email ON sales(email_hash);
`;

/** Adds a column to an existing database file if an older version created the table without it. */
function ensureColumn(d, table, column, type) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

let db = null;

export function openDb(file = config.dbPath) {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  ensureColumn(db, 'drafts', 'copied_text', 'TEXT');
  ensureColumn(db, 'drafts', 'copied_at', 'INTEGER');
  ensureColumn(db, 'drafts', 'context_json', 'TEXT');
  ensureColumn(db, 'leads', 'status_history_json', 'TEXT');
  ensureColumn(db, 'conversations', 'lead_platform', 'TEXT');
  ensureColumn(db, 'conversations', 'lead_status', 'TEXT');
  ensureColumn(db, 'conversations', 'lead_email', 'TEXT');
  migrate(db);
  return db;
}

/** One-off repairs to data written by earlier versions. Each runs once and is recorded in meta. */
function migrate(d) {
  const done = (key) => !!d.prepare('SELECT 1 FROM meta WHERE key = ?').get(key);
  const mark = (key) => d.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)').run(key, JSON.stringify(Date.now()));

  // Earlier versions matched sent replies to the wrong customer message and filed everything
  // learned under "general". Forget what was learned and let the corrected matching redo it.
  if (!done('learning_reset_v2')) {
    d.exec(`
      DELETE FROM learned;
      UPDATE drafts SET status = 'ready', sent_text = NULL, sent_by = NULL, sent_at = NULL, similarity = NULL
       WHERE status = 'answered' AND (item_key LIKE 'c:%' OR item_key LIKE 'l:%');
    `);
    mark('learning_reset_v2');
  }
}

export function closeDb() {
  if (db) { db.close(); db = null; salt = null; }
}

export function getMeta(key, fallback = null) {
  const row = openDb().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setMeta(key, value) {
  openDb().prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function transaction(fn) {
  const d = openDb();
  d.exec('BEGIN');
  try {
    const out = fn(d);
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

// ---- upserts -------------------------------------------------------------

export function upsertLead(l) {
  openDb().prepare(`
    INSERT INTO leads(id, conversation_id, first_name, last_name, phone, email, source, status, platform, state, lead_at, updated_at, stocks_json, inquiries_json, status_history_json)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      conversation_id = excluded.conversation_id, first_name = excluded.first_name, last_name = excluded.last_name,
      phone = excluded.phone, email = excluded.email, source = excluded.source, status = excluded.status,
      platform = excluded.platform, state = excluded.state, lead_at = excluded.lead_at, updated_at = excluded.updated_at,
      stocks_json = excluded.stocks_json, inquiries_json = excluded.inquiries_json,
      status_history_json = excluded.status_history_json
  `).run(l.id, l.conversationId, l.firstName, l.lastName, l.phone, l.email, l.source, l.status, l.platform, l.state,
    l.leadAt, l.updatedAt, JSON.stringify(l.stocks), JSON.stringify(l.inquiries), JSON.stringify(l.statusHistory || []));
}

export function upsertConversation(c) {
  openDb().prepare(`
    INSERT INTO conversations(id, phone, channel, status, lead_id, customer_name, latest_direction, latest_at, latest_body, lead_platform, lead_status, lead_email)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      phone = excluded.phone, channel = excluded.channel, status = excluded.status, lead_id = excluded.lead_id,
      customer_name = excluded.customer_name, latest_direction = excluded.latest_direction,
      latest_at = excluded.latest_at, latest_body = excluded.latest_body,
      lead_platform = excluded.lead_platform, lead_status = excluded.lead_status, lead_email = excluded.lead_email
  `).run(c.id, c.phone, c.channel, c.status, c.leadId, c.customerName, c.latestDirection, c.latestAt, c.latestBody,
    c.leadPlatform || null, c.leadStatus || null, c.leadEmail || null);
}

// ---- sales (a digest of the sale attached to a vehicle) -----------------------

let salt = null;

/**
 * Turns a phone key or an email into a match key that cannot be read back.
 * The salt is made once for this installation and kept in the database.
 */
export function matchHash(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (!salt) {
    salt = getMeta('match_salt', null);
    if (!salt) { salt = crypto.randomBytes(16).toString('hex'); setMeta('match_salt', salt); }
  }
  return crypto.createHash('sha256').update(`${salt}:${v}`).digest('hex').slice(0, 32);
}

/** Stores the digest from normalizeSale. The buyer's phone and email are scrambled here. */
export function upsertSale(s) {
  openDb().prepare(`
    INSERT INTO sales(vehicle_id, sale_id, stock_no, stage, sold_at, paid, phone_hash, email_hash, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vehicle_id) DO UPDATE SET
      sale_id = excluded.sale_id, stock_no = excluded.stock_no, stage = excluded.stage, sold_at = excluded.sold_at,
      paid = excluded.paid, phone_hash = excluded.phone_hash, email_hash = excluded.email_hash, updated_at = excluded.updated_at
  `).run(s.vehicleId, s.saleId, s.stockNo, s.stage, s.soldAt ?? null, s.paid,
    matchHash((s.phones || [])[0]) || null, matchHash(s.email) || null, Date.now());
}

export function deleteSale(vehicleId) {
  openDb().prepare('DELETE FROM sales WHERE vehicle_id = ?').run(vehicleId);
}

/** Sales whose buyer matches any of these phone keys or emails, newest first. */
export function salesFor({ phones = [], emails = [] } = {}) {
  const d = openDb();
  const out = new Map();
  for (const p of phones) {
    const h = matchHash(p);
    if (h) for (const r of d.prepare('SELECT * FROM sales WHERE phone_hash = ?').all(h)) out.set(r.vehicle_id, { ...r, matchedBy: 'phone' });
  }
  for (const e of emails) {
    const h = matchHash(e);
    if (h) for (const r of d.prepare('SELECT * FROM sales WHERE email_hash = ?').all(h)) if (!out.has(r.vehicle_id)) out.set(r.vehicle_id, { ...r, matchedBy: 'email' });
  }
  return [...out.values()].sort((a, b) => (b.sold_at || 0) - (a.sold_at || 0));
}

export function saleForVehicle(vehicleId) {
  return openDb().prepare('SELECT * FROM sales WHERE vehicle_id = ?').get(vehicleId) || null;
}

export function getVehicleById(id) {
  const r = openDb().prepare('SELECT data_json FROM vehicles WHERE id = ?').get(id);
  return r ? JSON.parse(r.data_json) : null;
}

/**
 * A lead with no text conversation is listed as "l:<lead>". Once it gains a conversation it is
 * listed as "c:<conversation>". Its suggestions, dismissals and read marks move with it, so the
 * same enquiry is not written twice.
 */
export function rekeyLeadItems() {
  const d = openDb();
  const rows = d.prepare(`
    SELECT DISTINCT k.item_key AS old, 'c:' || l.conversation_id AS new
      FROM (SELECT item_key FROM drafts WHERE item_key LIKE 'l:%'
            UNION SELECT item_key FROM dismissed WHERE item_key LIKE 'l:%'
            UNION SELECT item_key FROM seen WHERE item_key LIKE 'l:%'
            UNION SELECT item_key FROM learned WHERE item_key LIKE 'l:%') k
      JOIN leads l ON l.id = CAST(substr(k.item_key, 3) AS INTEGER)
     WHERE l.conversation_id IS NOT NULL`).all();
  for (const r of rows) {
    d.prepare('UPDATE drafts SET item_key = ? WHERE item_key = ?').run(r.new, r.old);
    d.prepare('UPDATE learned SET item_key = ? WHERE item_key = ?').run(r.new, r.old);
    d.prepare('UPDATE OR REPLACE dismissed SET item_key = ? WHERE item_key = ?').run(r.new, r.old);
    d.prepare('UPDATE OR REPLACE seen SET item_key = ? WHERE item_key = ?').run(r.new, r.old);
  }
  return rows.length;
}

export function upsertMessage(m) {
  openDb().prepare(`
    INSERT INTO messages(id, conversation_id, direction, body, sent_by, status, media_type, at, imported_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      body = excluded.body, sent_by = excluded.sent_by, status = excluded.status, media_type = excluded.media_type,
      at = excluded.at, imported_at = excluded.imported_at
  `).run(m.id, m.conversationId, m.direction, m.body, m.sentBy, m.status, m.mediaType, m.at, m.importedAt);
}

export function upsertVehicle(v) {
  openDb().prepare(`
    INSERT INTO vehicles(id, stock_no, year, make, model, model_code, status, sold_status, stock_in, data_json, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      stock_no = excluded.stock_no, year = excluded.year, make = excluded.make, model = excluded.model,
      model_code = excluded.model_code, status = excluded.status, sold_status = excluded.sold_status,
      stock_in = excluded.stock_in, data_json = excluded.data_json, updated_at = excluded.updated_at
  `).run(v.id, v.stockNo, v.year, v.make, v.model, v.modelCode, v.status, v.soldStatus, v.stockIn, JSON.stringify(v), Date.now());
}

// ---- Marketplace chats -----------------------------------------------------

/** Saves the summary of one chat. Leaves its messages and its change fingerprint alone. */
export function upsertMpConversation(c) {
  openDb().prepare(`
    INSERT INTO mp_conversations(id, account, buyer_name, stock_id, last_direction, last_message_at, archived, data_json)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account = excluded.account, buyer_name = excluded.buyer_name, stock_id = excluded.stock_id,
      last_direction = excluded.last_direction, last_message_at = excluded.last_message_at,
      archived = excluded.archived, data_json = excluded.data_json
  `).run(c.id, c.account, c.buyerName, c.stockId, c.lastDirection, c.lastMessageAt, c.archived ? 1 : 0, JSON.stringify(c));
}

/** Replaces every stored message of one chat, and records the fingerprint they belong to. */
export function replaceMpMessages(conversationId, messages, sig) {
  const d = openDb();
  d.prepare('DELETE FROM mp_messages WHERE conversation_id = ?').run(conversationId);
  const ins = d.prepare('INSERT OR REPLACE INTO mp_messages(id, conversation_id, seq, direction, source, text, status, has_media, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const m of messages) ins.run(m.id, conversationId, m.seq, m.direction, m.source, m.text, m.status, m.hasMedia ? 1 : 0, m.at);
  d.prepare('UPDATE mp_conversations SET sig = ?, messages_synced_at = ? WHERE id = ?').run(sig, Date.now(), conversationId);
}

export function getMpConversation(id) {
  const r = openDb().prepare('SELECT * FROM mp_conversations WHERE id = ?').get(id);
  return r ? { ...r, data: JSON.parse(r.data_json || '{}') } : null;
}

export function getMpMessages(conversationId) {
  return openDb().prepare('SELECT * FROM mp_messages WHERE conversation_id = ? ORDER BY seq ASC, id ASC').all(conversationId);
}

/** Marketplace suggestions written in the last 24 hours, for the section allowance. */
export function mpDraftsLastDay(now = Date.now()) {
  return openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key LIKE 'mp:%' AND status = 'ready' AND created_at >= ?").get(now - 24 * 3600 * 1000).n;
}

// ---- reads ---------------------------------------------------------------

const parseLead = (r) => r && ({ ...r, stocks: JSON.parse(r.stocks_json || '[]'), inquiries: JSON.parse(r.inquiries_json || '[]'), statusHistory: JSON.parse(r.status_history_json || '[]') });

export function getLead(id) {
  return parseLead(openDb().prepare('SELECT * FROM leads WHERE id = ?').get(id));
}

export function getLeadByConversation(conversationId) {
  return parseLead(openDb().prepare('SELECT * FROM leads WHERE conversation_id = ? ORDER BY updated_at DESC LIMIT 1').get(conversationId));
}

export function getConversation(id) {
  return openDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function getMessages(conversationId) {
  return openDb().prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY at ASC, id ASC').all(conversationId);
}

export function getVehicleByStock(stockNo) {
  const r = openDb().prepare('SELECT data_json FROM vehicles WHERE stock_no = ? ORDER BY updated_at DESC, id DESC LIMIT 1').get(String(stockNo));
  return r ? JSON.parse(r.data_json) : null;
}

export function allVehicles() {
  return openDb().prepare('SELECT data_json FROM vehicles').all().map((r) => JSON.parse(r.data_json));
}

export function countRows(table) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('bad table name');
  return openDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

// ---- drafts --------------------------------------------------------------

export function insertDraft(d) {
  const info = openDb().prepare(`
    INSERT INTO drafts(item_key, anchor_key, situation, reply, needs_human_json, facts_used_json, checks_json, provider, model, status, instruction, error, created_at, context_json)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.itemKey, d.anchorKey, d.situation || null, d.reply || null, JSON.stringify(d.needsHuman || []),
    JSON.stringify(d.factsUsed || []), JSON.stringify(d.checks || []), d.provider || null, d.model || null,
    d.status, d.instruction || null, d.error || null, Date.now(), d.context ? JSON.stringify(d.context) : null);
  return Number(info.lastInsertRowid);
}

const parseDraft = (r) => r && ({
  ...r,
  needsHuman: JSON.parse(r.needs_human_json || '[]'),
  factsUsed: JSON.parse(r.facts_used_json || '[]'),
  checks: JSON.parse(r.checks_json || '[]'),
  // What the message was about when the suggestion was written (it reads as "general" once answered).
  context: r.context_json ? JSON.parse(r.context_json) : null,
});

export function latestDraft(itemKey, anchorKey) {
  return parseDraft(openDb().prepare('SELECT * FROM drafts WHERE item_key = ? AND anchor_key = ? ORDER BY id DESC LIMIT 1').get(itemKey, anchorKey));
}

export function getDraft(id) {
  return parseDraft(openDb().prepare('SELECT * FROM drafts WHERE id = ?').get(id));
}

export function draftsAwaitingOutcome() {
  return openDb().prepare("SELECT * FROM drafts WHERE status = 'ready' AND sent_text IS NULL AND (item_key LIKE 'c:%' OR item_key LIKE 'l:%') ORDER BY id DESC LIMIT 500").all().map(parseDraft);
}

export function recordOutcome(id, { sentText, sentBy, sentAt, similarity }) {
  openDb().prepare("UPDATE drafts SET sent_text = ?, sent_by = ?, sent_at = ?, similarity = ?, status = 'answered' WHERE id = ?")
    .run(sentText, sentBy, sentAt, similarity, id);
}

/** The customer wrote again before anyone replied, so this suggestion answered a message that has moved on. */
export function markSuperseded(id) {
  openDb().prepare("UPDATE drafts SET status = 'superseded' WHERE id = ?").run(id);
}

/** Every Wheelman suggestion written for one conversation, for telling its own text from staff writing. */
export function draftTextsFor(itemKey) {
  return openDb().prepare("SELECT reply, copied_text FROM drafts WHERE item_key = ? AND reply IS NOT NULL AND reply != ''").all(itemKey);
}

export function setDraftRating(id, rating) {
  openDb().prepare('UPDATE drafts SET rating = ? WHERE id = ?').run(rating, id);
}

export function dismiss(itemKey, anchorKey) {
  openDb().prepare('INSERT OR REPLACE INTO dismissed(item_key, anchor_key, at) VALUES(?, ?, ?)').run(itemKey, anchorKey, Date.now());
}

export function isDismissed(itemKey, anchorKey) {
  return !!openDb().prepare('SELECT 1 FROM dismissed WHERE item_key = ? AND anchor_key = ?').get(itemKey, anchorKey);
}

/** The user opened this conversation: its messages up to this point have been read. */
export function markSeen(itemKey, anchorKey) {
  openDb().prepare('INSERT OR REPLACE INTO seen(item_key, anchor_key, at) VALUES(?, ?, ?)').run(itemKey, anchorKey, Date.now());
}

export function isSeen(itemKey, anchorKey) {
  return !!openDb().prepare('SELECT 1 FROM seen WHERE item_key = ? AND anchor_key = ?').get(itemKey, anchorKey);
}

/** Undoes Dismiss: the conversation goes back to Waiting. */
export function undismiss(itemKey) {
  openDb().prepare('DELETE FROM dismissed WHERE item_key = ?').run(itemKey);
}

export function recordCopied(id, text) {
  openDb().prepare('UPDATE drafts SET copied_text = ?, copied_at = ? WHERE id = ?').run(text, Date.now(), id);
}

/** Notes that Copy was pressed, without keeping the text. Used for Marketplace suggestions. */
export function recordCopiedTime(id) {
  openDb().prepare('UPDATE drafts SET copied_at = ? WHERE id = ?').run(Date.now(), id);
}

// ---- learning ------------------------------------------------------------

export function upsertLearned(l) {
  // Last line of defence: only dashboard conversations (c:) and leads (l:) may teach Wheelman.
  if (!/^[cl]:\d+$/.test(String(l.itemKey || ''))) throw new Error('Refused: only dashboard conversations can be learned from.');
  openDb().prepare(`
    INSERT INTO learned(draft_id, item_key, situations_json, first_reply, customer_text, draft_text, final_text, source, changed, similarity, at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(draft_id) DO UPDATE SET
      situations_json = excluded.situations_json, first_reply = excluded.first_reply, customer_text = excluded.customer_text,
      draft_text = excluded.draft_text, final_text = excluded.final_text, source = excluded.source,
      changed = excluded.changed, similarity = excluded.similarity, at = excluded.at
  `).run(l.draftId, l.itemKey, JSON.stringify(l.situations || []), l.firstReply ? 1 : 0, l.customerText || '', l.draftText || '',
    l.finalText, l.source, l.changed ? 1 : 0, l.similarity ?? null, l.at || Date.now());
}

export function deleteLearned(draftId) {
  openDb().prepare('DELETE FROM learned WHERE draft_id = ?').run(draftId);
}

/** One lesson per customer message: forget what other suggestions for the same message taught. */
export function deleteLearnedForAnchor(itemKey, anchorKey, exceptDraftId) {
  openDb().prepare('DELETE FROM learned WHERE draft_id != ? AND draft_id IN (SELECT id FROM drafts WHERE item_key = ? AND anchor_key = ?)')
    .run(exceptDraftId, itemKey, anchorKey);
}

/** True when another suggestion already taught exactly this reply. */
export function learnedTextExists(finalText, exceptDraftId) {
  return !!openDb().prepare('SELECT 1 FROM learned WHERE final_text = ? AND draft_id != ?').get(finalText, exceptDraftId);
}

export function allLearned(limit = 600) {
  return openDb().prepare('SELECT * FROM learned ORDER BY at DESC LIMIT ?').all(limit)
    .map((r) => ({ ...r, situations: JSON.parse(r.situations_json || '[]') }));
}

export function learnedStats() {
  const r = openDb().prepare("SELECT COUNT(*) AS total, SUM(changed) AS changed, SUM(CASE WHEN source = 'sent' THEN 1 ELSE 0 END) AS sent, MAX(at) AS latest FROM learned").get();
  return { total: r.total || 0, changed: r.changed || 0, sent: r.sent || 0, latest: r.latest || null };
}

// ---- AI usage counter ----------------------------------------------------

export function usageToday(day) {
  const rows = openDb().prepare('SELECT provider, count FROM llm_usage WHERE day = ?').all(day);
  const out = { total: 0 };
  for (const r of rows) { out[r.provider] = r.count; out.total += r.count; }
  return out;
}

export function addUsage(day, provider) {
  openDb().prepare(`
    INSERT INTO llm_usage(day, provider, count) VALUES(?, ?, 1)
    ON CONFLICT(day, provider) DO UPDATE SET count = count + 1
  `).run(day, provider);
}
