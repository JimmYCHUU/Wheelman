// Which way a reply goes, and the message box's one main button for it: Copy reply for a text, Send
// on Facebook for a Marketplace chat, Copy for Gmail for an email, Copy for WhatsApp for an auction
// order. Then what a send's failure means, and the words after a copy, a send, and a send that did
// not go. Pure functions (no DOM, no globals) beside model.js, which the tests import in Node.
import { mainAction } from './boxview.js';
import { sentence } from './words.js';
import { blanksIn } from '../../lib/blank.js';
import { plural } from '../../lib/format.js';

/**
 * The channel a reply goes out on: 'facebook' (a Marketplace chat), 'email', 'whatsapp' or 'text'.
 * An auction order is answered by text when the customer texted about it, else by email when they
 * prefer email, else on WhatsApp.
 */
export function replyChannel(item) {
  if (!item) return 'text';
  if (item.channel === 'marketplace') return 'facebook';
  if (item.channel === 'email') return 'email';
  const o = item.order;
  if (o) return o.replyVia === 'sms' ? 'text' : o.prefers === 'Email' ? 'email' : 'whatsapp';
  return 'text';
}

const COPY_LABEL = { text: 'Copy reply', email: 'Copy for Gmail', whatsapp: 'Copy for WhatsApp' };

/**
 * The open chat's send (state.sending[key]) as it bears on the box now, or undefined: one on its way
 * always counts; one that did not go counts while the chat is as it was then (a message from the
 * buyer since makes it old news).
 */
export function sendFor(item, sending) {
  if (!item || !sending) return undefined;
  if (sending.state === 'failed' && sending.anchor !== undefined && sending.anchor !== item.anchor) return undefined;
  return sending;
}

/** Whether the chat's reply is on its way now: its box cannot be edited until the send ends. */
export const sendingNow = (item, sending) => { const s = sendFor(item, sending); return !!s && s.state === 'sending'; };

/**
 * The message box's one main button: { kind, label, secondary, byKey }. kind is 'copy', 'fill' (to
 * the first blank), 'blocked', 'send' or 'sending'; secondary is the quiet Copy beside it, or null;
 * byKey says whether Ctrl+Enter presses it. Ctrl+Enter copies and never sends: Send needs the
 * button. On Facebook a blank blocks Send and never Copy, and a failed check blocks Send until Send
 * anyway (overridden). sending is state.sending[key], or undefined.
 */
export function mainFor({ item, text, checks, overridden, sending }) {
  const channel = replyChannel(item);
  if (channel !== 'facebook') {
    const a = mainAction({ text, checks, overridden });
    return { ...a, label: a.kind === 'copy' ? COPY_LABEL[channel] : a.label, byKey: true };
  }
  const send = sendFor(item, sending);
  if (send && send.state === 'sending') return { kind: 'sending', label: 'Sending…', secondary: null, byKey: false };
  const n = blanksIn(text).length;
  const fill = 'Fill ' + plural(n, 'blank') + ' to send';
  if (!overridden && (checks || []).some((c) => c.level === 'fail')) {
    return n ? { kind: 'fill', label: fill, secondary: null, byKey: true } : { kind: 'blocked', label: 'Fix the check first', secondary: null, byKey: false };
  }
  if (n) return { kind: 'fill', label: fill, secondary: n === 1 ? 'Copy with the blank' : 'Copy with the blanks', byKey: true };
  return { kind: 'send', label: send && send.state === 'failed' ? 'Try again' : 'Send on Facebook', secondary: 'Copy', byKey: false };
}

const COPIED = {
  facebook: 'Copied. Paste it into the Marketplace chat to send.',
  email: 'Copied. Paste it into your reply in Gmail.',
  whatsapp: 'Copied. Paste it into WhatsApp.',
};

/** The toast after a copy: the blanks still to fill, else where to paste it. left: the blanks in what was copied. */
export function copiedWords(item, left = 0) {
  if (left) return 'Copied, with ' + plural(left, 'blank') + ' still to fill';
  return COPIED[replyChannel(item)] || 'Copied';
}

