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
