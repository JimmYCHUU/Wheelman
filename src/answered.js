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
 * how: 'wheelman' | 'auto' | 'phone' | 'facebook' | 'dashboard'. by names the person only for 'dashboard'. 'facebook' is a person's
 * reply on a Marketplace chat that is not the auto-reply's (Jim's own after a send that timed out, a colleague's, or one typed on the engine's page).
 * latestDraft is the newest suggestion for the customer message that was answered, or null.
 * nameOf turns a sender's login into the name the thread shows.
 */
export function answeredBy(timeline, latestDraft, nameOf = (x) => x) {
  let lastUs = -1;
  for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].who === 'us' && !timeline[i].internal) { lastUs = i; break; }
  const customer = lastCustomerEntry(timeline);
  if (lastUs === -1 || !customer || timeline.indexOf(customer) > lastUs) return null;
  const reply = timeline[lastUs];
  const at = reply.at;
  if (sentFromWheelman(latestDraft, sentTextAfter(timeline, customer))) return { how: 'wheelman', by: '', at };
  if (reply.auto) return { how: 'auto', by: '', at };
  if (reply.phone || reply.phoneOnly) return { how: 'phone', by: '', at };
  if (reply.via === 'Marketplace') return { how: 'facebook', by: '', at };
  const by = nameOf(reply.by) || '';
  return { how: 'dashboard', by, at };
}

/** A reply's words as a chat keeps them: the link tag on our links and runs of space set aside. */
const plainReply = (s, tag) => String(s ?? '').replace(/\r/g, '').split(`?utm_source=${tag}`).join('').split(`&utm_source=${tag}`).join('').replace(/\s+/g, ' ').trim();

/**
 * Whether two replies are the same words as a chat keeps them: the link tag (utm_source=<tag>) and
 * runs of space set aside, as the new page compares them (web/new/js/channel.js sameText). False
 * when either is empty.
 */
export function sameReply(a, b, tag = 'marketplace') {
  const want = plainReply(a, tag);
  return want !== '' && want === plainReply(b, tag);
}

/** Where in these entries the first reply of ours with this text is, or -1. */
const oursWith = (entries, text, tag) => entries.findIndex((e) => e.who === 'us' && !e.internal && sameReply(e.text, text, tag));
const fromCustomer = (entries) => entries.some((e) => e.who === 'customer' && !e.internal);

/**
 * The first reply of ours with this text after the message `anchor` (the one a send answered),
 * whatever the customer wrote since: that reply went. Null when there is none, or when that message
 * is not in the timeline.
 */
export function replyAfter(timeline, anchor, text, tag = 'marketplace') {
  const at = timeline.findIndex((e) => e.key === anchor);
  const after = at === -1 ? [] : timeline.slice(at + 1);
  return after[oursWith(after, text, tag)] || null;
}

/**
 * replyAfter, with nothing from the customer after that reply: it went, and the chat is answered by
 * it. With that message not in the timeline, false.
 */
export function replyShown(timeline, anchor, text, tag = 'marketplace') {
  const at = timeline.findIndex((e) => e.key === anchor);
  if (at === -1) return false;
  const after = timeline.slice(at + 1);
  const ours = oursWith(after, text, tag);
  return ours !== -1 && !fromCustomer(after.slice(ours + 1));
}

/**
 * Whether these words are a reply of ours already in the chat since the customer last wrote (or
 * anywhere, when the customer has written nothing): sent again, the buyer would have them twice.
 */
export function alreadySent(timeline, text, tag = 'marketplace') {
  const customer = lastCustomerEntry(timeline);
  return oursWith(customer ? timeline.slice(timeline.indexOf(customer) + 1) : timeline, text, tag) !== -1;
}
