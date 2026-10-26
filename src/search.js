// The one search: customers (the rows of every section that is on), cars (the stock list) and
// words in messages. Plain SQL over the database module, no HTTP. The query is only ever a bound
// parameter, and % _ and the escape character in it are plain text.
import { openDb } from './db.js';
import { findCars } from './vehiclemedia.js';
import { rowMatches } from '../web/lib/search.js';

const SECTION_ORDER = ['dashboard', 'marketplace', 'importquery', 'auction'];
const SNIPPET = 140;
const MESSAGE_LIMIT = 20;

// Each message table: where the body is, how it maps to an item key, and the name to show.
const SOURCES = [
  { table: 'messages', sql: `SELECT 'c:' || m.conversation_id AS key, COALESCE(NULLIF(c.customer_name, ''), c.phone, '') AS name, m.at AS at, m.direction AS dir, m.body AS text FROM messages m LEFT JOIN conversations c ON c.id = m.conversation_id WHERE m.body LIKE ? ESCAPE '!' ORDER BY m.at DESC LIMIT ?`, home: 'dashboard' },
  { table: 'mp_messages', sql: `SELECT 'mp:' || m.conversation_id AS key, COALESCE(c.buyer_name, '') AS name, m.at AS at, m.direction AS dir, m.text AS text FROM mp_messages m LEFT JOIN mp_conversations c ON c.id = m.conversation_id WHERE m.text LIKE ? ESCAPE '!' ORDER BY m.at DESC LIMIT ?`, home: 'marketplace' },
  { table: 'mail_messages', sql: `SELECT 'em:' || m.thread_id AS key, COALESCE(NULLIF(t.customer_name, ''), t.customer_email, '') AS name, m.at AS at, m.direction AS dir, m.text AS text FROM mail_messages m LEFT JOIN mail_threads t ON t.id = m.thread_id WHERE m.text LIKE ? ESCAPE '!' ORDER BY m.at DESC LIMIT ?`, home: 'importquery' },
  { table: 'phone_messages', sql: `SELECT 'ph:' || m.thread_id AS key, COALESCE(t.name, '') AS name, m.at AS at, m.direction AS dir, m.text AS text FROM phone_messages m LEFT JOIN phone_threads t ON t.id = m.thread_id WHERE m.text LIKE ? ESCAPE '!' ORDER BY m.at DESC LIMIT ?`, home: 'dashboard' },
];

/** The words around the first match, at most 140 characters, with … where it was cut. */
export function snippet(text, q) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= SNIPPET) return s;
  const at = Math.max(0, s.toLowerCase().indexOf(q.toLowerCase()));
  const start = Math.max(0, at - 40);
  const lead = start > 0 ? 1 : 0;
  const end = Math.min(s.length, start + SNIPPET - lead - 1);
  const tail = end < s.length ? 1 : 0;
  const stop = tail ? end : Math.min(s.length, start + SNIPPET - lead);
  return (lead ? '…' : '') + s.slice(start, stop) + (tail ? '…' : '');
}

function messagesMatching(q, sectionOf) {
  const d = openDb();
  const have = new Set(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const like = `%${q.replace(/[!%_]/g, (c) => `!${c}`)}%`;
  const found = [];
  for (const src of SOURCES) {
    if (!have.has(src.table)) continue;
    for (const r of d.prepare(src.sql).all(like, MESSAGE_LIMIT)) {
      found.push({ key: r.key, section: sectionOf.get(r.key) || src.home, name: r.name || '', at: r.at || 0, who: String(r.dir).toLowerCase() === 'in' ? 'customer' : 'us', text: snippet(r.text, q) });
    }
  }
  return found.sort((a, b) => b.at - a.at).slice(0, MESSAGE_LIMIT);
}

/**
 * searchAll(q, { limit, rowsOf }): { customers, cars, messages }. rowsOf(section) gives the list
 * rows of a section, or null when it is switched off (the server passes its own cached lists).
 */
export function searchAll(q, { limit = 20, rowsOf = () => null } = {}) {
  const typed = String(q || '').trim().slice(0, 200);
  const out = { customers: [], cars: [], messages: [] };
  if (typed.length < 2) return out;
  const sectionOf = new Map();
  const seen = new Set();
  for (const section of SECTION_ORDER) {
    const rows = rowsOf(section);
    if (!rows) continue;
    for (const r of rows) {
      sectionOf.set(r.key, section);
      if (seen.has(r.key) || out.customers.length >= limit || !rowMatches(r, typed)) continue;
      seen.add(r.key);
      out.customers.push({ ...r, section });
    }
  }
  out.cars = findCars(typed, { max: 6 });
  out.messages = messagesMatching(typed, sectionOf);
  return out;
}
