# The new page, PR 2: the deal panel and one search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the new page at `/new/` gets the deal panel beside the conversation and one search box that finds customers, cars and words in messages across every section, so Jim no longer needs the old page for the car's photos, the customer's details or Find a car.
- **Car tab:** photos, videos and documents, each with Copy link and Add to reply, and a viewer.
- **Customer tab:** contact, came from, and the stage line.
- **What Wheelman used:** the facts, the team practice and the insider facts the reply relied on, and the model.

**Architecture:**
- **A separate panel store.** The panel has its own small store (`panelstore.js`), because `store.js` is at its 400-line limit. Its list helpers move to `listview.js`.
- **Two additions on the server, nothing removed.** The conversation sent to the page gains a `deal` field (the stage worked out from records today, so far not sent). A new read-only route `GET /api/search?q=` searches every section, the stock list and the stored messages.
- **The old page is unchanged.** Its Find a car keeps using `/api/vehicles?q=`.

**Tech Stack:** as PR 1: Node ≥22.13, node:sqlite, the built-in test runner, Preact + htm from `web/new/vendor/`, CSS layers and tokens, Playwright (MCP) on the preview at 3211.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 5, M5 Deal panel (R5.1–R5.3) and M10 Search (R10.1);
  - section 9, "Deal panel" and "Search" rows and "The deal panel in detail";
  - section 10, widths;
  - section 13, search under 300 ms over 50,000 messages;
  - section 14, story 16 is not in this PR.
- `prototype/js/ui-panel.js`, `prototype/js/ui-overlays.js:7-40` (Search) and `prototype/css/app.css:198-234, 302-329`.
- The old page's working behaviour, which must be kept: `web/views/CarPanel.js`, `web/views/Viewer.js`, `web/views/FindCar.js`, `web/lib/insert.js`, and `web/app.js:1168-1529` (the panel).

## Global Constraints

All of PR 1's Global Constraints hold (see `docs/superpowers/plans/2026-10-26-new-page-1-dashboard.md`). In particular:
- **Dependencies and the CSP:**
  - no dependencies;
  - the CSP is unchanged;
  - tokens only in CSS, and `check-css` covers `web/new/css`.
- **Plain words:** sentence case, colour always with words, numbers mean unread only.
- **Layout and size:**
  - 44 px touch targets on a phone;
  - no file over 400 lines;
  - tests on invented data.
- **Safety:**
  - never the live folder, its database or port 3210;
  - the preview is on 3211;
  - no AI attribution.

Changed for this PR:
- **API: additions only.** Two additions are allowed: the `deal` field on `GET /api/items/:key`, and the new route `GET /api/search`. Every existing route, field and the old page behave exactly as before.
- **The panel widths (PRD section 10):**
  - from 1280 px, the panel is a 360 px column beside the conversation, open by default, and its open or closed state is remembered under `wheelman.new.panel`;
  - from 900 to 1279 px it is a drawer over the conversation;
  - under 900 px it is a bottom sheet over the conversation, with a close button.
- **Supplier links are shown to Jim only.** A photo, video or document whose media entry has `shareable: false` gets no Copy link and no Add to reply, only Open and the words "For you only".
- **Insider facts.** They show under the heading "Shaped the reply, never stated" and are never offered for Add to reply.
- **Search covers every section.**
  - A Dashboard result opens on the new page.
  - A Marketplace, Imports or Auction result opens the old page at `/`, with the words "Opens on the old page", until PR 5.
  - A car result opens in the panel as "Another car" with "Back to <customer name>".
- **The cost of a request is not shown.** It is not stored for each draft today. What Wheelman used shows the model and the provider.

## Review Focus

