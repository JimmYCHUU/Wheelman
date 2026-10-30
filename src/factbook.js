// The business facts as the Playbook lists them, and an answer saved there. A save is a new row of
// playbook_versions (src/db.js), laid over the facts file whenever the file is read
// (loadBusinessFacts in src/knowledge.js), so the next request uses it. The file is never written,
// and no saved version is ever changed or removed: every answer the Playbook was given is kept.

import { loadBusinessFacts, FACTS_NAME, USE_FILE } from './knowledge.js';
import { addVersion, versionsOf } from './db.js';

export const FACT_STATES = ['confirmed', 'working', 'needs_answer'];
const LONGEST = 2000; // characters: an answer of exactly this many is taken, as the refusal says

const versions = (title) => versionsOf({ kind: 'fact', name: FACTS_NAME, part: title });
/** A topic of the file as a save's base keeps it, to tell later whether the file was changed by hand. */
const asBase = (t) => JSON.stringify({ status: t.status, answer: t.answer });
/** What the file said of a topic when a version was saved: { status, answer }, or null when it lacked the topic. */
const fromBase = (base) => { try { const b = base ? JSON.parse(base) : null; return b && typeof b.answer === 'string' ? b : null; } catch { return null; } };
const fileTopics = () => new Map(loadBusinessFacts(undefined, { playbook: false }).map((t) => [t.title, t]));

/**
 * Every business fact, in the file's order (one saved in the Playbook that the file lacks after
 * them), with the status and answer every request uses: { facts, counts }.
 *   facts:  [{ title, status, answer, at, from, earlier, file }]
 *     from     'playbook' when an answer saved there is in use, else 'file' (never saved, or put
 *              back to the file's own answer since)
 *     at       when the answer in use was saved; null for the file's own
 *     earlier  every answer saved before the one in use, newest first, then the file's own when a
 *              saved answer is in use: what the file said when the topic was first saved, else what
 *              it says now  [{ answer, status, at, from }]
 *     file     the file's { status, answer } when it was changed by hand after the answer in use
 *              was saved and now says something else, so it can be offered; otherwise null
 *   counts: { confirmed, working, needsAnswer }
 */
export function playbookFacts() {
  const own = fileTopics();
  const facts = loadBusinessFacts().map((t) => listed(t, own.get(t.title)));
  const count = (status) => facts.filter((f) => f.status === status).length;
  return { facts, counts: { confirmed: count('confirmed'), working: count('working'), needsAnswer: count('needs_answer') } };
}

function listed(t, inFile) {
  const fact = { title: t.title, status: t.status, answer: t.answer };
  const all = versions(t.title);
  const [newest] = all;
  // A version that put the file's own answer back in use has no answer of its own to list.
  const saves = all.filter((v) => v.status !== USE_FILE).map((v) => ({ answer: v.text, status: v.status, at: v.at, from: 'playbook' }));
  if (!newest || newest.status === USE_FILE) return { ...fact, at: null, from: 'file', earlier: saves, file: null };
  const earlier = saves.slice(1);
  const original = fromBase(all.at(-1).base) || inFile;
  if (original) earlier.push({ answer: original.answer, status: original.status, at: null, from: 'file' });
  // A hand edit to the very answer in use differs from nothing: there is nothing to offer.
  const file = inFile && asBase(inFile) !== newest.base && asBase(inFile) !== asBase(t) ? { status: inFile.status, answer: inFile.answer } : null;
  return { ...fact, at: newest.at, from: 'playbook', earlier, file };
}

/**
 * Saves an answer to a business fact in the Playbook, as a new version used from the next request.
 * Saving the answer and status already in use adds nothing. `from: 'file'` puts the file's own
 * answer back in use instead (useFile). Returns { fact }, the fact as playbookFacts lists it, or
 * { status, error } with the words to show.
 */
export function saveFact({ title, answer, status = 'confirmed', from = null, now = Date.now() } = {}) {
  const name = String(title ?? '').trim();
  const current = name ? loadBusinessFacts().find((t) => t.title === name) : null;
  if (!current) return { status: 404, error: 'That fact is not in the Playbook.' };
  if (from === 'file') return useFile(name, now);
  if (!FACT_STATES.includes(status)) return { status: 400, error: 'Say whether the answer is Confirmed or Working.' };
  // A fact put back to Needs answer has no answer: nothing is stated about it until it is answered.
  const text = status === 'needs_answer' ? '' : String(answer ?? '').trim();
  if (status !== 'needs_answer' && !text) return { status: 400, error: 'Write the answer first.' };
  if (text.length > LONGEST) return { status: 400, error: 'That answer is too long: keep it to 2,000 characters or fewer.' };
  if (current.status !== status || current.answer !== text) {
    const inFile = fileTopics().get(name);
    addVersion({ kind: 'fact', name: FACTS_NAME, part: name, text, status, base: inFile ? asBase(inFile) : '', at: now });
  }
  return { fact: playbookFacts().facts.find((f) => f.title === name) };
}

/**
 * Puts the file's own answer back in use: the Undo of a save on a fact that was the file's. It is a
 * version of its own (status USE_FILE), so every save stays kept, and the fact is read from the file
 * again as if never saved, later hand edits included. A fact read from the file already adds
 * nothing; one the file no longer has keeps its saved answer.
 */
function useFile(name, now) {
  const inFile = fileTopics().get(name);
  if (!inFile) return { status: 404, error: 'That fact is no longer in your facts file.' };
  const [newest] = versions(name);
  if (newest && newest.status !== USE_FILE) addVersion({ kind: 'fact', name: FACTS_NAME, part: name, text: '', status: USE_FILE, base: asBase(inFile), at: now });
  return { fact: playbookFacts().facts.find((f) => f.title === name) };
}
