// A customer who signs a text ("Thanks, Liam", "It's Mark here", "My name is Jo Smith") has told us
// their name. When the dashboard has no name for the number, that is the name the page shows, with
// the number beneath it. It is a label for the reader only: it never reaches the AI and is never
// used in a greeting, so a wrong guess can mislead nobody but the person looking at the list.

import { loadPeople } from './people.js';
import { isPlaceholderName } from './redact.js';

const NAME = String.raw`([A-Z][a-z]{1,15}(?:\s[A-Z][a-z]{1,15})?)`;
// "Thanks, Liam" / "Cheers Mark" / "Kind regards, Jo Smith" at the end of the text.
const SIGN_OFF = new RegExp(String.raw`(?:thanks|thank you|thankyou|cheers|regards|kind regards|best regards|many thanks|ta)[,.!]*\s+${NAME}\s*[.!]*$`, 'i');
// "It's Mark", "it is Mark", "this is Mark", "my name is Mark", "I'm Mark" (but not "I'm interested").
const INTRO = new RegExp(String.raw`(?:^|[.!?,]\s*|\s)(?:it'?s|it is|this is|my name is|i am|i'm)\s+${NAME}\b(?!\s+(?:interested|looking|after|wondering|keen|calling|texting|asking|happy|hoping|trying|waiting|chasing|wanting|going|coming|still|just|now|not|from|at|in|on))`, 'i');
// "Mark here" or "Hi, Mark here" at the start of the text.
const HERE = new RegExp(String.raw`^(?:hi|hello|hey|g'day|good (?:morning|afternoon|evening))?[,!. ]*${NAME}\s+here\b`, 'i');

// Words that take a capital in a text but are not anybody's name.
const NOT_A_NAME = new Set(`
  mate guys team carbarn sir boss bro buddy man dude again heaps alot lot much very so you all everyone anyway
  now that this it the a i in for to my me sorry ok okay yes no just not also still good fine happy keen free
  available busy sure ready back home away going coming done well glad able unable open down up off out on over
  come here there right click from been get got next last today tomorrow tonight yesterday morning afternoon
  evening weekend monday tuesday wednesday thursday friday saturday sunday january february march april may june
  july august september october november december carsales facebook marketplace gumtree customer buyer seller
  interested looking wondering asking calling texting waiting
`.split(/\s+/).filter(Boolean));

// The patterns match any case so the lead-in words do; the name itself must be written as a name,
// Capitalised. "Mark here" keeps "Mark"; "liam" is not taken for a name.
const CAPITALISED = /^[A-Z][a-z]{1,15}$/;
function properName(raw) {
  const words = [];
  for (const w of raw.split(' ')) { if (!CAPITALISED.test(w)) break; words.push(w); }
  return words.join(' ');
}

/** The name signed in one text, as written, or '' when there is none. */
export function signedNameIn(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  for (const re of [SIGN_OFF, INTRO, HERE]) {
    const m = t.match(re);
    if (!m) continue;
    const name = properName(m[1].trim());
    if (!name) continue;
    const first = name.split(' ')[0].toLowerCase();
    if (NOT_A_NAME.has(first) || isPlaceholderName(name) || loadPeople().words.includes(first)) continue;
    return name;
  }
  return '';
}

/**
 * The name a customer signed in a conversation: the fullest form of the one first name they used.
 * '' when nothing is signed, or when two different names are (two people on one number, or a guess
 * that would be wrong either way).
 */
export function signedName(timeline) {
  const names = new Map(); // first name, lower-cased -> the fullest form seen
  for (const e of timeline || []) {
    if (e.who === 'us' || e.internal || !e.text) continue;
    const n = signedNameIn(e.text);
    if (!n) continue;
    const k = n.split(' ')[0].toLowerCase();
    if (!names.has(k) || n.length > names.get(k).length) names.set(k, n);
  }
  return names.size === 1 ? [...names.values()][0] : '';
}
