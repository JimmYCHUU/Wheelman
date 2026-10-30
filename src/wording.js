// The wording the Playbook edits: the templates (voice/*-messages.md and the blocks) and the voice
// rules (house-voice.md, sales-playbook.md and the compact voice card). A save in the Playbook is a
// row of playbook_versions (src/db.js), laid over its part of the file whenever the file is read:
// templates through templateLines (template() in src/templates.js parses it), voice rules through
// voiceText. The files are only ever read: no wording file is written. With nothing saved, every
// file reads exactly as it did.
//
// A preview (withPreview) lays changed words over one part for one call chain only, held in an
// AsyncLocalStorage store: any other caller, at the same moment, reads as before.
//
// This module imports only node:fs, node:path, node:async_hooks, config.js and db.js, because
// templates.js, auction.js and eligible.js import it. Listing and saving are in src/wordingedit.js.

import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';
import { latestVersions } from './db.js';

/**
 * The files the Playbook edits, in the order it lists them: { name, kind, group, label }. `kind`
 * is playbook_versions.kind; `group` is where the Playbook shows the file.
 */
export const WORDING = Object.freeze([
  { name: 'dashboard-messages.md', kind: 'template', group: 'Dashboard', label: 'Dashboard messages' },
  { name: 'marketplace-messages.md', kind: 'template', group: 'Marketplace', label: 'Marketplace messages' },
  { name: 'importquery-messages.md', kind: 'template', group: 'Imports', label: 'Imports messages' },
  { name: 'auction-messages.md', kind: 'template', group: 'Auction', label: 'Auction messages' },
  { name: 'price-reply.md', kind: 'template', group: 'Blocks', label: 'Price reply' },
  { name: 'first-reply.md', kind: 'template', group: 'Blocks', label: 'First-reply details' },
  { name: 'inspection-invite.md', kind: 'template', group: 'Blocks', label: 'Invitation to see the car' },
  { name: 'auction-offer.md', kind: 'template', group: 'Blocks', label: 'Auction offer' },
  { name: 'import-ask.md', kind: 'template', group: 'Blocks', label: 'First reply to an import enquiry' },
  { name: 'house-voice.md', kind: 'voice', group: 'Voice', label: 'The Carbarn voice' },
  { name: 'sales-playbook.md', kind: 'voice', group: 'Selling', label: 'Sales playbook' },
  { name: 'compact/voice-card.md', kind: 'voice', group: 'Voice', label: 'The short voice card, for compact requests' },
].map((w) => Object.freeze(w)));

const listed = (name) => WORDING.find((w) => w.name === name) || null;

/** A line that starts a named part of a template file: ===== name =====. */
export const PART_HEADER = /^={3,}\s*([a-z0-9_]+)\s*={3,}\s*$/i;

// The voice card's opening comment is for whoever edits the file, and is never sent (voiceCard in
// src/prompt.js takes it out), so its part leaves it out too.
const CARD = 'compact/voice-card.md';
const NOT_SENT = /<!--[\s\S]*?-->/g;
const sent = (name, text) => (name === CARD ? text.replace(NOT_SENT, '') : text);

const preview = new AsyncLocalStorage();

/**
 * Runs fn with `text` laid over one part of one file, for fn's own call chain only (Task 2's
 * preview of a template change). Returns what fn returns.
 */
export function withPreview({ name, part, text }, fn) {
  return preview.run({ name: String(name ?? ''), part: String(part ?? ''), text: String(text ?? '') }, fn);
}

/** True inside withPreview: a cache must neither be read nor be written there. */
export const inPreview = () => !!preview.getStore();

/** A file under voice/ with its line ends made plain, or null when it is missing. */
function read(name) {
  try { return fs.readFileSync(path.join(config.voiceDir, name), 'utf8').replace(/\r/g, ''); } catch { return null; }
}

/** A template file's lines with its notes (lines starting with #) taken out, as template() reads them. */
function ownLines(name) {
  const text = read(name);
  return text === null ? null : text.replace(/^﻿/, '').split('\n').filter((l) => !l.startsWith('#'));
}

/** A template file's lines in parts: [{ part, header, lines }], part '' (header null) first, holding the lines before the first header. */
function templateSegments(lines) {
  const out = [{ part: '', header: null, lines: [] }];
  for (const l of lines) {
    const head = l.match(PART_HEADER);
    if (head) out.push({ part: head[1].toLowerCase(), header: l, lines: [] });
    else out[out.length - 1].lines.push(l);
  }
  return out;
}

