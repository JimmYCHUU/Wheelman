// The wording files in voice/: messages the team sends as they are, with the facts filled in by code.
//
// A file is plain text. In it:
//   # at the start of a line          a note for whoever edits the file; never sent
//   @name: some text                  a short piece of wording that code chooses between
//   ===== name =====                  starts a named part, when one file holds several messages
//   {word}                            a fact, filled in by code
//   {if_word}                         prints nothing; the paragraph it is in is kept only when the fact is true
//   {{NAME}}                          the customer's first name, put in last (see restore in redact.js)
//   [CAPITALS?]                       a blank the owner fills in; the page highlights it

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const cache = new Map();

/** Reads voice/<name>. Returns { text, snippets, sections }, or null when the file is missing. Edits take effect at once. */
export function template(name) {
  const file = path.join(config.voiceDir, name);
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  const hit = cache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.value;
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => !l.startsWith('#'));
  const snippets = {};
  const sections = {};
  const body = [];
  let part = null;
  const tidy = (rows) => rows.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  for (const l of lines) {
    const head = l.match(/^={3,}\s*([a-z0-9_]+)\s*={3,}\s*$/i);
    if (head) { part = head[1].toLowerCase(); sections[part] = []; continue; }
    const m = l.match(/^@([a-z0-9_]+):\s*(.+)$/);
    // "\n" typed in a snippet is a line break, so one line of the file can hold a short list.
    if (m) { snippets[m[1]] = m[2].trim().replace(/\\n/g, '\n'); continue; }
    (part ? sections[part] : body).push(l);
  }
  for (const k of Object.keys(sections)) sections[k] = tidy(sections[k]);
  const value = { text: tidy(body), snippets, sections };
  cache.set(file, { mtime: stat.mtimeMs, value });
  return value;
}

/** Puts values into {word} places. A place with no value given is left as it is. */
export const fill = (text, values) => String(text).replace(/\{([a-z0-9_]+)\}/g, (m, k) => (k in values && values[k] !== null && values[k] !== undefined ? values[k] : m));

/**
 * Fills a message paragraph by paragraph, leaving out what does not apply:
 *   - a paragraph with {if_word} stays only when that fact is true;
 *   - a line that is nothing but a {word} which does not apply is dropped;
 *   - a paragraph whose sentence needs a {word} which does not apply is dropped whole.
 * "Does not apply" is the value null. An empty text prints nothing and keeps the sentence. A
 * fact that is wanted but unknown should be given as a blank, such as [SOLD PRICE?], so the
 * paragraph stays and the page asks for it.
 */
export function fillParts(text, values) {
  const off = (k) => k in values && (values[k] === null || values[k] === false);
  const out = [];
  for (const para of String(text).split(/\n\s*\n/)) {
    const conditions = [...para.matchAll(/\{(if_[a-z0-9_]+)\}/g)].map((m) => m[1]);
    if (conditions.some((k) => !values[k])) continue;
    const kept = [];
    let dropped = false;
    for (const line of para.replace(/\{if_[a-z0-9_]+\}/g, '').split('\n')) {
      const only = /^\s*(\{[a-z0-9_]+\}\s*)+$/.test(line); // a line that is nothing but facts
      const missing = [...line.matchAll(/\{([a-z0-9_]+)\}/g)].map((m) => m[1]).filter(off);
      if (missing.length) { if (only) continue; dropped = true; break; }
      const filled = fill(line, values);
      // A line of facts that turned out empty is left out. One that fills to several lines keeps them all.
      if (only && !filled.trim()) continue;
      kept.push(filled);
    }
    if (dropped) continue;
    if (kept.join('').trim()) out.push(kept.join('\n'));
  }
  return out.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** {word} places that were never filled: a typing slip in the file, or a fact the code does not supply. */
export const unfilled = (text) => [...new Set(String(text || '').match(/\{[a-z0-9_]+\}/g) || [])];
