# The new page, PR 3: the rest of the message box — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the new page's message box gets the last of its PRD controls.
- **Removable blocks.** The code-built blocks (price reply, inspection invitation, standard first-reply block, links asked for, sign-off, auction offer) show as labelled parts with Remove.
- **A trust line.** "4 facts checked" opens to each fact's value and where it came from.
- **Remember.** A Tell Wheelman instruction can become one stored lesson with its scope and an off switch.
- **Good reply retired.** Copying a draft unchanged counts as approval.
- **What Wheelman used** names the lessons applied and the rules that fired.

**Architecture:**
- **The server records what it already knows** on each draft, in `context_json`, so no schema migration is needed for drafts:
  - `context.parts`: the AI text and each block, with a label and a reason;
  - `context.facts`: each figure and link traced to its source;
  - `context.lessons` and `context.rules`: what was applied.
- **`draftOf` sends them to the page as new fields.** The reply string itself never changes.
- **Lessons stay in the `advice` table,** with new columns from `ensureColumn`: `kind`, `channel`, `off`, `used_count` and `last_used_at`. There are two new routes for Remember and for switching a lesson, and `ownerGuidance` honours them.
- **The page:**
  - renders blocks in the pill editor as tinted, labelled regions while their text is still in the box;
  - replaces the green check line with the trust line;
  - adds Remember after a Tell Wheelman rewrite.

**Tech Stack:** as PR 1 and PR 2. Node ≥22.13, node:sqlite, the built-in test runner, Preact + htm from `web/new/vendor/`, CSS layers and tokens, and Playwright (MCP) on the preview at 3211.

**Spec:**
- `eval/redesign/prd-recovered.md` (local):
  - section 5, R3.4, R3.6, R3.7, R4.3, R4.4, R5.3, R9.1, R9.2, R9.4;
  - section 9, "The message box in detail";
  - section 14, stories 3, 5, 6 and 12 (12's switch through the toast here; the full Lessons page is PR 6).
- `prototype/js/ui-thread.js` (Seg blocks with Remove, Trust, Remember) and `prototype/css/app.css:141-196`.
- Engine map: `src/drafter.js:263-355` (`assessAnswer`: `links`, `price`, `invite`, `signOff`, `plan.tail`), `src/checks.js:123-133, 195-271, 299-457`, `src/factmarkers.js:73-108`, `src/learn.js:110-177, 217-245, 278-368`, `src/db.js:1191-1209`, `src/server.js:132-155, 969-998`.

## Global Constraints

PR 1's and PR 2's Global Constraints hold:
- no dependencies and the CSP unchanged;
- tokens only in CSS, with `check-css` covering `web/new/css`;
- plain words, sentence case, and colour always with words;
- 44 px touch targets on a phone, and no file over 400 lines;
- tests on invented data;
- never the live folder, its database or port 3210; the preview on 3211;
- no AI attribution.

Changed for this PR:
- **The reply string is never changed by this PR.**
  - The parts are found in the finished reply.
  - They are kept only if `parts.map(p => p.text).join('\n\n') === reply`. Otherwise `context.parts` is `[{ kind: 'ai', text: reply }]`.
- **API: additions, plus one deliberate change.**
  - The additions are:
    - `draftOf` sends `parts`, `facts`, `lessonsApplied` and `rules`;
    - `POST /api/drafts/:id/remember { scope }`;
    - `GET /api/lessons`;
    - `POST /api/lessons/:id/switch { on }`.
  - The one deliberate change is that copying a draft unchanged counts as approval on the server (PRD decision 3, accepted 24 Oct 2026). It applies whichever page copies. The old page's Good reply button stays until the switch-over.
  - Nothing else on the old page or in existing routes changes.
- **Lessons:**
  - A lesson that is switched off is never put into a request.
  - A Remember lesson applies to every later draft in its channel and scope, the same conversation included.
  - Marketplace, the phone-only list and auction orders teach nothing (R9.1, Confirmed): Remember is not offered there, and the route refuses them.
  - An instruction is never stored when Jim chooses "Just this once" (Confirmed, 24 Oct 2026).
- **Facts:**
  - Only figures and links the checks already trace are listed. Nothing is invented to fill the list.
  - A fact's `source` is one of: `'the stock record'`, `'our earlier messages'`, `'business facts'`, `'the website'`, `'what the customer said'`, `'your instruction'`, `'your wording file'` (for a block's own figures and links), or `'not found in the records'` (when `ok` is false).
