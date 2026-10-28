# The new page, PR 5: every section opens, and Marketplace with Send on Facebook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jim opens all four sections on the new page, and answers Facebook buyers there.
- **Every section opens:** Marketplace, Imports and Auction each have their own lists, rows and head line on the new page. Each conversation's main button is its channel's: Copy reply, Send on Facebook, Copy for Gmail or Copy for WhatsApp.
- **Marketplace is written on open:** a waiting buyer's chat is written when Jim opens it, on both pages. No Facebook chat is written in the background any more.
- **Send on Facebook** is the only send: Sending, then Sent with the time, or why it failed and **Try again**. The chat shows what the engine's auto-reply is doing.
- **Underneath,** the store is split first, so it can grow without passing 400 lines.

**Until PR 5b lands:**
- Imports and Auction open on the new page with their channel's Copy, but without:
  - the research notes;
  - the enquiry type;
  - the leads from the dashboard's Imports list (still in Auction);
  - the order box.
- They keep all of it on the old page.

PR 5b (`docs/superpowers/plans/2026-10-28-new-page-5b-imports-auction.md`) builds on this branch.

**Architecture:**
- **One ruled server change, everything else additive:**
  - No Facebook chat is written in the background (`src/worker.js`).
  - Both pages write one when it is opened, through one shared rule (`web/lib/onopen.js`), and the server says which chats qualify (`writeOnOpen`).
- **The store first gets smaller** (Task 1). Each new action set is its own module called by the store, as `remember.js` and `runstore.js` already are: `finish.js`, `hold.js` and `sender.js`.
- **Section rules are pure modules beside `model.js`**, which is near 400 lines and is not grown:
  - `sections.js` (chips, rows, head line);
  - `channel.js` (the main button);
  - `boxsections.js` (box states that differ by section);
  - `fbchat.js` (what the engine is doing).
- **The address keeps the store in step across sections:** `storeStep` now switches sections.

**Tech Stack:** as PRs 1–4.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 4 (the four tabs; "Changes to earlier decisions" row 4);
  - section 5 R1.2, R3.8, R3.9 and R4.6 (its last sentence);
  - section 7 (sections and addresses);
  - section 8 journey 4 and "When things go wrong";
  - section 13 the "Draft written on open" row;
  - section 14 stories 2 (its Send clause), 10 and 11.
