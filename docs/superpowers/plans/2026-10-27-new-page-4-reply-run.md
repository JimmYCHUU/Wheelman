# The new page, PR 4: the reply run, answered elsewhere, and written ahead for ten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jim works through his Dashboard queue without going back to the list, never redoes a reply someone else already sent, and finds the suggestion already written for the ten newest waiting customers.
- **The reply run:** "Start replying" opens the oldest waiting customer, Copy opens the next one, and Skip moves on. The run ends with a one-sentence summary.
- **Answered elsewhere:** a row answered from the phone, on the dashboard by a colleague, or by an auto-reply leaves Needs reply and says who answered and when.
- **Written ahead:** suggestions are ready for the ten newest waiting Dashboard conversations, even when the customer's message is more than a day old.

**Architecture:**
- **One additive server field.** `answered: { how, by, at } | null` is added to list rows and conversations. It is worked out from our last message after the customer's.
- **One worker change.** The Dashboard's ten newest waiting conversations are written ahead past the 24-hour age gate. The no-record and photo-only gates stay.
- **On the page:**
  - a small pure run store (`runstore.js`) keeps the queue, its place and the counts;
  - the list header gets "Start replying";
  - the conversation gets a run bar;
  - the model words "answered elsewhere".

**Tech Stack:** as PRs 1–3.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 5 R1.5, R4.6;
  - section 8 journey 2;
  - section 9 "Reply run";
  - section 13 "Speed";
  - section 14 stories 1, 7 and 8.
- `prototype/js/store.js:526-550` (startRun, skip, endRun, advanceRun, nextInRun) and `prototype/js/ui-thread.js:8-21` (the run bar, RunDone).
- Engine: `src/worker.js:204-268` (`draftWaiting`), `src/items.js:326-381` (state and `autoDraft`), and `src/server.js` `summary()`/`present()`.

## Global Constraints

The Global Constraints of PRs 1–3 hold:
- no dependencies and the CSP unchanged;
- tokens only, plain words, colour with words;
- 44 px targets, no file over 400 lines;
- invented test data;
- never the live folder, its database or port 3210; the preview on 3211;
- no AI attribution;
- the reply string is never changed by the page.

Changed for this PR:
- **API: additions only.** `answered` goes on rows and conversations. Every existing route and field behaves as before.
- **Write ahead (R4.6, Confirmed 24 Oct 2026):**
  - The ten newest waiting Dashboard conversations (`sectionRows('dashboard').waiting.slice(0, 10)`, dismissed ones excluded) are written ahead even when the customer's last message is older than the age gate.
  - Every other gate stays: no customer record, a photo with no words, held for a Prompt, a recent failure, the daily and busy limits.
  - Today's queue order and its caps for everything else are unchanged.
  - Marketplace background drafting is **not** changed in this PR. It stops in PR 5, when the new page writes Marketplace on open (Ruling, 27 Oct 2026).
- **Answered elsewhere (R1.5):**
  - `how` is one of `'phone'` (sent from the phone, from the phone add-on), `'dashboard'` (sent on the dashboard by a person), `'auto'` (an automatic reply) or `'wheelman'` (the reply matches a suggestion copied or sent from Wheelman).
  - `by` is the sender's name as the thread already shows it, or `''`.
  - `at` is the message time.
  - The words on screen:
    - "Answered on the phone 10:42";
    - "Answered by Alex on the dashboard 10:42";
    - "Answered by an auto-reply 10:42";
    - "Answered with Wheelman's suggestion 10:42".
    
    The time uses `clock()` today, else `listTime()`.
- **The reply run (story 7):**
  - The queue is the Needs reply rows (visible ones: not done, not answered) in **oldest first** order, frozen at start. Rows answered elsewhere during the run are skipped when reached.
  - After Copy in a run, the next customer opens, within 300 ms when its draft was written ahead.
  - **Skip** moves on without marking done.
  - **End run** stops it.
  - **The summary:** "All answered: 5 copied, 1 skipped, 1 answered elsewhere." It leaves out the zero parts, and reads "Nothing waiting." when the queue was empty.

## Review Focus

