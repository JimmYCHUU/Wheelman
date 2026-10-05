// Run before a commit or a push: makes sure nothing private is in the files git would publish.
// Compares every such file with each value in .env, the dashboard session, the staff names in
// voice/people.json and the usual shapes of API keys. Prints setting names only, never a value.
//
//   npm run check-private

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { config } from '../src/config.js';

const root = config.root;
const read = (file) => { try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch { return ''; } };

const SECRET = /USERNAME|PASSWORD|KEY|TOKEN|SECRET|URL/;
const settings = read('.env').split('\n').map((l) => l.trim().match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
  .map((m) => [m[1], m[2].trim()]).filter(([k, v]) => SECRET.test(k) && v.length >= 3);
const session = (() => { try { return Object.values(JSON.parse(read('data/.session.json'))).map(String).filter((v) => v.length >= 8); } catch { return []; } })();

// Staff names: every word of four letters or more in the local people file, apart from field names and wording.
const names = (() => {
  const out = new Set();
  const plain = /^(from|carbarn|here|team|regards|thanks|this|name|shared|login)$/i;
  const walk = (x, key = '') => {
    if (typeof x === 'string') { if (!/pattern|_about|note/i.test(key)) for (const w of x.split(/[^A-Za-z]+/)) if (w.length >= 4 && !plain.test(w)) out.add(w.toLowerCase()); }
    else if (Array.isArray(x)) x.forEach((v) => walk(v, key));
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, k);
  };
  try { walk(JSON.parse(read('voice/people.json'))); } catch { /* no local people file: nothing to compare */ }
  return [...out];
})();

const SHAPES = [
  ['a Google key', /AIza[0-9A-Za-z_\-]{30,}/],
  ['an OpenRouter key', /sk-or-[0-9A-Za-z\-]{20,}/],
  ['a GitHub token', /gh[pousr]_[0-9A-Za-z]{30,}/],
  ['a password written out', /password\s*[:=]\s*['"][^'"\s]{4,}['"]/i],
];
const PRIVATE_FILE = /(^|\/)\.env$|^data\/|(^|\/)people\.json$|(^|\/)examples\.json$|^PLAN\.md$|^Auction\.txt$|evidence|\.session|^\.playwright-mcp\/|^eval\/out\/|^knowledge\/website\//;

const files = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
const problems = [];
for (const f of files) {
  if (PRIVATE_FILE.test(f)) problems.push(`${f}: a private file that should be git-ignored`);
  if (/\.(woff2?|png|jpe?g|ico|gif)$/i.test(f)) continue;
  const text = read(f);
  const lower = text.toLowerCase();
  for (const [name, value] of settings) if (text.includes(value)) problems.push(`${f}: contains the value of ${name}`);
  if (session.some((v) => text.includes(v))) problems.push(`${f}: contains a dashboard session value`);
  if (names.some((n) => new RegExp(`\\b${n}\\b`).test(lower))) problems.push(`${f}: contains a staff name from voice/people.json`);
  for (const [what, re] of SHAPES) if (re.test(text)) problems.push(`${f}: contains what looks like ${what}`);
}

console.log(`Checked ${files.length} files against ${settings.length} settings (${settings.map(([k]) => k).join(', ')}), ${names.length} staff name words and ${SHAPES.length} key shapes.`);
if (problems.length) {
  console.log(`\nDo not commit or push yet. ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log('\nA short value can match by coincidence, such as inside an invented phone number in a test. Change the invented number.');
  process.exit(1);
}
console.log('Nothing private found. Safe to commit.');
