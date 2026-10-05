// A plain text record of things that went wrong, so "what happened?" still has an answer after
// the black window has scrolled away. The file is wheelman.log, beside the database, on this
// computer only; git never sees it.
//
// Only technical messages are written: which step failed and what the service answered.
// No customer name, number or message text goes in.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { formatSydney, sydneyDay } from './time.js';

const MAX_BYTES = 512 * 1024;

export const logFile = () => (config.dbPath === ':memory:' ? '' : path.join(path.dirname(config.dbPath), 'wheelman.log'));

export function logLine(kind, message) {
  const file = logFile();
  if (!file) return; // tests keep nothing
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Keep the newer half when the file grows large.
    try {
      if (fs.statSync(file).size > MAX_BYTES) {
        const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, text.slice(Math.floor(text.length / 2)).replace(/^[^\n]*\n/, ''));
      }
    } catch { /* no file yet */ }
    const now = Date.now();
    const when = `${sydneyDay(now)} ${formatSydney(now).split(', ').pop()}`;
    fs.appendFileSync(file, `[${when}] ${kind}: ${String(message).replace(/\s+/g, ' ').trim().slice(0, 2000)}\n`);
  } catch { /* a log that cannot be written must never stop the app */ }
}