1. **Add to reply while Jim is typing.** The link line goes in at the caret, or before the sign-off when there is none, using `placeLine`/`linkLine` from `web/lib/insert.js`. Nothing he typed is lost, and the result is saved like any edit. Pinned in Task 3: `addToReply puts the link at the caret and keeps the typed text`.
2. **A search typed fast.** Only the newest answer is shown, and an older answer arriving late never replaces it. Pinned in Task 6: `a late answer to an older search is dropped`.
3. **Search input from Jim.** Quotes, percent signs and underscores (`100%`, `O'Brien`, `a_b`) are matched as plain text. They are never SQL patterns, and they never throw an error. Pinned in Task 2: `search treats % _ and quotes as plain text`.
4. **A car with no photos, a media read that fails, or a car that is no longer in stock.** Each shows a sentence and Try again, never a blank panel. Pinned in Task 3 (store tests) and checked on the preview.
5. **The panel on a phone must not trap Jim.** Escape, the close button and the browser's Back all close the sheet and leave the conversation where it was. Pinned in Task 3: `the panel closes on Escape and Back` (hash sync) and checked on the preview at 390×844.

---

### Task 1: Split the store, and give the panel its own store

**Files:**
- Create: `web/new/js/listview.js`, holding `visibleRows`, `waitingCount` and `followUpOf`, moved unchanged from `store.js`. `store.js` re-exports them, so existing imports keep working.
- Create: `web/new/js/panelstore.js`
- Modify: `web/new/js/store.js`, which only loses the moved helpers.
- Test: `test/newpage-panelstore.test.js`. The existing `test/newpage-store*.test.js` must pass unchanged.

**Interfaces:**
- `createPanelStore({ api, storage, now, wide })` returns `{ get, subscribe, actions }`.
- State: `{ open, tab: 'car'|'customer'|'used', other: null | { stockNo, vehicle, state:'loading'|'ready'|'error', error }, media: { [stockNo]: { state:'loading'|'ready'|'error', photos, videos, documents, readAt, stale, error } } }`.
  - `open` starts from `storage.getItem('wheelman.new.panel') === 'open'` when `wide()` is true, with open as the default. It starts false when not wide.
- Actions:

  | Action | What it does |
  | --- | --- |
  | `toggle(open?)` | Sets `open`. It saves to `wheelman.new.panel` only while `wide()` |
  | `setTab(tab)` | Sets the tab |
  | `media(stockNo, { fresh })` | `GET /api/vehicles/<stockNo>/media` (with `?fresh=1` when fresh), at most once per stockNo unless fresh. Media is cached for the visit |
  | `showCar(stockNo)` | `GET /api/vehicles/<stockNo>`; sets `other` and the tab `'car'`, and opens the panel |
  | `back()` | Clears `other` |
  | `reset()` | Clears `other` and keeps `open` and `tab`. The UI calls it when the conversation changes |

- [ ] **Step 1: Write the failing tests:**
  - `the panel remembers open or closed only on wide windows`;
  - `media is read once per car and again on Read again`;
  - `a media read that fails says so and can be tried again`;
  - `showCar opens Another car and back returns`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test test/newpage-panelstore.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `listview.js`, `panelstore.js` and the `store.js` re-export.
- [ ] **Step 4: Run** the new test file and every `test/newpage-*.test.js`. Expected: PASS, with `store.js` shorter than before.
- [ ] **Step 5: Commit:** `New page: the panel's own store, and the list helpers out of the main store`

### Task 2: The server: the deal stage on a conversation, and one search route

**Files:**
- Modify: `src/server.js`, in `present()` (about lines 334-384) and in the route table (a new `GET /api/search`).
- Create: `src/search.js`, the search itself: pure SQL over the database module, no HTTP.
- Modify: `web/new/js/model.js` (`stageLine`)
- Test: `test/search.test.js`, `test/newpage-model.test.js`

