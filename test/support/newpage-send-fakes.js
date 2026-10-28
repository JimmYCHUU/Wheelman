// Shared by the Send on Facebook tests: an invented Facebook buyer as the fake server answers, the
// chat as the server answers a Send, and helpers for the fake server's send route. Invented data only.
import { mainFor } from '../../web/new/js/channel.js';
import { liveChecks, boxText } from '../../web/new/js/model.js';
import { clock } from '../../web/lib/format.js';
import { setup, draft } from './newpage-fakes.js';

export const AT = Date.parse('2026-10-28T23:42:00Z');
export const DAY = 864e5;
// A buyer waiting on us, with a suggestion that leaves the price blank, as GET /api/items/mp:1 answers.
export const FB = {
  key: 'mp:1', anchor: 'fm:1', name: 'Liam Invented', channel: 'marketplace', section: 'marketplace', state: 'awaiting', writeOnOpen: true,
  dismissed: false, writing: false, marketplace: { account: 'Yard phone 1', sending: false }, draft: draft(21, { reply: 'The price is [PRICE?]. Would you like to see it?' }),
};
// The same chat as the server answers a Send: answered with Wheelman's suggestion, the reply on its
// way, and no suggestion shown (the chat is no longer waiting on one).
export const SENT = { ...FB, anchor: 'fm:2', state: 'answered', writeOnOpen: false, answered: { how: 'wheelman', by: '', at: AT }, draft: null, marketplace: { account: 'Yard phone 1', sending: true } };
export const TYPING = "Sent on Facebook at " + clock(AT) + ". The engine's phone is typing it into the chat.";
export const ANYWAY = { label: 'Write a reply anyway', act: 'write', main: false };
export const OFFLINE = 'The Marketplace system did not accept the reply: the phone is offline';

/** The fake server with the buyer's chat in it (o: changes to the chat; shown: the page's on-screen check). */
export const fb = (o = {}, shown) => { const a = setup({}, { shown }); a.data.items['mp:1'] = { ...FB, ...o }; return a; };
/** The buyer's message, as the chat's thread has it. */
export const ASKED = { key: 'fm:1', who: 'customer', text: 'Hi, is this still available?' };
/** The chat answered by a reply of ours with this text after the buyer's message (the server's thread). */
export const sentWith = (text) => ({ ...SENT, thread: [ASKED, { key: 'fm:2', who: 'us', text, sending: true }] });
/** The sends posted so far. */
export const sends = (a) => a.calls.filter((c) => c.path === '/api/items/mp:1/send');
/** The server takes the send: the chat is answered from then on. */
export const takes = (a, out = { ok: true, queued: false }) => {
  a.data.on = { ...a.data.on, '/api/items/mp:1/send': () => { a.data.items['mp:1'] = SENT; return { ...out, item: SENT }; } };
};
/** An error as the page's api throws it: the words, the status, and whether they are the server's own. */
export const failure = (message, status, said = true) => Object.assign(new Error(message), status ? { status, said } : {});

/** The main button for the open conversation, as the message box asks for it. */
export const mainNow = (s) => {
  const text = s.typed !== null ? s.typed : boxText(s.item.draft);
  const ready = s.item.draft && s.item.draft.status === 'ready' ? s.item.draft : null;
  return mainFor({ item: s.item, text, checks: liveChecks(ready, text), overridden: s.overridden, sending: s.sending[s.key] });
};
