# The new page, PR 6b: templates and voice rules in the Playbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**The second half of the Playbook (split ruled 29 Oct 2026).** PR 6 (`docs/superpowers/plans/2026-10-29-new-page-6-playbook.md`) built the Playbook with its facts and lessons. This PR adds templates and voice rules to it.

**Builds on PR 6:**
- branch `new-page-6`;
- plan `docs/superpowers/plans/2026-10-29-new-page-6-playbook.md`;
- PR 6's ledger in `D:\Jim\Wheelman\eval\redesign\` (local).

Branch `new-page-6b` from PR 6's head, once PR 6's final review is clean. This plan was written on 29 Oct 2026 together with PR 6's plan. Before Task 1, check its file and line references against PR 6's head, and note any that moved in the ledger.

**It uses from PR 6:**
- **the versions table** `playbook_versions`, with `addVersion`, `versionsOf`, `latestVersions` and `versionsStamp` (`src/db.js`, PR 6 Task 1). Its `kind` is `'template'` or `'voice'` here, as it was `'fact'` there;
- **`src/playbookapi.js`** `playbookApi(req, res, p, url, { send, readBody })`, and its one dispatch line in `src/server.js` (PR 6 Task 1);
- **the Playbook page** (PR 6 Tasks 2 and 5):
  - `web/new/js/playbookroute.js`: `PLAYBOOK_TABS`, `playbookRoute`, `playbookHash`;
  - `web/new/js/playbookstore.js`: `createPlaybookStore`;
  - `web/new/js/playbookview.js`: `menuHint`;
  - `web/new/js/ui/playbook.js`: `PlaybookPage`, with its tabs;
  - `web/new/css/playbook.css`;
- `test/support/facts.js` `inventedFacts`, and the preview's invented people and Playbook data.

It also uses these pieces as they are:
- `src/templates.js` `template(name)`, the one place every wording file is read;
- `src/sectiontemplates.js`: `SECTION_FILES`, `FACTS`, `templatesFor`, `composeSectionTemplate`, `checkTemplates`;
- `src/ordermessages.js`: `composeMessage`, `ENQUIRY_MESSAGES`, `enquiryOrder`;
- `src/orders.js` `MESSAGES`;
- `src/items.js`: `listItems`, `orderRows`;
- `src/pricereply.js` `priceBlock`;
- `src/firstreply.js`: `standardBlock`, `inviteBlock`;
- `src/knowledge.js` `inspectionLinks`;
- `src/redact.js` `restore`;
- `src/prompt.js` `read` and `voiceCard`;
- `src/playbook.js` `playbookSections`;
- `src/auction.js` `ask`;
- `src/eligible.js`, its refresh of the website's list.

**Goal:** Jim changes his templates and voice rules on the page, no longer in the files.
- A template change is shown on three conversations before it is saved, and every version is kept (R9.5, story 14).
- A voice rule is saved and goes into the next suggestion.
- No wording file is ever written (PRD decision 7).

**Architecture:**
- **What is saved goes in PR 6's versions table**, one new row per save, laid over the file when it is read.
- **New server modules:**
  - `src/wording.js` is the overlay alone. Every template file is read through `template()`, which parses `templateLines(name)`. Every voice file is read through `voiceText(name)`. It imports only what `templates.js`, `auction.js` and `eligible.js` can import without a cycle.
  - `src/wordingedit.js` lists, saves and previews wording for the routes in `src/playbookapi.js`.
- **The preview** runs the code that writes each message, inside an `AsyncLocalStorage` store that holds the changed words. Only that call chain reads them, and nothing outside this computer is read inside it.
- **The page:** two more tabs, Templates and Voice, in PR 6's Playbook, with a new pure module, `wordingview.js`.