/**
 * What a send that threw means, from the page's api error (web/new/js/api.js): 'gone' (409: the
 * server found the reply of a send that timed out, from here or another page, or these words as our
 * reply since the buyer last wrote, so nothing more was sent; e.same says whether the words sent
 * are the ones that went), 'elsewhere' (409: another page is sending a reply to this chat),
 * 'refused' (the server said it was not sent: a 4xx, or its own 502 when the engine said no or was
 * not reached), or 'unknown' (no answer at all, or a failure not in the server's words, after which
 * the reply may have gone).
 */
export function sendOutcome(e) {
  const status = e && e.status;
  if (status === 409) return e.gone ? 'gone' : 'elsewhere';
  if (status >= 400 && status < 500) return 'refused';
  if (status === 502 && e.said) return 'refused';
  return 'unknown';
}

/**
 * Whether the chat, as the server has it now, shows a reply since the message a send was answering
 * (anchor): it is answered, or one of ours follows that message in its thread. Only what the chat
 * shows counts: a new message from the buyer alone is not a reply.
 */
export function repliedSince(item, anchor) {
  if (!item || item.anchor === anchor) return false;
  if (item.state !== 'awaiting') return true;
  const thread = item.thread || [];
  const at = thread.findIndex((m) => m.key === anchor);
  return at !== -1 && thread.slice(at + 1).some((m) => m.who === 'us' && !m.internal);
}

/** A reply's words compared as the chat keeps them: the link tag the server adds and runs of space set aside. */
const plain = (s) => String(s ?? '').replace(/\r/g, '').replace(/[?&]utm_source=marketplace\b/g, '').replace(/\s+/g, ' ').trim();

/** Whether two replies are the same words, as the chat keeps them. */
export const sameText = (a, b) => plain(a) !== '' && plain(a) === plain(b);

/**
 * Whether the chat shows this text as a reply of ours after the message a send answered (anchor):
 * the reply went, from here or another page of Jim's. A reply with other words (the auto-reply, a
 * colleague) is not it, and neither is an older one with the same words: with that message not in
 * the thread shown, nothing counts.
 */
export function sentSince(item, anchor, text) {
  if (!item) return false;
  const thread = item.thread || [];
  const at = thread.findIndex((m) => m.key === anchor);
  if (at === -1) return false;
  return thread.slice(at + 1).some((m) => m.who === 'us' && !m.internal && sameText(m.text, text));
}

/** The toast when the reply had gone already (the server's 409): the chat still open says it plainly; another chat open by now names the buyer. */
export function goneWords(name) {
  const who = String(name || '').trim();
  return who ? 'The reply to ' + who + ' has gone already.' : 'This reply has gone already.';
}

/** The toast after a send: the chat still open says it plainly; another chat open by now names the buyer. */
export function sentWords(queued, name) {
  const who = String(name || '').trim();
  if (queued) return (who ? 'Queued for ' + who + '.' : 'Queued.') + ' The Marketplace system sends it as soon as its phone is back online.';
  return who ? 'Sent to ' + who + '. It is on its way.' : 'Sent. It is on its way to the buyer.';
}

/**
 * The line in the box after a send that did not go, by its outcome: "Not sent." only when the server
 * said so. kept: false where no text is on screen to stay (Send it again, from the quiet line).
 */
export function sendFailedWords(error, outcome = 'refused', { kept = true } = {}) {
  if (outcome === 'elsewhere') return 'Not sent from here: another page is sending a reply to this chat.';
  if (outcome === 'unknown') return ['Wheelman could not tell whether this reply went.', sentence(error)].filter(Boolean).join(' ');
  return ['Not sent.', sentence(error), kept ? 'Your text is still in the box.' : ''].filter(Boolean).join(' ');
}

/** The toast for a send that did not go once another chat was open: whose, and why. */
export function sendFailedAwayWords(name, error, outcome = 'refused') {
  const who = String(name || '').trim() || 'the buyer';
  if (outcome === 'elsewhere') return 'Not sent to ' + who + ' from here: another page is sending a reply to this chat.';
  if (outcome === 'unknown') return ['Wheelman could not tell whether the reply to ' + who + ' went.', sentence(error)].filter(Boolean).join(' ');
  return ['Not sent to ' + who + '.', sentence(error)].filter(Boolean).join(' ');
}
