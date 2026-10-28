# The new page, PR 5b: Imports, the enquiry type and Auction orders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Builds on PR 5** (branch `new-page-5`, plan `docs/superpowers/plans/2026-10-28-new-page-5-marketplace.md`). Branch `new-page-5b` from it.

It uses PR 5's pieces as they are:
- `web/new/js/sections.js`: `validChip`, `sectionRowView`, `headLine`, `rowChannelWord`;
- `web/new/js/channel.js`: `replyChannel`, `mainFor`, `copiedWords`;
- `web/new/js/boxsections.js`: `sectionBox`, and `state.writeFailed`;
- `web/new/js/finish.js`: `restore`, `copyNow`, `dismiss`;
- `test/support/newpage-fakes.js`'s `data.sections`;
- `web/new/css/sections.css`.

**Goal:** the last two sections work fully on the new page.
- **Imports:** Import Query becomes Imports. It takes the leads from the dashboard's Imports list out of Auction, with the messages they had there. Emails get **Copy for Gmail** and their research notes, and every message is one click away.
- **The enquiry type:** one property with its reason line, in the conversation's menu. It replaces the Move menu and the three import ruling buttons.
- **Auction:** orders only, with the message picker, the paste box (**They wrote this**, **We sent this**), **Remove**, **Put back in To do**, **Copy for WhatsApp** and the Order tab.