**Interfaces:**
- **`present(item)` gains `deal`.** It is `item.deal ? { stage: item.deal.stage, stageText: item.deal.stageText, source: item.deal.source } : null`. Nothing else in `present()` changes.
- **`searchAll(q, { limit })` in `src/search.js`** returns `{ customers, cars, messages }`. A query shorter than 2 characters after trim gives all three empty; the query is cut to 200 characters.
  - **`customers`:** the row summaries from every section that is switched on, in the order Dashboard, Marketplace, Imports, Auction. Each row is matched by `rowMatches` from `web/lib/search.js` and carries its `section`. At most 20.
  - **`cars`:** `findCars(q, { max: 6 })` from `src/vehiclemedia.js`.
  - **`messages`:**
    - customer and staff message bodies from the dashboard `messages` table, the Marketplace message table, the email message table and the phone add-on table, each mapped to its item key;
    - matched case-insensitively as plain text, with LIKE and an ESCAPE character so `%`, `_` and the escape character are literal, and with the query as a bound parameter;
    - newest first, at most 20;
    - each `{ key, section, name, at, who: 'customer'|'us', text }`, where `text` is a snippet of at most 140 characters around the first match, with `…` where it was cut.
  - Read the table names and columns in `src/db.js`. A table that does not exist on this computer is skipped.
- **`GET /api/search?q=`** returns `searchAll(q)` as JSON. It is a GET only, behind the same sign-in, `allowed()` and headers as every other API route.
- **`stageLine(item)` in model.js** returns `{ steps: ['Enquiry','Inspection booked','Seen the car','Deposit','Sold'], current, source }`:
  - from `item.deal.stage`: `deposit_paid` or `payment_pending` is Deposit (index 3); `paid_in_full` or `delivered` is Sold (4);
  - otherwise from `item.leadStatus`, with the same table as `scripts/measure.js` `stageOf`: `INSPECTION` is 1, `INSPECTION_DONE` is 2, `DEPOSIT_RECEIVED` is 3, `CAR_SOLD` is 4;
  - anything else is Enquiry (0);
  - `source` is `'From the sale record'` when it came from `deal`, `'From the lead status'` when it came from `leadStatus`, and `''` for the default.

- [ ] **Step 1: Write the failing tests.** In `test/search.test.js`, use invented customers, start the app as `test/editor.test.js:15-28` does, then call `GET /api/search`:
  - `search finds a customer by name and by 3 phone digits across sections`;
  - `search finds a car by stock number`;
  - `search finds words in messages, newest first, with a snippet`;
  - `search treats % _ and quotes as plain text`: `100%`, `O'Brien` and `a_b` match only literal text, with no error;
  - `a query under 2 characters returns nothing`;
  - `the item carries its deal stage`: an invented sale with a deposit gives `deal.stage` `'deposit_paid'`;
  - `search over 50,000 invented messages answers in under 300 ms` (seed through the db upsert functions);
  - `every existing route answers as before`: the old `GET /api/items` and `/api/items/:key` give the same fields as before, plus `deal`.
  
  In `test/newpage-model.test.js`: `stageLine reads the sale record first, then the lead status`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit:** `Server: one search across sections, cars and messages, and the deal stage on a conversation`

### Task 3: The panel and the Car tab