/**
 * A voice file in parts: [{ part, head, body }] whose heads and bodies, joined, are the file. A
 * part is a "## " heading's lines, keyed by the heading's words; part '' (head '') is everything
 * before the first heading.
 */
function voiceSegments(text) {
  const chunks = text.split(/^(?=## )/m);
  const out = [];
  if (!chunks[0].startsWith('## ')) out.push({ part: '', head: '', body: chunks.shift() });
  for (const c of chunks) {
    const end = c.indexOf('\n');
    const head = end < 0 ? c : c.slice(0, end + 1);
    out.push({ part: head.slice(3).trim(), head, body: end < 0 ? '' : c.slice(end + 1) });
  }
  return out;
}

/** Each part once, in the file's order; an empty part '' (nothing before the first header or heading) is not one. */
function parts(list) {
  const out = new Map();
  for (const p of list) if (p.part || p.text) out.set(p.part, p.text);
  return [...out].map(([part, text]) => ({ part, text }));
}

/**
 * The parts of a file the Playbook edits, read from the file alone: [{ part, text }]; [] for a
 * missing file or one it does not list.
 *   - a template file with ===== id ===== lines: each part's lines, its @ lines included, up to
 *     the next header; part '' is the lines before the first header (the short pieces);
 *   - a template file with none: part '' is every line;
 *   - a voice file: each "## " heading's lines under it, keyed by the heading's words; part '' is
 *     everything before the first heading.
 * Template parts never hold the note lines. Voice parts keep the file's text as the AI is sent it.
 */
export function fileParts(name) {
  const w = listed(name);
  if (!w) return [];
  if (w.kind === 'voice') {
    const text = read(name);
    return text === null ? [] : parts(voiceSegments(text).map((s) => ({ part: s.part, text: sent(name, s.body).trim() })));
  }
  const lines = ownLines(name);
  return lines ? parts(templateSegments(lines).map((s) => ({ part: s.part, text: s.lines.join('\n').trim() }))) : [];
}

/**
 * The words laid over each part of a file: its newest saved version, then the preview's words for
 * its part when inside one. A newest version with a status of its own (such as 'file', which puts
 * the file's own words back in use) lays nothing: that part is the file's.
 */
function laidOver(w) {
  const out = new Map();
  for (const [part, v] of latestVersions(w.kind, w.name)) if (!v.status) out.set(part, v.text);
  const p = preview.getStore();
  if (p && p.name === w.name) out.set(p.part, p.text);
  return out;
}

/**
 * A template file's lines, notes taken out, with each part saved in the Playbook laid over it, and
 * the preview's part when inside one; null when the file is missing. `playbook: false` gives the
 * file's own lines. A file the Playbook does not list is read as it is.
 */
export function templateLines(name, { playbook = true } = {}) {
  const lines = ownLines(name);
  const w = listed(name);
  if (!lines || !playbook || !w || w.kind !== 'template') return lines;
  const over = laidOver(w);
  if (!over.size) return lines;
  return templateSegments(lines).flatMap((s) => [...(s.header === null ? [] : [s.header]), ...(over.has(s.part) ? over.get(s.part).split('\n') : s.lines)]);
}

/** A part's body with other words in it, the blank lines around it kept as the file has them. */
function laidBody(body, words) {
  if (!body.trim()) return `\n${words}\n\n`;
  const lead = body.length - body.trimStart().length;
  const trail = body.length - body.trimEnd().length;
  return body.slice(0, lead) + words + body.slice(body.length - trail);
}

/**
 * A voice file's text, trimmed, with each section saved in the Playbook laid over it, and the
 * preview's section when inside one; null when the file is missing. `playbook: false` gives the
 * file's own text. With nothing laid over, it is the file's text exactly as a request was sent it.
 */
export function voiceText(name, { playbook = true } = {}) {
  const text = read(name);
  if (text === null) return null;
  const w = listed(name);
  const over = playbook && w && w.kind === 'voice' ? laidOver(w) : new Map();
  if (!over.size) return text.trim();
  return voiceSegments(text).map((s) => s.head + (over.has(s.part) ? laidBody(s.body, over.get(s.part)) : s.body)).join('').trim();
}
