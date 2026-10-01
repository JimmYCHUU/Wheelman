// The people whose writing sets the voice, and the names of other staff.
//
// Names are kept out of the code. They live in voice/people.json on this computer, which git
// never sees. voice/people.example.json shows the shape with invented names, and is what a
// fresh copy (and the tests) use.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NEVER = '(?!x)x'; // a pattern that matches nothing, for when no names are configured

let cache = null;

export function loadPeople() {
  if (cache) return cache;
  const chosen = process.env.VOICE_PEOPLE_FILE
    ? path.resolve(config.root, process.env.VOICE_PEOPLE_FILE)
    : path.join(config.voiceDir, 'people.json');
  const file = fs.existsSync(chosen) ? chosen : path.join(config.voiceDir, 'people.example.json');
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no file: nobody is attributed */ }

  const voices = (raw.voices || []).map((v) => ({
    id: String(v.id),
    display: String(v.display || v.id),
    logins: (v.logins || []).map(String),
    sharedLogin: !!v.sharedLogin, // other people also send from this login, so the signature decides
    names: (v.names || []).map((n) => String(n).toLowerCase()),
    surnames: (v.surnames || []).map((n) => String(n).toLowerCase()),
  }));
  const names = voices.flatMap((v) => v.names);
  const surnames = voices.flatMap((v) => v.surnames);
  const otherStaff = (raw.otherStaff || []).map(String);

  cache = {
    voices,
    otherStaff,
    cannedPatterns: (raw.cannedPatterns || []).map(String),
    namesPattern: names.length ? names.map(escapeRe).join('|') : NEVER,
    surnamesPattern: surnames.length ? surnames.map(escapeRe).join('|') : NEVER,
    // Every staff first name, for recognising "Thanks <name>" as a plain thank-you.
    words: [...new Set([...names, ...otherStaff.flatMap((n) => n.toLowerCase().split(/\s+/))])],
  };
  return cache;
}

/** The name shown on the page for whoever sent a message: a first name instead of a login. */
export function displayNameFor(sentBy) {
  if (!sentBy) return sentBy;
  const v = loadPeople().voices.find((x) => x.logins.includes(sentBy));
  return v ? v.display : sentBy;
}

/** The first name of one of the voices, from its id. */
export function displayOfVoice(id) {
  const v = loadPeople().voices.find((x) => x.id === id);
  return v ? v.display : id === 'both' ? 'both' : String(id || '');
}

export const namePattern = (v) => (v.names.length ? v.names.map(escapeRe).join('|') : NEVER);