**Tech Stack:** as PRs 1–6:
- Node 22 with `node:sqlite`, and no dependencies (`AsyncLocalStorage` is built into `node:async_hooks`);
- the new page in Preact and htm, vendored as a classic script;
- pure ES modules, tested with `node --test`.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 4, principle 5;
  - section 5, R9.5;
  - section 9, the Playbook row of the screens table ("Save, after the preview");
  - section 11, "What changes compared with today": wording rules "in the Playbook, stored and versioned";
  - section 12, the Template record;
  - section 14, story 14;
  - Next steps, decision 7.
- **The prototype:**
  - `prototype/js/ui-pages.js`: `Templates`, `fillFor`, `Voice`;
  - `prototype/js/store.js`: `A.editTemplate`, `A.templateText`, `A.saveTemplate`.
- **The wording files:** `voice/*.md` and their own notes on what each `{word}` and `@` line means.
- **Jim's decisions** (memory): `wheelman-placement-and-templates`, `wheelman-sales-first-redesign`, `always-give-the-template`, `wheelman-import-auction-replies`, `wheelman-public-repo-rules`.

## Switch-over checklist items in this PR

None of the checklist's items moves here. The old page's wording is files edited by hand. PR 6 already added "the Menu's Playbook, with its tabs" to the checklist.
- **The old page changes in one way:** its suggestions use the Playbook's wording (Task 1), as the new page's do.

## Global Constraints

The Global Constraints of PRs 1–6 hold:
- no dependencies, and the CSP unchanged;
- tokens only, plain words, and colour always with words;
- 44 px targets;
- **file size and structure:**
  - No new page source file (every file under `web/new/js` and `web/new/css`) is over 400 lines, as `test/newpage-size.test.js` counts them. Test files are not bound.
  - `model.js` does not grow.
  - `store.js` takes no new action: the wording actions go in PR 6's `playbookstore.js`.
  - No `web/new/js` module imports another in a cycle (the existing test).
  - `src/wording.js` imports no module that imports `src/templates.js`.
- **invented test data only:**
  - The wording read is the repository's own `voice/` files, which are public.
  - Every version a test or the preview saves is an invented change, in an in-memory database.
  - No test and no step writes a file under `voice/`.
- never the live folder, its database or port 3210. The preview runs on 3211 (`node test/support/preview.js`);
- no AI attribution in commits or the PR;
- the page never changes the reply string;
- one test file runs with `node --disable-warning=ExperimentalWarning --test test/<name>.test.js`, and the suite with `npm.cmd test`;
- `npm.cmd run check-private` before every commit.

Changed for this PR:
- **API: additions, plus the ruled changes below.**
  - **The additions:** `GET /api/playbook/wording`, `POST /api/playbook/wording`, `GET /api/playbook/versions` and `POST /api/playbook/preview`.
  - Every other route, PR 6's included, answers exactly as before.
  - **Ruled change 1 (PRD decision 7, Confirmed 24 Oct 2026):**
    - Wording saved in the Playbook replaces that part of its file in every suggestion, on both pages, and in the replay and review scripts.
    - No wording file is ever written.
    - With nothing saved, every wording file reads as it did.
  - **Ruled change 2 (29 Oct 2026):** inside a preview only, the auction feed and the website's eligible-models list answer as unreachable. Everywhere else they are read as before.
- **Where wording is kept (Ruled with PR 6, 29 Oct 2026): PR 6's versions table, never the file.**
  - Every version is kept, and the file is the first one.
  - The voice files are in the public repository and the live folder stays on `main`, so writing them would leave uncommitted changes in `D:\Jim\Wheelman` and could publish wording by accident.
- **The wording rules hold:**
  - **The deposit link stays a blank** (Confirmed, 5 Oct 2026): a save that drops `[DEPOSIT LINK?]` from a part that has it is refused.
  - **Every fact, figure and link is still put in by code** (Confirmed, 17 and 24 Oct 2026). A save may use only the `{word}` facts that file is filled with.
  - **Always give the template** (Confirmed, 5 Oct 2026): a preview that cannot look something up shows the blank the message would have, never a refusal.
  - Insider facts are never stated, and nothing in a template changes that.