**Architecture:**
- **One ruled server change, everything else additive.** The Imports list's leads belong in Imports (`src/placement.js`); a customer with an order under way stays under it in Auction.
- **New action sets are modules called by the store,** as in PR 5: `typestore.js` and `orderstore.js`.
- **New pure modules:**
  - `messages.js` (every message, behind More messages);
  - `emailview.js` (research notes and the email's facts);
  - `enquiry.js` (the type, its choices, its requests and Undo);
  - `orderview.js` (the order box, strip and tab).
- **A move the store asks for** (`state.goTo`) becomes a new history entry, so the page follows a conversation to its new section and Back returns.

**Tech Stack:** as PRs 1–5.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 4 (the four tabs, the enquiry type, "Changes to earlier decisions" row 3);
  - section 5 R2.4, M6 (R6.1–R6.3) and M7 (R7.1–R7.2);
  - section 7 "Moving between sections";
  - section 8 journey 5;
  - section 9 "The message box in detail";
  - section 14 stories 9 and 10.
- `prototype/js/store.js` (`A.setType`, `A.dismiss`) and `prototype/js/ui-thread.js` (ChatHead, TypeMenu, MoreMenu, Research, PasteBox).
- **The old page, for each feature and its words:**
  - `web/app.js`: `renderThread` (Remove on a pasted message), `renderOrderComposer`, `customerSections`, `mailInfo`, `orderInfo`, `moveTexts`, `importNotice`, `rulingWords`, `rulingButtons`;
  - `web/views/MoveMenu.js`;
  - `web/lib/copy.js`.
- **The engine:**
  - `src/placement.js`;
  - `src/items.js` (`place`, `listItems`, `buildMailItem`);
  - `src/server.js` (`present`, `summary`, `offeredTemplates`, `sectionRows`, and the routes `/ruling`, `/move`, `/paste`, `/paste/:id/remove`, `/restore`, `/copied`);
  - `src/worker.js` (`draftWaiting`);
  - `src/ordermessages.js` (`enquiryTemplates`, `enquiryOrder`);
  - `src/imports.js` (`planImport`, `enquiryStage`);
  - `src/importjudge.js`;
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
  - the auction order box: message picker, paste box with We sent this and They wrote this, Remove, Put back in To do (Task 4);
  - Copy for Gmail and Copy for WhatsApp, with their toasts and Put back (Tasks 2 and 4).
- **Panel:**
  - Import Query research notes, now under the box (Task 2);
  - Auction order details and Their texts (Task 4);
  - Where it is listed (Task 3).
- **Moves:** the Move menu with Undo becomes the enquiry type menu (Task 3).

## Global Constraints

The Global Constraints of PRs 1–5 hold:
- no dependencies and the CSP unchanged;
- tokens only, plain words, colour with words;
- 44 px targets, no file over 400 lines;
- invented test data;
- never the live folder, its database or port 3210; the preview on 3211;
- no AI attribution;
- the reply string is never changed by the page;
- Send on Facebook is the only send, and each channel has its one main button (PR 5).

Changed for this PR:
- **API: additions, plus one ruled change.**
  - **The additions:**
    - `judged.quote`;
    - `stage` on an Imports text row;
    - the enquiry messages offered in Imports;
    - `listed: 'imports'` for an Imports-list lead in Imports.
  - **The ruled change (Confirmed 24 Oct 2026, PRD decision 2):**
    - A lead on the dashboard's Imports list belongs in Imports, not Auction.
    - A customer whose auction order is still under way stays under that order in Auction.
  - Every other route and field behaves as before. `/move` and `/ruling` are unchanged, and the old page's Move menu still offers Auction until the switch-over.
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

## Review Focus

1. **A lead from the Imports list lost between sections**: with the email intake off, with a live order, or after it was moved. It is always in exactly one list. Pinned in Task 1: `a lead from the Imports list is listed in Imports, also with the email intake off, and one with a live order stays under its order`.
2. **Typed text during an enquiry type change.** The edit is saved first, so the server sees it is touched. The text stays in the box, and nothing is written over it. Pinned in Task 3: `a type change with typed text keeps the text and writes nothing again`.
3. **Undo after a type change, also once Jim has moved on.** The type and the section go back exactly. The page goes back with them only while that conversation is still open, and never takes Jim away from another one. Pinned in Task 3: `Undo puts the enquiry type and the section back as they were`.
4. **A pasted WhatsApp message while Jim had typed in the box.** His text stays, and the new suggestion is offered, not forced in. Pinned in Task 4: `a pasted message keeps what was typed and offers the new suggestion`.
5. **A picked order message rewritten as the one that is due.** Tell Wheelman and Try again keep the message Jim picked. Pinned in Task 4: `the message picker lists the order's messages, the due one first, and a picked message is kept for Tell and Try again`.

---

### Task 1: Imports takes the leads from the dashboard's Imports list

**Files:**
- Modify:
  - `src/placement.js`:
    - `naturalSection` gives auction for a live order first, then importquery for `onImportsList`;
    - `sectionOn('importquery')` is always true;
    - update the header comment.
  - `src/items.js` `listItems`: the Imports-list leads and conversations (the SQL now in the `auction` branch) move to the `importquery` branch. Emails come only while `config.mail.switchedOn`. The `auction` branch keeps the live-order customers and what was moved there.
  - `src/ordermessages.js` `enquiryTemplates`: offered in Auction as today, and in Imports for any conversation that is not an email.
  - `src/server.js`:
    - in Imports, `offeredTemplates` gives the enquiry messages (`best: due`), then `templatesFor(item)`;
    - `listed` is `'imports'` for an Imports-list lead in Imports;
    - `summary()` adds `stage: enquiryStage(item).label` for an import text row in Imports.
  - `src/imports.js` `planImport`: a move into Imports counts as "unoffered", as a move into Auction does.
  - `src/learn.js`:
    - `teachesHere` is false for `onImportsList(item)`;
    - `onRemember` refuses it with "Conversations from the dashboard's Imports list do not teach Wheelman.".
  - `src/worker.js` `draftWaiting`: Auction's queue, then Imports' queue, which is not gated on the email intake.
  - `web/new/js/lessons.js` `rememberOffer`: null when `item.teaches === false`.
  - `web/new/js/sections.js`: an Imports row with `row.stage` and no other reason shows it.
  - `test/support/preview.js`.
- Test: `test/imports-section.test.js`. Update the tests that pin the old place:
  - in `test/placement.test.js`, "a lead from the Imports list … listed in Auction" and "… Import Query switched off sends it home", which now stands in Imports;
  - `test/templates.test.js` ("an enquiry in Auction has Which message?");
  - `test/orders.test.js` counts, `test/quality.test.js` and `test/writeahead.test.js`, wherever an Imports-list lead was counted in Auction.

  Each changed assertion is listed in the commit body.

**Interfaces:**
- A conversation's placement is now:
  - `ao:` is Auction;
  - `mp:` is Marketplace;
  - `em:` is Imports;
  - a live order is Auction (under the order when the order reads it);
  - `onImportsList` is Imports;
  - else Dashboard.

  Moves work as before.
- The `GET /api/items/<key>` of an Imports-list lead gives:
  - `section: 'importquery'`, `listed: 'imports'`, `isImport: true`;
  - `templates`: the six enquiry messages first, then the Imports templates.

- [ ] **Step 1: Write the failing tests:**
  - `a lead from the Imports list is listed in Imports, also with the email intake off, and one with a live order stays under its order`;
  - `an Imports lead keeps the messages it had in Auction, the due one first, and its row says where the enquiry has got to` (the row's `stage` matches `/^Enquiry: /`);
  - `an email in Imports keeps its own three messages and is not offered the auction ones`;
  - `moving a conversation into Imports searches the auction once, as a move into Auction did`;
  - `a conversation from the Imports list teaches nothing in Imports, and Remember is refused`;
  - `the background writer writes for Imports texts with the email intake off`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Add to the preview "Imani Invented" (`0491 570 194`), on the Imports list with no order, asking: "Could you find me a Daihatsu Copen? 2016 or newer, under 60,000 km."
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - Imports lists Imani with "Enquiry: …", and Instead offers "Thanks, with estimate and deposit";
  - Auction lists orders, and Nina and Remy stay under their orders.

  Screenshots go under `D:\Jim\Wheelman\.playwright-mcp\new-page-5b\` as `task1-*.png`.
- [ ] **Step 5: Commit:** `Imports: the leads from the dashboard's Imports list are listed in Imports, with the messages they had in Auction`

### Task 2: Imports on the new page: Copy for Gmail, research notes and every message

**Files:**
- Create:
  - `web/new/js/messages.js`, pure: `messageOptions`.
  - `web/new/js/emailview.js`, pure: `researchView`, `emailRows`.
  - `web/new/js/ui/research.js`.
- Modify:
  - `web/new/js/ui/messagebox.js`: More messages after the Instead line, and the research notes under the box;
  - `web/new/js/boxsections.js`: email drafts off;
  - `web/new/js/ui/customertab.js`: the Email section;
  - `web/new/js/sections.js`: Folded in Gmail;
  - `test/support/preview.js`.
- Test: `test/newpage-imports.test.js`.

**Interfaces:**
- **`messageOptions(item)`** returns `{ shown, more }`. `shown` is `insteadOptions(item)`. `more` is every other template in the conversation's list, in the server's order, not the one in the box.
  - The Instead line gains a MenuButton "More messages" when `more` is not empty. Each choice runs `actions.instead(id)`.
  - This is in every section.
- **`researchView(r)`** returns `{ count, found, notFound, notes, sources, when }`, or null without research. `count` is `found.length + notFound.length`. The words are the old page's:
  - "No model could be matched to this email.";
  - "Could not be found (the reply has a blank for each):";
  - "Read from: " with links;
  - "Looked up <clock>, from the eligible-models list read <listTime>."

  `ui/research.js` shows it under the box as a closed `<details>`: "What Wheelman looked up (N)".
- **`emailRows(mail)`:**
  - Subject, From, Model asked about;
  - Messages ("5, 1 folded in Gmail");
  - First message, Latest;
  - with folded messages: "Part of this thread could not be read because Gmail had folded it. In Gmail, press Expand all, then Send to Wheelman again."
- **`sectionBox`:** an email with `mail.draftsOff` and no ready draft reads `item.autoReason || 'Suggested replies for emails are switched off.'`, with no button.
- **Rows:** a row with `collapsed` reads "Folded in Gmail" (warn), ahead of every reason but done.
- **Copy for Gmail and its toast** come from PR 5's `mainFor` and `copiedWords`. The test below checks them on an Imports email and may already pass.

- [ ] **Step 1: Write the failing tests:**
  - `an email's main button is Copy for Gmail and its toast says to paste it into Gmail`;
  - `research notes list what was found, what was not and where it was read`;
  - `More messages lists every message past the three on the Instead line`;
  - `a folded email says so on its row and in the panel`;
  - `an email with suggestions switched off says so and offers nothing to copy`.
- [ ] **Step 2: Run** them. Expected: FAIL, except the first, which may pass from PR 5.
- [ ] **Step 3: Implement.** Add to the preview an invented import email from "Hollis Invented" (`hollis@example.com`), subject "Importing a Toyota Hiace GDH206", with one folded message. Post it as `test/importquery.test.js` posts a thread to `/api/mail/threads`, or with `storeMailThread(validateMailReport(report))`.
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - Hollis: research notes, Copy for Gmail, "Folded in Gmail";
  - Imani: More messages lists all six enquiry messages.

  Screenshots as `task2-*.png`.
- [ ] **Step 5: Commit:** `New page: Imports with Copy for Gmail, the research notes, and every message behind More messages`

### Task 3: The enquiry type

**Files:**
- Modify the server:
  - `src/importjudge.js`: `judgeImport` adds `quote` for the `words` sign. That is the customer's sentence holding the match, at most 60 characters, cut around the match with "…".
  - `src/server.js` `present()`: `judged.quote`.
- Create:
  - `web/new/js/enquiry.js`, pure: `typeView`, `typeRequest`, `typeUndo`, `listedWords`.
  - `web/new/js/typestore.js`: `createTypeChanger`.
- Modify:
  - `web/new/js/hashsync.js`: `goToHash`;
  - `web/new/js/main.js`;
  - `web/new/js/store.js`: wiring, and `state.goTo`;
  - `web/new/js/ui/conversation.js`: the More menu, and the head line starting with the type when it is not the section's own;
  - `web/new/js/ui/messagebox.js`: the reason as the context line;
  - `web/new/js/ui/customertab.js`: Where it is listed;
  - `test/support/preview.js`.
- Test: `test/importjudge.test.js` (one added), `test/newpage-enquiry.test.js`, `test/newpage-hashsync.test.js` (one added).

**Interfaces:**
- **`typeView(item)`** returns `{ type, label, reason, choices }`.
  - An order: `{ type:'order', label:'Auction order', reason:'', choices:[] }`.
  - Otherwise `type` is `'import'` when `item.isImport || item.section === 'importquery'`, else `'stock'`. The label is "Import enquiry" or "Stock enquiry".
  - **`choices`** (radio, `checked` for the type; the More menu shows them first, under the heading "Enquiry type"):
    - Stock enquiry, hint "Answered from the cars we have · Dashboard" (or "· Marketplace" for a Facebook chat);
    - Import enquiry, hint "Answered with eligibility, landed cost and the deposit · Imports";
    - Not a customer, hint "Dismissed, with Undo. It stays under All.".
  - **`reason`** is shown in the box only for a reading not yet confirmed, while the conversation is in Dashboard:
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
- **`typeRequest(item, type)`** returns `{ path, body }`, or null when nothing would change. The target is Imports for import; Marketplace for stock on a Facebook chat, else Dashboard.
  - `c:`/`l:` keys: `POST /api/items/<key>/ruling { kind: 'import'|'general', section: target }`;
  - any other key: `POST /api/items/<key>/move { section: target }`.
- **`typeUndo(item)`**, made from the item before the change:
  - `c:`/`l:`: `/ruling { kind: item.ruling ? item.ruling.kind : '', section: item.section }`;
  - otherwise: `/move { section: item.section }`.
- **`createTypeChanger({ api, get, set, toast, flush, refresh, dismiss, timers })`** returns `{ setType(type) }`.
  - "Not a customer" calls `dismiss()`, with the toast "Dismissed as not a customer" and Undo.
  - Otherwise it first awaits `flush()`, then posts.
  - **On success it:**
    - takes `out.item`;
    - sets `goTo: { section: out.item.section, chip: validChip(…, state awaiting ? 'waiting' : 'all'), key, n }`;
    - toasts "Moved to Imports.", "Moved to Dashboard." or "Moved to Marketplace." (or "Now answered as an import enquiry." or "… stock enquiry." with no move), with " The reply is being written again." when `out.writing`, and Undo (9 s);
    - while `item.writing`, refreshes every 2 s, at most 15 times.
  - **Undo** posts `typeUndo` and toasts "Put back as it was.". It sets `goTo` back only while that conversation is still open.
- **`goToHash(seenN, s)`** returns `{ hash, n }` for a `goTo` not yet followed, else null. `main.js` writes it with `location.hash =` (a new history entry), and `storeStep` does the rest.

- [ ] **Step 1: Write the failing tests:**
  - `the words that made it an import enquiry are quoted`;
  - `the enquiry type and its choices follow the conversation's section and channel` (a Dashboard text, a Facebook chat, an Imports email, an order);
  - `the reason line quotes the customer's words while it is still in Dashboard, and nothing moves by itself`;
  - `choosing Import enquiry rules and moves a text in one request, and an email or a Facebook chat moves`;
  - `the page follows the conversation to its new section`;
  - `Undo puts the enquiry type and the section back as they were` (including an Undo after another conversation was opened: the page stays where Jim is);
  - `Not a customer dismisses it with Undo`;
  - `a type change with typed text keeps the text and writes nothing again`: the edit posts before `/ruling`, and the typed text stays;
  - `a rewrite after a type change is shown once it is written`;
  - `a move the store asks for becomes a new address once`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Add to the preview "Jory Invented" (`0491 570 195`), a Dashboard text: "Hi, can you import a Toyota Hiace from Japan for me?"
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - Jory shows the reason line and stays in Dashboard; More, then Import enquiry moves him to Imports with Undo, and the reply is rewritten;
  - Undo brings him back;
  - Imani, as Stock enquiry, goes to Dashboard;
  - a Facebook chat, as Import enquiry, goes to Imports, and its button still reads Send on Facebook.

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
  - `web/new/js/boxsections.js`: an order goes to `orderBox`;
  - `web/new/js/messages.js`: an order's options;
  - `web/new/js/store.js`:
    - `state.picked` (null, or the message picked, set by `instead` and cleared by `show`);
    - `templateInHand` for an order is `item.order.replying ? undefined : item.order.message || undefined`, so Tell and Try again keep the picked message;
  - `web/new/js/finish.js`:
    - an order's Copy sends its text, as today;
    - its toast's action is "Put back in To do", which runs `restore(key)`;
    - `restore` also clears the local done mark;
  - `web/new/js/ui/conversation.js`: the order strip; "Remove" on a pasted message (`in:`/`po:` keys); More's Dismiss for an order reads "Dismiss this message";
  - `web/new/js/ui/panel.js`: for an order, the first tab is "Order" and shows `OrderTab`;
  - `web/new/js/ui/messagebox.js`;
  - `test/support/preview.js`.
- Test: `test/newpage-orders.test.js`.

**Interfaces:**
- **`orderBox({ item, picked, done, doneAt, writing, typed })`** returns views like `boxView`'s. The words are the old page's:
  - writing: writing;
  - typed text: the editor;
  - copied here (`done`): "Copied at <clock>." (good) with Put back in To do (`act:'restore'`);
  - `!order.replying && !picked && (order.handled || state !== 'awaiting')`:
    - copied: "You copied the message that was due. It is shown in the conversation above." with Put back in To do;
    - dismissed: "You dismissed the message that was due." with Put back in To do;
    - finished: "This order is finished. No message is due.";
    - else: "No message is due for this order right now. Choose a message to write it anyway.";
  - a ready draft: the editor;
  - a failed draft: its error, or "This message could not be written.", with Try again;
  - no draft: "They wrote to us. A reply has not been written yet." when replying, else "<order.why or 'A message is due.'> It is being prepared.", with Write it now.

  The picker and the paste box show in every view but writing.
- **`orderOptions(item)`** gives `order.messages` in the server's order, the due one marked "· due". It also gives "A reply to what they wrote" (id '') when `item.dueKind === 'reply'` and a message is in hand. `messageOptions` uses it for an order, so orders get the Instead line and More messages.
- **`orderStrip(item)`** returns:
  - `{ title: item.car || 'No car named yet', stage, finished, deposit: 'Deposit: <state lower case>', url }`;
  - `url` is `lot.url`, else `found.url`, when it is http(s); the link reads "Open the auction car".
- **`orderSections(order, now)`** returns `[{ title, rows: [[label, value]], notes, link }]`, in the old page's titles, rows and words:
  - Auction order, with its latest staff note;
  - Looking for, from Japan;
  - Auction car on this order;
  - Found in the coming auctions;
  - Car secured;
  - Charged and paid;
  - Their texts.

  Empty rows are left out.
- **`createOrderActions({ api, get, set, toast, refresh, take })`** returns `{ paste(direction, text), removePaste(id), moveTexts(section) }`. `take` is the store's `takeItem`, so typed text survives a paste and the new suggestion is offered with "Use the new suggestion".
  - `paste`:
    - it uses `plainPaste` and trims;
    - empty text gives the toast "There was nothing to paste." and returns false;
    - otherwise it posts `POST /api/items/<key>/paste { direction, text }`, with `writing` set while it is `'in'`;
    - `'out'` toasts "Added to the order. No reply is written.";
    - it returns true, so the box closes and empties. On failure it toasts the error and keeps the pasted text.
  - `removePaste(id)` posts `/paste/<id>/remove` and toasts "Taken out of the order." There is no Undo, as on the old page.
  - `moveTexts(section)` posts `/move { section }` for `order.texts.key`. It toasts "Their texts are answered in Dashboard now." or "Their texts are answered on this order now.", with Undo (a move back to `out.from`), then refreshes.
- **The paste box:**
  - a button "Paste what they wrote";
  - a textarea, placeholder "Paste what the customer wrote on WhatsApp, or type what they said", label "What the customer wrote";
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

  Use `db.addOrderMessage`, or `POST /api/items/ao:503/paste`.
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
  - In "The new page": Imports (with the leads from the dashboard's Imports list), the enquiry type in the conversation's menu, and auction orders with the paste box and Copy for WhatsApp.
  - Take out PR 5's sentence that Imports and Auction keep their full tools on the old page.
  - Imports takes the dashboard's Imports list, and Auction holds orders.
  - One dated Status line.

  The README is public: plain words, no figures, no names.
- [ ] **Step 2: Walk through it on the preview** at 1440×900 and 390×844, light and dark:
  - **Journey 5:** Jory is read as an import enquiry and stays in Dashboard; Enquiry type, then Import enquiry, moves him to Imports; the reply is rewritten; Copy. Then Hollis's email: research notes, then Copy for Gmail.
  - **An auction order:** a pasted message, its reply, Copy for WhatsApp, then Put back in To do.
  - **Imports:** Imani with More messages.
  - **Undo** of a type change.

  There must be no console errors, and the only requests must be to 127.0.0.1:3211. Screenshots as `task5-*.png`.
- [ ] **Step 3: Run** `npm.cmd test`, `check-private`, `check-deps` and `check-css`. Expected: all pass.
- [ ] **Step 4: Commit:** `README: Imports, the enquiry type and auction orders on the new page`
