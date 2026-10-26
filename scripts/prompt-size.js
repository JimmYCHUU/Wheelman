// Prompt size meter: what each prompt section costs, measured on real cases from a COPY of the database.
// No AI request is made. Prints section names and sizes only, never prompt text.
//
//   npm run prompt-size -- --n 30 --style full|compact
//
// Refuses to run unless DB_PATH points at a copy of the database.

import { config } from '../src/config.js';
import { requireCopy } from '../src/livedb.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const wanted = Math.max(1, Math.min(400, Number(flag('--n')) || 30));
const style = flag('--style') ?? 'full';
if (style !== 'full' && style !== 'compact') { console.log('--style must be full or compact.'); process.exit(1); }

try { requireCopy(config.dbPath); } catch (e) { console.log(e.message); process.exit(1); }

const { openDb, closeDb } = await import('../src/db.js');
const { collectCases, spread, itemAt } = await import('../src/replaycases.js');
const { buildItem } = await import('../src/items.js');
const { buildPrompt } = await import('../src/prompt.js');
const { sectionSizes, estimateTokens } = await import('../src/promptsize.js');

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const db = openDb();
const cases = spread(collectCases(db, {}), wanted);
const bySection = new Map(); // name -> { chars: [per case], tokens: [per case] }
const totals = { chars: [], tokens: [] };
for (const c of cases) {
  const item = itemAt(buildItem({ conversationId: c.conversationId }), c.cut, c.at);
  const p = buildPrompt(item, { now: c.at, holdOutConversation: true, style });
  const sizes = sectionSizes(p);
  const perCase = new Map();
  for (const s of sizes) {
    const e = perCase.get(s.name) ?? { chars: 0 };
    e.chars += s.chars;
    perCase.set(s.name, e);
  }
  for (const [name, e] of perCase) {
    if (!bySection.has(name)) bySection.set(name, { chars: [], tokens: [] });
    bySection.get(name).chars.push(e.chars);
    bySection.get(name).tokens.push(Math.ceil(e.chars / 4));
  }
  totals.chars.push(p.system.length + p.user.length);
  totals.tokens.push(estimateTokens(p.system) + estimateTokens(p.user));
}

console.log(`Prompt size, style ${style}: ${cases.length} cases (up to ${wanted} asked for). No AI request was made.`);
console.log('Median per section (over the cases that have it):\n');
const rows = [...bySection].map(([name, v]) => ({ name, n: v.chars.length, chars: median(v.chars), tokens: median(v.tokens) }))
  .sort((a, b) => b.chars - a.chars);
const width = Math.max(10, ...rows.map((r) => r.name.length));
for (const r of rows) console.log(`  ${r.name.padEnd(width)}  ${String(r.chars).padStart(7)} chars  ${String(r.tokens).padStart(6)} tokens  (in ${r.n} of ${cases.length})`);
console.log(`\n  ${'TOTAL'.padEnd(width)}  ${String(median(totals.chars)).padStart(7)} chars  ${String(median(totals.tokens)).padStart(6)} tokens  (median of the totals)`);
closeDb();
