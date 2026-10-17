// An existing database made by an earlier version kept "moved to Import Query" on the owner's
// ruling. Opening it with this version copies those moves into their own table, so they stay
// where the owner put them, and a ruling taken away later no longer moves anything back. All
// data is invented.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { applyTestEnv } from './support/env.js';

const file = path.join(os.tmpdir(), `wheelman-moves-upgrade-${process.pid}.db`);
for (const f of ['', '-shm', '-wal']) fs.rmSync(file + f, { force: true });

// A database as the earlier version left it: two rulings, one of them a move to Import Query.
const old = new DatabaseSync(file);
old.exec(`
  CREATE TABLE item_rulings (item_key TEXT PRIMARY KEY, lead_id INTEGER, kind TEXT NOT NULL, section TEXT NOT NULL DEFAULT 'dashboard', at INTEGER);
  INSERT INTO item_rulings(item_key, lead_id, kind, section, at) VALUES ('l:901', 901, 'import', 'importquery', 1000);
  INSERT INTO item_rulings(item_key, lead_id, kind, section, at) VALUES ('c:902', 902, 'general', 'dashboard', 2000);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  INSERT INTO meta(key, value) VALUES ('learning_reset_v2', '1');
`);
old.close();

applyTestEnv({ DB_PATH: file });
const db = await import('../src/db.js');

after(() => { db.closeDb(); for (const f of ['', '-shm', '-wal']) fs.rmSync(file + f, { force: true }); });

test('an older database keeps its moves to Import Query, now in their own table, and its rulings', () => {
  db.openDb();
  assert.deepEqual({ ...db.itemMove('l:901', 901) }, { itemKey: 'l:901', leadId: 901, section: 'importquery', at: 1000 });
  assert.equal(db.itemMove('c:902', 902), null, 'a ruling that moved nothing is not a move');
  assert.deepEqual(db.movedKeys('importquery'), ['l:901']);
  assert.equal(db.itemRuling('l:901', 901).kind, 'import', 'the ruling itself is kept');
  // Taking the ruling away leaves the move as it is.
  db.clearItemRuling('l:901', 901);
  assert.equal(db.itemMove('l:901', 901).section, 'importquery');
  // Opened again: the copy is made once only.
  db.closeDb();
  db.openDb();
  assert.deepEqual(db.movedKeys('importquery'), ['l:901']);
});