**Files:**
- Create: `web/new/js/ui/panel.js` (frame, tabs, open and close, drawer and sheet) and `web/new/js/ui/cartab.js`
- Modify: `web/new/js/ui/app.js` (the panel slot), `web/new/js/ui/conversation.js` (a "Details" button in the head; the car strip's "N photos" opens the Car tab), `web/new/js/main.js` (build the panel store; Escape closes the drawer or sheet; the panel `reset()` on conversation change), `web/new/js/hashsync.js` (Back closes the sheet on a phone: under 900 px an open sheet is a history entry), and the CSS files
- Test: `test/newpage-panelstore.test.js`, `test/newpage-hashsync.test.js`

**Interfaces:**
- Consumes: `createPanelStore` (Task 1); the main store's `item` and the `type` action; `placeLine` and `linkLine` from `web/lib/insert.js`.
- **`addToReply(text, label, url, caret)`** is a pure function in `panelstore.js` (or a new `web/new/js/insertlink.js`). It returns the new box text from `placeLine(text, linkLine(label, url), caret)`. The UI passes the editor's caret position, or `null` when it has none, and calls the main store's `type(newText)`. After Add to reply the drawer or sheet closes on a narrow window.
- **The Car tab**, ported from `web/views/CarPanel.js` and `prototype/js/ui-panel.js:31-64`:
  - **Top:** the hero photo (`/api/vehicles/<stock>/picture/<id>`) with a count, the title, stock · price · km, fuel · gearbox · seats · colour, the availability words, and Open listing.
  - **Photos:** 9, then a "+N" tile; auction photos (6), marked "For you only" when not shareable; "See all N".
  - **Videos** (poster and play) and **Documents** (Open), each with Copy link and Add to reply when shareable.
  - **Footer:** the Included list; "Read <ago>" with Read again; loading, error and Try again.
  - **No car matched:** "No car is linked to this conversation." plus whatever the customer asked about (`item.looking`, when present).
  - **Another car:** a "Back to <name>" line at the top.

- [ ] **Step 1: Write the failing tests:**
  - `addToReply puts the link at the caret and keeps the typed text`;
  - `addToReply with no caret puts the link before the sign-off`;
  - `the panel closes on Escape and Back` (the hash-sync rule for a phone sheet).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the panel and the Car tab.
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview at 1440×900, 1100×800 and 390×844, light and dark:
  - the panel column, the drawer and the sheet;
  - photos, videos and documents;
  - Copy link;
  - Add to reply at the caret while text is typed, saved like any edit;
  - Read again;
  - a car with no media, and a media failure (stop the stand-in's media route, or give an unknown stock);
  - Escape and Back close the sheet.
  
  Save screenshots as `task3-*.png` under `D:\Jim\Wheelman\.playwright-mcp\new-page-2\`.
- [ ] **Step 5: Commit:** `New page: the deal panel and its Car tab, with Add to reply`

### Task 4: The viewer

**Files:**
- Create: `web/new/js/ui/viewer.js`, a port of `web/views/Viewer.js` in the new page's components
- Modify: `web/new/js/ui/cartab.js` (photos and videos open the viewer) and the CSS files

**Interfaces:**
- Consumes: the panel store's `media[stockNo]`; `addToReply` (Task 3).
- **Behaviour:**
  - a modal `<dialog>` with group tabs (photos, auction photos, videos);
  - previous and next, with arrows, Home and End;
  - a filmstrip;
  - for videos, a "with voice-over" / "without" choice when both links exist (`link`, `plainLink`);
  - Copy link (reads "Copied" for 2 s), Add to reply (closes the viewer) and Open original;
  - Escape closes it and focus returns to the tile that opened it;
  - shareable rules as in the Global Constraints.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Check on the preview** at 1440×900 and 390×844:
  - keyboard only: open, arrows, Home and End, Escape, and focus back on the tile;
  - Add to reply from the viewer;
  - the videos choice.
  
  Save screenshots as `task4-*.png`.
- [ ] **Step 3: Commit:** `New page: the photo and video viewer`

### Task 5: The Customer tab and What Wheelman used

**Files:**
- Create: `web/new/js/ui/customertab.js`, `web/new/js/ui/usedtab.js`
- Modify: `web/new/js/ui/panel.js` and the CSS files
- Test: `test/newpage-model.test.js`, for any new pure function (for example `leadStatusWords`)

**Interfaces:**
- Consumes: `stageLine` (Task 2); the item's fields `name`, `firstName`, `phone`, `email`, `source`, `location`, `leadStatus`, `looking`, `noLead` and `deal`; the draft's `factsUsed`, `practiceUsed`, `insiderUsed`, `aiImport`, `instruction`, `model`, `provider`, `rungLabel` and `nextStep`.
- **The Customer tab:**
  - the name;
  - phone and email (a click copies, with a toast);
  - "Came from" (`source`) and "Lives in" (`location`), when known;
  - the lead status in words (`leadStatusWords(leadStatus)` with the same mapping as `stageLine`, for example `INSPECTION` is "Inspection booked");
  - "Asking about" (`looking`, for an import customer);
  - "No customer record" when `noLead`;
  - the stage line (5 steps, the current one marked in words and colour, then its `source` sentence);
  - "Shaped the reply, never stated", listing `insiderUsed`, shown only when not empty.
- **What Wheelman used:**
  - "Facts it relied on" (`factsUsed`, each a line);
  - "What the team really sent for similar messages: N replies" when `practiceUsed` > 0;
  - "Your instruction: …" when `instruction`;
  - "Where the customer is: <rungLabel>. Next step: <nextStep>" when present;
  - "Written by <model> (<provider>)";
  - "No suggestion yet." when there is no draft.
  
  There is no cost line (Global Constraints).

- [ ] **Step 1: Write the failing test** for `leadStatusWords`.
- [ ] **Step 2: Implement** the two tabs and the function.
- [ ] **Step 3: Run** the tests. Check both tabs on the preview at 1440×900 and 390×844, light and dark: a customer with a sale, a customer with a lead status, a number with no record, a draft with insider facts (have the preview's stand-in report one if none does), and no draft. Save screenshots as `task5-*.png`.
- [ ] **Step 4: Commit:** `New page: the Customer tab with its stage line, and What Wheelman used`

### Task 6: One search

**Files:**
- Create: `web/new/js/ui/search.js` (box and results), `web/new/js/searchstore.js` (debounce and newest-answer-wins, pure with injected timers)
- Modify: `web/new/js/ui/topbar.js` (the search box between the tabs and the status; under 1100 px an icon button that opens it), `web/new/js/main.js` (`/` focuses search when not typing), and the CSS files
- Test: `test/newpage-searchstore.test.js`

**Interfaces:**
- Consumes: `GET /api/search?q=` (Task 2); the panel store's `showCar` (Task 1); the main store's `open` and the hash (Dashboard results).
- `createSearchStore({ api, timers })` returns `{ get, subscribe, actions: { type(q), clear() } }`.
  - State: `{ q, state:'idle'|'loading'|'ready'|'error', results:{customers,cars,messages} }`.
  - A request goes out 200 ms after typing stops, only for 2 or more characters, and only the newest request's answer is kept.
- **Results:**
  - **Grouped** as Customers, Cars and Messages, at most 6 each, with "Show all N" opening the rest in the same list.
  - **Keyboard:** Up, Down, Enter and Escape, with `role="listbox"` and options.
  - **Customer or message result:** a Dashboard one opens it (hash and `open`). Any other section gets the line "Opens on the old page" and opens `/` in the same tab.
  - **Car result:** opens the panel as Another car.
  - **Empty:** "No match. Try a stock number or part of a phone number."
  - **Error:** "Search is not answering. Try again."

- [ ] **Step 1: Write the failing tests:**
  - `search waits 200 ms after typing`;
  - `a late answer to an older search is dropped`;
  - `under 2 characters nothing is asked`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview:
  - find an invented customer by name and by 3 phone digits;
  - find a car by stock number, opening it in the panel with Back;
  - find a word from a message;
  - an Auction or Marketplace result says "Opens on the old page";
  - the keyboard only;
  - 390 px.
  
  Save screenshots as `task6-*.png`.
- [ ] **Step 5: Commit:** `New page: one search across customers, cars and messages`

### Task 7: README and walkthrough

**Files:**
- Modify: `README.md`:
  - "The new page": add the panel and search;
  - "Project layout": the new files;
  - one dated Status line, in the style of the others.

- [ ] **Step 1: Update the README.** It is public: plain words, no business figures, no staff names.
- [ ] **Step 2: Walkthrough on the preview** at 1440×900, 1100×800 and 390×844, light and dark:
  - open a customer and the panel;
  - Add to reply a photo link at the caret, then Copy;
  - the viewer by keyboard;
  - the Customer tab and What Wheelman used;
  - search for a customer, a car and a message word;
  - an Auction result.
  
  No console errors, and only `127.0.0.1:3211` requests. Save screenshots as `task7-*.png`.
- [ ] **Step 3: Run** `npm.cmd test`, `check-private`, `check-deps` and `check-css`. Expected: all pass.
- [ ] **Step 4: Commit:** `README: the deal panel and search on the new page`