- `prototype/js/store.js` (`A.copy`, `A.send`) and `prototype/js/ui-thread.js` (Composer, MainButton).
- **The old page, for each feature and its words:**
  - `web/app.js`: `renderHead`, `renderThread` (the Marketplace pills), `renderComposer`, `mountEditor` (`doCopy`, `doSend`), `marketplaceInfo`, `open()`;
  - `web/sections/registry.js` (each section's lists and words);
  - `web/lib/copy.js`.
- **The engine:**
  - `src/items.js` `buildMarketplaceItem`;
  - `src/server.js` `present`, `summary`, `sectionRows`, and the routes `/send` and `/copied`;
  - `src/worker.js` `draftWaiting`;
  - `src/llm.js` (the Marketplace daily words).

## Switch-over checklist items in this PR

From `docs/superpowers/plans/2026-10-26-new-page-programme.md`, each with the task that covers it:

- **Top bar:** section tabs with new counts, for all four sections (Task 2).
- **List:**
  - the Marketplace-down notice (Task 3);
  - chips per section (Task 2);
  - row tags: due (Task 2), Needs you (Task 3);
  - Load older conversations, and Load more orders (Task 2);
  - empty states per section (Task 2);
  - the first row opening on wide windows in every section (Task 2).
- **Conversation:**
  - the head's sub line (Task 2);
  - the car strip for a Marketplace listing (Task 3);
  - the Marketplace auto-reply pills, and Sending on a reply on its way (Task 3).
- **Message box:**
  - Write it now and Try again, with Marketplace written on open and a refused write said in words (Task 3);
  - Copy reply and Copy with blanks under each channel's label (Task 4);
  - Send reply on Marketplace, now **Send on Facebook** (Task 4).
- **Panel:** Marketplace (Task 3).
- **Keyboard:** Ctrl+Enter copies in every section and never sends (Task 4).

## Global Constraints

The Global Constraints of PRs 1–4 hold:
- no dependencies and the CSP unchanged;
- tokens only, plain words, colour with words;
- 44 px targets, no file over 400 lines;
- invented test data;
- never the live folder, its database or port 3210; the preview on 3211;
- no AI attribution;
- the reply string is never changed by the page.

Changed for this PR:
- **API: additions, plus one ruled change.**
  - **The addition:** `writeOnOpen` on a conversation.
  - **The ruled change (Confirmed 24 Oct 2026, R4.6; Ruling 27 Oct 2026):**
    - No Facebook chat is written in the background, wherever it is listed.
    - A waiting buyer's chat is written when it is opened, on both pages, however old the message.
    - A photo with no words, a chat not marked as a buyer and an archived chat are not written on open.
    - There is no streaming in this PR: the box reads Writing… until the whole reply is in.
  - Every other route and field behaves as before. The old page changes in one place only: it writes a waiting chat when it is opened.
- **Send on Facebook (R3.8, Confirmed 9 Oct 2026; story 11):**
  - It is the only send anywhere. It goes only when the button is pressed, never by itself.
  - The button reads Send on Facebook, then Sending…, then the box says "Sent on Facebook at 10:42.".
  - A failure says why, keeps the text and offers Try again.
  - A blank blocks Send and never blocks Copy. The server refuses a blank anyway.
  - A failed check blocks Send until "Send anyway".
- **One main button per channel (story 10):**
  - a text: Copy reply;
  - a Facebook chat: Send on Facebook;
  - an email: Copy for Gmail;
  - an auction order: Copy for WhatsApp, or Copy reply when the order is answered by text, or Copy for Gmail when they prefer email.
- **Learning:** Marketplace is never learned from. Its Copy tells the server no text, and Remember is never offered.
- **Rulings for Jim (28 Oct 2026). Each is a reversible default and goes in the PR description:**
  - **Only Facebook chats stop being written in the background.** Imports and Auction are written as today.
    - Cost if wrong: Imports and Auction keep spending requests on suggestions that may go unused.
  - **No new daily cap.**
    - A write on open counts as an asked-for write, like Write it now. The existing budget and Used so far still apply.
    - Marketplace's own daily allowance (`config.marketplace.dailyDrafts`) no longer limits anything: it was for the background.
    - When the provider refuses (busy, out of allowance, budget reached, not reached), the box says the reason in words with Try again. It is never a silent empty box.
    - Cost if wrong: a busy Marketplace day spends more small-model requests, within the budget.
  - **Ctrl+Enter never sends.** It copies in every section; Send needs the button.
    - Cost if wrong: one Tab or click per Send.
  - **A chat is written on open however old the buyer's message.**
    - Cost if wrong: one small-model request for each older chat opened.
  - **On a wide window, switching to Marketplace opens its first chat, so it is written,** as every section opens its first row.
    - Cost if wrong: one request when Jim only meant to look at the list.
  - **A quiet Copy stays beside Send,** as on the old page.
    - Cost if wrong: one more control.
  - **There is no Put back after a Send:** a sent reply cannot be taken back. This differs from the prototype.
    - Cost if wrong: none.
  - **The reply run stays on Dashboard's Needs reply only.**
    - Cost if wrong: no run through Marketplace, Imports or Auction yet.

## Review Focus

1. **Send pressed twice, or pressed while a reply is on its way** (a slow engine, a double click, the chat reopened). Exactly one reply reaches the buyer, the button reads Sending… until the answer comes, and a 409 from the server is said in words. Pinned in Task 4: `a second press while sending sends nothing`.
2. **A blank in a Facebook reply.** It never reaches the buyer: the button moves the caret to the blank, and a `send()` called anyway (a stale button, a key) posts nothing. Pinned in Task 4: `send with a blank posts nothing and moves to the blank`.
3. **A chat written twice on open**: switching chats fast, reopening one while it is being written, or the 20 s refresh. It is written once, and a failed write waits for Try again. Pinned in Task 3: `opening a waiting chat writes it once, and opening it again while it is written writes nothing more`.
4. **The AI refuses a write on open** (busy, out of allowance, the budget used, the provider not reached, or the request failing). The box says why in words and offers Try again, never an empty box or only a toast that goes. Pinned in Task 3: `a chat written on open that the AI refuses says why and offers Try again`.
5. **Switching section with typed text in the open conversation.** What was typed is saved before the other section loads, and is there when Jim comes back. Pinned in Task 2: `switching section saves what was typed first`.

---

### Task 1: The store is split, and nothing it does changes

**Files:**
- Create:
  - `web/new/js/finish.js`: Copy and what follows it, the done marks kept in storage, Put back, Dismiss with Undo, and copying a link, number or email.
  - `web/new/js/hold.js`: the Tell hold (`release`, `holdTell`).
- Modify: `web/new/js/store.js`. It keeps the state, the list, opening, writing, Instead and Load older, and calls the two modules. Aim for 280 lines or fewer.
- Test: `test/newpage-size.test.js`. All existing `test/newpage-store*.test.js` must pass unchanged.

**Interfaces:**
- **`createFinish({ api, clipboard, storage, now, get, set, toast, text, refresh, runner })`** returns `{ copy, copyNow, copyText, putBack, restore, restoreFollowUp, copyLink, copyNumber, copyEmail, dismiss, dismissFollowUp }`.
  - Each has today's body and words.
  - `copy` is `() => runner.copy(get().key, copyNow)`.
- **`readDone(storage)`** returns `{ done, doneAt }` for the store's first state.
- **`createHold({ api, get, timers })`** returns:
  - `holdTell(on)`;
  - `releaseFor(key)`, which releases a hold on any conversation but `key`. `show()` calls it.
- **The runner** is still created in `store.js`, before `createFinish`, which takes it.
- **From Task 2 on, a new action set is a module of its own** in this pattern. Nothing new goes into `store.js` but its wiring.

- [ ] **Step 1: Write the failing tests:**
  - `no new page file is over 400 lines`: every file under `web/new/js` (with `ui/`) and `web/new/css`.
  - `the store's actions are the same after the split`: `Object.keys(store.actions).sort()` equals the list read from `store.js` before you start. As of this plan that is boot, refresh, setChip, more, open, type, flush, write, tell, holdTell, instead, copy, copyNumber, copyEmail, older, dismiss, dismissFollowUp, putBack, restore, restoreFollowUp, copyLink, toast, remember, justOnce, switchLesson, startRun, skipRun, endRun, clear, bringBack, override. Add any that PR 4's fixes added.
- [ ] **Step 2: Run** them. Expected: the size test passes now and must keep passing; the action list is the check that the split keeps everything.
- [ ] **Step 3: Implement** the split. Move code as it is; change no words and no order of calls.
- [ ] **Step 4: Run** `npm.cmd test`. Expected: PASS, with every existing new page test unchanged. Open the preview's Dashboard once:
  - Copy, Undo, Dismiss, Undo;
  - a Tell hold;
  - no console errors.
- [ ] **Step 5: Commit:** `New page: the store is split into Copy and Dismiss, and the Tell hold, with nothing changed`

### Task 2: Every section opens on the new page

**Files:**
- Create: `web/new/js/sections.js` (pure).
- Modify:
  - `web/new/js/model.js`: every entry in `SECTIONS` is `ready: true`. Change nothing else there.
  - `web/new/js/route.js`: a chip is valid only for its section.
  - `web/new/js/store.js`: `setSection`, and `boot` takes the route's section.
  - `web/new/js/hashsync.js`: `storeStep` switches sections.
  - `web/new/js/main.js`.
  - `web/new/js/ui/app.js`: the "still on the old page" branch goes; tabs and search results open their section.
  - `web/new/js/ui/list.js`: chips, counts, empty words, Load more, the channel word, and Start replying on Dashboard only.
  - `web/new/js/ui/search.js`: "Opens on the old page" goes.
  - `web/new/js/ui/conversation.js`: the head's sub line.
  - `test/support/newpage-fakes.js`: `data.sections[section] = { rows, counts }`, answered by `GET /api/items?section=…`, which returns `section`.
- Test: `test/newpage-sections.test.js`. Update `test/newpage-hashsync.test.js`: the test "a section still on the old page" now expects a section step. Update `test/newpage-model.test.js` for `ready`.

**Interfaces:**
- **`SECTION_CHIPS`:**
  - `dashboard`: waiting "Needs reply", followups "Follow-ups", all "All";
  - `marketplace`: waiting "Needs reply", all "All";
  - `importquery`: waiting "Needs reply", all "All";
  - `auction`: waiting "To do", quiet "In progress", other "Finished".

  The ids are the server's `tab` values. **`chipsFor(section)`** returns the list. **`validChip(section, chip)`** returns the chip, or the section's first one.
- **`emptyWords(section, chip)`:**
  - dashboard: as today;
  - marketplace: waiting "No buyer is waiting.", all "There are no Marketplace chats yet.";
  - importquery: waiting "No one is waiting.", all "No import enquiries yet. In Gmail, open one and press Send to Wheelman.";
  - auction: waiting "Nothing to do.", quiet "No orders are under way.", other "No finished orders.".
- **`moreLabel(section)`:** "Load older conversations"; Auction "Load more orders"; Imports "Load older enquiries".
- **`rowChannelWord(row, section)`:**
  - By key: `mp:` Facebook, `em:` Email, `ao:` WhatsApp, anything else Text.
  - It returns '' when that is the section's own: Dashboard Text, Marketplace Facebook, Imports Email, Auction WhatsApp.
- **`sectionRowView(row, opts, section)`** returns `rowView(row, opts)` plus `channel` and `tone`.
  - An order row (`ao:`) that is not done reads `row.due` with a leading "Send: " made "Due: ", else `row.stage`.
  - Its tone is `info` when `row.dueKind === 'reply'`, `warn` for another due, '' otherwise.
  - `list.js` uses `view.tone` when it is set.
- **`headLine(item)`:**
  - "Writing a suggestion…" while writing;
  - an order: "Order AS-501 · prefers WhatsApp";
  - an email: "Email · <subject>";
  - a Facebook chat: "Marketplace · <account>";
  - else `item.situation`.
- **`resultAddress(r)`** returns `{ section: r.section, chip, key: r.key }`.
  - In Auction the chip is by state: awaiting `waiting`, answered `quiet`, closed `other`.
  - Elsewhere it is `waiting` for awaiting, else `all`.
- **Store: `setSection(id, { chip, key, wide })`:**
  - It ends a run quietly.
  - It flushes what was typed (through `close()` or `show()`, which already flush).
  - It sets `{ section, chip: validChip(id, chip), rows: [], total: 0, listState: 'loading', limit: 20 }` and refreshes.
  - It then opens `key` unless it is the one already open.
  - With no key it closes the conversation, and opens the first row when `wide`, as `boot` does.
- **`storeStep(route, s)`** returns `{ section, chip, key }` when `route.section !== s.section`. Everything else is as before.
- **`main.js`** calls `actions.setSection(step.section, { chip: step.chip, key: step.key, wide: innerWidth >= 1280 })`.
- **The reply run** is offered on Dashboard's Needs reply only, and `startRun` does nothing elsewhere.

- [ ] **Step 1: Write the failing tests:**
  - `every section has its own chips, empty words and Load more`;
  - `routes keep each section's own chips` (`#/auction/quiet/ao%3A5` keeps `quiet`; `#/marketplace/followups` becomes `waiting`);
  - `the address moves the store to another section and opens the conversation there`;
  - `choosing another section ends a reply run quietly`;
  - `switching section saves what was typed first`;
  - `a row shows its channel only when it differs from its section's own, and an order row says what is due`;
  - `the head names the account, the subject or the order`;
  - `a search result opens in its own section, on the list it is on`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview at 1440×900 and 390×844, light and dark:
  - each tab lists its invented rows;
  - an auction order row says "Due: …";
  - Back goes from Auction to Dashboard;
  - a search result in Marketplace opens there.

  Screenshots go under `D:\Jim\Wheelman\.playwright-mcp\new-page-5\` as `task2-*.png`.
- [ ] **Step 5: Commit:** `New page: Marketplace, Imports and Auction open on the new page, each with its own lists`

### Task 3: Marketplace is written on open, and the chat shows what the engine is doing

**Files:**
- Modify the server:
  - `src/worker.js` `draftWaiting`: no Facebook chat is queued or written. Take out the Marketplace queue, its allowance branch and the `mpHoldUntil` branch; the status report keeps its fields.
  - `src/items.js` `buildMarketplaceItem`: `finishItem(…, timeline, { autoDraftMaxAgeHours: Infinity })`.
  - `src/server.js` `present()`: `writeOnOpen`.
  - `src/llm.js` (the Marketplace daily words).
- Create:
  - `web/lib/onopen.js`, pure, shared by both pages: `writesOnOpen(item)`.
  - `web/new/js/fbchat.js`, pure: `marketplacePills`, `listingStrip`, `marketplaceRows`, `marketplaceDown`.
  - `web/new/js/boxsections.js`, pure: `sectionBox`.
  - `web/new/css/sections.css`, linked from `web/new/index.html` (layers `components`/`views`, tokens only).
- Modify the pages:
  - `web/app.js` `open()`: after loading, `if (writeNow && (state.followUp ? followUpToWrite(item) : writesOnOpen(item))) write(item, '')`.
  - `web/new/js/store.js`:
    - `show()`: after the conversation is in, `if (writesOnOpen(item) && state.typed === null) await write({})`;
    - `write()`: `state.writeFailed`.
  - `web/new/js/ui/messagebox.js`: `sectionBox` in place of `boxView`.
  - `web/new/js/ui/conversation.js`: the pills after the messages, "Sending" in place of the time on a reply on its way (`m.sending`), and the listing strip.
  - `web/new/js/ui/customertab.js`: the Marketplace section.
  - `web/new/js/ui/list.js`: the Marketplace-down line.
  - `web/new/js/sections.js`: the "Needs you" reason.
  - `test/support/preview.js`.
- Test: `test/marketplace-onopen.test.js`, `test/newpage-fbchat.test.js`. Rewrite the two worker tests in `test/marketplace.test.js` ("Marketplace has its own allowance…", "when the small model has used up its day…") as the first and fourth tests below.

**Interfaces:**
- **`writeOnOpen`** is `item.channel === 'marketplace' && item.autoDraft && item.state === 'awaiting'`.
- **`writesOnOpen(item)`** is `!!item && item.writeOnOpen === true && item.state === 'awaiting' && !item.dismissed && !item.draft && !item.writing`.
  - A failed draft is a draft: it waits for Try again.
  - A new buyer message while the chat is open is not written by itself; the box says "No suggestion yet." with Write it now.
- **The words in `src/llm.js` line 298:** "The AI models used for Marketplace have used up their allowance for today. Try again after <time>."
- **`state.writeFailed`** is `{ key, message } | null`.
  - It is set when a write from this page ends with no draft written: the answer's `error` with no failed draft to show it, or the request itself failing (`e.message`).
  - It is cleared when a write starts and when a conversation is opened.
- **`sectionBox(args)`** takes the arguments of `boxView`, plus `writeFailed`, and returns its views.
  - **A refused write, with no ready draft:**
    - no typed text: `{ kind:'quiet', tone:'bad', sentence: message, button: { label:'Try again', act:'retry', main:true }, tell:true }`;
    - typed text: the editor with `failure: message + ' Your text is kept.'`.
  - **A failed draft** is told by `boxView`, as today: "A suggestion could not be written. <error>", with Try again.
  - Anything else goes to `boxView`. PR 5b adds its states here.
- **`marketplacePills(item, now)`** returns `[{ tone, text }]`, in the old page's words:
  - handed to a person (`locked` or stage `handed_off`): "The auto-reply has handed this chat to a person: <lockReason>." (without the colon part when there is no reason);
  - `failed`: "2 replies from the Marketplace system failed to send." (`plural`);
  - `replyComing` while waiting, queued 15 minutes or more: "The auto-reply wrote an answer <ago>, but it has not been sent." (warn);
  - otherwise: "An auto-reply is queued for this chat and may answer first." (info).
- **`listingStrip(item)`** returns `{ title, note: 'Not in the stock list', url }` when there is no `item.vehicle` but there is `marketplace.listingTitle`, else null. The link reads "Open on Facebook" and must be http(s).
- **`marketplaceRows(m)`** gives the panel's rows, in the old page's labels and order:
  - Seller account, Listing, Price on Facebook;
  - Auto-reply ("On for this chat"/"Off for this chat"), Stage (underscores made spaces);
  - Handed to a person, Why, Suggested next step;
  - the listing link, "The listing on Facebook".

  Then the notes under "Noted by the auto-reply", with "These notes were made automatically and have not been checked."
- **`marketplaceDown(status)`** gives "Marketplace not reached since <clock>. The chats here are from the last good read." when `status.marketplace.lastSync.ok === false`, else ''.
- **The row reason** "Needs you" (info) goes on a row with `needsPerson` and `unanswered`, when `rowView` gave no reason.

- [ ] **Step 1: Write the failing tests:**
  - `no Facebook chat is written in the background, wherever it is listed`: one in Marketplace and one moved to Dashboard; `draftWaiting` writes only the Dashboard customer.
  - `a waiting buyer is written on open however old the message; an archived chat, one not marked as a buyer and a photo with no words are not` (`writeOnOpen` on `GET /api/items/mp:…`).
  - `writesOnOpen asks once: never over a draft, a write on its way, a dismissed chat or one that is not waiting`.
  - `a chat written from the page uses the Marketplace model and says when its allowance is used up` (`POST /api/items/mp:…/draft`).
  - `opening a waiting chat writes it once, and opening it again while it is written writes nothing more` (store, with fakes: two opens, one POST `/draft`).
  - `a chat written on open that the AI refuses says why and offers Try again`: three cases, the box naming the reason each time:
    - a failed draft carrying the allowance words;
    - an answer `{ item, error }` with no draft (the budget used);
    - the request failing.
  - `the auto-reply's pills say what it is doing with the chat`.
  - `a listing not in the stock list has its own strip, and the panel lists what the engine knows`.
  - `the Marketplace section says when Marketplace was not reached`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Add to `test/support/preview.js` two invented chats beside `fixtures.marketplace()`:
  - chat 506 "Tove Invented", handed to a person (`agent.locked: true`, `lock_reason: 'Asked to speak to a person'`);
  - chat 507 "Ulla Invented", with an auto-reply queued 20 minutes ago and not sent (an `out` message from `agent` with status `queued`, and `pending_outbound: 1`).

  If `preview.js` would pass 400 lines, move the added people into `test/support/preview-people.js`.
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - nothing is written for Marketplace at start (`GET /api/items/mp:501` has no draft);
  - opening Liam shows Writing…, then the suggestion;
  - with the stand-in AI made to fail once ("fail this one" in a Tell), the box says why with Try again;
  - Tove's and Ulla's pills;
  - the Marketplace section in Details;
  - on the old page (`127.0.0.1:3211/`), opening a waiting chat writes it.

  Screenshots as `task3-*.png`.
- [ ] **Step 5: Commit:** `Marketplace: a chat is written when it is opened, not in the background, and the page shows what the engine is doing`

### Task 4: Send on Facebook, and one main button per channel

**Files:**
- Create:
  - `web/new/js/channel.js`, pure: `replyChannel`, `mainFor`, `copiedWords`, `sendFailedWords`.
  - `web/new/js/sender.js`: `createSender`.
- Modify:
  - `web/new/js/store.js`: registers `send`, and `state.sending = {}`.
  - `web/new/js/finish.js`: Copy says the server nothing of a Facebook reply's text, and the toast words.
  - `web/new/js/boxsections.js`: the sent state.
  - `web/new/js/ui/messagebox.js`: the main button from `mainFor`; the failure line; Send anyway; Ctrl+Enter only for `byKey`.
  - `test/support/standins.js`: `world.refuseSendOnce`.
  - `test/support/preview.js`.
- Test: `test/newpage-send.test.js`.

**Interfaces:**
- **`replyChannel(item)`** is one of `'text'`, `'facebook'`, `'email'` or `'whatsapp'`:
  - `item.channel` `marketplace` is facebook;
  - `email` is email;
  - an order is text when `order.replyVia === 'sms'`, email when `order.prefers === 'Email'`, else whatsapp;
  - anything else is text.
- **`mainFor({ item, text, checks, overridden, sending })`** returns `{ kind, label, secondary, byKey }`. `sending` is `state.sending[key]` or undefined.
  - **Not Facebook:**
    - `mainAction(…)` as today;
    - a `copy` reads "Copy reply", "Copy for Gmail" or "Copy for WhatsApp" by channel;
    - `byKey: true`.
  - **Facebook, in this order:**
    - sending: `{ kind:'sending', label:'Sending…', byKey:false }`, disabled;
    - a failed check, not overridden: with blanks, `{ kind:'fill', label:'Fill 1 blank to send', secondary:null }`; without, `{ kind:'blocked', label:'Fix the check first' }`;
    - blanks: `{ kind:'fill', label:'Fill 1 blank to send' | 'Fill 2 blanks to send', secondary:'Copy with the blank' | 'Copy with the blanks', byKey:true }`;
    - otherwise: `{ kind:'send', label: sending?.state === 'failed' ? 'Try again' : 'Send on Facebook', secondary:'Copy', byKey:false }`.
  - **The failed-check line's button** reads "Send anyway" on Facebook. It sets `overridden`, then sends.
- **`createSender({ api, get, set, toast, now, text, refresh })`** returns `{ send() }`. `send()`:
  - It does nothing unless the open item is a Facebook chat with text, and nothing while `sending[key].state === 'sending'`.
  - With a blank in the text it posts nothing and returns `'fill'`. The UI moves the caret to the first blank.
  - Otherwise it sets `sending[key] = { state:'sending' }` and posts `POST /api/items/<key>/send { text, draftId }`.
  - **On success:**
    - it clears `sending[key]`;
    - if the chat is still open, it takes `out.item`;
    - it toasts "Sent. It is on its way to the buyer." or, when `out.queued`, "Queued. The Marketplace system sends it as soon as its phone is back online.";
    - then it refreshes the list.
  - **On failure:** `sending[key] = { state:'failed', error: e.message }`. The text stays.
  - The send is keyed by conversation, so a chat reopened mid-send still reads Sending….
- **The sent state in `sectionBox`:** a Facebook chat that is answered with `draft.sentHereAt` reads "Sent on Facebook at <clock>.", plus " The engine's phone is typing it into the chat." while `marketplace.sending`. It is quiet and good, with no button.
- **`sendFailedWords(error)`** is "Not sent. <error> Your text is still in the box." (bad, `role="alert"`).
- **`copiedWords(item, left)`:**
  - blanks left: "Copied, with N blanks still to fill";
  - Facebook: "Copied. Paste it into the Marketplace chat to send.";
  - email: "Copied. Paste it into your reply in Gmail.";
  - WhatsApp: "Copied. Paste it into WhatsApp.";
  - otherwise: "Copied".
- **Copy on Facebook** posts `POST /api/drafts/<id>/copied { text: '' }`, as the old page does.
- **`world.refuseSendOnce`** is a Set of chat ids. The stand-in engine answers each one's next reply with 503 `{ detail: 'the phone is offline' }`, once.

- [ ] **Step 1: Write the failing tests:**
  - `one main button per channel` (all four, with blanks, a failed check, sending and failed);
  - `Ctrl+Enter copies but never sends` (`byKey`);
  - `send posts the text with its draft and says Sent with the time`;
  - `a failed send keeps the text, says why and offers Try again`;
  - `a second press while sending sends nothing`;
  - `send with a blank posts nothing and moves to the blank`;
  - `a Marketplace copy tells the server nothing of the text`;
  - `Send anyway past a failed check sends`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** In `test/support/preview.js`, set `refuseSendOnce` to chat 501 (Liam), so the first Send fails and Try again works.
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview at 1440×900 and 390×844, light and dark:
  - Liam: fill the blank, Send on Facebook, see it refused and Try again, then Sent with the time;
  - Ava: Copy (the request body has no text);
  - Ctrl+Enter in Liam's box does nothing;
  - an email's button reads Copy for Gmail, and an auction order's reads Copy for WhatsApp.

  Screenshots as `task4-*.png`.
- [ ] **Step 5: Commit:** `New page: Send on Facebook with Sending, Sent and Try again, and one main button for each channel`

### Task 5: README and walkthrough

- [ ] **Step 1: Update `README.md`:**
  - In "The new page": all four sections open there, with their own lists and each channel's main button. Facebook buyers are answered with Send on Facebook.
  - Take out the sentence that the other three sections are still on the old page. Say that Imports and Auction have their full tools on the old page until the next update.
  - In "How a suggestion is written": Facebook chats are written when they are opened, on both pages, not in the background.
  - One dated Status line.

  The README is public: plain words, no figures, no names.
- [ ] **Step 2: Walk through it on the preview** at 1440×900 and 390×844, light and dark:
  - **Journey 4:** Liam is written on open; fill the blank; Send is refused and Try again works; Sent with the time; the row leaves Needs reply.
  - **A refused write:** the box says why with Try again.
  - **The store split:** on Dashboard, Copy and Undo, Dismiss and Undo, a Tell hold, and a reply run through two customers all work as before.
  - **Each tab:** its lists and empty words.

  There must be no console errors, and the only requests must be to 127.0.0.1:3211. Screenshots as `task5-*.png`.
- [ ] **Step 3: Run** `npm.cmd test`, `check-private`, `check-deps` and `check-css`. Expected: all pass.
- [ ] **Step 4: Commit:** `README: every section on the new page, Send on Facebook, and Facebook chats written when opened`