- **Rulings for Jim (29 Oct 2026). Each is a reversible default and goes in the PR description:**
  - **A voice rule is saved with no preview.** Only the AI can show its effect, and a preview would cost three requests.
    - Cost if wrong: Jim sees the effect on the next suggestion.
  - **A preview is the template filled word for word with each conversation's facts, with no AI.**
    - Nothing is read from outside this computer: in a preview the auction feed and the website's list answer as unreachable, so their figures are blanks.
    - Cost if wrong: the preview shows Jim's words, not the AI's fitting of them, and blanks where a live auction car would be.
  - **The three conversations** are the newest in the template's section where it is offered, in the last 30 days. When fewer fit, the newest others fill up, marked "Not offered here".
    - Cost if wrong: a less telling preview.
  - **A template's whole part is editable,** its `@label` and `@fits` lines included, under the file's own checks (`checkTemplates`). The short pieces before the first part are one part of their own. A new part, or a new section of a voice file, is still added in the file.
    - Cost if wrong: Jim adds a new message by hand.
  - **A wording file changed by hand after a Playbook save:** the Playbook's wording stays in use. The Playbook says the file now differs and offers the file's wording, to preview and save as a new version.
    - Cost if wrong: Jim's later hand edit waits for one press.
  - **No "used N times" on a template.** Nothing records which file a used template came from.
    - Cost if wrong: one count missing.
  - **The Playbook's wording can be changed through the team link,** as its facts can (PR 6). Every version is kept, so a change made there can be put back.
    - Cost if wrong: someone with the team password can change a template or a voice rule.

## Review Focus

1. **A wording file changed by a save.** Every file under `voice/` stays byte for byte. Pinned in Task 1: `a template saved in the Playbook is the one Which message? writes, on both pages, and the file is never written`.
2. **Every suggestion changed although nothing was saved.** Pinned in Task 1: `with nothing saved, every wording file reads as before`.
3. **A save that drops the deposit link's blank.** Pinned in Task 1: `the deposit link stays a blank: a save without [DEPOSIT LINK?] is refused where the file has it`.
4. **A save that breaks a file's reading:** a new part, a note line, an unknown fact, a signal no conversation shows, or a lost `@label` or `@fits`. Pinned in Task 1: `a save that would break the file is refused: a new part, a note line, an unknown fact, a signal no conversation shows, or a lost @label or @fits`.
5. **A preview's words in a real suggestion written at the same moment.** Pinned in Task 2: `a preview's wording never reaches a suggestion written at the same time`.
6. **A preview that reads the auction or the website.** Pinned in Task 2: `a preview reads nothing from outside: the auction and the website's list are not asked`.
7. **A template saved without being seen on three conversations,** or saved after its words changed since the preview. Pinned in Task 3: `Save waits for a preview of the words in the editor`.
8. **Jim's words lost when the server refuses a save.** Pinned in Task 3: `a save the server refuses keeps the words in the editor and says why`.

---

### Task 1: Templates and voice rules from the Playbook, every version kept

