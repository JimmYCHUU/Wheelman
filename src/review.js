// The review: the same real conversations written two ways (two voices, or two models), side by
// side for the owner to judge blind. A run is one JSON file under data/review/, written by
// scripts/review.js and read by the Review page, which saves each vote back into it. The files hold
// real customer text, so they stay in data/ (git never sees it) and the page is never served
// through the team link.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const ID = /^[\w.-]{1,80}$/;
export const PICKS = ['left', 'right', 'both_poor'];
const plain = (message) => Object.assign(new Error(message), { status: 400 });
const dir = () => config.reviewDir;
const fileOf = (id) => path.join(dir(), `${id}.json`);

/** A run's name from the moment it started: 2026-10-12-1432-05. */
export function newRunId(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Writes a run whole, through a temporary file, so a vote never leaves a half-written file. */
export function writeRun(run) {
  if (!ID.test(String(run?.id || ''))) throw plain('A review run needs a plain name.');
  fs.mkdirSync(dir(), { recursive: true });
  const file = fileOf(run.id);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(run, null, 1));
  fs.renameSync(tmp, file);
  return file;
}

/** One run by name, or null when there is none or it cannot be read. */
export function readRun(id) {
  if (!ID.test(String(id || ''))) return null;
  try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')); } catch { return null; }
}

/** Every run, newest first, with what the list on the page needs. */
export function listRuns() {
  let names = [];
  try { names = fs.readdirSync(dir()).filter((f) => f.endsWith('.json')); } catch { return []; }
  return names.map((f) => readRun(f.slice(0, -5))).filter(Boolean)
    .map((r) => ({ id: r.id, createdAt: r.createdAt, n: (r.cases || []).length, rated: (r.cases || []).filter((c) => c.vote).length, sides: r.sides, filter: r.filter || null }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The owner's vote on one case: left, right, or both poor. The sides are shuffled per case, so
 * the vote is kept with the side it stood for (A or B), and the page then says which was which.
 */
export function vote(id, index, pick, now = Date.now()) {
  const run = readRun(id);
  if (!run) throw Object.assign(new Error('That review run is not here.'), { status: 404 });
  const c = (run.cases || [])[Number(index)];
  if (!c) throw plain('That case is not in the run.');
  if (!PICKS.includes(pick)) throw plain('Pick Left is better, Right is better, or Both poor.');
  const other = c.left === 'A' ? 'B' : 'A';
  c.vote = { pick, side: pick === 'both_poor' ? null : pick === 'left' ? c.left : other, at: now };
  writeRun(run);
  return { case: c, summary: summarise(run) };
}

const mean = (a) => (a.length ? Math.round((a.reduce((t, v) => t + v, 0) / a.length) * 10) / 10 : 0);
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

/** The tallies the page shows at the top: wins, the sales score, hard failures, length and cost, per side. */
export function summarise(run) {
  const cases = run?.cases || [];
  const rated = cases.filter((c) => c.vote);
  const wins = { A: rated.filter((c) => c.vote.side === 'A').length, B: rated.filter((c) => c.vote.side === 'B').length, poor: rated.filter((c) => c.vote.pick === 'both_poor').length };
  const side = (s) => {
    const all = cases.map((c) => c[s]).filter(Boolean);
    const done = all.filter((x) => x.status === 'ready');
    return {
      written: done.length,
      score: mean(done.map((x) => Number(x.score?.score) || 0)),
      fails: done.filter((x) => x.level === 'fail').length,
      medianWords: median(done.map((x) => Number(x.words) || 0)),
      costAud: Math.round(all.reduce((t, x) => t + (Number(x.costAud) || 0), 0) * 100) / 100,
      unpriced: all.some((x) => x.usage && x.costAud === null),
    };
  };
  const bySituation = [];
  for (const c of cases) {
    let row = bySituation.find((r) => r.situation === c.situation);
    if (!row) { row = { situation: c.situation, label: c.label || c.situation, n: 0, A: 0, B: 0, poor: 0 }; bySituation.push(row); }
    row.n++;
    if (c.vote?.side === 'A') row.A++;
    else if (c.vote?.side === 'B') row.B++;
    else if (c.vote?.pick === 'both_poor') row.poor++;
  }
  return { n: cases.length, rated: rated.length, unrated: cases.length - rated.length, wins, A: side('A'), B: side('B'), bySituation };
}
