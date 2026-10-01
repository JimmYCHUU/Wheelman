// Builds voice/examples.json: genuine replies by the people named in voice/people.json, from the dashboard conversations,
// each paired with the customer message it answered, with customer details removed.
// Runs by itself once a day while the app is open, and on demand with: npm run build-voice

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { openDb, getLead, getLeadByConversation, getMeta, setMeta } from './db.js';
import { buildTimeline } from './items.js';
import { attribute, cleanForExample, buildFrequencyIndex, maskGreetingNames, maskCustomerSignOff } from './voice.js';
import { redact } from './redact.js';
import { classify } from './situations.js';
import { isAcknowledgement, wordCount, squash } from './text.js';

const DAY = 24 * 3600 * 1000;

export function buildVoiceBank() {
  const db = openDb();
  const allOutgoing = db.prepare("SELECT conversation_id, body FROM messages WHERE direction = 'OUT'").all();
  const isFrequentTemplate = buildFrequencyIndex(allOutgoing);

  const conversations = db.prepare('SELECT id, lead_id FROM conversations').all();
  const examples = [];
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };

  for (const conv of conversations) {
    const lead = (conv.lead_id && getLead(conv.lead_id)) || getLeadByConversation(conv.id) || null;
    const timeline = buildTimeline(lead, conv.id).filter((e) => !e.internal);

    let i = 0;
    while (i < timeline.length) {
      if (timeline[i].who !== 'us') { i++; continue; }
      // A run of consecutive messages from us, with no customer message in between, is one reply.
      let j = i;
      while (j + 1 < timeline.length && timeline[j + 1].who === 'us' && timeline[j + 1].at - timeline[j].at < 15 * 60 * 1000) j++;
      const run = timeline.slice(i, j + 1);

      // What the customer said since our previous message.
      const before = [];
      for (let k = i - 1; k >= 0 && timeline[k].who === 'customer'; k--) before.unshift(timeline[k]);
      i = j + 1;

      const parts = [];
      const authors = new Set();
      for (const e of run) {
        const author = attribute(e.by, e.text);
        if (!author) { skip('not by one of the voices'); continue; }
        const cleaned = cleanForExample({ body: e.text, conversation_id: conv.id }, isFrequentTemplate);
        if (!cleaned.body) { skip(cleaned.reason); continue; }
        parts.push(cleaned.body);
        authors.add(author);
      }
      if (!parts.length) continue;

      const customerText = before.map((e) => e.text).filter(Boolean).join('\n').trim();
      const events = before.map((e) => e.event).filter(Boolean);
      if (!customerText && !events.length) { skip('no customer message to pair with'); continue; }
      if (customerText && !events.length && before.every((e) => !e.text || isAcknowledgement(e.text))) { skip('customer only said thanks'); continue; }

      const reply = parts.join('\n');
      const situation = classify(customerText, { events, leadStatus: lead?.status });
      examples.push({
        id: `${conv.id}-${run[0].key}`,
        conversationId: conv.id,
        author: authors.size === 1 ? [...authors][0] : 'both',
        situations: situation.all,
        primary: situation.primary,
        firstReply: !timeline.slice(0, timeline.indexOf(run[0])).some((e) => e.who === 'us'),
        customer: maskCustomerSignOff(redact(customerText, lead)).slice(0, 900),
        events: events.map((e) => redact(e, lead)),
        reply: maskGreetingNames(redact(reply, lead)),
        replyWords: wordCount(reply),
        at: run[0].at,
      });
    }
  }

  // Drop exact repeats of the same short reply so one stock phrase cannot dominate.
  const seen = new Map();
  const unique = examples.filter((e) => {
    const k = squash(e.reply).toLowerCase();
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return n < 2;
  });

  fs.mkdirSync(config.voiceDir, { recursive: true });
  fs.writeFileSync(path.join(config.voiceDir, 'examples.json'), JSON.stringify({ builtAt: new Date().toISOString(), count: unique.length, examples: unique }, null, 1));
  setMeta('voice_bank_built_at', Date.now());

  const tally = (f) => unique.reduce((o, e) => { const k = f(e); o[k] = (o[k] || 0) + 1; return o; }, {});
  const words = unique.map((e) => e.replyWords).sort((a, b) => a - b);
  return {
    count: unique.length,
    byAuthor: tally((e) => e.author),
    bySituation: Object.fromEntries(Object.entries(tally((e) => e.primary)).sort((a, b) => b[1] - a[1])),
    firstReplies: unique.filter((e) => e.firstReply).length,
    medianWords: words[Math.floor(words.length / 2)] || 0,
    p90Words: words[Math.floor(words.length * 0.9)] || 0,
    skipped: Object.fromEntries(Object.entries(skipped).sort((a, b) => b[1] - a[1])),
  };
}

/** Rebuild at most once a day. Returns the stats when it rebuilt, otherwise null. */
export function refreshVoiceBankIfStale(maxAgeMs = DAY) {
  const file = path.join(config.voiceDir, 'examples.json');
  const last = getMeta('voice_bank_built_at', 0);
  if (fs.existsSync(file) && Date.now() - last < maxAgeMs) return null;
  return buildVoiceBank();
}

export function voiceBankInfo() {
  return { builtAt: getMeta('voice_bank_built_at', null) };
}
