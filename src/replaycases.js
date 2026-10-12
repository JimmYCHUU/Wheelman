// The past exchanges a replay or a review runs on: a customer message that one of our people
// answered, taken as the conversation stood at that moment, with the real answer kept aside so a
// suggestion can be written as if it had not been. Shared by scripts/replay.js and scripts/review.js.

import { buildItem, finishItem } from './items.js';
import { attribute, cleanForExample, buildFrequencyIndex, stripSignature, stripLocationBlock } from './voice.js';
import { isAcknowledgement } from './text.js';

/**
 * The conversation as it stood just before our reply at position `cut`, judged as it would have
 * been at that moment: who was waiting, whether they were already a buyer, which car.
 */
export const itemAt = (full, cut, at) => finishItem({
  itemKey: full.itemKey, channel: 'sms', lead: full.lead, hasLeadRecord: full.hasLeadRecord,
  conversation: full.conversation, conversationId: full.conversationId, phone: full.phone,
}, full.timeline.slice(0, cut), { now: at });

/**
 * Candidate cases: a customer message followed by a genuine reply from one of the voices, one per
 * conversation, newest conversations first.
 * only: 'buyers' (people who had already bought), 'first' (first replies to brand-new enquiries,
 * where the reply need not be a clean example of someone's own writing), or null.
 * since: only replies sent after this time. situation: only this primary situation.
 */
export function collectCases(db, { only = null, since = 0, situation = '' } = {}) {
  const isFrequentTemplate = buildFrequencyIndex(db.prepare("SELECT conversation_id, body FROM messages WHERE direction = 'OUT'").all());
  const cases = [];
  for (const conv of db.prepare('SELECT id FROM conversations ORDER BY latest_at DESC').all()) {
    const full = buildItem({ conversationId: conv.id });
    if (!full) continue;
    const t = full.timeline;
    for (let i = 1; i < t.length; i++) {
      const e = t[i];
      if (e.who !== 'us' || e.internal) continue;
      if (t[i - 1].who !== 'customer') continue;
      if (since && e.at < since) continue;
      const author = attribute(e.by, e.text);
      if (only !== 'first') {
        if (!author) continue;
        if (!cleanForExample({ body: e.text, conversation_id: conv.id }, isFrequentTemplate).body) continue;
      }
      const pending = [];
      for (let k = i - 1; k >= 0 && t[k].who === 'customer'; k--) pending.unshift(t[k]);
      const text = pending.map((p) => p.text).filter(Boolean).join('\n');
      if (!text || pending.every((p) => !p.text || isAcknowledgement(p.text))) continue;
      const item = itemAt(full, i, e.at);
      if (item.state !== 'awaiting') continue;
      if (only === 'buyers' && !item.deal) continue;
      if (only === 'first' && !item.isNewEnquiry) break; // only the very first reply can qualify
      if (situation && item.situation.primary !== situation) continue;
      // Their whole answer may span two or three texts sent within minutes.
      const actual = [];
      for (let k = i; k < t.length && t[k].who === 'us' && !t[k].internal && t[k].at - e.at < 15 * 60 * 1000; k++) actual.push(only === 'first' ? stripSignature(t[k].text) : stripSignature(stripLocationBlock(t[k].text)));
      cases.push({ conversationId: conv.id, cut: i, author, actual: actual.filter(Boolean).join('\n'), situation: item.situation.primary, at: e.at });
      break; // one case per conversation keeps the sample varied
    }
  }
  return cases;
}

/** Up to `wanted` cases, taken in turns from each situation so the sample is varied. */
export function spread(cases, wanted) {
  const bySituation = new Map();
  for (const c of cases) { if (!bySituation.has(c.situation)) bySituation.set(c.situation, []); bySituation.get(c.situation).push(c); }
  const sample = [];
  while (sample.length < wanted && [...bySituation.values()].some((a) => a.length)) {
    for (const arr of bySituation.values()) { if (arr.length && sample.length < wanted) sample.push(arr.shift()); }
  }
  return sample;
}
