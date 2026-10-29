# The new page, PR 5b: PR 5's leftovers, Imports, the enquiry type and Auction orders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Builds on PR 5:**
- branch `new-page-5`, head `8f86048`, PR #66;
- plan `docs/superpowers/plans/2026-10-28-new-page-5-marketplace.md`;
- ledger `eval/redesign/pr5-marketplace-ledger.md` (local, in `D:\Jim\Wheelman\eval\redesign\`).

Branch `new-page-5b` from `8f86048`. This plan was refreshed on 28 Oct 2026 against the code at `8f86048`. Task 0 is new. Tasks 1–5 now name the code as it is.

It uses PR 5's pieces as they are:
- `web/new/js/sections.js`: `validChip`, `sectionOff`, `sectionRowView`, `headLine`, `rowChannelWord`;
- `web/new/js/channel.js`: `replyChannel`, `mainFor`, `copiedWords`, `sameText`;
- `web/new/js/boxsections.js`:
  - `sectionBox`;
  - `boxViewOf`, the one view that the message box and the run bar both read;
  - the store's `state.writeFailed`;
- `web/new/js/finish.js`: `restore`, `putBack`, `copyNow`, `dismiss`;
- `web/new/js/sender.js`: `createSender` (`send`, `settle`, `seen`);
- the test fakes:
  - `test/support/newpage-fakes.js`: `setup`, `data.sections`, `data.on`;
  - `test/support/newpage-send-fakes.js`: `FB`, `SENT`, `fb`, `sends`, `failure`;
- `web/new/css/sections.css`.

**Goal:** PR 5's leftovers are closed first. Then the last two sections work fully on the new page.
- **PR 5's leftovers (Task 0):**
  - Send on Facebook never sends the same words to a buyer twice, from any page.
  - The box is cleared only for the words that went.
  - A Facebook chat answered on Facebook says so.
  - `model.js` is split, so the page's modules have no import cycle.
- **Imports:** Import Query becomes Imports. It takes the leads from the dashboard's Imports list out of Auction, with the messages they had there. Emails get **Copy for Gmail** and their research notes, and every message is one click away.
- **The enquiry type:** one property with its reason line, in the conversation's menu. It replaces the Move menu and the three import ruling buttons.
- **Auction:** orders only, with:
  - the message picker;
  - the paste box (**They wrote this**, **We sent this**);
  - **Remove**, **Put back in To do** and **Copy for WhatsApp**;
  - the Order tab.

**Architecture:**
- **Two ruled server changes. Everything else is additive.**
  - The send route refuses words that have already gone (Task 0a).
  - The Imports list's leads belong in Imports (`src/placement.js`). A customer with an order under way stays under it in Auction (Task 1).
- **New action sets are modules called by the store,** as in PR 5: `typestore.js` and `orderstore.js`.
- **New pure modules:**
  - `boxview.js`: the message box's rules, moved out of `model.js`;
  - `messages.js`: every message, behind More messages;
  - `emailview.js`: research notes and the email's facts;
  - `enquiry.js`: the type, its choices, its requests and Undo;
  - `orderview.js`: the order box, strip and tab.
- **A move the store asks for** (`state.goTo`) becomes a new history entry. The page follows a conversation to its new section, and Back returns.

**Tech Stack:** as PRs 1–5:
- Node 22 with `node:sqlite`, and no dependencies;
- the new page in Preact and htm, vendored as a classic script;
- pure ES modules, tested with `node --test`.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 4 (the four tabs, the enquiry type, "Changes to earlier decisions" row 3);
  - section 5 R2.4, M6 (R6.1–R6.3) and M7 (R7.1–R7.2);
  - section 7 "Moving between sections";
  - section 8 journey 5;
  - section 9 "The message box in detail";
  - section 14 stories 9 and 10.
- `eval/redesign/pr5-marketplace-ledger.md` (local). Its rulings and deferrals to PR 5b bind Task 0 and Task 3: lines 48–49, 54, 57, 79, 86 and 113–114.
- The prototype:
  - `prototype/js/store.js`: `A.setType`, `A.dismiss`;
  - `prototype/js/ui-thread.js`: ChatHead, TypeMenu, MoreMenu, Research, PasteBox.
- **The old page, for each feature and its words:**
  - `web/app.js`: `renderThread` (Remove on a pasted message), `renderOrderComposer`, `customerSections`, `mailInfo`, `orderInfo`, `moveTexts`, `importNotice`, `rulingWords`, `rulingButtons`;
  - `web/views/MoveMenu.js`;
  - `web/lib/copy.js`.
- **The engine:**
  - `src/placement.js`;
  - `src/items.js` (`place`, `listItems`, `buildMailItem`, `buildMarketplaceItem`);
  - `src/answered.js` (`answeredBy`, `replyShown`);
  - `src/server.js`:
    - `present`, `summary`, `offeredTemplates`, `sectionRows`, `enquiryRows`, `writeAgainIfUntouched`;
    - the routes `/send`, `/ruling`, `/move`, `/paste`, `/paste/:id/remove`, `/restore` and `/copied`;
  - `src/worker.js` (`draftWaiting`);
  - `src/ordermessages.js` (`enquiryTemplates`, `enquiryOrder`, `ENQUIRY_MESSAGES`);
  - `src/imports.js` (`planImport`, `enquiryStage`);
  - `src/importjudge.js` (`judgeImport`);
  - `src/learn.js` (`teachesHere`, `onRemember`).

## Switch-over checklist items in this PR

From `docs/superpowers/plans/2026-10-26-new-page-programme.md`, each with the task that covers it:

- **List:** the row tag folded in Gmail (Task 2).
- **Conversation:**
  - the head's Order no. (Task 4);
  - the car strip for an auction order (Task 4);
  - the order's events and staff notes, already drawn by the thread (checked in Task 4).
- **Message box:**
  - the import judgement line (Task 3);
  - Which message?, the whole list (Task 2);
  - email drafts off (Task 2);
  - the auction order box: the message picker, the paste box with We sent this and They wrote this, Remove, and Put back in To do (Task 4);
  - Copy for Gmail and Copy for WhatsApp, with their toasts and Put back (Tasks 2 and 4).
- **Panel:**
  - Import Query research notes, now under the box (Task 2);
  - Auction order details and Their texts (Task 4);
  - Where it is listed (Task 3).
- **Moves:** the Move menu with Undo becomes the enquiry type menu (Task 3).

## Global Constraints

The Global Constraints of PRs 1–5 hold:
- no dependencies, and the CSP unchanged;
- tokens only, plain words, and colour always with words;
- 44 px targets;
- **file size and structure:**
  - No new page source file (every file under `web/new/js` and `web/new/css`) is over 400 lines, as `test/newpage-size.test.js` counts them. That test counts the trailing newline, so `model.js` is at 400 today. Test files are not bound (PR 5 ruling, ledger line 67).
  - `model.js` does not grow. New rules go in modules of their own. Task 0b makes it smaller.
  - `store.js` (309 lines) takes only wiring. A new action set is its own module, and each new action is added to the list in `test/newpage-size.test.js`.
  - From Task 0b on, no `web/new/js` module imports another in a cycle. A test pins this.
- invented test data only;
- never the live folder, its database or port 3210. The preview runs on 3211 (`node test/support/preview.js`);
- no AI attribution in commits or the PR;
- the page never changes the reply string;
- Send on Facebook is the only send, and each channel has its one main button (PR 5);
- one test file runs with `node --disable-warning=ExperimentalWarning --test test/<name>.test.js`, and the suite with `npm.cmd test`.

Changed for this PR:
- **API: additions, plus two ruled changes.**
  - **The additions:**
    - `judged.quote`;
    - `stage` on an Imports text row;
    - the enquiry messages offered in Imports;
    - `listed: 'imports'` for an Imports-list lead in Imports;
    - `answered.how: 'facebook'`;
    - `same` on a send's 409;
    - `keep` on `/ruling` and `/move`.
  - **Ruled change 1 (PR 5 ledger, the residuals ruling, 28 Oct 2026):**
    - A Facebook send whose words are already in the chat as our reply, after the buyer's last message, is answered 409 "This reply has gone already.".
    - So is a send whose words are the noted reply of a send that timed out, whatever the buyer wrote since.
    - The 409 says, in `same`, whether the words sent now are the ones that went.
  - **Ruled change 2 (Confirmed 24 Oct 2026, PRD decision 2):**
    - A lead on the dashboard's Imports list belongs in Imports, not Auction.
    - A customer whose auction order is still under way stays under that order in Auction.
  - **Every other route and field behaves as before.** `/move` and `/ruling` differ in two ways only:
    - with `keep: true`, nothing is written again;
    - a Facebook chat is written again only where opening it would write it (PR 5 ledger, line 54).

    The old page's Move menu still offers Auction until the switch-over.
- **The enquiry type (R2.4, story 9):**
  - It is one property. The conversation's More menu has an "Enquiry type" heading with three choices:
    - Stock enquiry (Dashboard, or Marketplace for a Facebook chat);
    - Import enquiry (Imports);
    - Not a customer (Dismiss, with Undo).
  - An auction order has no type to choose.
  - Nothing moves into Marketplace.
  - Nothing is moved into Auction by hand, except an order customer's own texts, from the order's Their texts. This follows 24 Oct 2026 ("Auction holds orders only"), which is later than the 17 Oct "every direction".
  - Undo, for 9 s, puts the type and the section back.
  - An untouched draft is written again. Typed text is kept, and nothing is written over it.
- **Imports and the bid (M6):**
  - The exact-answer rule holds: what cannot be found is a blank plus research notes, never a guess.
  - The deposit link stays a blank (R6.3).
  - The suggested bid is worked out exactly as `src/imports.js` does it today (R6.2).
- **Auction orders (M7):**
  - An order's stage and its next message come from the wording file, as today.
  - Nothing is learned from an order: Remember is never offered, and copying is never approval.
- **Rulings for Jim (28 Oct 2026). Each is a reversible default and goes in the PR description:**
  - **A text read as an import enquiry never moves by itself.**
    - This keeps the 12 Oct 2026 rule over the PRD's "Imports holds every import enquiry". Its reason line says why, and Import enquiry in the menu moves it.
    - Cost if wrong: one click to move each one.
  - **A text from the dashboard's Imports list teaches nothing in Imports,** as it taught nothing in Auction. Remember is refused for it.
    - Cost if wrong: those replies do not teach until Jim says so.
  - **Imports and Auction are still written in the background as today** (PR 5's ruling).
    - Cost if wrong: requests spent on suggestions that may go unused.
  - **Imports is always on.** Emails are listed only while the email intake is on.
    - Its tab now shows with the intake off. PR 5's tab rule stays for Marketplace.
    - Cost if wrong: an Imports tab shows even with the intake off.
  - **Every Imports row that is not an email gets the auction pre-order messages it had in Auction,** plus the Imports templates. Emails keep their own three.
    - Cost if wrong: an email customer cannot get "Car found" from the list (Tell Wheelman still can).
  - **A move into Imports searches the auction once,** as a move into Auction did.
    - Cost if wrong: one auction lookup, with no AI request.
  - **"More messages" follows the Instead line in every section** whenever more than three messages fit. It brings back the old page's whole list.
    - Cost if wrong: one more control.
  - **The enquiry type lives in More,** not in a button of its own in the head.
    - Cost if wrong: one more click than the prototype.
  - **After a type change the page follows the conversation,** and checks every 2 s, up to 30 s, for the rewrite.
    - Cost if wrong: one Back, and a few local requests.
  - **Undo of a type change writes an untouched reply again.**
    - Cost if wrong: one more AI request.
  - **Research notes are under the box** (as in the PRD), not in the panel (as on the old page).
    - Cost if wrong: a different place than Jim is used to.
  - **A removed paste has no Undo,** as on the old page.
    - Cost if wrong: paste it again.
  - **The same words are refused on any Facebook chat while they are our reply since the buyer last wrote** (new in this refresh). This includes words the auto-reply sent.
    - Cost if wrong: to send identical words on purpose, Jim changes one word.
  - **The note after a timed-out send lasts until a later send on that chat is taken, or Wheelman restarts** (new in this refresh). Until then its words are refused on that chat, even after the buyer has written again.
    - Cost if wrong: if the buyer asks for exactly that reply again, Jim changes one word.
  - **A person's reply on a Facebook chat reads "Answered on Facebook"** (new in this refresh). This includes Jim's own send that timed out and went, until a send on that chat finds it and marks it sent. It then reads "Sent on Facebook".
    - Cost if wrong: words only.
  - **A type change with text in the box tells the server to keep it** (`keep: true`, new in this refresh). Nothing is written over it, even when the edit has not landed or there is no suggestion to keep it with.
    - Cost if wrong: none for Jim; one optional field on two routes.

## Review Focus

1. **A lead from the Imports list lost between sections**: with the email intake off, with a live order, or after it was moved. It is always in exactly one list. Pinned in Task 1: `a lead from the Imports list is listed in Imports, also with the email intake off, and one with a live order stays under its order`.
2. **Typed text during an enquiry type change.**
   - The edit goes out first, and the request carries `keep: true`. The server writes nothing over it.
   - The text stays in the box.

   Pinned in Task 3: `a type change with typed text keeps the text and writes nothing again`.
3. **Undo after a type change, also once Jim has moved on.**
   - The type and the section go back exactly.
   - The page goes back with them only while that conversation is still open, and never takes Jim away from another one.

   Pinned in Task 3: `Undo puts the enquiry type and the section back as they were`.
4. **A pasted WhatsApp message while Jim had typed in the box.** His text stays, and the new suggestion is offered, not forced in. Pinned in Task 4: `a pasted message keeps what was typed and offers the new suggestion`.
5. **A picked order message rewritten as the one that is due.** Tell Wheelman and Try again keep the message Jim picked. Pinned in Task 4: `the message picker lists the order's messages, the due one first, and a picked message is kept for Tell and Try again`.
6. **A deliberate new reply after "This reply has gone already.", or after the buyer wrote again.** Other words go, once. The words that went never go twice, from any page. Pinned in Task 0a: `the reply that timed out is refused again after the buyer wrote, and other words go`.
7. **Jim's words cleared by a 409 they were not part of.** The box is cleared only when the server says the words sent are the ones that went, whatever the page's own comparison says. Pinned in Task 0a: `a 409 clears the box only when the server says these words are the ones that went`.
8. **Send it again refused by the new same-words rule.** A reply the engine took but did not deliver is not in the chat, so it can be sent again. Pinned in Task 0a: `the same words as our reply since the buyer last wrote are refused on any chat, and a reply that did not reach the buyer can be sent again`.
9. **The `model.js` split changes a box state, or a cycle comes back** later, for example when `model.js` imports a box module again. Every existing box test passes unchanged. Pinned in Task 0b: `the new page's modules import one another without a cycle`.

---

### Task 0a: Send on Facebook never sends the same words twice

This closes the three residuals of PR 5's final re-review (ledger lines 113–114) and its nit:
- the old page's second press after a 409;
- the same words sent again after the buyer wrote;
- the page's comparison not matching the server's tagged text;
- the nit: the undelivered view's Copy is not quiet.

**Files:**
- Modify:
  - `src/answered.js`: `sameReply`, `wentAfter` and `alreadySent`, beside `replyShown`;
  - `src/server.js`:
    - the `/send` route (lines 828–904);
    - the `mayHaveGone` note (line 426);
  - `web/new/js/api.js`: `same` on a 409's error;
  - `web/new/js/sender.js` `failedSend`, in its `gone` branch (lines 167–178);
  - `web/new/js/ui/messagebox.js` line 125: the undelivered view's Copy is `btn quiet`;
  - `README.md`: "The new page" (lines 727–733) and the 28 October Status line (line 2202).
- Test:
  - `test/newpage-send-maygone.test.js`: four added, one assertion changed;
  - `test/newpage-send-checkfirst.test.js`: one added, the `gone` helper changed;
  - `test/newpage-send-delivery.test.js`: one regex changed.

**Interfaces:**
- **In `src/answered.js`:**
  - `sameReply(a, b, tag = 'marketplace')` returns a boolean: the same words as a chat keeps them (`plainReply`: the link tag and runs of space set aside). It is false when either is empty.
  - `wentAfter(timeline, anchor, text, tag)` returns a boolean:
    - true for a reply of ours (`who: 'us'`, not internal) with these words after the message `anchor`, whatever the customer wrote since;
    - false when `anchor` is not in the timeline.

    `replyShown` stays as it is: `wentAfter`, with nothing from the customer after that reply.
  - `alreadySent(timeline, text, tag)` returns a boolean: a reply of ours with these words after the customer's last message (`lastCustomerEntry`), or anywhere when the customer has written nothing.
- **The note** after a 504 is `{ text, anchor, draftId, at, found: false, told: false }` by key. It lives in memory only, as now.
- **The 409.** `POST /api/items/mp:<id>/send` answers 409 `{ error: 'This reply has gone already.', gone: true, same }`.
  - `same` is true when the words sent now are the ones that went.
  - It is compared on the server's own text: the box text after `tagMarketplaceLinks`, then `sameReply`.
- **The page's api error** carries `same: true | false` beside `gone: true` (`web/new/js/api.js`).
- **The route,** after the blank check and the in-flight guard, in this order:
  1. **A note not yet found.**
     - Marketplace is read afresh. A failed read answers 502, as now, and the note stays.
     - The chat is built again.
     - When the noted reply is not `wentAfter` its anchor, the note goes and the send carries on.
     - When it is, `found` becomes true, and its suggestion is marked sent from here once, as the 409 path does today (`onEdited`, `recordSentHere`).
  2. **A found note:**
     - words that are `sameReply` to the note's: 409 with `same: true`, whatever the buyer wrote since;
     - other words, with nothing from the buyer since that reply (`replyShown`) and `told` still false: 409 with `same: false`, and `told` becomes true, so his next press sends them (the 8f86048 ruling, ledger line 111);
     - otherwise the send carries on.
  3. **Any chat:** when `alreadySent` holds on Wheelman's copy (the one built in step 1, if any), 409 with `same: true`. No Marketplace read is made for this.
  4. **After the send:**
     - when the engine takes the reply (200), the note goes;
     - a 504 sets a fresh note in place of any;
     - a 502 leaves the note.

  Each 409 logs one line under `marketplace`, as now.
- **A changed call:** the PR 5 ledger accepted the fixer's "the 409 only when the buyer has written nothing since our reply" (line 110). For the words that went, the 409 now holds whatever the buyer wrote since (the residuals ruling, line 114). Other words keep that rule, once.

- [ ] **Step 1: Write the failing tests.**
  - **In `test/newpage-send-maygone.test.js`** (real routes and the stand-in engine; reuse `buyer`, `timesOut`, `post` and `replies`):
    - `a second press with the same words after "This reply has gone already." is refused again, from the old page too`:
      - after a 504, two posts of the same text each answer 409 `{ error: GONE, gone: true, same: true }`;
      - `replies(id).length` stays 1.
    - `the reply that timed out is refused again after the buyer wrote, and other words go`:
      - a 504 with Marketplace readable;
      - then the buyer writes again: push an `in` message onto the stand-in chat, set the row's `last_direction: 'in'` and `last_message_at`, and run `syncMarketplace()`;
      - the same text answers 409 with `same: true`, and other words answer 200;
      - `replies(id).length` is 2.
    - `the 409 says whether the words sent are the ones that went, compared on the tagged text`:
      - the noted text holds `` `${config.site.baseUrl}/vehicles/1159?utm_source=facebook` ``, which the server tags `utm_source=marketplace`;
      - the same text again answers 409 with `same: true`;
      - on a second chat, other words with nothing from the buyer since answer 409 with `same: false`, then the same other words answer 200.
    - `the same words as our reply since the buyer last wrote are refused on any chat, and a reply that did not reach the buyer can be sent again`:
      - a send answered 200, then the same text answers 409 with `same: true`;
      - no Marketplace read comes first: the count of GET `/inbox/conversations` is unchanged;
      - a chat in `world.failDeliveryOnce` takes the reply but does not deliver it, and the same text again answers 200.
  - **Change** `the old page's send is checked the same way, and a chat that cannot be read first sends nothing`: its 409 body is `{ error: GONE, gone: true, same: true }`.
  - **In `test/newpage-send-checkfirst.test.js`:**
    - The helper becomes `gone(same = true)`.
    - `a 409 after a timed-out send keeps a different reply in the box` uses `gone(false)`.
    - In `a 409 that says the reply has gone already shows it sent, and nothing more is posted`, the api check also asserts `e.same === true`, and `e.same === false` for a body with `same: false`.
    - Add `a 409 clears the box only when the server says these words are the ones that went`:
      1. With `gone(true)`, while the re-read thread shows the reply with `utm_source=marketplace` and the box holds it with `utm_source=facebook` (`sameText` says they differ): `typed` is null and `sending` is `{}`.
      2. With `gone(false)`, while the thread shows the box's very words: the text stays in `typed`.
  - **In `test/newpage-send-delivery.test.js`,** `a reply that did not reach the buyer is shown with a quiet Copy, and once copied the box says Copied as its row does`: its regex reads `class="btn quiet"`.
- [ ] **Step 2: Run** the three files. Expected: FAIL on the new and changed assertions only.
- [ ] **Step 3: Implement.**
  - In `sender.js`'s `gone` branch:
    - `went(key, read.item)` when `e.same`. `read.item` may be null; `went` then marks the suggestion sent locally, as now.
    - Otherwise it does what it does now for other words.
  - In `README.md` line 729, replace "A send that may have gone is never sent twice." with:
    > Wheelman does not send words that are already in the chat as our reply since the buyer last wrote, from any page.
  - In the same paragraph, replace "If the reply is there, nothing more is sent and Wheelman says it has gone already." with:
    > If the reply is there, nothing more is sent and Wheelman says it has gone already. While it is running, it does not send those words to that chat again, even after the buyer has written back, and the box is cleared only when the words you sent are the ones that went.
  - In the 28 October Status line, "which never sends twice and says plainly when a reply did not reach the buyer" becomes:
    > which checks the chat before a reply that may have gone is sent again, and says plainly when a reply did not reach the buyer
- [ ] **Step 4: Run** the three files, then `npm.cmd test` and `npm.cmd run check-private`. Check on the preview:
  - Liam's Send is refused once, then Try again, then Sent;
  - Tove's Send it again goes once;
  - the undelivered Copy is quiet.

  Screenshots go under `D:\Jim\Wheelman\.playwright-mcp\new-page-5b\` as `task0a-*.png`.
- [ ] **Step 5: Commit:** `Marketplace: the same words are never sent to a buyer twice, from any page, and a 409 says whether the words sent are the ones that went`

### Task 0b: model.js split in two, the old page's dead retry words, and Answered on Facebook

These are the deferrals to PR 5b (ledger lines 48–49, 57, 79 and 86).

**Files:**
- Create: `web/new/js/boxview.js`, pure. It holds `answeredWords`, `boxText`, `mainAction` and `boxView`, moved from `model.js` as they are, with `PUT_BACK` and `PUT_BACK_FOLLOW_UP`. It imports only `../../lib/blank.js` and `../../lib/format.js`.
- Modify:
  - `web/new/js/model.js`:
    - it imports `answeredWords` from `./boxview.js` for `rowView`;
    - it re-exports the four: `export { answeredWords, boxText, mainAction, boxView } from './boxview.js'`. Every existing import of them stays as it is;
    - it drops `export { boxViewOf } from './boxsections.js'` (line 280);
    - it ends near 325 lines.
  - `web/new/js/boxsections.js` line 5, and `web/new/js/channel.js` line 5: they import from `./boxview.js`.
  - `web/new/js/runstore.js` line 22: the comment names `boxsections.js boxViewOf`.
  - `web/lib/copy.js` line 279: `composer.retry.marketplace` goes.
  - `web/app.js`:
    - `retryFor` (line 547) gives 0 for a Facebook chat, since nothing retries one;
    - line 782 chooses between `composer.retry.daily` and `composer.retry.busy` only.
  - `src/answered.js` `answeredBy`: a reply of ours on a Marketplace chat that is not the auto-reply's (`reply.via === 'Marketplace'`) is `{ how: 'facebook', by: '', at }`. This replaces line 48's 'dashboard' with no name.
  - `web/new/js/boxview.js` `answeredWords`: adds `facebook: 'Answered on Facebook'`.
  - `src/server.js`, the `answered` comment in `summary()` (line 204): it names the five ways.
- Test:
  - `test/newpage-size.test.js`;
  - `test/newpage-fbchat.test.js`;
  - `test/marketplace-onopen.test.js`;
  - `test/answered.test.js`;
  - `test/newpage-model.test.js`;
  - `test/newpage-send-maygone.test.js`.

**Interfaces:**
- **The split** changes no view, label or word.
- **`answered.how` gains `'facebook'`:** a person's reply on Facebook. That is Jim's own after a send that timed out, a colleague's from the shared page, or one typed on the engine's page.
  - The row and the box read "Answered on Facebook 10:42".
  - `'wheelman'` still wins when the suggestion was sent from here (`sent_here_at`). So once a send's check finds a timed-out reply, it reads "Sent on Facebook at …".

- [ ] **Step 1: Write the failing tests.**
  - **`test/newpage-size.test.js`:** `the new page's modules import one another without a cycle`.
    - It reads every `.js` under `web/new/js`, with `ui/`.
    - It follows each relative `import … from` and `export … from`, and finds no cycle.
    - `boxsections.js` and `channel.js` import nothing from `model.js`.
  - **`test/newpage-fbchat.test.js`:** the `fromModel` import (line 7) and its assertion (line 176) give way to a source check:
    - `ui/messagebox.js` and `ui/conversation.js` both import `boxViewOf` from `../boxsections.js`;
    - `model.js` exports no `boxViewOf`.
  - **`test/marketplace-onopen.test.js`:** `the old page has no retry words for a Facebook chat, since nothing retries one`.
    - `Object.hasOwn(COPY, 'composer.retry.marketplace')` is false;
    - `web/app.js` does not mention it.
  - **`test/answered.test.js`:**
    - `a Marketplace reply typed by a person names nobody` expects `{ how: 'facebook', by: '', at: 2 }`.
    - Add `a Facebook chat a person answered on Facebook says so, not the dashboard`:
      - make a chat in `mp_conversations` as `an auto-reply says so` does, with an `out` message from `source: 'dashboard'` with `status: 'sent'`;
      - `answered.how` is `'facebook'`;
      - the page's `rowView(row, { now }).reason` matches `/^Answered on Facebook /`.
  - **`test/newpage-model.test.js`,** `answeredWords says how, by whom and when`: `answeredWords({ how: 'facebook', by: '', at }, now)` equals `'Answered on Facebook ' + clock(at)`.
  - **`test/newpage-send-maygone.test.js`:** `a reply that timed out and went reads Answered on Facebook, not on the dashboard`.
    - A 504 with Marketplace readable.
    - Once the chat is answered, `answered.how` is `'facebook'`.
    - `sectionBox({ item, now }).sentence` matches `/^Answered on Facebook .*No reply needed\.$/`.
- [ ] **Step 2: Run** the six files. Expected: FAIL on the new and changed assertions only. Every other box and model test passes before and after.
- [ ] **Step 3: Implement.** Move the code as it is, and change no words in the move.
- [ ] **Step 4: Run** the six files, then `npm.cmd test`. On the preview, Dashboard, Liam and Tove look as before, with no console errors.
- [ ] **Step 5: Commit:** `New page: the message box's rules move out of model.js, the old page loses words that could not show, and a Facebook chat answered on Facebook says so`

### Task 1: Imports takes the leads from the dashboard's Imports list

**Files:**
- Modify:
  - `src/placement.js`:
    - `naturalSection` (line 39): a live order first (`auction`), then `onImportsList` (`importquery`);
    - `sectionOn` (line 25): `importquery` is always on. Marketplace still follows `config.marketplace.enabled`;
    - the header comment's table (lines 9–17).
  - `src/items.js` `listItems` (line 847):
    - the `importquery` branch (line 883) lists:
      1. the Imports-list leads and conversations: the two queries now at lines 895–903 of the `auction` branch;
      2. then the email threads, only while `config.mail.switchedOn`;
      3. then `keepMoved()`;
    - the `auction` branch keeps `liveOrderCustomers()` and `keepMoved()`.
  - `src/ordermessages.js` `enquiryTemplates` (line 438): offered in Auction as today, and in Imports for any conversation whose channel is not `email`.
  - `src/server.js`:
    - `offeredTemplates` (line 347):
      - in Imports, `[...enquiryTemplates(item).map((t) => ({ ...t, best: t.due })), ...templatesFor(item)]`;
      - a picked message that is no longer offered is labelled from `MESSAGES` first, then `sectionTemplateLabel`;
    - `present()`'s `listed` (line 405):
      - `'moved'` first;
      - then `'imports'` for `item.section === 'importquery' && item.home === 'importquery' && onImportsList(item)`;
      - then `'order'` in Auction, as now;
    - `summary()` (line 188): `stage: enquiryStage(item).label` for a row in Imports that is not an email and has `item.imports`;
    - `enquiryRows()`'s comment (line 447): Auction's rows that are not orders are now a moved conversation, or a live-order customer's other conversation.
  - `src/imports.js` `planImport` (line 333): `unoffered` holds for a move into Imports as for one into Auction.
  - `src/learn.js`:
    - `teachesHere` (line 49) is false for `onImportsList(item)`;
    - `onRemember` (line 376) refuses it, after the Auction check, with `REMEMBER_IMPORTS_LIST = "Conversations from the dashboard's Imports list do not teach Wheelman."`.
  - `src/worker.js` `draftWaiting` (line 249): the Imports queue is no longer gated on `config.mail.switchedOn`, because `listItems` leaves the emails out itself.
  - `web/new/js/lessons.js` `rememberOffer` (line 39): null when `item.teaches === false`.
  - `web/new/js/sections.js` `sectionRowView` (line 91): a row that is not an order, with `row.stage` and no other reason, shows its stage with tone ''. That covers Imports' texts, and Auction's moved enquiries, whose rows already carry a stage.
  - `test/support/preview.js`.
- Test: `test/imports-section.test.js`. Update the tests that pin the old place:
  - in `test/placement.test.js`:
    - `a lead from the Imports list with no order is listed in Auction as an enquiry, and not in Dashboard` (line 60): Imports in place of Auction, `[item.section, item.listed, item.isImport]` is `['importquery', 'imports', true]`, and the name says Imports;
    - `a conversation moves between Dashboard, Auction and Import Query in every direction, and Undo takes it back` (line 73): `l:9101` moves `from` `'importquery'`, and back into Imports;
    - `a move follows the lead into the text conversation that starts later, and Import Query switched off sends it home` (line 231): with the intake off it stays in Imports (`['importquery', 'dashboard']`) and a move there is taken. Its name ends "and it stays in Imports with the email intake off";
    - `the background writer writes for enquiries in Auction and for orders a customer has texted` (line 275): Yan's enquiry is in Imports now, and still written;
    - `an Imports lead that nobody moved is searched for only when it tells us something new` (line 336): `item.section` is `'importquery'`;
  - `test/templates.test.js`, `an enquiry in Auction has "Which message?" too: …` (line 394):
    - `item.section` is `'importquery'`;
    - the first six ids are as now, then the Imports templates;
    - `best` is on the due one;
    - its name says Imports;
  - `test/importquery.test.js`, `the section lists the threads, counts them, searches them, and is off with the intake` (line 265):
    - with the intake off the section stays Imports, with no email row;
    - `sections.importquery` is a number;
    - its name ends "and lists no email with the intake off";
  - any other assertion that `npm.cmd test` shows counted an Imports-list lead in Auction. `test/orders.test.js`'s counts do not: Nina and Remy have live orders.

  Each changed assertion is listed in the commit body.

**Interfaces:**
- **A conversation's placement** is now:
  - `ao:` is Auction;
  - `mp:` is Marketplace;
  - `em:` is Imports;
  - a live order is Auction (under the order when the order reads it);
  - `onImportsList` is Imports;
  - else Dashboard.

  Moves work as before.
- **`GET /api/items/<key>` of an Imports-list lead** gives:
  - `section: 'importquery'`, `listed: 'imports'`, `isImport: true`, `teaches: false`;
  - `templates`: the six enquiry messages first (`best` on the due one), then the Imports templates.

- [ ] **Step 1: Write the failing tests:**
  - `a lead from the Imports list is listed in Imports, also with the email intake off, and one with a live order stays under its order`;
  - `an Imports lead keeps the messages it had in Auction, the due one first, and its row says where the enquiry has got to`: the row's `stage` matches `/^Enquiry: /`;
  - `an email in Imports keeps its own three messages and is not offered the auction ones`;
  - `moving a conversation into Imports searches the auction once, as a move into Auction did`;
  - `a conversation from the Imports list teaches nothing in Imports, and Remember is refused`;
  - `the background writer writes for Imports texts with the email intake off`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Add "Imani Invented" (`0491 570 194`) to the preview:
  - push `rawLead(794, null, imani, now, { platform: 'IMPORTS', source: 'Import', … })` onto `invented.leads.IMPORTS`, before `startStandins`;
  - she has no order;
  - her enquiry reads: "Could you find me a Daihatsu Copen? 2016 or newer, under 60,000 km."
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - Imports lists Imani with "Enquiry: …", and Instead offers "Thanks, with estimate and deposit";
  - Auction lists orders, and Nina and Remy stay under their orders.

  Screenshots as `task1-*.png`.
- [ ] **Step 5: Commit:** `Imports: the leads from the dashboard's Imports list are listed in Imports, with the messages they had in Auction`

### Task 2: Imports on the new page: Copy for Gmail, research notes and every message

**Files:**
- Create:
  - `web/new/js/messages.js`, pure: `messageOptions`.
  - `web/new/js/emailview.js`, pure: `researchView`, `emailRows`.
  - `web/new/js/ui/research.js`.
- Modify:
  - `web/new/js/ui/messagebox.js` (269 lines):
    - `messageOptions(item).shown` in place of `insteadOptions(item)` (line 154);
    - More messages after the Instead line (lines 233–235);
    - the research notes under the box, drawn by `MessageBox`.

    If the file would pass 400 lines, the Instead line moves to `ui/instead.js`.
  - `web/new/js/boxsections.js` `sectionBox`: email drafts off;
  - `web/new/js/ui/customertab.js`: the Email section;
  - `web/new/js/sections.js` `sectionRowView`: Folded in Gmail;
  - `test/support/preview.js`.
- Test: `test/newpage-imports.test.js`.

**Interfaces:**
- **`messageOptions(item)`** returns `{ shown, more }`.
  - `shown` is `insteadOptions(item)` (`model.js`).
  - `more` is every other template in the conversation's list, in the server's order, except the one in the box.
  - The Instead line gains a MenuButton (`ui/menu.js`) "More messages" when `more` is not empty. Each choice runs `actions.instead(id)`.
  - This is in every section.
- **`researchView(r)`** reads `draft.research`: `{ found, notFound, notes, sources: [{ url, label }], readAt, listReadAt }`.
  - It returns `{ count, found, notFound, notes, sources, when }`, or null without research. `count` is `found.length + notFound.length`.
  - The words are the old page's (`mailInfo`, `web/app.js` line 1385):
    - "No model could be matched to this email.";
    - "Could not be found (the reply has a blank for each):";
    - "Read from: ", with links;
    - "Looked up <clock>, from the eligible-models list read <listTime>."
  - `ui/research.js` shows it under the box, for a ready suggestion only, as a closed `<details>`: "What Wheelman looked up (N)".
- **`emailRows(mail)`:**
  - Subject, From (`customerEmail`), Model asked about (`car`);
  - Messages ("5, 1 folded in Gmail");
  - First message, Latest;
  - with folded messages: "Part of this thread could not be read because Gmail had folded it. In Gmail, press Expand all, then Send to Wheelman again."
- **`sectionBox`:** an email with `mail.draftsOff` and no ready draft reads `item.autoReason || 'Suggested replies for emails are switched off.'`, with no button. `draftsOff` is always false today (`src/items.js` line 804), so the test uses an invented item.
- **Rows:** a row with `collapsed` reads "Folded in Gmail" (warn). It comes ahead of every reason but done and a failed send.
- **Copy for Gmail and its toast** come from PR 5's `mainFor` and `copiedWords`. The test below pins them on an Imports email, and passes already.

- [ ] **Step 1: Write the failing tests:**
  - `an email's main button is Copy for Gmail and its toast says to paste it into Gmail`;
  - `research notes list what was found, what was not and where it was read`;
  - `More messages lists every message past the three on the Instead line`;
  - `a folded email says so on its row and in the panel`;
  - `an email with suggestions switched off says so and offers nothing to copy`.
- [ ] **Step 2: Run** them. Expected: FAIL, except the first, which passes from PR 5.
- [ ] **Step 3: Implement.** Add an invented import email to the preview:
  - from "Hollis Invented" (`hollis@example.com`);
  - subject "Importing a Toyota Hiace GDH206";
  - with one folded message.

  Store it with `storeMailThread(validateMailReport(report))` (`src/mail.js`), after the server starts.
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - Hollis: research notes, Copy for Gmail, "Folded in Gmail";
  - Imani: More messages lists all six enquiry messages.

  Screenshots as `task2-*.png`.
- [ ] **Step 5: Commit:** `New page: Imports with Copy for Gmail, the research notes, and every message behind More messages`

### Task 3: The enquiry type

**Files:**
- Modify the server:
  - `src/importjudge.js`: `judgeImport` adds `quote` for the `words` sign. That is the customer's sentence holding the match, at most 60 characters, cut around the match with "…".
  - `src/server.js`:
    - `present()`'s `judged` (line 390): `quote`;
    - `writeAgainIfUntouched(key, item, { keep = false } = {})` (line 571):
      - with `keep` it writes nothing;
      - a Facebook chat is written again only while `fresh.autoDraft`: a buyer, with words, not archived, as opening writes it. A seller or photo-only chat is not written after a move. This is the PR 5 ledger's ruling (line 54), deferred to Move's replacement;
    - `/ruling` (line 919) and `/move` (line 942) pass `{ keep: body.keep === true }`.
- Create:
  - `web/new/js/enquiry.js`, pure: `typeView`, `typeRequest`, `typeUndo`, `listedWords`.
  - `web/new/js/typestore.js`: `createTypeChanger`.
- Modify the page:
  - `web/new/js/hashsync.js`: `goToHash`;
  - `web/new/js/main.js`: a store subscriber writes `goToHash`'s hash with `location.hash =`;
  - `web/new/js/store.js`:
    - the wiring;
    - `state.goTo` (null at start);
    - the action `setType`;
  - `web/new/js/finish.js`: `dismiss(words = 'Dismissed')`. Its toast words can be given. The More menu's Dismiss still passes none, because MenuButton calls `run()` with no arguments;
  - `web/new/js/ui/conversation.js`:
    - the More menu (line 48), with the "Enquiry type" heading and its three choices first;
    - the head line, starting with the type when it is not the section's own;
  - `web/new/js/ui/messagebox.js`: the reason as the context line;
  - `web/new/js/ui/customertab.js`: Where it is listed;
  - `test/support/preview.js`;
  - `test/newpage-size.test.js`: `'setType'` in the action list.
- Test:
  - `test/importjudge.test.js`: two added;
  - `test/newpage-enquiry.test.js`;
  - `test/newpage-hashsync.test.js`: one added;
  - `test/marketplace-onopen.test.js`: one added.

**Interfaces:**
- **`typeView(item)`** returns `{ type, label, reason, choices }`.
  - An order: `{ type:'order', label:'Auction order', reason:'', choices:[] }`.
  - Otherwise `type` is `'import'` when `item.isImport || item.section === 'importquery'`, else `'stock'`. The label is "Import enquiry" or "Stock enquiry".
  - **`choices`** are MenuButton radio items (`checked` for the type). The More menu shows them first, under the heading "Enquiry type":
    - Stock enquiry, hint "Answered from the cars we have · Dashboard" (or "· Marketplace" for a Facebook chat);
    - Import enquiry, hint "Answered with eligibility, landed cost and the deposit · Imports";
    - Not a customer, hint "Dismissed, with Undo. It stays under All.".
  - **`reason`** is shown in the box only for a reading not yet confirmed (no `item.ruling`), while the conversation is in Dashboard:
    - read by code: "Read as an import enquiry: they asked “<quote>”." (or ": <why>." without a quote), then " Choose Import enquiry in More to list it in Imports.";
    - the AI's guess alone (`draft.aiImport`): "The AI thought this might be an import enquiry: a car to find in Japan, not one on the yard.";
    - else ''.

    A reading never moves the conversation by itself (Ruling, 28 Oct 2026).
- **`listedWords(item)`**, under "Where it is listed" in the Customer tab:
  - moved: "You moved it to <section>. It came in as <home>, and the reply still goes out the way it came in.";
  - `listed` imports: "Listed in Imports: it came from the dashboard's Imports list.";
  - `listed` order: "Listed in Auction: this customer has an auction order under way.";
  - ruling general: "You said this is not an import enquiry. The reply is written the ordinary way.";
  - ruling import: "You said this is an import enquiry. The reply is written the import way.";
  - judged: "Wheelman reads this as an import enquiry: <why>.";
  - else ''.
- **`typeRequest(item, type)`** returns `{ path, body }`, or null when nothing would change. The target is Imports for import; for stock, Marketplace for a Facebook chat, else Dashboard.
  - `c:` and `l:` keys: `POST /api/items/<key>/ruling { kind: 'import'|'general', section: target }`;
  - any other key: `POST /api/items/<key>/move { section: target }`.
- **`typeUndo(item)`** is made from the item before the change:
  - `c:` and `l:` keys: `/ruling { kind: item.ruling ? item.ruling.kind : '', section: item.section }`;
  - otherwise: `/move { section: item.section }`.
- **`createTypeChanger({ api, get, set, toast, flush, refresh, dismiss, timers })`** returns `{ setType(type) }`.
  - "Not a customer" calls `dismiss('Dismissed as not a customer')`, with its Undo.
  - Otherwise it calls `flush()`, so the edit goes out at once, then posts `typeRequest`'s body with `keep: true` while the box holds typed text (`state.typed !== null`). `autosave.flush()` returns nothing to await. `keep` is what makes sure nothing is written over the text.
  - **On success it:**
    - takes `out.item`;
    - sets `goTo: { section: out.item.section, chip: validChip(section, state awaiting ? 'waiting' : 'all'), key, n }`, where `n` counts up;
    - toasts "Moved to Imports.", "Moved to Dashboard." or "Moved to Marketplace." (or "Now answered as an import enquiry." or "… stock enquiry." when nothing moved), with " The reply is being written again." when `out.writing`, and Undo (9 s);
    - while `item.writing`, refreshes every 2 s, at most 15 times.
  - **Undo** posts `typeUndo`'s body, with `keep` as above, and toasts "Put back as it was.". It sets `goTo` back only while that conversation is still open.
- **`goToHash(seenN, s)`** returns `{ hash, n }` for a `goTo` not yet followed, else null. `main.js` writes it with `location.hash =` (a new history entry), and `storeStep` does the rest.

- [ ] **Step 1: Write the failing tests:**
  - `the words that made it an import enquiry are quoted` (`test/importjudge.test.js`);
  - `a ruling or a move with keep writes nothing again` (`test/importjudge.test.js`): the route answers `writing: false`, and no new draft is stored;
  - `a move writes a Facebook chat again only where opening it would write it` (`test/marketplace-onopen.test.js`): a waiting buyer moved to Imports is written, and a chat not marked as a buyer, or a photo with no words, is not;
  - `the enquiry type and its choices follow the conversation's section and channel`: a Dashboard text, a Facebook chat, an Imports email and an order;
  - `the reason line quotes the customer's words while it is still in Dashboard, and nothing moves by itself`;
  - `choosing Import enquiry rules and moves a text in one request, and an email or a Facebook chat moves`;
  - `the page follows the conversation to its new section`;
  - `Undo puts the enquiry type and the section back as they were`: this includes an Undo after another conversation was opened, where the page stays where Jim is;
  - `Not a customer dismisses it with Undo`;
  - `a type change with typed text keeps the text and writes nothing again`: the edit goes out (a keepalive beacon) before `/ruling`, `/ruling`'s body has `keep: true`, and the typed text stays;
  - `a rewrite after a type change is shown once it is written`;
  - `a move the store asks for becomes a new address once` (`test/newpage-hashsync.test.js`).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Add "Jory Invented" (`0491 570 195`) to the preview: a Dashboard text from lead and conversation 795, made as Wynn's is. He writes: "Hi, can you import a Toyota Hiace from Japan for me?"
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - Jory shows the reason line and stays in Dashboard. More, then Import enquiry, moves him to Imports with Undo, and the reply is rewritten.
  - Undo brings him back.
  - Imani, as Stock enquiry, goes to Dashboard.
  - A Facebook chat, as Import enquiry, goes to Imports, and its button still reads Send on Facebook.

  Screenshots as `task3-*.png`.
- [ ] **Step 5: Commit:** `New page: the enquiry type, with its reason, in the conversation's menu, in place of Move and the import buttons`

### Task 4: Auction orders on the new page

**Files:**
- Create:
  - `web/new/js/orderview.js`, pure: `orderBox`, `orderOptions`, `orderStrip`, `orderSections`.
  - `web/new/js/orderstore.js`: `createOrderActions`.
  - `web/new/js/ui/orderbox.js`: the picker and the paste box.
  - `web/new/js/ui/ordertab.js`.
- Modify:
  - `web/new/js/boxsections.js`:
    - `sectionBox` sends an order to `orderBox`;
    - `boxViewOf` (line 113) passes `picked: s.picked`.
  - `web/new/js/messages.js`: an order's options.
  - `web/new/js/store.js`:
    - the closure `picked` (line 38) becomes `state.picked`: null, or the message picked. `instead` sets it, `show` clears it, and `itemPath` reads it;
    - `templateInHand` (line 228) for an order is `item.order.replying ? undefined : item.order.message || undefined`, so Tell and Try again keep the picked message;
    - the wiring of `paste`, `removePaste` and `moveTexts`.
  - `web/new/js/finish.js`:
    - an order's Copy sends its text, as today;
    - in `copyNow` (lines 54–56), its toast's action for an order is "Put back in To do", which runs `restore(key)`;
    - `restore` also clears the local done mark (`putBack(key)` when `done[key]` is set).
  - `web/new/js/ui/conversation.js`:
    - the order strip;
    - "Remove" on a pasted message (`in:` and `po:` keys);
    - More's Dismiss for an order reads "Dismiss this message".
  - `web/new/js/ui/panel.js` (`TABS`, line 16): for an order, the Car tab reads "Order" and shows `OrderTab`. Its id stays `'car'`, so the panel store's tab is kept.
  - `web/new/js/ui/messagebox.js`.
  - `test/support/preview.js`.
  - `test/newpage-size.test.js`: `'paste'`, `'removePaste'` and `'moveTexts'` in the action list.
- Test: `test/newpage-orders.test.js`.

**Interfaces:**
- **`orderBox({ item, picked, done, doneAt, writing, typed })`** returns views like `boxView`'s. The words are the old page's (`renderOrderComposer`, `web/app.js` line 800), in this order:
  1. writing: writing;
  2. typed text: the editor;
  3. copied here (`done`): "Copied at <clock>." (good), with Put back in To do (`act:'restore'`);
  4. when `!order.replying && !picked && (order.handled || state !== 'awaiting')`:
     - `handled` copied: "You copied the message that was due. It is shown in the conversation above.", with Put back in To do;
     - `handled` dismissed: "You dismissed the message that was due.", with Put back in To do;
     - finished: "This order is finished. No message is due.";
     - else: "No message is due for this order right now. Choose a message to write it anyway.";
  5. a ready draft: the editor;
  6. a failed draft: its error, or "This message could not be written.", with Try again;
  7. no draft: "They wrote to us. A reply has not been written yet." when replying, else "<order.why or 'A message is due.'> It is being prepared.", with Write it now.

  The picker and the paste box show in every view but writing.
- **`orderOptions(item)`** gives `order.messages` in the server's order, as `{ id: m.type, label }`, with the due one's label ending " · due". It also gives "A reply to what they wrote" (id '') when `item.dueKind === 'reply'` and a message is in hand. `messageOptions` uses it for an order, so orders get the Instead line and More messages.
- **`orderStrip(item)`** returns `{ title: item.car || 'No car named yet', stage, finished, deposit: 'Deposit: <order.deposit.state, lower case>', url }`. `url` is `lot.url`, else `found.url`, when it is http(s). The link reads "Open the auction car".
- **`orderSections(order, now)`** returns `[{ title, rows: [[label, value]], notes, link }]`. The titles, rows and words are the old page's (`orderInfo`, `web/app.js` line 1408):
  - Auction order, with its latest staff note;
  - Looking for, from Japan;
  - Auction car on this order;
  - Found in the coming auctions;
  - Car secured;
  - Charged and paid;
  - Their texts (`order.texts`: `{ key, here }`).

  Empty rows are left out.
- **`createOrderActions({ api, get, set, toast, refresh, take })`** returns `{ paste(direction, text), removePaste(id), moveTexts(section) }`. `take` is the store's `takeItem`, so typed text survives a paste, and the new suggestion is offered with "Use the new suggestion".
  - **`paste`:**
    - it uses `plainPaste` and trims;
    - empty text gives the toast "There was nothing to paste." and returns false;
    - otherwise it posts `POST /api/items/<key>/paste { direction, text }`, with `writing` set while the direction is `'in'`;
    - `'out'` toasts "Added to the order. No reply is written.";
    - it returns true, so the box closes and empties. On failure it toasts the error and keeps the pasted text.
  - **`removePaste(id)`** posts `/paste/<id>/remove` and toasts "Taken out of the order.". There is no Undo, as on the old page.
  - **`moveTexts(section)`** posts `/move { section }` for `order.texts.key`.
    - It toasts "Their texts are answered in Dashboard now." or "Their texts are answered on this order now.", with Undo (a move back to `out.from`).
    - Then it refreshes.
- **The paste box:**
  - a button "Paste what they wrote";
  - a textarea, with the placeholder "Paste what the customer wrote on WhatsApp, or type what they said" and the label "What the customer wrote";
  - "They wrote this" (main), "We sent this", "Cancel";
  - the fine line "Nothing is sent. It is added to this order so the reply knows what was said."

- [ ] **Step 1: Write the failing tests:**
  - `an order's box says what is due, what was copied or dismissed, and offers Put back in To do`;
  - `the message picker lists the order's messages, the due one first, and a picked message is kept for Tell and Try again`;
  - `They wrote this pastes and shows the reply written for it; We sent this writes nothing`;
  - `a pasted message keeps what was typed and offers the new suggestion`;
  - `a paste with nothing in it is not sent, and Windows line ends are made plain`;
  - `Remove takes a pasted message out of the order`;
  - `Copy for WhatsApp, or Copy reply when the order is answered by text, and Put back in To do after it`;
  - `Their texts go to Dashboard and back, with Undo`;
  - `the Order tab lists the order, its car and what was charged and paid`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** In the preview, after the first sync, paste into order 503 (Omar):
  - `in`: "Any news on the XV? I can go a bit higher if needed.";
  - `out`: "We will let you know after the auction."

  Use `db.addOrderMessage` (`src/db.js` line 662), or `POST /api/items/ao:503/paste`.
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview at 1440×900 and 390×844, light and dark:
  - Omar's reply to the pasted message, Copy for WhatsApp, then Put back in To do;
  - picking "Still searching";
  - Remove on the pasted message;
  - the Order tab with its money, and Their texts there and back;
  - the order's events and staff note in the thread.

  Screenshots as `task4-*.png`.
- [ ] **Step 5: Commit:** `New page: auction orders with the message picker, the paste box, Remove, Put back in To do and Copy for WhatsApp`

### Task 5: README and walkthrough

- [ ] **Step 1: Update `README.md`:**
  - In "The new page", describe:
    - Imports, with the leads from the dashboard's Imports list;
    - the enquiry type in the conversation's menu;
    - auction orders, with the paste box and Copy for WhatsApp.
  - Take out PR 5's sentence "Imports and Auction have their full tools on the old page until the next update." (lines 723–724).
  - Say that Imports takes the dashboard's Imports list, is always on, and lists emails while the email intake is on. Auction holds orders.
  - Add one dated Status line. It also names Task 0:
    - Send on Facebook refuses the same words twice;
    - a Facebook chat answered on Facebook says so.

  The README is public: plain words, no figures, no names.
- [ ] **Step 2: Walk through it on the preview** at 1440×900 and 390×844, light and dark:
  - **Journey 5:**
    1. Jory is read as an import enquiry and stays in Dashboard.
    2. Enquiry type, then Import enquiry, moves him to Imports.
    3. The reply is rewritten; Copy.
    4. Then Hollis's email: research notes, then Copy for Gmail.
  - **An auction order:** a pasted message, its reply, Copy for WhatsApp, then Put back in To do.
  - **Imports:** Imani with More messages.
  - **Undo** of a type change.
  - **Marketplace:** Liam's Send and Try again, and Tove's Send it again, as after Task 0a.

  There must be no console errors, and the only requests must be to 127.0.0.1:3211. Screenshots as `task5-*.png`.
- [ ] **Step 3: Run** `npm.cmd test`, `npm.cmd run check-private`, `npm.cmd run check-deps` and `npm.cmd run check-css`. Expected: all pass.
- [ ] **Step 4: Commit:** `README: Imports, the enquiry type and auction orders on the new page`