1. **A customer writes again during the run.** The row's new message makes it waiting again with a new anchor. The run does not open it twice in one pass, and it shows in Needs reply after the run. Pinned in Task 3: `a row that changes during the run is not visited twice`.
2. **The conversation open in the run is answered elsewhere while Jim reads it.** The box says it was answered elsewhere and offers "Write a reply anyway", and Copy is not the main action. The run's Next moves on. Pinned in Task 4: `an open conversation answered elsewhere says so and the run moves on`.
3. **Ending or leaving the run.** Choosing another row, another chip or a tab ends the run quietly (no summary toast). The browser's Back from the run bar goes back through the conversations normally. Pinned in Task 3: `choosing another row ends the run`.
4. **Written ahead past the gate but the customer has no record.** Nothing is written for a number with no record or for a photo-only message, even in the top ten. Pinned in Task 2: `the top ten skip the age gate only`.
5. **A copy that fails inside the run.** When the clipboard write is refused, the run stays on that customer and says so; it does not move on. Pinned in Task 3: `a failed copy keeps the run where it is`.

---

### Task 1: The server says who answered elsewhere

**Files:**
- Create: `src/answered.js`, with the pure `answeredBy(timeline, latestDraft)`.
- Modify: `src/server.js` (`summary()` and `present()` add `answered`) and `src/items.js` (only if the timeline needs a field it lacks).
- Test: `test/answered.test.js`

**Interfaces:**
- **`answeredBy(timeline, latestDraft)`** returns `{ how, by, at } | null`:
  - It returns null unless the last entry from us comes after the customer's last message.
  - `how` is chosen in this order:
    - `'wheelman'` when `latestDraft` for that anchor has `copied_at` or `sent_here_at`, and the sent text matches it (the outcome already recorded by `updateOutcomes`, or similarity ≥ 0.8 with `edited ?? reply`);
    - `'auto'` when the message is automatic (`auto`);
    - `'phone'` when it came from the phone (`phone`);
    - `'dashboard'` otherwise.
  - `by` is the message's `by` for `'dashboard'`, otherwise `''`.
- **Rows and conversations** gain `answered`, worked out only when the state is answered, and null otherwise.

- [ ] **Step 1: Write the failing tests:**
  - `a reply sent from the phone is answered on the phone`;
  - `a reply typed on the dashboard by a colleague names them`;
  - `an auto-reply says so`;
  - `a copied suggestion that was sent is answered with Wheelman's suggestion`;
  - `a waiting conversation has no answered field`.
  
  Use invented data, with phones in 0491 570 1xx.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit:** `Server: a conversation answered elsewhere says how, by whom and when`

### Task 2: Written ahead for the ten newest waiting Dashboard conversations

