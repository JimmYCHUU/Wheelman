// The Playbook's Templates and Voice tabs in words: the wording in groups, whether Save may be
// pressed, each saved version of a part, and the lines beside the editor. Pure functions (no DOM,
// no globals); the tests import them in Node.
import { dayLabel } from '../../lib/format.js';

const GROUPS = { templates: ['Dashboard', 'Marketplace', 'Imports', 'Auction', 'Blocks'], voice: ['Voice', 'Selling'] };

/** A day in the middle of a line: "today", "yesterday" or "Thursday 29 October". */
const dayInLine = (at, now) => { const d = dayLabel(at, now); return /^(Today|Yesterday)$/.test(d) ? d.toLowerCase() : d; };

// A line that is only a greeting, "Hello {{NAME}}," or "Good morning {{NAME}},": every message
// opens alike, so it says nothing about which message it is.
const GREETING_ONLY = /^(hello|hi|dear|good (morning|afternoon|evening))\b[^.!?]{0,40},$/i;

/**
 * A part's first line, for a list to scan: the first line a customer reads, with a message's @
 * lines, a line that is only a {word} (such as {greeting}) and a line that is only a greeting
 * passed over. Short pieces, which are all @ lines, give the first piece's words without its name;
 * words with no other line, the first of them. '' for none.
 */
export function firstLine(text) {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const read = lines.find((l) => !/^@[a-z0-9_]+:/.test(l) && !/^\{[a-z0-9_]+\}$/.test(l) && !GREETING_ONLY.test(l));
  if (read) return read;
  const piece = lines.find((l) => /^@[a-z0-9_]+:\s*\S/.test(l));
  return piece ? piece.replace(/^@[a-z0-9_]+:\s*/, '') : lines[0] || '';
}

/**
 * The parts of the wording files, as GET /api/playbook/wording lists them, in groups: [{ group,
 * parts: [{ name, kind, part, label, first, text, fileText, at, versions, fileChanged }] }]. The Templates
 * tab's groups are Dashboard, Marketplace, Imports, Auction and Blocks, in that order; with tab
 * 'voice', the Voice tab's, Voice and Selling. Each part is where the server lists it (the auction
 * file's enquiry messages under Imports), in the files' order and each file's own; an empty group
 * is left out.
 */
export function wordingGroups(files, tab = 'templates') {
  const all = (files || []).flatMap((f) => (f.parts || []).map((p) => ({
    group: p.group || f.group, name: f.name, kind: f.kind, part: p.part, label: p.label, first: firstLine(p.text), text: p.text,
    fileText: p.fileText ?? p.text, at: p.at ?? null, versions: p.versions || 0, fileChanged: !!p.fileChanged,
  })));
  return (GROUPS[tab] || GROUPS.templates)
    .map((group) => ({ group, parts: all.filter((p) => p.group === group).map(({ group: _, ...p }) => p) }))
    .filter((g) => g.parts.length);
}

/** Whether a template's Save may be pressed: only for the very words last shown on three conversations. */
export const canSave = (previewed, text) => !!previewed && previewed.text === text;

/** "Show how it reads", or "Show how it reads again" once the words have changed since they were shown. */
export const previewLabel = (previewed, text) => (previewed && previewed.text !== text ? 'Show how it reads again' : 'Show how it reads');

/** A preview's heading: the customer's name and car, "Dara · 2020 Toyota Voxy ZS". */
export const previewHead = (c) => [c.name, c.car].filter(Boolean).join(' · ');

/** "changed today" for wording saved in the Playbook; '' for the file's own. */
export const changedLine = (at, now = Date.now()) => (at ? 'changed ' + dayInLine(at, now) : '');

/** The line beside Save, for a part with `versions` saved: "Version 3. Every earlier version is kept." */
export const nextVersionLine = (versions) => 'Version ' + ((versions || 0) + 1) + '. Every earlier version is kept.';

/**
 * Every version of a part, as GET /api/playbook/versions gives them: [{ id, label, text, inUse? }].
 * "Version N, <day>" for each saved version, newest first (the newest, the wording in use, is
 * marked inUse), then the file's own: "In your file", or "What your file said first" when the file
 * says something else now (saidFirst).
 */
export function versionLines(out, now = Date.now()) {
  const saved = (out && out.versions) || [];
  const lines = saved.map((v, i) => ({ id: v.id, label: 'Version ' + (saved.length - i) + ', ' + dayInLine(v.at, now), text: v.text, ...(i === 0 ? { inUse: true } : {}) }));
  if (out && typeof out.file === 'string') lines.push({ id: null, label: out.saidFirst ? 'What your file said first' : 'In your file', text: out.file });
  return lines;
}
