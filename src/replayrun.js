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

// What llm.js says when no model could answer (the provider is down or busy).
const PROVIDER_DOWN = /No AI model could answer|AI models used for Marketplace could not answer/;

/**
 * A fetch that lets only the AI providers' hosts through: anything else is refused and counted by host.
 * Returns { fetch, blocked } where blocked is { host: count }.
 */
export function offlineFetch(allowedHosts, realFetch) {
  const allowed = new Set(allowedHosts.map((h) => String(h).toLowerCase()));
  const blocked = {};
  const guarded = async (input, init) => {
    let host = '';
    try { host = new URL(typeof input === 'string' ? input : input?.url ?? String(input)).host.toLowerCase(); } catch { host = String(input); }
    if (!allowed.has(host)) {
      blocked[host] = (blocked[host] || 0) + 1;
      throw new Error(`Replay is offline: blocked ${host}`);
    }
    return realFetch(input, init);
  };
  return { fetch: guarded, blocked };
}

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
  // A failed result does not count as done: a resume runs that case again. The newest line for a key and style wins.
  const done = new Set(resumeFrom.filter((r) => !r.error && r.worst !== 'fail').map((r) => `${r.key}|${r.style}`));
  const results = [];
  let threwRun = 0, downRun = 0;
  for (const [index, c] of cases.entries()) {
    const key = caseKey(c);
    const item = itemAt(buildItem({ conversationId: c.conversationId }), c.cut, c.at);
    for (const style of styles) {
      if (style === 'full' && sampleFull !== undefined && index >= sampleFull) continue;
      if (done.has(`${key}|${style}`)) continue;
      const t0 = Date.now();
      let d;
      let threw = null;
      try {
        d = await draft(item, { save: false, holdOutConversation: true, now: c.at, style });
      } catch (e) { threw = e; d = {}; }
      if (d.daily) return { results, stopped: 'daily' };
      const failed = !!threw || d.status !== 'ready';
      let r;
      if (failed) {
        const error = threw ? `threw: ${threw.message}` : String(d.error || 'The draft failed');
        r = {
          key, style, similarity: 0, salesOurs: 0, salesTheirs: sales(item, c.actual, d), worst: 'fail',
          tokensIn: d.usage?.in || 0, tokensOut: d.usage?.out || 0, model: d.model || '', ms: Date.now() - t0, error,
        };
        threwRun = threw ? threwRun + 1 : 0;
        downRun = !threw && PROVIDER_DOWN.test(error) ? downRun + 1 : 0;
      } else {
        threwRun = 0; downRun = 0;
        r = {
          key, style,
          similarity: d.reply ? similarity(comparable(d.reply), comparable(c.actual)) : 0,
          salesOurs: d.reply ? sales(item, d.reply, d) : 0,
          salesTheirs: sales(item, c.actual, d),
          worst: worst(d.checks || []),
          tokensIn: d.usage?.in || 0, tokensOut: d.usage?.out || 0,
          model: d.model || '', ms: Date.now() - t0,
        };
      }
      results.push(r);
      onResult?.(r);
      if (threwRun >= 3 || downRun >= 3) return { results, stopped: 'error' };
    }
  }
  return { results, stopped: null };
}
