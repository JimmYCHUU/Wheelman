// Runs past exchanges through a drafter in one or two prompt styles, one result per case and style,
// so full and compact can be compared on the same cases. The drafter is passed in: the real one in
// scripts/replay.js, a stand-in in the tests. Results go out one at a time (onResult) so a run that
// stops can be resumed.

import { buildItem } from './items.js';
import { itemAt } from './replaycases.js';
import { comparable } from './learn.js';
import { similarity } from './text.js';
import { worst } from './checks.js';
import { salesScore } from './selling.js';
import { farAway } from './situations.js';

export const caseKey = (c) => `${c.conversationId}:${c.cut}`;

const sales = (item, body, d) => salesScore({
  body: comparable(body), nextStep: d.nextStep, rung: d.rung, situations: item.situation.all, channel: 'sms',
  farAway: farAway(item.pendingText, item.lead?.state).far, firstReply: item.isNewEnquiry,
}).score;

/**
 * cases: from spread(). styles: e.g. ['full','compact']. sampleFull: full style only on the first n
 * cases (all when omitted). resumeFrom: earlier results; their case and style pairs are not run again.
 * Returns only the new results, and why it stopped: null (finished), 'daily' (allowance used up) or
 * 'error' (a draft failed or threw; everything before it is kept).
 */
export async function runReplay({ cases, styles, sampleFull, resumeFrom = [], draft, onResult }) {
  const done = new Set(resumeFrom.map((r) => `${r.key}|${r.style}`));
  const results = [];
  for (const [index, c] of cases.entries()) {
    const key = caseKey(c);
    const item = itemAt(buildItem({ conversationId: c.conversationId }), c.cut, c.at);
    for (const style of styles) {
      if (style === 'full' && sampleFull !== undefined && index >= sampleFull) continue;
      if (done.has(`${key}|${style}`)) continue;
      const t0 = Date.now();
      let d;
      try {
        d = await draft(item, { save: false, holdOutConversation: true, now: c.at, style });
      } catch { return { results, stopped: 'error' }; }
      if (d.daily) return { results, stopped: 'daily' };
      if (d.status !== 'ready') return { results, stopped: 'error' };
      const r = {
        key, style,
        similarity: d.reply ? similarity(comparable(d.reply), comparable(c.actual)) : 0,
        salesOurs: d.reply ? sales(item, d.reply, d) : 0,
        salesTheirs: sales(item, c.actual, d),
        worst: worst(d.checks || []),
        tokensIn: d.usage?.in || 0, tokensOut: d.usage?.out || 0,
        model: d.model || '', ms: Date.now() - t0,
      };
      results.push(r);
      onResult?.(r);
    }
  }
  return { results, stopped: null };
}
