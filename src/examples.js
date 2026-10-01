// Picks the real past replies most useful as style examples for a given enquiry.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let bank = null;
let bankMtime = 0;

const STOP = new Set('a an the and or but if of to in on at for from with by is are was were be been it this that as we you your our us i my me do does did can could would will have has had not no yes so hi hello hey thanks thank please regards name'.split(' '));
const bag = (s) => new Set(String(s || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

export function loadExamples() {
  const file = path.join(config.voiceDir, 'examples.json');
  if (!fs.existsSync(file)) return [];
  const mtime = fs.statSync(file).mtimeMs;
  if (bank && mtime === bankMtime) return bank;
  bank = JSON.parse(fs.readFileSync(file, 'utf8')).examples.map((e) => ({ ...e, bag: bag(e.customer + ' ' + e.events.join(' ')) }));
  bankMtime = mtime;
  return bank;
}

/**
 * @param {object} q { situations: string[], primary, text, firstReply, excludeConversationId }
 */
export function pickExamples(q, max = 6) {
  const all = loadExamples().filter((e) => e.conversationId !== q.excludeConversationId);
  if (!all.length) return [];
  const want = bag(q.text);
  const scored = all.map((e) => {
    let score = 0;
    if (e.primary === q.primary) score += 3;
    for (const s of e.situations) if (q.situations.includes(s)) score += 1;
    let overlap = 0;
    for (const w of want) if (e.bag.has(w)) overlap++;
    score += want.size ? (overlap / Math.sqrt(want.size)) * 1.5 : 0;
    if (!!e.firstReply === !!q.firstReply) score += 0.7;
    if (e.replyWords >= 6 && e.replyWords <= 60) score += 0.5; // one-word and essay-length replies teach less
    if (!e.customer) score -= 0.5;
    return { e, score };
  }).sort((a, b) => b.score - a.score);

  // Keep both voices represented so the result stays a blend.
  const out = [];
  const perAuthor = {};
  const cap = Math.ceil(max * 0.67);
  const seenReply = new Set();
  for (const { e, score } of scored) {
    if (score < 1.5 && out.length >= 3) break;
    const k = e.reply.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    if (seenReply.has(k)) continue;
    if ((perAuthor[e.author] || 0) >= cap) continue;
    seenReply.add(k);
    perAuthor[e.author] = (perAuthor[e.author] || 0) + 1;
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}
