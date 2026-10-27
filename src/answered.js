// Who answered a conversation that is no longer waiting: Wheelman's own suggestion (copied or sent
// from here), an automatic reply, the phone, or a person on the dashboard. The new page says so.
import { similarity } from './text.js';
import { comparable } from './learn.js';

const MATCH = 0.8;

/** The customer message our reply answered: the newest one the customer wrote (staff notes aside). */
export function lastCustomerEntry(timeline) {
  for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].who === 'customer' && !timeline[i].internal) return timeline[i];
  return null;
}

/** What we sent in answer: our messages after the customer's last one, as one text. */
function sentTextAfter(timeline, customer) {
  const at = timeline.indexOf(customer);
  return timeline.slice(at + 1).filter((e) => e.who === 'us' && !e.internal && e.text).map((e) => e.text).join('\n');
}

/** True when the draft was copied or sent from Wheelman and what went out is that text. */
function sentFromWheelman(draft, sentText) {
  if (!draft || !(draft.copied_at || draft.sent_here_at)) return false;
  // The outcome the worker already recorded (a reply seen after the suggestion was copied).
  if (typeof draft.sent_text === 'string' && draft.similarity >= MATCH) return true;
  if (!sentText.trim()) return false;
  const sent = comparable(sentText);
  return [draft.edited_text, draft.reply, draft.copied_text]
    .filter((t) => typeof t === 'string' && t.trim())
    .some((t) => similarity(comparable(t), sent) >= MATCH);
}

/**
 * How a conversation was answered, or null while it is not: { how, by, at }.
 * how: 'wheelman' | 'auto' | 'phone' | 'dashboard'. by names the person only for 'dashboard'.
 * latestDraft is the newest suggestion for the customer message that was answered, or null.
 * nameOf turns a sender's login into the name the thread shows.
 */
export function answeredBy(timeline, latestDraft, nameOf = (x) => x) {
  let lastUs = -1;
  for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].who === 'us') { lastUs = i; break; }
  const customer = lastCustomerEntry(timeline);
  if (lastUs === -1 || !customer || timeline.indexOf(customer) > lastUs) return null;
  const reply = timeline[lastUs];
  const at = reply.at;
  if (sentFromWheelman(latestDraft, sentTextAfter(timeline, customer))) return { how: 'wheelman', by: '', at };
  if (reply.auto) return { how: 'auto', by: '', at };
  if (reply.phone || reply.phoneOnly) return { how: 'phone', by: '', at };
  return { how: 'dashboard', by: nameOf(reply.by) || '', at };
}
