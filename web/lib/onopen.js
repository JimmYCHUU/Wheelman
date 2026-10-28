// Whether a conversation is written as it is opened: the one rule both pages ask (web/app.js and
// the new page's store). A Facebook chat is never written in the background, so a buyer waiting on
// us is written when the chat is opened; the server says which chats qualify (writeOnOpen). Pure:
// no DOM, no state.

/**
 * True once for a waiting chat: never over a suggestion (a failed one waits for Try again), a write
 * already on its way, a dismissed chat or one that is not waiting. A new buyer message while the
 * chat is open is not written by itself: only opening asks.
 */
export const writesOnOpen = (item) => !!item && item.writeOnOpen === true && item.state === 'awaiting' && !item.dismissed && !item.draft && !item.writing;

/**
 * The old page's words (a key in web/lib/copy.js) for a waiting conversation with no suggestion and
 * nothing to say why: a Facebook chat has no suggestion yet, beside Write it now (nothing writes it
 * in the background); anything else is written within a few minutes.
 */
export const noSuggestionKey = (item) => (item && item.channel === 'marketplace' ? 'composer.none' : 'composer.waiting');
