// Which way a reply goes, and the message box's one main button for it: Copy reply for a text, Send
// on Facebook for a Marketplace chat, Copy for Gmail for an email, Copy for WhatsApp for an auction
// order. Then the words after a copy, and after a send that did not go. Pure functions (no DOM, no
// globals) beside model.js, which the tests import in Node.
import { mainAction } from './model.js';
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

/** The words, ending in a full stop unless they end in one of their own (as boxsections.js reads a refused write). */
const sentence = (words) => { const s = String(words || '').trim(); return !s || /[.!?]$/.test(s) ? s : s + '.'; };

/** The line in the box after a send that did not go: why, in the server's words, and that the text stays. */
export const sendFailedWords = (error) => ['Not sent.', sentence(error), 'Your text is still in the box.'].filter(Boolean).join(' ');

/** The toast for a send that did not go once another chat was open: whose, and why. */
export const sendFailedAwayWords = (name, error) => ['Not sent to ' + (String(name || '').trim() || 'the buyer') + '.', sentence(error)].filter(Boolean).join(' ');