- **Words on screen:**
  - the trust line reads `N facts checked` (green) or the failing fact's sentence (red);
  - a block's label is one of: Price reply, Invitation to see the car, First-reply details, Links you asked for, Sign-off, Auction offer;
  - Remove reads "Remove", and an undone remove reads "Put back".

## Review Focus

1. **Removing a block while Jim has typed elsewhere.** Remove takes out exactly that block's text and the blank line before it. Nothing he typed changes, and the result saves like any edit. Pinned in Task 4: `removing a block keeps the typed text and Put back restores it`.
2. **A block Jim edited inside.** Once a block's text is no longer in the box word for word, it shows as ordinary text, with no Remove and no stale label. Pinned in Task 4: `an edited block becomes plain text`.
3. **A Remember with no scope, or on a section that does not teach.** The route refuses with a plain sentence and stores nothing. Pinned in Task 3: `remember is refused for Marketplace, phone-only and orders, and without a scope`.
4. **The facts list on a reply with no figures or links.** It reads "No figures or links to check" and never shows "0 facts checked" in green. Pinned in Task 5: `trustLine with no facts says so`.
5. **Copying unchanged but with a blank still in it.** It is not approval: a draft with an unfilled `[X?]` is never kept as approved. Pinned in Task 3: `copying unchanged with a blank is not approval`.

---

### Task 1: The server records the reply's parts

**Files:**
- Modify: `src/drafter.js`:
  - `assessAnswer` returns the blocks it built, `blocks: [{ kind, label, text, why }]`, alongside its other results (drafter.js:263-355);
  - `writeDraft` sets `context.parts` after the Marketplace link tagging (about line 606).
- Modify: `src/prompt.js`, so the inspection plans return their `why` (about lines 414, 422, 430; the reason is already worked out at 372-376).
- Modify: `src/server.js` `draftOf` (about lines 132-155): `parts: draft.context?.parts || null`.
- Create: `src/parts.js`, with the pure `partsOf(reply, blocks)`.
- Test: `test/parts.test.js`, and one end-to-end case in `test/editor.test.js` style.

**Interfaces:**
- **`partsOf(reply, blocks)`** returns `[{ kind: 'ai'|'block', label, text, why }]`:
  - it walks the blocks from the end of `reply` with `lastIndexOf`, so the AI part is whatever comes before the first block;
  - it returns `[{ kind:'ai', label:'', text: reply, why:'' }]` unless `parts.map(p => p.text).join('\n\n') === reply`;
  - it never changes `reply`.
- **The block kinds and labels:**

  | kind | label | Source | Reason (`why`) taken from |
  | --- | --- | --- | --- |
  | `price` | Price reply | `price` | `prompt.price.lines[0]` |
  | `invite` | Invitation to see the car | `invite` | the inspection plan's new `why` |
  | `first` | First-reply details | the standard block, when it is the `signOff` | "A first reply to a new enquiry" |
  | `links` | Links you asked for | each link line | `prompt.media.lines[0]` |
  | `signoff` | Sign-off | `config.signOff`, when it is the `signOff` | "The first reply to this customer today" |
  | `offer` | Auction offer | `plan.tail` | `plan.lines[1]` |

- A Marketplace link tag is applied to the parts the same way as to the reply (`tagMarketplaceLinks`), so the parts still join to the reply.

- [ ] **Step 1: Write the failing tests:**
  - `partsOf splits a reply into the AI text and its blocks`;
  - `partsOf falls back to one AI part when the blocks are not found word for word`;
  - `a written draft carries its parts and the reply is unchanged`, end to end with the stand-in AI, a first reply to a new invented enquiry;
  - `a Marketplace draft's parts carry the same link tags as its reply`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new tests and `npm.cmd test`. Expected: PASS. Every existing test must pass unchanged: the reply strings do not change.
- [ ] **Step 5: Commit:** `Drafts: each draft keeps its parts, the AI's words and each block with its reason`

### Task 2: The server traces each fact to its source

**Files:**
- Modify: `src/checks.js`, adding `traceFacts(body, pieces)`, which reuses `NUMBER`, `plainTimes`, `normNum`, `findUrls` and `untagged`.
- Modify: `src/drafter.js`:
  - `allowedMaterial` also returns `pieces: [{ source, text }]`;
  - `writeDraft` sets `context.facts`.
