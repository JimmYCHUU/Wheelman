# The new page, PR 6: the Playbook's facts and lessons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**The Playbook is split in two (ruled 29 Oct 2026).** The whole of it was ten tasks: more than one final review should take, as with PR 5.
- **This PR (Tasks 1–6)** covers what Wheelman knows and learned.
- **PR 6b** (`docs/superpowers/plans/2026-10-29-new-page-6b-templates-voice.md`) adds templates and voice rules on top. It builds on this PR's branch, and uses its versions table, `src/playbookapi.js` and the Playbook page.

**Builds on PR 5b:**
- branch `new-page-5b`, head `599e938`, PR #67;
- plan `docs/superpowers/plans/2026-10-28-new-page-5b-imports-auction.md`;
- ledger `eval/redesign/pr5b-imports-auction-ledger.md` (local, in `D:\Jim\Wheelman\eval\redesign\`).

Branch `new-page-6` from `599e938`. This plan was written on 29 Oct 2026 against the code at `599e938`.

It uses these pieces as they are:
- `src/learn.js`: `teachesHere`, `canLearnFrom`, `ownerGuidance`, `onRemember`, and the private `isFollowUp`, `writtenUntaught`;
- `src/db.js`: the `advice` and `learned` tables, `listLessons`, `getLesson`, `switchLesson`, `insertRemember`, `insertAdvice`, `countLessonUse`;
- the routes `GET /api/lessons`, `POST /api/lessons/:id/switch` and `POST /api/drafts/:id/remember` (`src/server.js` lines 1172–1195), unchanged;
- `src/knowledge.js`: `knowledgeFile`, `loadBusinessFacts`, `businessFactsForPrompt`, `relevantFacts`;
- `src/checks.js` `traceFacts`, and `src/drafter.js`'s `context.facts` and `context.lessons`;
- `web/new/js/lessons.js`: `rememberOffer`, `scopeWords`;
- `web/new/js/remember.js`: the store's `switchLesson`;
- `web/new/js/ui/menu.js` `MenuButton`;
- the main store's `actions.toast(message, { label, run })`;
- `test/support/preview.js` and its stand-ins.

**Name clash to keep in mind:** `src/playbook.js` already exists. It is the sales playbook (`voice/sales-playbook.md`) for compact requests, not this page. This PR's routes go in `src/playbookapi.js`, and the page's store is `web/new/js/playbookstore.js`.

**Goal:** One place where Jim answers what Wheelman needs to know, sees what it learned, and switches any of it off. The files stay as they are.
- **Business facts** are listed as Needs your answer, Working and Confirmed. Answering one makes it Confirmed with the day, and the next suggestion that uses it names it in the trust line (journey 6, story 15).
- **Lessons** show where each came from, its scope, its day, how often it was used and its history, with an off switch (R9.4, story 12).
- **An edit made on three suggestions** waits in Lessons as a proposed lesson with its examples, for **Keep as a lesson** or **Not a rule** (R9.3, story 13).
- **A suggestion that teaches nothing says so,** so neither page offers a way to teach from it (the PR 5b ledger's deferral, line 100).

**Architecture:**
- **Every Playbook edit is a new row in the database** (`playbook_versions` in `data\app.db`). It is laid over the file when the file is read. No file is ever written, and no row is ever changed or removed. PR 6b keeps its templates and voice rules in the same table.
- **New server modules:**
  - `src/factbook.js`: the facts as the Playbook lists them, and saving one;
  - `src/factcite.js`: which business facts a suggestion used, and which it needed;
  - `src/editrules.js`: repeated edits found, grouped and decided;
  - `src/playbookapi.js`: the `/api/playbook/…` routes, reached by one line in `src/server.js`.
- **The page:**
  - The Playbook is a full view at `#/playbook/<tab>`, opened from the Menu.
  - It has its own store, `playbookstore.js`, beside the main store, as the panel's and the search's are.
  - The main store keeps the open conversation, with its typed text, while the Playbook is on screen.
- **New pure page modules:**
  - `playbookroute.js`: the Playbook's address;
  - `trustview.js`: the trust line, moved out of `model.js`, now with business facts;
  - `playbookview.js`: the Lessons and Business facts tabs' words.

**Tech Stack:** as PRs 1–5b:
- Node 22 with `node:sqlite`, and no dependencies;
- the new page in Preact and htm, vendored as a classic script;
- pure ES modules, tested with `node --test`.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 4: principle 5, and "Changes to earlier decisions" row 1;
  - section 5, M9 (R9.1–R9.4 and R9.6);
  - section 7: the Menu, and the address `#/playbook/lessons`;
  - section 8, journeys 3 and 6;
  - section 9, the Playbook row of the screens table;
  - section 12, the Lesson and Fact records;
  - section 14, stories 12, 13 and 15;
  - section 15, the risk "Proposed lessons drift or annoy";
  - Next steps, decision 7.
- **The ledgers** (local):
  - `pr3-message-box-ledger.md` line 17 (R9.3 moved to PR 6) and line 55 (Remember lessons kept out of Marketplace requests);
  - `pr5b-imports-auction-ledger.md` line 96 (a wording-file message teaches nothing, wherever it was written) and line 100 (the per-draft flag deferred to PR 6).
- **The prototype:**
  - `prototype/js/ui-pages.js`: `Playbook`, `Lessons`, `LessonCard`, `Facts`, `FactAsk`;
  - `prototype/js/store.js`: `A.answerFact`, `A.factToWorking`, `A.lesson`;
  - `prototype/js/ui-thread.js` line 162: the line for a fact that needs an answer;
  - `prototype/js/ui-panel.js` line 140: "See every lesson in Playbook".
- **The old page:** `web/app.js` line 1112, the Good reply and Could be better gate (`teach`).
- **Jim's decisions** (memory): `wheelman-next-redesign`, `wheelman-brand-and-learning-rules`, `wheelman-no-model-training`, `wheelman-sales-first-redesign`, `always-give-the-template`, `wheelman-public-repo-rules`.

## Switch-over checklist items in this PR

None of the checklist's items moves here: the old page has no Playbook. Its facts are a file edited by hand, and its lessons are listed nowhere.
- **The old page changes in two ways:**
  - Good reply and Could be better are hidden on a suggestion that teaches nothing (Task 3).
  - Its suggestions use the Playbook's facts (Task 1), as the new page's do.
- **Task 6 adds one line to the programme doc's checklist,** under Top bar: "the Menu's Playbook, with its tabs".

## Global Constraints

The Global Constraints of PRs 1–5b hold:
- no dependencies, and the CSP unchanged;
- tokens only, plain words, and colour always with words;
- 44 px targets;
- **file size and structure:**
  - No new page source file (every file under `web/new/js` and `web/new/css`) is over 400 lines, as `test/newpage-size.test.js` counts them. Test files are not bound.
  - `model.js` does not grow. Task 2 makes it smaller: the trust line moves to `trustview.js`.
  - `store.js` takes no new action. The Playbook's store is its own, made in `main.js`, so the size test's action list is unchanged.
  - No `web/new/js` module imports another in a cycle (the existing test).
- invented test data only:
  - Every test that reads business facts, and the preview, point `config.knowledgeDir` at a scratch folder made by `test/support/facts.js`.
  - None reads the worktree's own copy of the real facts file.
- never the live folder, its database or port 3210. The preview runs on 3211 (`node test/support/preview.js`);
- no AI attribution in commits or the PR;
- the page never changes the reply string;
- one test file runs with `node --disable-warning=ExperimentalWarning --test test/<name>.test.js`, and the suite with `npm.cmd test`;
- `npm.cmd run check-private` before every commit.

Changed for this PR:
- **API: additions, plus the ruled changes below.**
  - **The additions:**
    - `GET /api/playbook/facts` and `POST /api/playbook/facts`;
    - `GET /api/playbook/lessons` (the lessons with `from` and `history`, the proposals, and those marked not a rule) and `POST /api/playbook/proposals`;
    - on a conversation's draft: `teaches`, `topics` and `openTopics`;
    - in `/api/status`: `playbook: { toReview }`.
  - `GET /api/lessons` and every other route answer exactly as before.
  - **Ruled change 1 (PRD decision 7, Confirmed 24 Oct 2026):**
    - A business fact saved in the Playbook replaces that topic of the facts file in every request, on both pages.
    - The file is never written.
    - With nothing saved, every request is as it was.
  - **Ruled change 2 (the PR 5b ledger's deferral, line 100):**
    - A suggestion that teaches nothing says `teaches: false`.
    - The old page then hides Good reply and Could be better, as the new page hides Remember.
  - **Ruled change 3 (R9.3, story 13):** a kept edit lesson is used like a Remember lesson. It goes into requests of its channel and scope, and never into a Marketplace request.
- **Where a Playbook edit is kept (Ruled, 29 Oct 2026): in the database, one new row per save, laid over the file when it is read.**
  - **Every version is kept.** Rows are only ever added. A test reads the source and finds no statement that changes or removes one.
  - **Jim's current files cannot be lost.** Nothing writes them, so a mistake in the Playbook never touches what he has.
  - **One store for all of it.** PR 6b keeps the voice files' versions in the same table. Those files are in the public repository and the live folder stays on `main`, so writing them would leave uncommitted changes in `D:\Jim\Wheelman`, could block his next `git pull`, and could publish wording by accident. The database is git-ignored.
  - **It is backed up.** The daily backup already holds `data\app.db`.
  - **The file is the first version** and the default for any topic never saved.
  - The other choice, writing the file after a backup copy, was rejected for those reasons.
- **Where the Playbook lives (Ruled, 29 Oct 2026): a Menu item that opens a full view at `#/playbook/<tab>`, not a fifth tab.**
  - The PRD puts it behind the top-bar menu with its own address (section 7). The four tabs are sections of conversations (Confirmed, 24 Oct 2026).
  - Back returns to the conversation as it was left. A section tab leaves the Playbook.
- **The learning rules hold (Confirmed, 1, 8 and 9 Oct, 24 Oct 2026):**
  - lessons are stored records fed into each request, never model training;
  - Marketplace never teaches, and neither do the phone-only list, auction orders, follow-ups, the Auction section or the dashboard's Imports list in Imports;
  - Remember and edit lessons never go into a Marketplace request;
  - a switched-off lesson is never sent to the AI;
  - texts teach texts, and emails teach emails.
- **The facts rules hold (Confirmed, 5 and 12 Oct 2026):**
  - The Playbook's facts are business facts, which a reply may state. The insider facts in the panel are not in the Playbook and are never stated.
  - The exact-answer rule holds: a Needs-answer fact stays a blank in replies until it is answered, and nothing is guessed.
- **Rulings for Jim (29 Oct 2026). Each is a reversible default and goes in the PR description:**
  - **An edit is proposed as a lesson once it is made on 3 different suggestions** (R9.3 and story 13 say 3). Each suggestion counts once, whichever conversation it was in.
    - Cost if wrong: a lesson proposed too early (Not a rule ends it), or too late.
  - **What counts as one edit:** a run of up to 8 words removed, added or replaced, found by comparing what Wheelman wrote with what was copied.
    - It must hold a word that is not a small word ("the", "and").
    - It must hold no figure, link, blank or capitalised word inside a sentence (a name, a place or a car).
    - Cost if wrong: an edit Jim makes often is never proposed, or a trivial one is.
  - **Proposals come only from replies copied from Wheelman** in a conversation that teaches (`drafts.copied_at` set, a learned row with a change). A reply typed on the dashboard or the phone is not Jim's edit of a suggestion.
    - Cost if wrong: a colleague's habits are not proposed.
  - **A proposal's words and its lesson are made by code, with no AI:**
    - "You removed “kindly”, 6 times" gives the lesson "Leave out “kindly”.";
    - "You changed “assist” to “help”, 3 times" gives "Write “help”, not “assist”.";
    - "You added “Please call before visiting.”, 3 times" gives "Add “Please call before visiting.” when it fits.".
    - Cost if wrong: words only; Jim can say Not a rule.
  - **A kept edit lesson's scope** is the kind of message all its examples were about, else every reply, in their channel.
    - Cost if wrong: a lesson that applies more or less widely than Jim meant.
  - **Kept edit lessons never reach a Marketplace chat,** as Remember lessons never do.
    - Cost if wrong: an edit Jim makes on texts does not shape Marketplace replies.
  - **A business fact is named in the trust line** when the customer asked about it and the AI's words share at least 2 words with its answer. Asked about means the compact style's own rule (`relevantFacts`): a title word counts 2, an answer word 1, and a score of 2 or more.
    - Only a reply the AI wrote from the full request cites one. A template, an auction message and code's own wording cite none. At most 3 are named.
    - Cost if wrong: a fact named that was not used, or one used and not named. Figures and links are still traced as before.
  - **A Needs-answer fact is named above the box** when the customer asked about it and the reply has a `[CHECK?]` blank. **Answer it** opens it in the Playbook.
    - Cost if wrong: one line missing or extra.
  - **No suggestion is written again by itself when a fact is answered** (the prototype rewrites them). The box then reads "has your answer now", and offers **Write it again** while nothing is typed in it.
    - Cost if wrong: one press per waiting customer, and no requests spent unasked.
  - **A facts file changed by hand after a Playbook save:** the Playbook's answer stays in use. The Playbook says the file now differs and offers the file's answer as a new version.
    - Cost if wrong: Jim's later hand edit waits for one press.
  - **The page has no "Add a fact",** and no editing or deleting of a lesson's words (switch it off instead). A topic the file no longer has keeps its saved answer and stays in use.
    - Cost if wrong: a new topic is still added in the file.
  - **The operations guide (`knowledge/how-carbarn-works.md`) stays a file** and is not in the Playbook.
    - Cost if wrong: Jim edits it by hand until he asks.
  - **The Playbook works through the team link as it does on this computer.** Every version is kept, so a change made there can be put back.
    - Cost if wrong: someone with the team password can change a fact or switch a lesson.
  - **Lesson evidence is shown as stored:** with the customer's details taken out, and `{{NAME}}` shown as "(name)".
    - Cost if wrong: Jim sees "(name)" where the customer's name was.
  - **Proposals are counted only in the Menu's Playbook item and on the Lessons tab.** Nothing appears in the list, the box or a toast while he works (R9.3: "It never pops up during work").
    - Cost if wrong: proposals wait unseen until he opens the Menu.

## Review Focus

1. **Jim's facts file changed or lost by a save.** It stays byte for byte, and each save is a new row. Pinned in Task 1: `saving a fact never writes the facts file, and every version is kept`.
2. **Every request changed although nothing was saved.** With no row, the facts are exactly the file's. Pinned in Task 1: `with nothing saved in the Playbook, the facts are the file's, as before`.
3. **A hand edit to the file after a Playbook answer, silently ignored.** The Playbook says the file differs and offers its answer. Pinned in Task 1: `a file changed by hand after a Playbook answer says so, and its answer can be used`.
4. **A fact named in the trust line that the reply never used.** The trust line must not overstate. Pinned in Task 2: `a fact the customer asked about and the reply used is cited; one only given to the AI is not`.
5. **Write it again pressed over typed words after a fact is answered.** It is offered only while the box is untouched. Pinned in Task 2: `the Needs-answer line links to the fact, and offers Write it again only while the box is untouched`.
6. **A lesson reaching a Marketplace request, or one that is switched off.** Pinned in Task 4: `a kept edit lesson goes into texts of its channel, never a Marketplace request, and not once switched off`.
7. **A proposal made from a filled blank, a figure, a link, a name, or a reply not copied from Wheelman.** Pinned in Task 4: `repeated edits are proposed only from replies copied from Wheelman, never from a filled blank, a figure, a link or a name`.
8. **Undo after Keep or Not a rule leaving a lesson on, or losing the proposal.** Pinned in Task 4: `Not a rule is remembered, Keep it after all makes the lesson, and Undo puts each back`.
9. **Typed words lost on the way to the Playbook and back,** or the store following the Playbook's address to the Dashboard. Pinned in Task 5: `on a Playbook address the store is left where it was and nothing is written over the address`.

---

### Task 1: Business facts in the Playbook, every version kept

**Files:**
- Create:
  - `src/factbook.js`: `playbookFacts`, `saveFact`, `FACT_STATES`;
  - `src/playbookapi.js`: `playbookApi`;
  - `test/support/facts.js`: `inventedFacts`, `INVENTED_FACTS`.
- Modify:
  - `src/db.js`:
    - the table `playbook_versions` in `SCHEMA`;
    - a section "---- the Playbook" with `addVersion`, `versionsOf`, `latestVersions` and `versionsStamp`;
  - `src/knowledge.js` `loadBusinessFacts`: the Playbook's answers laid over the file;
  - `src/server.js` `api()`: one dispatch line, `if (p.startsWith('/api/playbook/') && await playbookApi(req, res, p, url, { send, readBody })) return;`;
  - `src/app.js` line 41: the start-up line says "answer them in the Playbook, in the new page's Menu" in place of the file name.
- Test: `test/playbook-facts.test.js`.

**Interfaces:**
- **The table:**
  ```sql
  CREATE TABLE IF NOT EXISTS playbook_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,   -- 'fact' | 'template' | 'voice'
    name TEXT NOT NULL,   -- the file: 'business-facts.md', 'dashboard-messages.md', 'house-voice.md'
    part TEXT NOT NULL,   -- a fact's title, a template's part, a voice section's heading; '' the whole file
    text TEXT NOT NULL,
    status TEXT,          -- a fact's: 'confirmed' | 'working' | 'needs_answer'
    base TEXT,            -- the file's own text for that part when this was saved
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS playbook_versions_part ON playbook_versions(kind, name, part, id);
  ```
- **In `src/db.js`:**
  - `addVersion({ kind, name, part, text, status = null, base = null, at = Date.now() })` returns the id;
  - `versionsOf({ kind, name, part })` returns rows, newest first;
  - `latestVersions(kind, name)` returns a `Map` of part to the newest row;
  - `versionsStamp()` returns the newest id, or 0, from a counter that `addVersion` moves.
  - Nothing updates or deletes a row of this table.
- **In `src/knowledge.js`:** `loadBusinessFacts(file = knowledgeFile('business-facts'), { playbook = true } = {})`.
  - With `playbook`, each topic's newest saved version replaces its status and answer. A version saved as `needs_answer` makes the answer `''`.
  - A topic laid over also carries `at`, the save's time. A topic not laid over has no `at` key, so with nothing saved the list is exactly the file's.
  - A saved title the file lacks is added after the file's topics.
  - `businessFactsForPrompt` and `relevantFacts` call it with no options, so every request, the `/api/status` counts and the start-up line use the Playbook.
- **In `src/factbook.js`:**
  - `FACT_STATES = ['confirmed', 'working', 'needs_answer']`.
  - `playbookFacts()` returns `{ facts, counts }`.
    - `facts` are in file order: `[{ title, status, answer, at, from, earlier, file }]`.
    - `from` is `'file'` or `'playbook'`; `at` is the newest save's time, or null for the file's.
    - `earlier` lists every version before the current one, newest first, then the file's own: `[{ answer, status, at, from }]`.
    - `file` is `{ status, answer }` only when the file's topic differs from the `base` of the newest save; otherwise null.
  - `saveFact({ title, answer, status = 'confirmed', now })` returns `{ fact }`, or `{ status, error }`.
    - Its `base` is `JSON.stringify({ status, answer })` of the file's topic, or `''` when the file has no such topic.
    - The answer is trimmed. Saving the same answer and status again adds no row.
    - **The refusals:**
      - a title neither the file nor the Playbook has: 404 "That fact is not in the Playbook.";
      - a status not in `FACT_STATES`: 400 "Say whether the answer is Confirmed or Working.";
      - an empty answer with `confirmed` or `working`: 400 "Write the answer first.";
      - over 2,000 characters: 400 "That answer is too long: keep it under 2,000 characters.".
- **The routes** (`src/playbookapi.js`, `playbookApi(req, res, p, url, { send, readBody })` returns true when it answered):
  - `GET /api/playbook/facts` gives `playbookFacts()`;
  - `POST /api/playbook/facts { title, answer, status }` gives 200 `{ fact }` (the fact as `playbookFacts` lists it), or the refusal.
- **`test/support/facts.js`:** `inventedFacts()` makes a scratch folder under `os.tmpdir()` holding `business-facts.md`, built from `INVENTED_FACTS`, and returns its path. The topics, with no figures:
  - Opening hours, CONFIRMED: "Open every day of the week.";
  - Holding deposit, CONFIRMED: "A refundable holding deposit takes a car off the market.";
  - Roof racks, WORKING: "We can fit roof racks before pickup; a person quotes the cost.";
  - Tinted windows, NEEDS ANSWER;
  - Car covers, NEEDS ANSWER.

- [ ] **Step 1: Write the failing tests** in `test/playbook-facts.test.js` (real routes and the stand-ins, as `test/remember.test.js` does; `config.knowledgeDir = inventedFacts()` in `before`):
  - `the Playbook lists every business fact with its state, and an answer saved there is used in the next request`:
    - GET lists the five, in file order, with `from: 'file'`. `counts` is `{ confirmed: 2, working: 1, needsAnswer: 2 }`;
    - POST Tinted windows, "Yes, we can arrange window tinting before pickup, and a person quotes the cost." answers 200 with `status: 'confirmed'`, `from: 'playbook'` and `at` of today;
    - `buildPrompt(item).user` for a customer then has "- Tinted windows: Yes, we can arrange window tinting" under BUSINESS FACTS. It no longer lists "- Tinted windows" under TOPICS WITH NO CONFIRMED ANSWER;
    - `/api/status` `facts.needsAnswer` is 1.
  - `saving a fact never writes the facts file, and every version is kept`:
    - the file's bytes and `mtimeMs` are the same after three saves;
    - `versionsOf` holds three rows;
    - `earlier` lists the two older saves, then the file's own;
    - the same answer saved again adds no row.
  - `with nothing saved in the Playbook, the facts are the file's, as before`: `loadBusinessFacts()` deep-equals `loadBusinessFacts(undefined, { playbook: false })`, and `businessFactsForPrompt().text` lists the file's usable topics in its order.
  - `a fact saved as Working is used and listed to confirm; one put back to Needs answer is not used`:
    - `/api/status` `facts.toConfirm` names a fact saved as Working;
    - saved again with `needs_answer` and `''`, it is under TOPICS WITH NO CONFIRMED ANSWER and not under BUSINESS FACTS.
  - `a fact the file does not have is refused, and an empty or overlong answer is refused`: the four refusals, in their words.
  - `a file changed by hand after a Playbook answer says so, and its answer can be used`:
    - after a save, the test rewrites the scratch file's Roof racks answer;
    - the Playbook's answer is still the one in the request;
    - `file` is `{ status: 'working', answer: <the new words> }`;
    - posting that answer makes `file` null again.
  - `no statement changes or removes a saved version`: no file under `src/` matches `/(UPDATE|DELETE FROM)\s+playbook_versions/i`.
- [ ] **Step 2: Run** `test/playbook-facts.test.js`. Expected: FAIL (no route).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, `test/relevantfacts.test.js` and `npm.cmd test`. Expected: PASS. No preview check yet: the page comes in Task 5. `curl http://127.0.0.1:3211/api/playbook/facts` on the preview lists the invented facts once Task 2 points the preview at them.
- [ ] **Step 5: Commit:** `Playbook: business facts answered in the Playbook are used in every request, every version kept, and the facts file is never written`

### Task 2: The trust line names the business facts a suggestion used (journey 6)

**Files:**
- Create:
  - `src/factcite.js`: `citedTopics`, `openTopics`;
  - `web/new/js/trustview.js`: `trustLine`, `factLine` (moved from `model.js` as they are), `topicLine`, `factAsk`;
  - `web/new/js/playbookroute.js`, importing nothing: `PLAYBOOK_TABS`, `playbookRoute`, `playbookHash`.
- Modify:
  - `src/knowledge.js`:
    - export `topicScore(topic, query, { titleOnly = false } = {})` and `factWords(text)`, the scoring `relevantFacts` does now, which it then calls;
    - `businessFactsForPrompt()` also returns `topics`, the list it read.
  - `src/prompt.js` `buildPrompt`: it also returns `askedText` (the customer's waiting words, redacted: `waitingText`) and `factTopics` (`facts.topics`).
  - `src/drafter.js`, beside `context.facts` (line 652):
    - `context.topics = plain ? citedTopics({ asked: prompt.askedText, reply: aiPart, topics: prompt.factTopics }) : []`;
    - `context.openTopics = plain ? openTopics({ asked: prompt.askedText, reply, topics: prompt.factTopics }) : []`;
    - here `plain` is `answered && !fit && !plan`.
  - `src/server.js`:
    - `draftOf` adds `topics: draft.context?.topics || []` and `openTopics: (draft.context?.openTopics || []).map((title) => ({ title, answered: false }))`;
    - `present()` alone sets `answered`, from one `loadBusinessFacts()`. List rows read no facts.
  - `web/new/js/model.js`: `export { trustLine, factLine } from './trustview.js'`, with the moved code removed.
  - `web/new/js/ui/trust.js`: `FactAsk`.
  - `web/new/js/ui/messagebox.js` `Draft`: `<${FactAsk} …/>` under the `Context` line.
  - `test/support/preview.js`:
    - `config.knowledgeDir = inventedFacts()` after `pointConfigAt`;
    - Dara Invented;
    - two stand-in replies.
- Test:
  - `test/factcite.test.js`;
  - `test/playbook-facts.test.js`: two added;
  - `test/newpage-trust.test.js`.

**Interfaces:**
- **`citedTopics({ asked, reply, topics, max = 3 })`** returns `[{ title, status, at }]` for topics that are not `needs_answer`, best score first:
  - `topicScore(topic, asked) >= 2`, and
  - at least 2 distinct `factWords` shared by `reply` and the topic's answer.
  - `at` is the topic's `at` (Task 1), or null when it came from the file.
- **`openTopics({ asked, reply, topics, max = 2 })`** returns titles of `needs_answer` topics where `topicScore(topic, asked, { titleOnly: true }) >= 2`, only when `reply` holds `[CHECK?]`.
- **The draft view:**
  - `topics: [{ title, status, at }]`;
  - `openTopics: [{ title, answered }]`.
- **`trustLine(draft, text, now)`** is as today for a draft with no `topics`, so every existing test passes unchanged. With topics:
  - one entry is added to `facts` per topic: `{ label: title, value: '', source: 'your business facts', ok: true, topic: { status, at } }`;
  - the headline gains the sentence "Uses your business fact “Tinted windows”." (two: "Uses your business facts “A” and “B”."). It follows the figures' words, or stands alone when no figure or link was found. The tone rule is unchanged.
- **`topicLine(f, now)`:**
  - "Tinted windows · from your business facts, confirmed today";
  - "… , confirmed Thursday 29 October" (`dayLabel`, with Today and Yesterday in lower case);
  - "… , still Working" for a Working fact;
  - "… · from your business facts" when it came from the file.
  - `factLine` calls it for a topic entry.
- **`factAsk(item, typed)`** returns `{ words, href, rewrite }` for the first open topic, or null:
  - not answered: words "“Tinted windows” needs your answer in the Playbook, so the reply has a blank for it.", with the link **Answer it**;
  - answered: "“Tinted windows” has your answer now. Write the reply again to use it.", with `rewrite: typed === null`, which shows **Write it again** (`actions.write({})`);
  - `href` is `playbookHash('facts', title)`.
- **`playbookroute.js`:**
  - `PLAYBOOK_TABS = ['lessons', 'facts']` (6b adds `'templates'` and `'voice'`);
  - `playbookRoute(hash)` returns `{ tab, id }` for `#/playbook/<tab>[/<id>]` (an unknown tab is `'lessons'`; `id` is decoded), else null;
  - `playbookHash(tab, id)` returns `'#/playbook/' + tab`, plus `'/' + encodeURIComponent(id)` when `id` is given.

- [ ] **Step 1: Write the failing tests:**
  - **`test/factcite.test.js`** (invented topics, no server):
    - `a fact the customer asked about and the reply used is cited; one only given to the AI is not`:
      - asked "Can you tint the windows before I pick it up?", with the reply sharing the answer's words: cited;
      - the same reply to "Is it still available?": not cited;
      - asked about tinting, with a reply about finance: not cited;
      - at most 3.
    - `a Needs-answer fact the customer asked about is named when the reply has a blank for it`: named with `[CHECK?]` in the reply, not without it, and not when the customer asked about something else.
  - **In `test/playbook-facts.test.js`:**
    - `a Needs-answer fact answered in the Playbook is Confirmed with today's date, and the next suggestion's trust line cites it` (journey 6, story 15):
      1. The stand-in AI answers with `[CHECK?]`. The draft's `openTopics` is `[{ title: 'Tinted windows', answered: false }]`.
      2. POST the answer.
      3. The same conversation's `openTopics` reads `answered: true`.
      4. A new draft, whose AI words are "Yes, we can arrange window tinting before pickup, and we will quote the cost for you.", has `topics: [{ title: 'Tinted windows', status: 'confirmed', at }]`, where `at` is the save's time.
      5. `trustLine(draft, draft.reply, now).text` ends "Uses your business fact “Tinted windows”.".
    - `a template, an auction message or code's own wording cites no business fact`: a draft from a Dashboard template (`message=still_available`), and an order message, have `topics: []` and `openTopics: []`.
  - **`test/newpage-trust.test.js`:**
    - `the trust line names the business facts a suggestion used, with their state and day`: the headline with no figures; with two facts; and `topicLine` for a confirmed, a Working and a file fact.
    - `the Needs-answer line links to the fact, and offers Write it again only while the box is untouched`:
      - the link is `#/playbook/facts/Tinted%20windows`;
      - `rewrite` is true with `typed === null`, and false with typed text;
      - there is no line when `openTopics` is empty.
    - `the trust line lives in trustview.js, and model.js passes it on`: `model.js` exports the same functions, and its source no longer defines `trustLine`.
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Implement.** In the preview:
  - **Dara Invented** (`0491 570 196`): a Dashboard text from lead and conversation 797, made as Wynn's is, with stock 1800, written two minutes ago: "Can you tint the windows on the Voxy before I pick it up?"
  - **The stand-in AI:**
    - when the request holds "- Tinted windows: " under BUSINESS FACTS and the customer's words mention tinting, it answers "Yes, we can arrange window tinting before pickup, and we will quote the cost for you.";
    - when "- Tinted windows" is under TOPICS WITH NO CONFIRMED ANSWER, it answers "Thank you for asking. Whether we can tint the windows before pickup is [CHECK?]." with that blank in `needs_human`.
- [ ] **Step 4: Run** the files and `npm.cmd test`. On the preview:
  1. Dara's box shows the Needs-answer line.
  2. POST the answer with curl.
  3. Reopen Dara: "has your answer now" and **Write it again**.
  4. Press it: the trust line names Tinted windows.

  Screenshots go under `D:\Jim\Wheelman\.playwright-mcp\new-page-6\` as `task2-*.png`.
- [ ] **Step 5: Commit:** `New page: the trust line names the business facts a suggestion used, and a fact that needs an answer says so above the box`

### Task 3: Each lesson's history and source, and a suggestion that teaches nothing says so

**Files:**
- Modify:
  - `src/db.js`:
    - the table `lesson_events (id INTEGER PRIMARY KEY AUTOINCREMENT, advice_id INTEGER NOT NULL, what TEXT NOT NULL, at INTEGER NOT NULL)` with an index on `advice_id`;
    - `addLessonEvent(adviceId, what, at)`;
    - `insertAdvice` (for a note) and `insertRemember` write `'made'`, or `'again'` for a repeat. `switchLesson` writes `'on'` or `'off'`;
    - `lessonDetails(lessons)`: each listed lesson with `from` and `history`, from one read of `lesson_events` and one of `advice`.
  - `src/learn.js`: `draftTeaches(item, draft)`.
  - `src/server.js` `draftOf`: `teaches: draftTeaches(item, row)`.
  - `src/playbookapi.js`: `GET /api/playbook/lessons` gives `{ lessons: lessonDetails(listLessons()) }`. Task 4 adds its other two lists.
  - `web/new/js/lessons.js` `rememberOffer`: null when `draft.teaches === false`.
  - `web/app.js` line 1112: `const teach = !!item.teaches && d.teaches !== false;`.
- Test:
  - `test/lessons-history.test.js`;
  - `test/newpage-model.test.js`: one added.

**Interfaces:**
- **`what`** is one of `'made'`, `'again'`, `'on'`, `'off'`, `'kept'` and `'undone'`. Task 4 writes the last two.
- **`lessonDetails`** adds to each lesson:
  - `from`:
    - a note: `{ note, customer, draft }`, from `advice.note`, `customer_text` and `draft_text`, all stored redacted;
    - a Remember lesson: `{ instruction }`;
    - an edit lesson: `{ examples, count }` (Task 4);
  - `history: [{ what, at }]`, oldest first. A row with no `'made'` event (one taught before this update) starts with `{ what: 'made', at: advice.at }`.
- **`GET /api/lessons` is unchanged.** Its test at `test/remember.test.js` line 96 still passes as it is.
- **`draftTeaches(item, draft)`** is true only when all of these hold:
  - `teachesHere(item)`;
  - `canLearnFrom(draft.item_key)`;
  - not a follow-up (`isFollowUp`);
  - not `writtenUntaught(draft, item)`: in Auction, from the Imports list in Imports, or from the auction's wording file;
  - the anchor is not `out:`.

  It reads only the item and the row, so a list build pays nothing for it.

- [ ] **Step 1: Write the failing tests:**
  - **In `test/lessons-history.test.js`** (the routes, as `test/remember.test.js`):
    - `every lesson lists where it came from, its scope, its date, its use and its history`:
      - a Remember lesson, switched off then on, lists `history` `['made', 'off', 'on']` and `from: { instruction }`;
      - a note's lessons list `from.note`;
      - `usedCount` is as `/api/lessons` says.
    - `a lesson taught before this update has its making in its history`: an `advice` row written with no event lists `[{ what: 'made', at: row.at }]`.
    - `a suggestion from the auction's wording file says it teaches nothing, and neither page offers a way to teach from it`:
      - a text moved into Imports, written from `first_estimate`, has `draft.teaches === false`;
      - an ordinary Dashboard suggestion has `true`;
      - `web/app.js` gates Good reply and Could be better on `d.teaches !== false` (a source check, as PR 5b's are).
    - `a follow-up's suggestion and one written in Auction say they teach nothing`: `draft.teaches === false` for both.
  - **In `test/newpage-model.test.js`:** `rememberOffer is not offered on a suggestion that teaches nothing`: an instruction draft with `teaches: false` gives null, and with `teaches: true` the offer.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Any assertion that deep-equals a draft's fields gains `teaches`, `topics` and `openTopics`. Each is listed in the commit body.
- [ ] **Step 4: Run** them and `npm.cmd test`. On the preview, Imani's "Thanks, with estimate and deposit", rewritten with Tell Wheelman, offers no Remember. On the old page at 3211 `/`, it offers no Good reply or Could be better.

  Screenshots as `task3-*.png`.
- [ ] **Step 5: Commit:** `Lessons: each one's history and where it came from, and a suggestion that teaches nothing says so on both pages`

### Task 4: Repeated edits proposed as lessons (R9.3)

**Files:**
- Create: `src/editrules.js`: `EDIT_THRESHOLD`, `editHunks`, `proposalsFrom`, `editProposals`, `decideProposal`.
- Modify:
  - `src/db.js`:
    - the table `edit_rules (key TEXT PRIMARY KEY, decision TEXT NOT NULL, proposal_json TEXT NOT NULL, at INTEGER NOT NULL)`. `proposal_json` is the proposal as it stood when decided, so a rejected one can still be listed and kept;
    - `ensureColumn(db, 'advice', 'rule_key', 'TEXT')` and `ensureColumn(db, 'advice', 'evidence_json', 'TEXT')`;
    - `editRows(limit = 2000)`: the learned rows with `changed = 1` and a `draft_text`, joined to their draft where `copied_at IS NOT NULL`, newest first;
    - `editDecisions()`: a `Map` of key to `{ decision, proposal, at }`;
    - `setEditDecision(key, decision, proposal, at)` and `clearEditDecision(key)`;
    - `insertEditLesson({ key, itemKey, scope, text, evidence, at })`: one `advice` row of kind `'edit'` per key. Kept again, the same row is switched on and dated afresh;
    - `editLessonOf(key)`.
  - `src/learn.js` `ownerGuidance` (line 447): a lesson of kind `'edit'` is taken as a `'remember'` one is (`rememberFits`).
  - `src/playbookapi.js`:
    - `GET /api/playbook/lessons` also gives `proposals` and `notRules`;
    - `POST /api/playbook/proposals { key, decision }`.
  - `src/server.js` `/api/status`: `playbook: { toReview: editProposals().length }`.
  - `test/support/preview.js`.
- Test:
  - `test/editrules.test.js` (pure);
  - `test/playbook-lessons.test.js` (routes).

**Interfaces:**
- **`EDIT_THRESHOLD = 3`.**
- **`editHunks(before, after)`** returns `[{ removed, added, beforeSentence, afterSentence }]`.
  - It is a word-level longest-common-subsequence diff. Words are compared lower case, with punctuation set aside.
  - Each hunk is one run of words removed, added or both, kept in its original words.
  - A sentence is cut at `.`, `!`, `?` or a line end.
- **`proposalsFrom(rows, { decided = new Map(), threshold = EDIT_THRESHOLD } = {})`** is pure. Each row is `{ draft_id, item_key, channel, situations, draft_text, final_text, at }`. It returns `[{ key, kind, removed, added, channel, scope, count, examples }]`, the most made first.
  - **A hunk counts** when each side has at most 8 words, and it holds at least one word of 3 or more letters that is not in `learn.js`'s small words.
  - **It does not count** when either side holds a digit, `http`, a blank (`[` … `?]`), `{{NAME}}`, or a capitalised word that does not start its sentence.
  - `kind` is `'remove'`, `'add'` or `'replace'`.
  - `key` is `${channel}|${kind}|${removed.toLowerCase()}|${added.toLowerCase()}`.
  - `count` counts distinct suggestions. Only `count >= threshold` is proposed, and a decided key is not.
  - `examples` holds 3, newest first: `{ before: beforeSentence, after: afterSentence, at }`.
  - `scope` is the `situations[0]` all its rows share, else `'any'`.
- **`editProposals()`** runs `proposalsFrom(editRows(), { decided: editDecisions() })`. Its result is kept until the learned rows or the decisions change.
- **`decideProposal(key, decision, { now })`** finds the proposal among those waiting, else in the stored decision (a rejected one):
  - `'keep'` makes the lesson with `insertEditLesson`, its text by the Ruling's words, and `evidence` the proposal's `{ examples, count }`. It writes the event `'kept'` and stores `'kept'`. Keep it after all is this on a rejected key.
  - `'reject'` stores `'rejected'`.
  - `'undo'` clears the decision. A lesson of that key is switched off, with the event `'undone'`, so the edit is proposed again.
  - A key found in neither gives 404 "That proposal is no longer waiting.".
- **The routes:**
  - `GET /api/playbook/lessons` gives `{ lessons, proposals, notRules }`. `notRules` are the stored proposals of the keys rejected, each as a proposal is.
  - `POST /api/playbook/proposals { key, decision: 'keep'|'reject'|'undo' }` gives `{ lesson? }`, or 400 "Say keep, not a rule or undo.".
- **An edit lesson in a request** is used as a Remember lesson is: for its channel, its scope or every reply, never in a Marketplace request, and never while it is off.

- [ ] **Step 1: Write the failing tests:**
  - **In `test/editrules.test.js`** (invented rows):
    - `the words removed, added or changed are found, with the sentence around them`:
      - "Could you kindly send us your number?" to "Could you send us your number?" gives `removed: 'kindly'`;
      - "We are happy to assist." to "We are happy to help." gives a replace;
      - adding "Please call before visiting." gives an add.
    - `an edit made on three suggestions is proposed with three examples, newest first; two are not enough`:
      - "kindly" removed on four rows: `count: 4`, with 3 examples;
      - "the vehicle" to "the car" on two rows: not proposed.
    - `repeated edits are proposed only from replies copied from Wheelman, never from a filled blank, a figure, a link or a name`:
      - three rows each of these give nothing: `[PRICE?]` to a figure, "48,000 km" to "49,000 km", one link to another, "Dana" added mid-sentence;
      - `editRows()` leaves out a learned row whose draft was never copied.
    - `a proposal's scope is the kind of message all its examples share, else every reply`.
    - `emails' edits are proposed for emails and texts' for texts`: the same edit on two emails and two texts is not proposed. Three of either is, with that channel.
  - **In `test/playbook-lessons.test.js`** (the routes; rows made with `insertDraft`, `recordCopied` and `upsertLearned`):
    - `Keep makes a lesson from the edit, with its examples, and it is not proposed again`:
      - the lesson's `do` is "Leave out “kindly”.", with `kind: 'edit'` and `from.examples.length` 3;
      - `history` ends with `'kept'`;
      - `proposals` no longer has the key.
    - `Not a rule is remembered, Keep it after all makes the lesson, and Undo puts each back`:
      - a reject moves the proposal to `notRules`;
      - `'keep'` on it makes the lesson;
      - `'undo'` switches the lesson off and the edit is proposed again;
      - after an `'undo'` of a reject, it is proposed again.
    - `a kept edit lesson goes into texts of its channel, never a Marketplace request, and not once switched off`:
      - `buildPrompt` for a text holds "Leave out “kindly”.";
      - for a Marketplace chat it does not;
      - nor for a text once the lesson is switched off.
    - `the status counts the lessons waiting to be reviewed`: `/api/status` `playbook.toReview` goes 2, then 1 after a Keep.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** In the preview, after the people are added:
  - **Four copied edits removing "kindly"**, on the drafts of Ada, Bo, Cleo and Dev (c:701–c:704), made with `insertDraft`, `recordCopied` and `upsertLearned` (`source: 'copied'`, `changed: true`):
    - "Could you kindly send us your number?" to "Could you send us your number?";
    - "We would kindly ask you to call first." to "We ask you to call first.";
    - "Kindly let us know a time." to "Let us know a time.";
    - "Please kindly confirm the day." to "Please confirm the day.".
  - **Three changing "assist" to "help"** (Esme, Finn, Gia: c:705–c:707).
  - **Two changing "the vehicle" to "the car"** (Hugo, Ines), below the threshold.
  - **A Remember lesson** on Jax (c:710): "Do not mention finance unless they ask.", scope `finance`, switched off and on again.
  - **A Could be better note** on Kira (c:711): "Too long. Keep it to three lines.", with the lesson "Keep a reply to three short lines." (scope `any`).
- [ ] **Step 4: Run** them and `npm.cmd test`. On the preview, `curl /api/playbook/lessons` lists two proposals and the two lessons, and `/api/status` says `toReview: 2`.
- [ ] **Step 5: Commit:** `Lessons: an edit made on three suggestions is proposed as a lesson with its examples, to keep or mark as not a rule`

### Task 5: The Playbook page: the Menu, its address, Lessons and Business facts

**Files:**
- Create:
  - `web/new/js/playbookstore.js`: `createPlaybookStore`;
  - `web/new/js/playbookview.js` (pure): `lessonGroups`, `lessonLine`, `historyLines`, `proposalWords`, `factGroups`, `factTag`, `menuHint`, `backHref`;
  - `web/new/js/ui/playbook.js`: `PlaybookPage`;
  - `web/new/js/ui/lessonstab.js`: `LessonsTab`;
  - `web/new/js/ui/factstab.js`: `FactsTab`;
  - `web/new/css/playbook.css`, in `@layer views`, linked in `web/new/index.html` after `viewer.css`.
- Modify:
  - `web/new/js/hashsync.js` `addressAfter`: null when `playbookRoute(hash)`.
  - `web/new/js/main.js`:
    - `createPlaybookStore({ api, toast: actions.toast })`, passed to `App`;
    - the `hashchange` handler returns before `storeStep` on a Playbook address. It calls `actions.flush()` and `playbook.actions.load(tab, id)` instead;
    - `shown` is false while the address is the Playbook's;
    - a boot on a Playbook address calls `actions.boot({ section: 'dashboard', chip: 'waiting', key: null }, …)`, never `parseRoute` of that address (which would read a fact's title as a conversation's key), and shows the Playbook.
  - `web/new/js/ui/app.js`:
    - on a Playbook address, `<${PlaybookPage}>` in place of `<main class="work">`;
    - the top bar stays, with no tab current, and a tab leaves the Playbook.
  - `web/new/js/ui/topbar.js`: the Menu's first item, `{ label: 'Playbook', hint: menuHint(state.status), run: () => { location.hash = playbookHash('lessons'); } }`.
  - `web/new/js/ui/usedtab.js`: under "Lessons it followed", the link "See every lesson in the Playbook" (`playbookHash('lessons')`).
  - `test/support/preview.js`: nothing new, as Tasks 2 and 4 added the data.
- Test:
  - `test/newpage-playbook.test.js`;
  - `test/newpage-hashsync.test.js`: one added.

**Interfaces:**
- **`createPlaybookStore({ api, toast })`** returns `{ get, subscribe, actions: { load, keep, notRule, switchLesson, saveFact } }`.
  - **State:** `{ tab, focus, state: 'idle'|'loading'|'ready'|'error', error, lessons, proposals, notRules, facts, counts }`.
  - **`load(tab, focus)`** asks `GET /api/playbook/lessons` or `GET /api/playbook/facts`. `focus` is the fact to scroll to and focus.
  - **`keep(key)`** posts `{ key, decision: 'keep' }`. It toasts "Kept. It applies from the next suggestion." with Undo, which posts `'undo'` and toasts "Put back to review.".
  - **`notRule(key)`** posts `'reject'`. It toasts "Marked as not a rule. Wheelman will not suggest it again." with Undo.
  - **`switchLesson(id, on)`** posts the existing `/api/lessons/<id>/switch`. It toasts "Lesson switched off. It no longer shapes suggestions." or "Lesson switched on.", with Undo.
  - **`saveFact(title, answer, status)`** posts `/api/playbook/facts`.
    - It toasts "Saved as Confirmed. New suggestions use it." (or "Saved as Working."), with Undo. Undo posts the answer and status the fact had before, and toasts "Put back as it was.".
    - It returns true. On a refusal it toasts the server's words and returns false, so the editor keeps the text.
  - Every action loads its tab again after it lands.
- **`playbookview.js`:**
  - `lessonGroups({ lessons, proposals, notRules })` returns `{ review, on, off, notRules }`. Lessons are newest first.
  - `lessonLine(l, now)` gives, for example, "Texts · price questions · from your instruction · Yesterday · used in 4 suggestions".
    - The channel is "Texts" or "Emails"; the scope comes from `scopeWords`.
    - Where it came from is "from your instruction", "from your Could be better note" or "from your repeated edits".
    - The use is "not used yet" for none.
  - `historyLines(l, now)` gives one line per event:
    - "Made from your instruction, <day>" (or "…from your Could be better note", or "Kept from your repeated edits");
    - "Remembered again, <day>";
    - "Switched off, <day>" and "Switched on, <day>";
    - "Undone, <day>".
  - `proposalWords(p)` returns `{ headline, applies }`:
    - `headline`: "You removed “kindly”, 4 times", "You changed “assist” to “help”, 3 times" or "You added “…”, 3 times";
    - `applies`: "Would apply to texts · every reply".
    - `{{NAME}}` in an example reads "(name)".
  - `factGroups(facts)` returns `{ needs, working, confirmed }`, each in file order.
  - `factTag(f, now)` returns `{ text, tone }`:
    - "Needs answer" (warn);
    - "Working" (info);
    - "Confirmed today", "Confirmed Thursday 29 October" or "Confirmed in your file" (good).
  - `menuHint(status)`:
    - "Lessons and business facts" when nothing waits;
    - "2 lessons to review · 1 fact needs an answer" (`status.playbook.toReview`, `status.facts.needsAnswer`), and the same with one part when only one waits.
  - `backHref(s)` returns `hashFor({ section: s.section, chip: s.chip, key: s.key })`, for "Back to <section name>".
- **The page, top to bottom:**
  - "Back to <section>";
  - the heading "Playbook" and the line "Everything Wheelman knows and follows, in one place. Change it here and new suggestions use it.";
  - the tabs, as links with `aria-current="page"`: "Lessons" (with "2 to review") and "Business facts" (with "1 needs an answer");
  - the tab's content. While loading it reads "Reading the Playbook…". On a failure it reads "The Playbook could not be read: <error>" with **Try again**.
- **Lessons tab:**
  - The intro: "Lessons come from your instructions when you choose Remember, your Could be better notes, and edits you make again and again. Texts teach texts and emails teach emails. Marketplace, phone-only texts and auction orders never teach."
  - **To review:** each proposal shows its headline, the tag "Proposed" (info, in words), `applies`, its three examples ("Before", struck through; "What you sent"), and **Keep as a lesson** (main) and **Not a rule**. With none: "Nothing to review. A lesson is proposed after you make the same edit on three suggestions."
  - **In use (N)** and **Switched off:** each lesson shows its words, a switch (`role="switch"`, `aria-checked`, `aria-label` "Switch off: <words>" or "Switch on: <words>"), its `lessonLine`, and two closed `<details>`: "Where it came from" (the note, the instruction, or the examples) and "History".
  - **Not a rule:** each with its words and **Keep it after all**.
- **Business facts tab:**
  - The intro: "Every fact a reply states comes from here or from the stock records. A fact that needs your answer is a blank in replies until you answer it."
  - **Needs your answer:** the title, the tag, a textarea labelled "Your answer", and **Save as Confirmed**.
  - **Working (in use, not yet confirmed by you):** the answer, **Confirm** and **Change the answer**.
  - **Confirmed:** the tag, the answer, and **Change the answer**.
  - Changing an answer opens the textarea with **Save as Confirmed** and **Cancel**.
  - "Earlier answers (N)" is a closed `<details>`: each entry is its day and words, with **Use this answer**, which puts them in the textarea. Saving is still Jim's press.
  - When `file` is set: "Your file has a different answer since you saved this one: “…”." with **Use the file's answer**.
  - The fact the address names is scrolled to, and its textarea or first button is focused.
- **`hashsync.js` and `main.js`:** a Playbook address is never written over, never sends the store to another section, and never ends the conversation open in the store. Back returns to that conversation as it was.

- [ ] **Step 1: Write the failing tests:**
  - **In `test/newpage-hashsync.test.js`:** `on a Playbook address the store is left where it was and nothing is written over the address`:
    - `addressAfter(prev, '#/playbook/lessons', s)` is null for a store that opened a conversation by itself;
    - `playbookRoute('#/playbook/facts/Tinted%20windows')` is `{ tab: 'facts', id: 'Tinted windows' }`;
    - `playbookRoute('#/dashboard/waiting')` is null;
    - `playbookRoute('#/playbook/nonsense')` is `{ tab: 'lessons', id: null }`.
  - **In `test/newpage-playbook.test.js`** (fake api, as `newpage-searchstore.test.js` does):
    - `the Playbook store loads lessons and facts, and Keep, Not a rule, a switch and a saved answer each offer Undo`: the posts, their bodies, the toast words, and that Undo posts what was there before.
    - `a refused answer keeps the words and says why`: `saveFact` returns false and toasts the server's words.
    - `lessonGroups puts proposals to review first, then lessons in use, switched off and not a rule`.
    - `a lesson's line says its channel, scope, where it came from, its day and its use`: a Remember, a note and an edit lesson, and a history with each event's words.
    - `factGroups lists Needs your answer, Working and Confirmed, each in the file's order`, and `factTag` for each state, with and without a day.
    - `the Menu's Playbook hint counts what waits for Jim, and says nothing when nothing waits`.
    - `a Playbook page that cannot be read says so with Try again`: the store's `state: 'error'` carries the words.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Every control is at least 44 px on touch, and every state says so in words as well as colour. At phone width it is one column with 16 px edges, and the tabs scroll sideways.
- [ ] **Step 4: Run** them, `npm.cmd test` and `npm.cmd run check-css`. On the preview, at 1440×900 and 390×844, in light and dark:
  - **Journey 3, taught then switched off:**
    1. Tell Wheelman "Do not mention finance" on a Dashboard text.
    2. Remember.
    3. Menu, then Playbook: the lesson is In use, with its scope, its day and its switch.
    4. Switch it off, then Undo.
  - **Proposals:** "You removed “kindly”, 4 times", Keep, then Undo; "You changed “assist” to “help”", Not a rule, then Keep it after all.
  - **Journey 6:**
    1. Dara's **Answer it**.
    2. The fact focused.
    3. Save as Confirmed.
    4. Back: Dara's conversation as it was, then **Write it again**.
    5. The trust line names Tinted windows.
  - **Typed text kept:** type in a box, go to the Playbook, Back, and the text is there.

  Screenshots as `task5-*.png`.
- [ ] **Step 5: Commit:** `New page: the Playbook, from the Menu, with Lessons (proposals to review, history, off switch) and Business facts`

### Task 6: README and walkthrough (PR 6)

- [ ] **Step 1: Update `README.md`:**
  - **"The new page"** gains a paragraph on the Playbook: in the Menu, with Lessons and Business facts. Answering a fact makes it Confirmed with the day, and the next suggestion's trust line names it. Lessons show where they came from, their history and a switch. Edits made on three suggestions wait as proposals.
  - **The trust line paragraph** says it names the business facts a suggestion used.
  - Take out "A list of all lessons comes in a later update." (line 802).
  - **"What Wheelman knows"**, the business facts row and the paragraph under the table: answered in the Playbook. The file is the first version and is never written; every version is kept in `data\app.db`. Topics without an answer are listed in the Playbook.
  - **"How Wheelman learns"** gains a bullet, **Repeated edits**: three times, then Keep as a lesson or Not a rule, never in a Marketplace request, and nothing pops up while you work.
  - **"Where your files live"**, the `data\app.db` row: "what you answered and changed in the Playbook, every version".
  - **One dated Status line.**

  The README is public: plain words, no figures, no names.
- [ ] **Step 2: Update `docs/superpowers/plans/2026-10-26-new-page-programme.md`:**
  - row 6 says PR 6 was split in two on 29 October 2026, with what 6 and 6b hold, as row 5's note does for PR 5;
  - the checklist's Top bar gains "the Menu's Playbook, with its tabs".
- [ ] **Step 3: Walk through it on the preview** at 1440×900 and 390×844, light and dark: journeys 3 and 6 as in Task 5, the proposals, and Back to a conversation with typed text. There must be no console errors, and the only requests must be to 127.0.0.1:3211. Screenshots as `task6-*.png`.
- [ ] **Step 4: Run** `npm.cmd test`, `npm.cmd run check-private`, `npm.cmd run check-deps` and `npm.cmd run check-css`. Expected: all pass.
- [ ] **Step 5: Commit:** `README: the Playbook's business facts and lessons, and edits proposed as lessons`
