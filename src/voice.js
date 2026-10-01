// Decides which past messages were genuinely written by the people whose voice we learn,
// and cleans them into examples. Who those people are is read from voice/people.json.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { squash, wordCount } from './text.js';
import { loadPeople, namePattern } from './people.js';

let exclusions = null;
export function loadExclusions() {
  if (exclusions) return exclusions;
  const raw = JSON.parse(fs.readFileSync(path.join(config.voiceDir, 'exclusions.json'), 'utf8'));
  const people = loadPeople();
  exclusions = {
    conversations: new Set(Object.values(raw.conversations).flat().map(Number)),
    canned: [...raw.cannedPatterns, ...people.cannedPatterns].map((p) => new RegExp(p, 'i')),
    otherStaff: people.otherStaff,
  };
  return exclusions;
}

const SIGNED = /(regards|from carbarn|\bhere\b|this is|my name is|it'?s|thanks?,?\s*$)/i;

// Patterns that depend on the configured names, built once.
let rx = null;
function patterns() {
  if (rx) return rx;
  const p = loadPeople();
  const N = p.namesPattern;
  const S = p.surnamesPattern;
  rx = {
    signLine: [
      /^(kind |warm |best |many )?regards,?\.?$/i,
      new RegExp(`^((kind |warm |best )?regards,?\\s*)?(${N})(\\s+(${S}))?(\\s+(from|at|@)\\s+carbarn)?\\.?$`, 'i'),
      /^(team\s+)?carbarn\.?$/i,
      /^(📞\s*)?(\+?61|0)[\d\s-]{8,12}$/,
      new RegExp(`^(thanks|thank you|cheers),?\\s*(${N})\\.?$`, 'i'),
    ],
    // Inline sign-offs: "... tomorrow morning. Regards, <name> from Carbarn"
    inlineRegards: new RegExp(`[\\s,]*(kind |warm |best )?regards,?\\s*(${N})(\\s+(from|at)\\s+carbarn)?\\.?\\s*$`, 'i'),
    inlineFrom: new RegExp(`[\\s,]*\\b(${N})\\s+(from|at)\\s+carbarn\\.?\\s*$`, 'i'),
    // Self-introductions: "<name> here from Carbarn." / "This is <name> from Carbarn."
    selfIntro: new RegExp(`(^|[\\n.!?,]\\s*)((this is|it'?s|it is|my name is)\\s+)?(${N})(\\s+here)?(\\s+(from|at)\\s+carbarn)?(\\s+here)?\\s*[.!]\\s*`, 'gi'),
    thirdPerson: new RegExp(`\\b(call|ask for|speak (to|with)|contact)\\s+(${N})\\b`, 'i'),
    anyName: new RegExp(`\\b(${N})\\b`, 'i'),
  };
  return rx;
}

/** True when the message is signed by this person: their name at the end, or a self-introduction at the start. */
function signedBy(voice, body) {
  const n = namePattern(voice);
  const b = String(body || '');
  if (!SIGNED.test(b)) return false;
  const tail = b.split('\n').slice(-3).join(' ');
  const head = b.split('\n').slice(0, 2).join(' ');
  return new RegExp(`\\b(${n})\\b`, 'i').test(tail)
    || new RegExp(`\\b(${n})\\b.{0,20}\\b(here|from carbarn)`, 'i').test(head)
    || new RegExp(`\\b(this is|my name is|it'?s)\\s+(${n})\\b`, 'i').test(head);
}

/** Who wrote an outgoing message: the id of one of the configured voices, or null (someone else / unknown). */
export function attribute(sentBy, body) {
  const { voices } = loadPeople();
  const owner = voices.find((v) => v.logins.includes(sentBy));
  if (owner) {
    if (!owner.sharedLogin) return owner.id;
    // Other people also send from this login. A signature by exactly one other voice decides.
    const others = voices.filter((v) => v !== owner && signedBy(v, body));
    return others.length === 1 && !signedBy(owner, body) ? others[0].id : owner.id;
  }
  if (sentBy === null || sentBy === undefined || sentBy === '') {
    const who = voices.filter((v) => signedBy(v, body));
    return who.length === 1 ? who[0].id : null;
  }
  return null;
}

/** Removes the standard location/hours block, leaving any personal line typed above it. */
export function stripLocationBlock(body) {
  const b = String(body || '');
  if (!/📍/.test(b)) return b;
  return b.split('📍')[0].trim();
}

/** Removes the sender's own name, sign-off and phone line from the end of a message. */
export function stripSignature(body) {
  const { signLine, inlineRegards, inlineFrom, selfIntro } = patterns();
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || signLine.some((re) => re.test(last))) lines.pop(); else break;
  }
  let t = lines.join('\n');
  t = t.replace(inlineRegards, '');
  t = t.replace(inlineFrom, '');
  selfIntro.lastIndex = 0;
  t = t.replace(selfIntro, (m, lead) => (/[,]/.test(lead) ? lead.replace(/,\s*$/, ',\n') : lead));
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const normForFrequency = (s) => squash(s).toLowerCase()
  .replace(/https?:\/\/\S+/g, '<url>')
  .replace(/\$?\d[\d,.]*/g, '#')
  .replace(/^(hi|hello|hey|good (morning|afternoon|evening)|dear|thanks|thank you)[ ,]+[a-z'’-]+[,.! ]+/i, '$1 <name> ');

/** Wording used in three or more different conversations is a template, not personal writing. */
export function buildFrequencyIndex(allOutgoing) {
  const index = new Map();
  for (const m of allOutgoing) {
    const k = normForFrequency(stripLocationBlock(m.body));
    if (k.length < 25) continue;
    if (!index.has(k)) index.set(k, new Set());
    index.get(k).add(m.conversation_id);
  }
  return (body) => {
    const k = normForFrequency(body);
    return k.length >= 25 && (index.get(k)?.size || 0) >= 3;
  };
}

/** Messages that read as written by an AI tool rather than typed by the person. */
export function looksMachineWritten(body) {
  const b = String(body || '');
  const dash = /\S\s[—–]\s\S/.test(b);
  const curlyContractions = (b.match(/\b\w+’(ll|re|ve|d|s|t)\b/g) || []).length;
  const stock = /(i’d recommend|i'd recommend|just let (me|us) know|happy to help|we’ll keep an eye out|understood —|thanks for (your|the) (enquiry|message|update)\. )/i.test(b);
  return (dash && curlyContractions >= 1) || (stock && curlyContractions >= 2) || (dash && stock);
}

export function signedByOtherStaff(body) {
  const ex = loadExclusions();
  const tail = String(body || '').split('\n').slice(-3).join(' ');
  const head = String(body || '').split('\n').slice(0, 2).join(' ');
  return ex.otherStaff.some((n) => {
    const name = n.replace(/\s+/g, '\\s+');
    return new RegExp(`(regards|thanks|cheers)[,\\s]*${name}\\b`, 'i').test(tail)
      || new RegExp(`\\b${name}\\s+(from|at)\\s+carbarn`, 'i').test(tail + ' ' + head)
      || new RegExp(`\\b${name}\\s+here\\b`, 'i').test(head);
  });
}

/**
 * Returns the cleaned body if the message is usable as a style example, otherwise null with a reason.
 */
export function cleanForExample(message, isFrequentTemplate) {
  const ex = loadExclusions();
  const { thirdPerson, anyName } = patterns();
  const raw = String(message.body || '');
  if (ex.conversations.has(Number(message.conversation_id))) return { reason: 'excluded conversation' };
  if (ex.canned.some((re) => re.test(raw))) return { reason: 'canned wording' };
  if (signedByOtherStaff(raw)) return { reason: 'signed by other staff' };
  if (thirdPerson.test(raw)) return { reason: 'refers to them in third person' };

  let body = stripSignature(stripLocationBlock(raw));
  body = body.replace(/^(hello|hi),?\s*$/i, '').trim();
  if (!body) return { reason: 'empty after cleaning' };
  if (/^(https?:\/\/\S+\s*)+$/.test(body)) return { reason: 'link only' };
  if (isFrequentTemplate(body)) return { reason: 'repeated template' };
  if (looksMachineWritten(raw)) return { reason: 'machine written' };
  if (body.length > 700) return { reason: 'too long' };
  if (wordCount(body) < 2) return { reason: 'too short' };
  if (anyName.test(body)) return { reason: 'mentions staff by name' };
  if (/\?{2,}|!{2,}/.test(body)) return { reason: 'sharp tone' };
  return { body };
}

/** Names in greetings that the lead record could not match. */
export function maskGreetingNames(text) {
  const notNames = /^(there|team|guys|mate|all|again|sir|bro|brother|buddy|everyone|folks|you|we|i|it|the|this|that|for|so|very|much|heaps|and|please|yes|no|ok|okay)$/i;
  return String(text || '')
    .replace(/^(\s*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|thanks|thank you|no worries|sure|yes|sorry)),?[ \t]+([\p{L}'’-]{2,16})\b(?=[ \t]*[,.!]|[ \t]*$)/gimu, (m, greet, name) => (/^\p{Lu}/u.test(name) && !notNames.test(name) ? `${greet} {{NAME}}` : m))
    // A name used at the end of a sentence: "That's all we have on the board, <Name>."
    .replace(/(,[ \t]*)([A-Z][a-z'’-]{2,15})(\.[ \t]*$)/gm, (m, a, name, c) => (/^(Sydney|Lidcombe|Japan|Australia|Toyota|Honda|Nissan|Mazda|Subaru|Mitsubishi|Hiace|Alphard|Carbarn|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Yes|No|Thanks|Regards|Cheers|Sorry|Sure|Okay|Please|Unfortunately|Today|Tomorrow)$/.test(name) ? m : `${a}{{NAME}}${c}`));
}

/** A customer's name at the end of their own message: "Regards\n<Name>". */
export function maskCustomerSignOff(text) {
  return String(text || '')
    .replace(/((?:kind |best |warm )?regards|thanks|thank you|cheers|from),?\s*\n?\s*([A-Z][a-z'’-]{1,15}(?:\s+[A-Z][a-z'’-]{1,15})?)\s*\.?\s*$/g, (m, word) => `${word}\n[NAME]`)
    .replace(/\b(my name is|this is|i am|i'm|it'?s)\s+([A-Z][a-z'’-]{1,15})\b(?=\s*(here|from|\.|,|$))/g, (m, lead) => `${lead} [NAME]`);
}