**Files:**
- Modify: `src/worker.js` (`draftWaiting`, about lines 204-268) and `src/items.js` (`finishItem`'s age gate, about lines 368-376, takes an override).
- Test: `test/writeahead.test.js`

**Interfaces:**
- **`draftWaiting`:**
  - It first takes the keys of `sectionRows('dashboard').waiting.slice(0, 10)`, newest first. Expose a small function for this from server.js or items.js; do not import server.js into worker.js if that would create a cycle. Choose the cleanest place and say which.
  - For each it builds the item with the age gate lifted (`finishItem(..., { autoDraftMaxAgeHours: Infinity })`, or an equivalent `ignoreAge` flag). It then applies the usual queue rules (held, dismissed, a draft already there, recent failure, limits).
  - The rest of today's queue follows unchanged. A conversation already handled from the top ten is not visited twice.
- **The page** needs no change: the draft is simply there on open.

- [ ] **Step 1: Write the failing tests:**
  - `the top ten skip the age gate only`. A 30-hour-old waiting customer in the top ten gets a draft. An 11th, equally old, does not. A no-record number and a photo-only message in the top ten get none.
  - `the top ten are written newest first and once`.
  - `the daily limit still stops the pass`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit:** `Drafts: the ten newest waiting Dashboard conversations are written ahead, however old the message`

### Task 3: The reply run

**Files:**
- Create: `web/new/js/runstore.js`, pure with no DOM. It holds the run's state and the decisions; the main store calls it.
- Modify:
  - `web/new/js/store.js`, adding the actions `startRun`, `skipRun` and `endRun`. If it would pass 400 lines, put the run wiring in `runstore.js` and keep store.js to the calls.
  - `web/new/js/ui/list.js` ("<N> waiting, oldest <ago> · Start replying" above the rows on Needs reply).
  - `web/new/js/ui/conversation.js` (the run bar).
  - `web/new/js/hashsync.js`, if the run's opens need a rule (they are automatic opens, so they replace).
  - the CSS.
- Test: `test/newpage-runstore.test.js`

**Interfaces:**
- **`createRun(rows, now)`** returns `{ queue: [key…] oldest first, i: 0, copied: 0, skipped: 0, elsewhere: 0, seen: Set }`.
  - **`nextKey(run, rowsNow)`** returns the next key not yet seen whose row is still waiting and not done. A row that is now answered elsewhere counts toward `elsewhere` and is passed over. It returns null at the end.
  - **`runSummary(run)`** gives the summary words from the Global Constraints.
- **The main store's actions:**
  - `startRun()` builds the queue from the rows the page has (it loads all waiting rows first if `total > rows.length`), then opens the first.
  - After a successful `copy()` during a run, it calls `copied++` and opens the next.
  - `skipRun()` calls `skipped++` and opens the next.
  - `endRun()` stops the run.
  - At the end it shows the summary in the conversation area ("All answered: …"), with "Back to the list".
  - Opening another row, chip or tab ends the run without a summary.
- **The run bar** reads "Reply run · 3 of 7" with Skip and End run, as a live region.

- [ ] **Step 1: Write the failing tests:**
  - `the run takes Needs reply oldest first`;
  - `copy in a run opens the next`;
  - `skip moves on without marking done`;
  - `a row answered elsewhere during the run is passed over and counted`;
  - `a row that changes during the run is not visited twice`;
  - `choosing another row ends the run`;
  - `a failed copy keeps the run where it is`;
  - `the summary leaves out the zero parts`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview at 1440×900 and 390×844, light and dark:
  - Start replying;
  - Copy three times;
  - Skip one;
  - End;
  - the summary;
  - the keyboard: Ctrl+Enter copies and moves on.
  
  Screenshots go under `D:\Jim\Wheelman\.playwright-mcp\new-page-4\` as `task3-*.png`.
- [ ] **Step 5: Commit:** `New page: the reply run, Copy then the next customer`

### Task 4: Answered elsewhere on the page

**Files:**
- Modify: `web/new/js/model.js` (`answeredWords(answered, now)`; `rowView`'s reason for an answered-elsewhere row) and `web/new/js/ui/messagebox.js` (the answered state).
- Test: `test/newpage-model.test.js`, `test/newpage-store*.test.js`

**Interfaces:**
- **`answeredWords({ how, by, at }, now)`** gives the exact words in the Global Constraints.
- **`rowView`:** an answered row shows them as its reason on All. Needs reply never lists it, because the server's waiting tab already excludes it.
- **The open conversation:** when it becomes answered elsewhere while open, the box shows "<answered words>. No reply needed." with "Write a reply anyway". A suggestion that was there is shown under it as greyed text, not in the editor. In a run the run bar's Next opens the next customer.
  - When Jim had typed text, it is kept, and the line says "The customer was answered elsewhere. Your text is kept."

- [ ] **Step 1: Write the failing tests:**
  - `answeredWords says how, by whom and when`;
  - `an answered row's reason on All`;
  - `an open conversation answered elsewhere says so and the run moves on`;
  - `typed text is kept when the conversation is answered elsewhere`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Check on the preview.** Add to `test/support/preview.js` an invented conversation the stand-in dashboard answers from the phone a minute after the preview starts, the same way the world's existing messages are made. Check:
  - the row leaves Needs reply;
  - on All it says "Answered on the phone …";
  - the open box changes.
  
  Screenshots as `task4-*.png`.
- [ ] **Step 5: Commit:** `New page: a customer answered elsewhere leaves Needs reply and says who answered`

### Task 5: README and walkthrough

- [ ] **Step 1: Update `README.md`.** In "The new page", add the reply run, answered elsewhere, and written ahead for ten. In "How a suggestion is written", note that the ten newest waiting Dashboard conversations are written ahead whatever their age. Add one dated Status line. The README is public: plain words, no figures, no names.
- [ ] **Step 2: Walk through it on the preview** at 1440×900 and 390×844, light and dark:
  - a run through four customers, with one skipped;
  - a customer answered on the phone during the run;
  - the summary;
  - a 30-hour-old waiting customer in the top ten has its suggestion on open.
  
  There must be no console errors, and the only requests must be to 127.0.0.1:3211. Screenshots as `task5-*.png`.
- [ ] **Step 3: Run** `npm.cmd test`, `check-private`, `check-deps` and `check-css`. Expected: all pass.
- [ ] **Step 4: Commit:** `README: the reply run, answered elsewhere and written ahead for ten`
