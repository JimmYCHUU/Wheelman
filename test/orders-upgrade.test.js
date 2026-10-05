// An existing database made by an earlier version keeps one auction request per lead. Opening it
// with this version replaces that table with the one-row-per-order table, and loses nothing of
// the owner's: the old table was only a copy of the dashboard. All data is invented.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const file = path.join(os.tmpdir(), `wheelman-upgrade-${process.pid}.db`);
for (const f of ['', '-shm', '-wal']) fs.rmSync(file + f, { force: true });

// A database as the earlier version left it.
const old = new DatabaseSync(file);
old.exec(`
  CREATE TABLE auction_orders (lead_id INTEGER PRIMARY KEY, order_no TEXT, stage TEXT, lot_phase TEXT, source TEXT, lot_id TEXT, deposit_state TEXT, wanted_json TEXT, created_at INTEGER, checked_at INTEGER);
  INSERT INTO auction_orders(lead_id, order_no, stage) VALUES (7001, 'AS-70', 'INITIAL_DEPOSIT');
  CREATE TABLE drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, item_key TEXT NOT NULL, anchor_key TEXT NOT NULL, situation TEXT, reply TEXT, needs_human_json TEXT, facts_used_json TEXT, checks_json TEXT, provider TEXT, model TEXT, status TEXT NOT NULL, instruction TEXT, error TEXT, created_at INTEGER, rating TEXT, sent_text TEXT, sent_by TEXT, sent_at INTEGER, similarity REAL);
  INSERT INTO drafts(item_key, anchor_key, reply, status, created_at) VALUES ('c:1', 'm:1', 'Yes, it is available.', 'ready', 1);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  INSERT INTO meta(key, value) VALUES ('learning_reset_v2', '1');
`);
old.close();

process.env.DB_PATH = file;
const db = await import('../src/db.js');

after(() => { db.closeDb(); for (const f of ['', '-shm', '-wal']) fs.rmSync(file + f, { force: true }); });

test('an older database is upgraded: orders are kept one per order, and suggestions are untouched', () => {
  const d = db.openDb();
  const cols = d.prepare('PRAGMA table_info(auction_orders)').all().map((c) => c.name);
  assert.ok(cols.includes('id') && cols.includes('data_json') && !cols.includes('checked_at'), cols.join(', '));
  assert.equal(db.countRows('auction_orders'), 0, 'read again from the dashboard on the next check');
  assert.equal(db.getAuctionOrder(7001), null);
  assert.equal(d.prepare("SELECT reply FROM drafts WHERE item_key = 'c:1'").get().reply, 'Yes, it is available.');
  for (const t of ['order_notes', 'order_messages']) assert.equal(db.countRows(t), 0);

  // An order stored now is found by its lead, and by its own number.
  db.upsertOrder({ id: 70, orderNo: 'AS-70', stage: 'INITIAL_DEPOSIT', lotPhase: 'SOURCING', source: 'LIVE_AUCTION', closed: '', leadId: 7001, customer: { firstName: 'Nina', lastName: 'Test', phone: '0491 570 110', email: '' }, depositState: 'NONE', wanted: { make: 'Subaru', model: 'XV Hybrid' }, lot: null, car: null, money: { lines: [], payments: [] }, note: null, createdAt: Date.now() });
  assert.equal(db.getAuctionOrder(7001).orderNo, 'AS-70');
  assert.equal(db.getOrder(70).customer.firstName, 'Nina');

  // Opening it a second time changes nothing.
  db.closeDb();
  assert.equal(db.getOrder(70).orderNo, 'AS-70');
});
