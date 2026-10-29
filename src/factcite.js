// Which business facts a suggestion used, for the trust line under the box, and which it needed that
// have no answer yet, for the line above it. Asked about is the compact style's own rule (topicScore,
// as relevantFacts ranks topics): a title word counts 2, an answer word 1, and 2 or more is asked
// about. A fact is used only when the AI's words also share 2 of its answer's words, so one that
// was only given to the AI in the request is never named. The drafter calls these only for a reply
// the AI wrote from the whole request: never a template, an auction message or code's own wording.

import { topicScore, factWords } from './knowledge.js';

/** Topics asked about, best first, in the file's order where they score the same. */
function askedAbout(topics, asked, { titleOnly = false } = {}) {
  const out = [];
  (topics || []).forEach((t, order) => {
    const score = topicScore(t, asked, { titleOnly });
    if (score >= 2) out.push({ t, score, order });
  });
  return out.sort((a, b) => b.score - a.score || a.order - b.order).map((x) => x.t);
}

/**
 * The answered facts the reply used: [{ title, status, at }], at most `max`, best first. `at` is when
 * the answer in use was saved in the Playbook, or null for the facts file's own.
 */
export function citedTopics({ asked = '', reply = '', topics = [], max = 3 } = {}) {
  const said = new Set(factWords(reply));
  const shares = (t) => new Set(factWords(t.answer).filter((w) => said.has(w))).size >= 2;
  return askedAbout((topics || []).filter((t) => t.status !== 'needs_answer'), asked)
    .filter(shares).slice(0, max)
    .map((t) => ({ title: t.title, status: t.status, at: t.at ?? null }));
}

/** The titles of facts with no answer that the customer asked about, when the reply has a [CHECK?] blank: at most `max`, best first. */
export function openTopics({ asked = '', reply = '', topics = [], max = 2 } = {}) {
  if (!String(reply || '').includes('[CHECK?]')) return [];
  return askedAbout((topics || []).filter((t) => t.status === 'needs_answer'), asked, { titleOnly: true })
    .slice(0, max).map((t) => t.title);
}