**Files:**
- Create:
  - `src/wording.js`, the overlay only: `WORDING`, `fileParts`, `templateLines`, `voiceText`, `withPreview`, `inPreview`. It imports only `node:fs`, `node:path`, `node:async_hooks`, `./config.js` and `./db.js`, because `templates.js`, `auction.js` and `eligible.js` import it;
  - `src/wordingedit.js`, what the routes call: `wordingParts`, `saveWording` (and Task 2's `previewWording`). It may import `sectiontemplates.js`, `ordermessages.js`, `orders.js` and `items.js`. `wording.js` never imports it, so there is no cycle.
- Modify:
  - `src/templates.js` `template(name)`:
    - it parses `templateLines(name)` in place of the file's raw lines;
    - its cache key adds `versionsStamp()`;
    - inside a preview it does not use the cache.
  - `src/prompt.js`: `read('house-voice.md')` and `read('sales-playbook.md')` become `voiceText(name)`. `voiceCard()` reads `voiceText('compact/voice-card.md')`, with its comment taken out as now, and its cache keyed on `versionsStamp()` too.
  - `src/playbook.js` `playbookSections()`: it reads `voiceText('sales-playbook.md')`, its cache keyed on `versionsStamp()` too.
  - `src/playbookapi.js`: `GET /api/playbook/wording`, `POST /api/playbook/wording` and `GET /api/playbook/versions`.
  - `test/support/preview.js`.
- Test: `test/wording.test.js`.

**Interfaces:**
- **`WORDING`** (in `wording.js`), the files the Playbook edits, each `{ name, kind, group, label }`:
  - **templates:**
    - `dashboard-messages.md` (Dashboard);
    - `marketplace-messages.md` (Marketplace);
    - `importquery-messages.md` (Imports);
    - `auction-messages.md` (Auction; `wordingParts` lists its `ENQUIRY_MESSAGES` parts under Imports, where they are offered);
    - the blocks: `price-reply.md` "Price reply", `first-reply.md` "First-reply details", `inspection-invite.md` "Invitation to see the car", `auction-offer.md` "Auction offer", and `import-ask.md` "First reply to an import enquiry".
  - **voice:**
    - `house-voice.md` (Voice);
    - `sales-playbook.md` (Selling);
    - `compact/voice-card.md` (Voice, "The short voice card, for compact requests").
- **A part:**
  - **In a template file with `===== id =====` lines:** each part's lines, its `@` lines included, up to the next header. Part `''` holds the lines before the first header, labelled "The short pieces".
  - **In a template file with none:** part `''` is every line.
  - **In a voice file:** each `## ` heading's lines, keyed by the heading's words. Part `''` is everything before the first heading.
  - Template parts never hold the `#` note lines. Voice parts keep the file's text as the AI is sent it.
- **`fileParts(name)`** (`wording.js`) returns `[{ part, text }]` from the file alone.
- **`wordingParts(name)`** (`wordingedit.js`) returns the parts with the newest version laid over: `[{ part, label, text, fileText, at, versions, fileChanged }]`.
  - A part's label is its `@label`, else `MESSAGES[id]` for the auction file, else the heading, the file's label, or "The short pieces".
  - `fileChanged` is true when `fileText` differs from the newest version's `base`.
- **`templateLines(name)`** gives the file's lines, notes taken out, with each saved part laid over, and the preview's part when inside one.
- **`voiceText(name)`** gives the file's text with each saved section laid over, and the preview's section when inside one.
- **`saveWording({ name, part, text, now })`** (`wordingedit.js`) returns `{ part, unchanged }`, or `{ status, error }`.
  - The text is trimmed at its ends. The same text as the current one adds no row.
  - `kind` is the file's, and `base` is the file's text for the part.
  - **The refusals:**
    - a file or part the Playbook does not list: 404 "That wording is not in the Playbook.";
    - empty: 400 "Write the wording first.";
    - over 8,000 characters: 400 "That is too long: keep it under 8,000 characters.";
    - in a template, a line like `===== x =====`: "A line like ===== name ===== starts a new message. Add a new message in the file itself.";
    - in a template, a line starting with `#`: "A line starting with # is a note and is never sent. Take the # off, or remove the line.";
    - in a voice section, a line starting with `## `: "A line starting with ## starts a new section. Add a new section in the file itself.";
    - a part of the three section files, with the saved text laid over, where `checkTemplates()` names a problem it does not name now: that problem's own words. That covers a missing `@label` or `@fits`, a signal no conversation shows, and a `{word}` Wheelman does not fill in;
    - in any other template file, a `{word}` the file does not already use: "{word} is not a fact Wheelman fills in here.";
    - a part whose file text holds `[DEPOSIT LINK?]` and whose new text does not: "The deposit link stays a blank: keep [DEPOSIT LINK?] in this message.".
- **The routes:**
  - `GET /api/playbook/wording` gives `{ files: [{ name, kind, group, label, parts }] }`, with `parts` from `wordingParts`;
  - `POST /api/playbook/wording { name, part, text }` gives `{ part }` (as `wordingParts` lists it), or the refusal;
  - `GET /api/playbook/versions?kind=&name=&part=` gives `{ versions: [{ id, text, at }], file }`, newest first, where `file` is the file's own text.

- [ ] **Step 1: Write the failing tests** in `test/wording.test.js` (real routes and the stand-ins):
  - `a template saved in the Playbook is the one Which message? writes, on both pages, and the file is never written`:
    - save `dashboard-messages.md` `still_available` with "Yes, the {car} is available today.";
    - `composeSectionTemplate(item, 'still_available').text` holds "is available today";
    - every file under `voice/` has the same bytes and `mtimeMs` as before.
  - `every version of a template is kept, and the file's own wording is the first`: two saves give two versions newest first, plus `file`.
  - `a save that would break the file is refused: a new part, a note line, an unknown fact, a signal no conversation shows, or a lost @label or @fits`: one assertion per refusal, in its words, with no row added.
  - `the deposit link stays a blank: a save without [DEPOSIT LINK?] is refused where the file has it`: `auction-messages.md` `first_estimate` with the blank taken out is refused, and with it kept is taken.
  - `a voice rule saved in the Playbook goes into the next request, and the compact card and the selling guide follow theirs`:
    - a saved `house-voice.md` "Length" section is in `systemPrompt('sms')`;
    - a saved card is in the compact system prompt;
    - a saved `sales-playbook.md` "The price question" is in `playbookFor({ situation: 'price' })`.
  - `with nothing saved, every wording file reads as before`:
    - `template(name)` deep-equals the file parsed with the overlay off, for every template in `WORDING`;
    - `voiceText(name)` equals the file's trimmed text.
  - `a wording file changed by hand after a Playbook save says so`: `fileChanged` is true, and saving the file's text makes it false.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.** In the preview, after the server starts, POST two versions of `dashboard-messages.md` `still_available` and one of `house-voice.md` "Length", each a small invented change, so Earlier versions can be seen.
- [ ] **Step 4: Run** it and `npm.cmd test`. On the preview, Wynn's **Still available** in **More messages** writes the saved wording.
- [ ] **Step 5: Commit:** `Playbook: templates and voice rules saved in the Playbook are what Wheelman writes from, every version kept, and no wording file is written`

### Task 2: A template change previewed on three conversations

**Files:**
- Modify:
  - `src/wordingedit.js`: `previewWording({ name, part, text, now })`.
  - `src/auction.js` `ask()`: inside a preview (`inPreview()` from `wording.js`) it throws `new AuctionError('Not read for a preview.')` before any request.
  - `src/eligible.js`, its refresh of the website's list: inside a preview it reads nothing and uses what is stored.
  - `src/sectiontemplates.js`: nothing. It reads the preview's part through `template()`.
  - `src/playbookapi.js`: `POST /api/playbook/preview`.
- Test: `test/playbook-preview.test.js`.

**Interfaces:**
- **`withPreview({ name, part, text }, fn)`** runs `fn` with an `AsyncLocalStorage` store. `templateLines` and `voiceText` read the part as `text` only inside it, and every other caller reads as before.
- **`previewWording({ name, part, text, now })`** returns `{ previews: [{ key, name, section, car, text, fits }] }`. It runs `saveWording`'s refusals first, with no row added, and `text` is shown with the first name put back (`restore`).
  - **The three section files:**
    - the conversations `listItems({ source, states: ['awaiting', 'answered'], maxAgeHours: 24 * 30, limit: 60 })` gives for the file's section;
    - the first three where `templatesFor(item)` offers the part, then the newest others, with `fits: false`;
    - each is `composeSectionTemplate(item, part, { now })` in the preview.
  - **`auction-messages.md`:**
    - an order message is shown on the three newest orders listed in Auction (`orderRows`), as `composeMessage(item.order, part)`;
    - one of `ENQUIRY_MESSAGES` is shown on the three newest Imports texts that are not emails, as `composeMessage(enquiryOrder(item), part)`.
  - **The blocks** are shown on the three newest Dashboard conversations with a car:
    - `price-reply.md` as `priceBlock({ vehicle, inspectionUrl })`;
    - `first-reply.md` as `standardBlock({ vehicleUrl })`;
    - `inspection-invite.md` as `inviteBlock(url)`;
    - `auction-offer.md` and `import-ask.md` through the order or enquiry message that holds them (`lot_offer`, `first_estimate`).
  - **A voice file:** 400 "Voice rules have no preview: only the AI can show their effect.".
  - **With no conversation at all:** `{ previews: [], none: 'There is no conversation in this section to show it on yet.' }`.
- **The route:** `POST /api/playbook/preview { name, part, text }`.

- [ ] **Step 1: Write the failing tests** in `test/playbook-preview.test.js`:
  - `a preview shows the changed wording on three conversations where it is offered, newest first`: five invented Dashboard texts about an available car, with `still_available` previewed. Three previews, newest first, each holding the changed words and the conversation's own car.
  - `with fewer than three where it fits, the preview fills up from the same section and says they are not offered there`: `fits: false` on the fill.
  - `a preview's wording never reaches a suggestion written at the same time`:
    - a preview and a `/draft` of `still_available` are started together, with `Promise.all`;
    - the draft holds the file's words, not the preview's;
    - no version row is added.
  - `a preview reads nothing from outside: the auction and the website's list are not asked`: the stand-in auction's request count and the site stand-in's are unchanged after previewing `first_estimate` and an Imports email template.
  - `an auction message is previewed on three orders, and an enquiry message on three Imports texts`.
  - `a block is previewed on three conversations with a car`: `price-reply.md` with "{inclusions}" filled from each car's list.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it and `npm.cmd test`. On the preview, `curl -X POST /api/playbook/preview` for `still_available` lists Wynn, Ada and another, and for `first_estimate` lists Imani.
- [ ] **Step 5: Commit:** `Playbook: a template change is shown on three conversations before it is saved, written word for word, with nothing read from outside`

### Task 3: The Templates and Voice tabs

**Files:**
- Create:
  - `web/new/js/wordingview.js` (pure): `wordingGroups`, `canSave`, `versionLines`;
  - `web/new/js/ui/templatestab.js`: `TemplatesTab`;
  - `web/new/js/ui/voicetab.js`: `VoiceTab`.
- Modify:
  - `web/new/js/playbookroute.js`: `PLAYBOOK_TABS` gains `'templates'` and `'voice'`.
  - `web/new/js/playbookstore.js`:
    - `load('templates' | 'voice')` asks `GET /api/playbook/wording`;
    - `versions(name, part)`, `preview(name, part, text)` and `saveWording(name, part, text)`;
    - state gains `wording`, `editing: { name, part, text } | null`, and `previewed: { text, previews, none } | null`.
  - `web/new/js/ui/playbook.js`: the two tabs.
  - `web/new/js/playbookview.js` `menuHint`: "Lessons, facts, templates and voice" when nothing waits.
  - `web/new/css/playbook.css`.
- Test: `test/newpage-templates.test.js`.

**Interfaces:**
- **`wordingGroups(files)`** returns `[{ group, parts: [{ name, part, label, text, at, versions, fileChanged }] }]`, in the order Dashboard, Marketplace, Imports, Auction, Blocks. The Voice tab reads Voice and Selling.
- **`canSave(previewed, text)`** is true only when `previewed && previewed.text === text`.
- **`versionLines(out, now)`** gives "Version N, <day>" for each saved version, newest first, then "In your file".
- **Templates tab:**
  - each group lists its parts, each with its label, its text in the quiet tone, "changed <day>" when saved, and **Edit**;
  - editing shows the label, a textarea, the line "Words in braces, such as {car_link}, are filled in by code from the records. Keep them, and the facts stay exact.", **Show how it reads**, then the three previews side by side (stacked on a phone), each headed by the customer's name and car, with "Not offered here" when `fits` is false;
  - then **Save this version** (main, disabled until `canSave`) and **Cancel**, with the line "Version N+1. Every earlier version is kept.";
  - after a change to the text, the button reads **Show how it reads again**;
  - "Earlier versions (N)" is a closed `<details>`: each version with **Use this version**, which puts it in the textarea. It is saved only after its own preview;
  - when `fileChanged`: "Your file has other wording for this part since you saved yours." with **Use the file's wording**, which puts it in the textarea.
- **Voice tab:**
  - the intro: "How every reply sounds and sells. A change here goes into the next suggestion; there is no preview, because only the AI can show it.";
  - each section with **Edit**, a textarea, **Save** and **Cancel**, and the same Earlier versions.
- **The toasts:** "Saved. New suggestions use it; suggestions already written keep their words." with Undo, which saves the version before as a new one. A refusal keeps the textarea's words and toasts the server's.

- [ ] **Step 1: Write the failing tests** in `test/newpage-templates.test.js` (fake api):
  - `the Templates tab groups the messages by section, with the blocks last`;
  - `Save waits for a preview of the words in the editor`: `canSave` is false before a preview and after a change, and true after a preview of the same words;
  - `an earlier version goes into the editor, and is saved only after its preview`;
  - `the Voice tab saves a rule with no preview and says new suggestions follow it`;
  - `a save the server refuses keeps the words in the editor and says why`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, `npm.cmd test` and `npm.cmd run check-css`. On the preview, at 1440×900 and 390×844, light and dark (story 14):
  1. Templates, Dashboard, Still available, Edit.
  2. Change a word, then Show how it reads: three conversations side by side.
  3. Save this version, then Undo.
  4. Earlier versions, then Use this version.
  5. Voice, then Length, Edit and Save.
  6. Wynn's More messages, Still available: it writes the saved words.

  Screenshots under `D:\Jim\Wheelman\.playwright-mcp\new-page-6b\` as `task3-*.png`.
- [ ] **Step 5: Commit:** `New page: the Playbook's Templates, previewed on three conversations before saving, and Voice, every version kept`

### Task 4: README and walkthrough

- [ ] **Step 1: Update `README.md`:**
  - **"The new page"**: the Templates and Voice tabs.
  - **"What Wheelman knows"**: the two wording rows say "In the Playbook (the file is the first version, and is never written)".
  - **"How Wheelman learns"**: the last paragraph's "edit `voice/house-voice.md`… edit `voice/sales-playbook.md`" becomes Playbook, then Voice.
  - **One dated Status line.**

  The README is public: plain words, no figures, no names.
- [ ] **Step 2: Walk through it on the preview** at 1440×900 and 390×844, light and dark:
  - story 14 as in Task 3;
  - an auction message previewed on three orders;
  - a refused save (the deposit link's blank taken out).

  There must be no console errors, and the only requests must be to 127.0.0.1:3211. Screenshots as `task4-*.png`.
- [ ] **Step 3: Run** `npm.cmd test`, `npm.cmd run check-private`, `npm.cmd run check-deps` and `npm.cmd run check-css`. Expected: all pass.
- [ ] **Step 4: Commit:** `README: templates and voice rules in the Playbook, previewed and versioned`
