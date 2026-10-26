// Which database is the live one, and the guard that keeps scripts off it.

import path from 'node:path';

/**
 * True for the live layout: a file named app.db in a folder named data, the database the app keeps
 * open. Scripts that write or replay run on a copy only.
 */
export function isLiveDatabase(dbPath) {
  const full = path.resolve(String(dbPath || ''));
  return path.basename(full).toLowerCase() === 'app.db' && path.basename(path.dirname(full)).toLowerCase() === 'data';
}

/** Throws unless dbPath is set and is not the live database. ':memory:' (the tests) is a copy. */
export function requireCopy(dbPath) {
  if (!dbPath || !String(dbPath).trim() || isLiveDatabase(dbPath)) {
    throw new Error('DB_PATH must point at a copy of the database, not the live one');
  }
}