- Modify: `src/factmarkers.js` (`maskTrusted` keeps each marker's `section`; `restoreFacts` reports the markers used).
- Modify: `src/server.js` `draftOf`: `facts: draft.context?.facts || []`.
- Test: `test/tracefacts.test.js`

**Interfaces:**
- **`pieces`**, in order: `{source:'the stock record', text: vehicleText + similar cars}`, `{source:'our earlier messages', text}`, `{source:'business facts', text: businessFactsText}`, `{source:'the website', text: websiteText}`, `{source:'what the customer said', text}`, and `{source:'your instruction', text}`.
- **`traceFacts(body, pieces, failTokens)`** returns `[{ label, value, source, ok }]`:
  - **What is traced:** every money figure, kilometre figure and link in `body`.
  - **`source`:** the first piece whose text contains the figure or link.
  - **`label`:** the line prefix where it was found (`/^-?\s*([^:\n]{1,40}):/` on that line of the piece), else `''`.
  - **`ok`:** false when the token is in `failTokens`, the tokens of the figure, customer-figure, price-floor and link checks; then `source` is `'not found in the records'`.
  - **Order and duplicates:** in reply order, each value once.
- **Block facts:** for each block part from Task 1, its figures and links are added with `source: 'your wording file'` and `ok: true`. The booking link and the car's page link get `'the stock record'`.
- **Compact style:** a fact written as a `{{Fn}}` marker gets its marker's `section` as `source`: Vehicle facts give the stock record, Business facts give business facts, the Website gives the website. A typed figure caught by figure-raw gets `ok: false`.

- [ ] **Step 1: Write the failing tests:**
  - `a price from the stock record is traced to it with its label`;
  - `a warranty figure is traced to business facts`;
  - `a booking link in the invitation is from the stock record, the block's own figures from your wording file`;
  - `an invented price is listed as not found in the records`;
  - `a reply with no figures or links gives an empty list`;
  - `compact markers report their section as the source`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** The existing checks and their messages do not change.
- [ ] **Step 4: Run** the new tests and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit:** `Drafts: each figure and link in a draft is traced to where it came from`

### Task 3: Lessons with a scope and an off switch, Remember, and Copy as approval

**Files:**
- Modify: `src/db.js`:
  - `ensureColumn` adds `advice.kind TEXT DEFAULT 'note'`, `advice.channel TEXT`, `advice.off INTEGER DEFAULT 0`, `advice.used_count INTEGER DEFAULT 0` and `advice.last_used_at INTEGER`;
  - new functions `insertRemember`, `listLessons`, `switchLesson` and `countLessonUse`.
- Modify: `src/learn.js`:
  - `ownerGuidance` skips `off`;
  - it filters on the lesson's `channel` against the request's channel;
  - a `kind='remember'` lesson bypasses the hold-out of the same conversation;
  - each returned lesson carries `adviceId` and `n`;
  - `onCopied`: unchanged text with no blank left becomes approval through `setDraftRating(id,'good')` and `onApproved`.
- Modify: `src/prompt.js` (buildPrompt returns `owner: { lessons }` with their ids) and `src/drafter.js`:
  - `context.lessons = [{ adviceId, n, do, scope, at }]`;
  - `context.rules = { standard, price, invite, media, again, playbook }`, the booleans it already computed;
  - `countLessonUse` for each lesson shown, after the draft is saved.
- Modify: `src/server.js`:
  - `POST /api/drafts/:id/remember { scope }`;
  - `GET /api/lessons`;
  - `POST /api/lessons/:id/switch { on }`;
  - `draftOf` sends `lessonsApplied` and `rules`.
- Test: `test/remember.test.js`, plus additions in the existing learning tests if they live elsewhere.

**Interfaces:**
- **`POST /api/drafts/:id/remember { scope }`:**
  - `scope` is the situation key the page offers (the item's primary situation), or `'any'`.
  - It needs the draft to have an `instruction`.
  - It refuses with `{ error }` (400) for `mp:`, `ph:`, `ao:` and `fu:` anchors, for a draft without an instruction, and for an empty scope. The words are "Marketplace chats, phone-only texts and auction orders do not teach Wheelman." and "There is no instruction to remember."
  - It stores one advice row: `kind='remember'`, `channel` from the item key, `note` = the instruction, `lessons_json = [{ scope, when: '', do: instruction, internal: false }]`, `draft_id = null`.
  - It returns `{ lesson: { id, do, scope, channel, at, off:false } }`.
- **`GET /api/lessons`** returns `{ lessons: [{ id, kind, channel, scope, do, at, off, usedCount, lastUsedAt }] }`, newest first, over the Remember rows and the distilled Could-be-better lessons.
- **`POST /api/lessons/:id/switch { on }`** sets `off` and returns the lesson.
- **The approval rule:** copying counts as approval only when `squash(comparable(text)) === squash(comparable(draft.reply))` and `blanksIn(text).length === 0`.

- [ ] **Step 1: Write the failing tests:**
  - `remember stores one lesson with its scope and channel`;
  - `a remembered lesson goes into the next request for the same kind of reply, the same conversation included`;
  - `a lesson switched off is not put into a request`;
  - `remember is refused for Marketplace, phone-only and orders, and without a scope`;
  - `just this once stores nothing` (a Tell write with no remember adds no advice row);
  - `copying unchanged counts as approval`;
  - `copying unchanged with a blank is not approval`;
  - `a draft records the lessons applied and the rules that fired, and each lesson's use is counted`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new tests and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit:** `Learning: Remember keeps a lesson with its scope and an off switch, and copying as written counts as approval`

### Task 4: Blocks in the editor

**Files:**
- Modify: `web/new/js/model.js`, with `boxSegments(text, parts)`: segments of `{kind:'text'|'blank'|'block', …}`. It may move into a new `web/new/js/segments.js` if `model.js` would pass 400 lines.
- Modify: `web/new/js/ui/editor.js`, `web/new/js/ui/messagebox.js` and the CSS
- Test: `test/newpage-model.test.js` (or `test/newpage-segments.test.js`)

**Interfaces:**
- **`boxSegments(text, parts)`:**
  - Returns the same text and blank segments as `segments(text)`, with block regions marked.
  - Each block part (`kind !== 'ai'`) whose `text` is found word for word in `text` becomes `{ kind:'block', label, why, start, end, inner: segments(blockText) }`, so blanks inside a block are still pills.
  - A block part that is not found is ignored, so an edited block becomes plain text.
  - `joinSegments` of the result is still `text`.
- **`removeBlock(text, block)`** returns the text without that block and without the blank line that joined it. **`restoreBlock(text, block, at)`** puts it back where it was.
- **The editor:**
  - a block is a tinted region with its label above it, for example "Price reply · added by Wheelman's rules" (the `why` is in a title or details for screen readers);
  - it has Remove; its text stays editable;
  - Remove calls `type(removeBlock(...))`, with a toast "Removed" and "Put back";
  - the main store's `item.draft.parts` feed it.

- [ ] **Step 1: Write the failing tests:**
  - `boxSegments marks each block found word for word`;
  - `an edited block becomes plain text`;
  - `removing a block keeps the typed text and Put back restores it`;
  - `blanks inside a block are still pills`;
  - `joinSegments of boxSegments is the text` (round trip).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm.cmd test`. Check on the preview at 1440×900 and 390×844, light and dark:
  - a first reply with the First-reply details block and the Sign-off;
  - a price question with the Price reply block;
  - Remove and Put back;
  - typing inside a block turns it plain.
  
  Screenshots go under `D:\Jim\Wheelman\.playwright-mcp\new-page-3\` as `task4-*.png`.
- [ ] **Step 5: Commit:** `New page: Wheelman's blocks shown in the reply with a label and Remove`

### Task 5: The trust line

**Files:**
- Modify: `web/new/js/model.js`. `trustLine(draft, text)` returns `{ tone:'good'|'bad'|'none', text, facts }` and replaces the PR 1 green-line rule.
- Modify: `web/new/js/ui/messagebox.js` and the CSS
- Test: `test/newpage-model.test.js`

**Interfaces:**
- **`trustLine(draft, text)`:**
  - **No draft, or the box differs from Wheelman's text:** `{ tone:'none', text:'What you typed has not been checked.' }`.
  - **No facts:** `{ tone:'none', text:'No figures or links to check.' }`.
  - **A fact with `ok:false`:** `{ tone:'bad', text: '<value> is not in your records.' }`.
  - **Otherwise:** `{ tone:'good', text: n === 1 ? '1 fact checked' : n + ' facts checked', facts }`.
- **The UI:**
  - The line opens and closes a list: each fact as "<label or value> · <value> · from <source>", and the failing one in red words.
  - A failed check keeps blocking Copy until fixed or "Copy anyway".

- [ ] **Step 1: Write the failing tests:**
  - `trustLine counts checked facts`;
  - `trustLine with no facts says so`;
  - `trustLine names a fact not in the records`;
  - `trustLine says typed text is not checked`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Check on the preview:**
  - a reply with a price and a link: "2 facts checked" opens to their sources;
  - the stand-in invents a wrong price for one invented customer: a red sentence, Copy blocked;
  - an edited box: "What you typed has not been checked."
  
  Screenshots as `task5-*.png`.
- [ ] **Step 5: Commit:** `New page: the trust line, each fact with where it came from`

### Task 6: Remember, and What Wheelman used gets lessons and rules

**Files:**
- Modify: `web/new/js/store.js` (actions `remember(scope)` and `switchLesson(id, on)`), `web/new/js/model.js` (`rememberOffer(item, draft)`), `web/new/js/ui/messagebox.js`, `web/new/js/ui/usedtab.js` and the CSS
- Test: `test/newpage-store*.test.js`, `test/newpage-model.test.js`

**Interfaces:**
- **`rememberOffer(item, draft)`:**
  - Returns null unless the draft has an `instruction`, the key is `c:`, `l:` or `em:` (the Dashboard section), and the instruction was not already remembered.
  - Otherwise returns `{ scope, label }`. `scope` is the item's situation key, and `label` is "Remember for <situation label in lower case>", for example "Remember for price questions". With no situation, the scope is `'any'` and the label "Remember for every reply".
- **After a Tell Wheelman rewrite,** one line reads "Rewritten from your instruction." with "Just this once" (closes the line and stores nothing) and the Remember label:
  - **Remember** calls `POST /api/drafts/<id>/remember { scope }`, then toasts "Remembered for price questions", with "Undo" switching the lesson off through `POST /api/lessons/<id>/switch { on:false }`.
  - **A refusal** shows its sentence in the toast.
- **What Wheelman used gains:**
  - "Lessons it followed", from `lessonsApplied`: each "do" line with "from <date>" in Sydney time;
  - "Rules that fired", from `rules`: plain words, for example "Added the first-reply details for a new enquiry", "Added the price reply" and "Sign-off for the first reply today".
  
  This completes PR 2's Ruling 2.

- [ ] **Step 1: Write the failing tests:**
  - `rememberOffer is offered only for a Dashboard draft with an instruction`;
  - `remember posts the scope and Undo switches the lesson off`;
  - `a refused remember shows its sentence`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Check on the preview:**
  - Tell Wheelman "Do not mention finance", then Remember for…: the toast appears and Undo works;
  - the next draft for that kind of customer shows the lesson in What Wheelman used;
  - "Just this once" stores nothing (`GET /api/lessons` stays the same).
  
  Screenshots as `task6-*.png`.
- [ ] **Step 5: Commit:** `New page: Remember for a kind of reply, and What Wheelman used shows its lessons and rules`

### Task 7: README and walkthrough

**Files:**
- Modify: `README.md`:
  - "The new page" gains the blocks, the trust line and Remember;
  - "How Wheelman learns": copying as written counts as approval, Remember lessons and the off switch;
  - one dated Status line.

- [ ] **Step 1: Update the README.** It is public: plain words, no figures, no names. Remove the "later update" sentence for what this PR delivers.
- [ ] **Step 2: Walkthrough on the preview** at 1440×900 and 390×844, light and dark:
  - a first reply's blocks, Remove and Put back;
  - the trust line and a failing fact;
  - Tell, then Remember, then Undo;
  - What Wheelman used with lessons and rules;
  - Copy unchanged, then `GET /api/lessons` and the draft's rating show approval.
  
  No console errors, and only 127.0.0.1:3211 requests. Screenshots as `task7-*.png`.
- [ ] **Step 3: Run** `npm.cmd test`, `check-private`, `check-deps` and `check-css`. Expected: all pass.
- [ ] **Step 4: Commit:** `README: blocks, the trust line and Remember on the new page`
