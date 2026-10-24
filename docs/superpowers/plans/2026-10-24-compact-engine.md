# Compact engine: smaller prompts, facts by code, proven by replay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut each reply request from about 15,500 input tokens to about 4,000, let code (not the AI) write every figure and link, and prove on 400 past Dashboard conversations that replies are no worse before anything goes live.

**Architecture:** A second prompt style, `compact`, sits beside today's `full` style. It is chosen per request (`style` option) or by `PROMPT_STYLE` in `.env`, and the default stays `full`. Compact sends a short voice card and only the parts of the sales playbook, business facts and operations guide that match the message. Every literal in the trusted material (prices, distances, dates, links) becomes a `{{Fn}}` marker that code restores after the AI answers. A hardened replay runner writes drafts in both styles on a copy of the database and reports paired results against a fixed gate.

**Tech Stack:** Node 22, `node:sqlite`, `node:test`, zero dependencies, no build.

**Spec:** the Wheelman Next PRD (private Claude Doc, 24 Oct 2026). This plan covers roadmap stage 2's first part, "facts by markers everywhere; prompts cut to 4,000 tokens". It also uses PRD decision row 6 ("Code inserts every fact through markers"), accepted 24 Oct 2026, and the Stage 1 baseline. Stable IDs and the stored inbox are the next plan, written after this one passes its gate.

## Global Constraints

- Node `>=22.13`; no new dependencies (`npm.cmd run check-deps` passes); no build step.
- **Never the live database.** Every script here refuses to run unless `DB_PATH` points at a copy. A file named `app.db` inside a folder named `data` is live (the existing `isLiveDatabase` rule).
- **Replay is offline.** It makes no dashboard, content-engine or car-media requests. The AI provider is the only network call.
- **Default stays `full`.** With no `PROMPT_STYLE` set, every draft is byte-for-byte what main produces today. Every existing test passes unchanged.
- These confirmed rules must survive in the compact style, word for word or in meaning:
  - "Good morning / Good afternoon / Good evening" by Sydney time, or "Hello"; never "Hi".
  - The greeting and sign-off only on the first reply of the day; the AI writes no sign-off.
  - Formal and courteous: no slang ("No worries" is out), no emoji, at most one exclamation mark.
  - The deposit is the only urgency: never other buyers or "selling fast".
  - At most one question, and only when the answer is needed.
  - Insider facts shape a reply and are never stated.
  - Never name a lower price figure, and never accept or refuse an offer.
  - A promise, day or time only if staff gave it.
  - A marked blank such as `[PRICE?]` where a person must decide; never a guess.
  - Answer first, then one next step.
- Gate (PRD section 16, stage 2), on cases replayed in both styles:
  - compact median similarity is at least full median minus 0.02;
  - compact share at similarity 0.8 or more is no more than 3 points below full;
  - the compact hard-fail rate is not higher than full's;
  - the compact median input is at most 6,000 tokens (target 4,000).
- Real customer text appears only under `eval/out/` (git-ignored). Tests use invented data; invented phone numbers avoid simple digit runs.
- Before every commit: `npm.cmd test` is green and `npm.cmd run check-private` passes. Commit messages read "Area: what changed", with no AI attribution of any kind.

## Review Focus

1. **A message with no useful words**, such as "is it still available?": compact retrieval finds nothing. The prompt must still carry the core facts (address, opening hours, holding deposit). Test in Task 5.
2. **The AI writes a marker that does not exist** (`{{F99}}`), or drops one it was asked to use: the draft fails `marker-unknown`, goes through the usual one retry, and a draft with a raw marker is never shown. Test in Task 6.
3. **A figure the customer typed themselves** ("would you take $24k?"), repeated in the reply: allowed, not flagged as invented. Test in Task 6.
4. **The replay stops halfway** (daily cap, provider down, Ctrl+C): the results so far are on disk, and `--resume` skips cases already done in that style. Test in Task 1.
5. **The provider returns no JSON in compact style:** the same handling as full style (draft fails cleanly, no crash). Test in Task 4.

---

### Task 1: A safe, resumable replay runner with paired results

**Files:**
- Create: `src/livedb.js`, `src/replayrun.js`, `src/replaystats.js`
- Modify: `scripts/replay.js` (becomes a thin command), `scripts/tone-redraft.js` (import `isLiveDatabase` from `src/livedb.js`), `src/vehiclemedia.js:296` (`mediaForReply` returns `null` when `config.offline`), `src/config.js` (`offline: env.OFFLINE === '1'`, `llm.promptStyle` placeholder added in Task 4)
- Test: `test/livedb.test.js`, `test/replayrun.test.js`

**Interfaces:**
- Produces:
  - `isLiveDatabase(dbPath: string): boolean`
  - `requireCopy(dbPath: string): void`: throws `Error('DB_PATH must point at a copy of the database, not the live one')` when unset or live.
  - `runReplay({ cases, styles: string[], sampleFull?: number, resumeFrom?: CaseResult[], draft: (item, opts) => Promise<Draft>, onResult?: (r) => void }): Promise<{ results: CaseResult[], stopped: null | 'daily' | 'error' }>`
  - `CaseResult = { key: string, style: 'full'|'compact', similarity: number, salesOurs: number, salesTheirs: number, worst: 'ok'|'warn'|'input'|'fail', tokensIn: number, tokensOut: number, model: string, ms: number }`
  - `pairStats(results: CaseResult[]): { paired: number, full: StyleStats, compact: StyleStats, gate: { pass: boolean, reasons: string[] } }`
  - `StyleStats = { n, medianSimilarity, close80, near95, failRate, medianTokensIn }`

- [ ] **Step 1: Write the failing tests**
  - `livedb.test.js`: `isLiveDatabase('D:/x/data/app.db') === true`; `isLiveDatabase('D:/x/eval/copy.db') === false`; `requireCopy(undefined)` and `requireCopy('C:/a/data/app.db')` throw the message above.
  - `replayrun.test.js`: uses the stand-in AI and 3 invented cases. Check that:
    - `styles: ['full','compact']`, `sampleFull: 2` gives 2 full + 3 compact results;
    - `resumeFrom` holding 1 compact result gives 2 new compact results;
    - a stand-in that returns the daily-limit error stops with `stopped: 'daily'`, and the results so far are returned;
    - `pairStats` on hand-made results gives `gate.pass === false` with the reason `"compact median similarity 0.50 is more than 0.02 below full 0.60"` when compact is 0.50 and full is 0.60;
    - `pairStats` passes when compact is 0.59, close80 is equal, the fail rate is equal and the median tokens are 3,900.
- [ ] **Step 2: Run them and see them fail.** Run `node --test test/livedb.test.js test/replayrun.test.js`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.**
  - `src/livedb.js`: move `isLiveDatabase` out of `tone-redraft.js`.
  - `runReplay`: for each case and style, call `draft(itemAt(full, cut, at), { save:false, holdOutConversation:true, now: at, style })`. Score it with `similarity(comparable(reply), comparable(actual))` and `salesScore`. Take the tokens from `draft.usage`. Run full style only on the first `sampleFull` cases, in `spread` order.
  - `pairStats`: count only cases present in both styles toward the gate; `failRate` = share with `worst === 'fail'`.
  - `scripts/replay.js` flags:
    - `--n <1..400>` (default 20);
    - `--styles full,compact`;
    - `--sample-full <n>`;
    - `--resume <run dir>`;
    - `--gap <seconds>`, which sets `config.llm.secondsBetween`;
    - `--confirm`.
  - Without `--confirm`, the script prints the case count and an estimate, then exits. The estimate is requests per style, and tokens at 15,500 in per full request and 4,000 per compact.
  - With `--confirm`, the script:
    - calls `requireCopy(config.dbPath)` first and sets `config.offline = true`;
    - writes each result as one JSON line to `eval/out/replay-<timestamp>/results.jsonl` as it lands;
    - writes `summary.json` (from `pairStats`) and `cases.html` (side by side: what was sent, full, compact).
- [ ] **Step 4: Run them and see them pass.** Run `node --test test/livedb.test.js test/replayrun.test.js`, then `npm.cmd test`. Expected: all PASS.
- [ ] **Step 5: Commit.** `Replay: refuses the live database, runs offline, resumes, and reports full against compact`

### Task 2: No look-ahead in the learning material

**Files:**
- Modify: `src/examples.js:25` (`pickExamples(q, max = 6, now = Date.now())`), `src/practice.js:223` (filter rows to `at <= now`; the cache key gains the Sydney day of `now`), `src/learn.js:349,391,402` (`ownerGuidance`, `learnedExamples`, `corrections` use only rows created at or before `now`), `src/prompt.js:550-551` (pass `now` to `pickExamples`)
- Test: `test/lookahead.test.js`

**Interfaces:** the function names are unchanged; `pickExamples` gains `now` as its third argument.

- [ ] **Step 1: Write the failing test.** Store a learned reply, a correction and an owner lesson dated 2 days after a fixed `now`. Then check that `learnedExamples(q, 2, now)`, `corrections(q, 2, now)`, `ownerGuidance(q, now)` and `practiceFor(q, 3, now)` do not contain them, and do contain an identical row dated 1 day before.
- [ ] **Step 2: Run it.** Run `node --test test/lookahead.test.js`. Expected: FAIL, the later rows are present.
- [ ] **Step 3: Implement** the `at <= now` filters in the four modules. With the default `now = Date.now()`, nothing changes in the live app.
- [ ] **Step 4: Run.** Run `node --test test/lookahead.test.js`, then `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit.** `Learning: a draft written for a past moment sees only what was known then`

### Task 3: A prompt size meter

**Files:**
- Create: `src/promptsize.js`, `scripts/prompt-size.js`; add `"prompt-size"` to `package.json` scripts (same `node --env-file-if-exists=.env --disable-warning=ExperimentalWarning` form as the others)
- Test: `test/promptsize.test.js`

**Interfaces:**
- Produces:
  - `estimateTokens(text: string): number`, which is `Math.ceil(text.length / 4)`;
  - `sectionSizes({ system, user }): Array<{ name: string, chars: number, tokens: number }>`. Sections are split on lines matching `/^=== (.+) ===$/`. Text before the first heading is named `"(system)"` or `"(user head)"`.

- [ ] **Step 1: Write the failing test.** A two-section user prompt gives the names `["(system)","(user head)","VEHICLE FACTS","BUSINESS FACTS"]` with the right character counts. `estimateTokens('abcd') === 1`.
- [ ] **Step 2: Run it.** Run `node --test test/promptsize.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `scripts/prompt-size.js --n 30 --style full|compact` calls `requireCopy`, builds prompts for `collectCases` items with `buildPrompt` (no AI), and prints the median characters and tokens for each section and in total.
- [ ] **Step 4: Run** `node --test test/promptsize.test.js` and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit.** `Prompts: a meter that shows what each section costs`

### Task 4: The compact voice card, playbook by situation, and the style switch

**Files:**
- Create: `voice/compact/voice-card.md` (at most 2,400 characters, written from `voice/house-voice.md`), `src/playbook.js`
- Modify: `src/prompt.js:70-123` (`systemPrompt(channel, { replyVia, style = 'full' })`), `src/prompt.js:512` (`buildPrompt` takes `style`, defaulting to `config.llm.promptStyle`), `src/drafter.js:320` (`writeDraft` passes `style` through, defaulting to `config.llm.promptStyle`), `src/config.js` (`llm.promptStyle: env.PROMPT_STYLE === 'compact' ? 'compact' : 'full'`), `.env.example` (`PROMPT_STYLE=full`, with one comment line)
- Test: `test/compactprompt.test.js`

**Interfaces:**
- Produces:
  - `playbookSections(): Array<{ heading: string, body: string }>`, parsed from `voice/sales-playbook.md` on `## ` headings;
  - `playbookFor({ situation: string, rung: string, channel: string }): string`, at most 2 situation sections plus `"Words that end a conversation, and words we never use"`, and at most 3,500 characters in total;
  - `buildPrompt(item, { …existing, style })`, which in compact style adds the user section `=== SELLING FOR THIS MESSAGE ===` holding `playbookFor(...)`.
- Situation to playbook section (headings exactly as in the file; the first that applies wins, so there is at most one besides "Where the customer is, and the move"):

| When | Section |
| --- | --- |
| price question | "The price question" |
| wants to see the car | "Inviting an inspection" |
| lives far away | "The far-away customer" |
| asks to hold the car or accepts a figure | "Holding the car: the deposit is the only urgency" |
| car sold or reserved | "The sold or reserved car" |
| car not at the showroom | "A car that is not at the showroom yet" |
| buyer after the sale | "After the sale" |
| says no | "Accepting a no" |
| complaint | "Complaints are held" |
| import | "Imports: trust documents first" |
| always | "Where the customer is, and the move" |

- [ ] **Step 1: Write the failing tests** (`compactprompt.test.js`):
  - the compact system prompt for `'sms'` is 4,000 characters or fewer;
  - it contains each confirmed-rule phrase from Global Constraints: "never \"Hi\"", "first reply of the day", "No worries", "emoji", "one exclamation mark", "deposit is the only urgency", "selling fast", "one question", "never stated", "lower", "only if our staff", "[PRICE?]", "Answer first";
  - `playbookFor({ situation:'price', rung:'interest', channel:'sms' })` contains "The price question" and not "After the sale";
  - `buildPrompt(item)` with no style equals `buildPrompt(item, { style:'full' })`, byte for byte;
  - with a stand-in AI that answers non-JSON, `draftFor(item, { save:false, style:'compact' })` resolves with `status:'failed'`, as full style does.
- [ ] **Step 2: Run them.** Run `node --test test/compactprompt.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The voice card keeps every confirmed rule in Global Constraints and the "shape of a reply" in four lines. It drops the long examples and explanations of `house-voice.md`.
  - Compact `systemPrompt` order: intro; `=== VOICE ===` (card); channel rules as today; `=== WHERE FACTS COME FROM ===`; `=== PROMISES AND TIMES ===`; `=== WHEN OUR STAFF GIVE AN INSTRUCTION ===`; `=== OUTPUT ===`.
  - `=== SELLING ===` moves to the user prompt as the situation's sections.
  - Cache the voice card and the playbook parse for 60 seconds, as the website chunks are.
- [ ] **Step 4: Run** `node --test test/compactprompt.test.js` and `npm.cmd test`. Expected: PASS; every existing test is unchanged.
- [ ] **Step 5: Commit.** `Prompts: a compact style with a short voice card and the selling advice for this message`

### Task 5: Only the facts this message needs (compact style)

**Files:**
- Modify: `src/knowledge.js` (add `relevantFacts`, `relevantOperations`), `src/prompt.js:690-702,729-776` (compact branches)
- Test: `test/relevantfacts.test.js`

**Interfaces:**
- Produces:
  - `relevantFacts(query: string, { max = 5, core = ['address', 'opening hours', 'holding deposit'], topics = loadBusinessFacts() } = {}): string`. Its lines read `- Title: answer` as `businessFactsForPrompt` writes them. Core topics are those whose title contains a core phrase (case-insensitive), always included. The other topics are ranked by shared `words()` with the query, title words counted double. Topics marked needs-answer are never included.
  - `relevantOperations(query: string, { max = 2, text = operationsGuide() } = {}): string`. Paragraphs are split on blank lines and ranked the same way. Empty when nothing shares 2 or more words.
- Compact caps in `buildPrompt`:
  - examples: 3 in all (learned 1, bank 2);
  - corrections: 1;
  - team practice: 2, reply at most 500 characters;
  - website extracts: 2 passages of at most 900 characters;
  - business facts: `relevantFacts(waitingText + situation)`;
  - how we work: `relevantOperations(waitingText)`;
  - the conversation budget stays 2,600.

- [ ] **Step 1: Write the failing tests.** Use invented topics passed in through `topics`/`text`:
  - a trade-in question gets the "Trade-ins" topic plus the 3 core topics, and not "Extended warranty when not included";
  - "is it still available?" gets exactly the 3 core topics (Review Focus 1);
  - a needs-answer topic never appears;
  - a compact `buildPrompt` for a fixture price question has `system.length + user.length <= 16000` (about 4,000 tokens).
- [ ] **Step 2: Run them.** Run `node --test test/relevantfacts.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the two functions and the compact branches. Full style keeps every current call unchanged.
- [ ] **Step 4: Run** `node --test test/relevantfacts.test.js` and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit.** `Prompts: the compact style sends only the facts and examples this message needs`

### Task 6: Facts by markers (compact style)

**Files:**
- Create: `src/factmarkers.js`
- Modify: `src/fitter.js:20` (export `LITERAL`), `src/prompt.js` (compact: mask the trusted sections and return `factMarkers`), `src/drafter.js:189-280` (`assessReply`: check for raw literals, then restore, then the existing checks)
- Test: `test/factmarkers.test.js`

**Interfaces:**
- Consumes: `LITERAL` from `fitter.js`; `buildPrompt` from Task 4.
- Produces:
  - `maskTrusted(sections: Record<string,string>): { masked: Record<string,string>, markers: Array<{ name: string, value: string }> }`. Names are `F1`, `F2`… in order of first appearance; the same value always gets the same name.
  - `restoreFacts(text: string, markers): string`
  - `inventedLiterals(aiText: string, { allowedText: string }): string[]`. These are the literals in the AI's text before restoring, outside `{{Fn}}`, and not found in `allowedText`.
  - `unknownMarkers(aiText, markers): string[]`
  - `buildPrompt(...).factMarkers` is the array in compact style and `null` in full style.
- The trusted sections masked in compact style:
  - VEHICLE FACTS, SIMILAR VEHICLES AVAILABLE NOW, the stock line, INSPECTION, PRICE REPLY;
  - STANDARD FIRST REPLY, LINKS THEY ASKED FOR, BUSINESS FACTS, HOW CARBARN WORKS, WEBSITE EXTRACTS;
  - RESEARCH, IMPORTING PAGES.
- Left unmasked: the conversation, examples, practice and instruction.
- Added to the compact `=== WHERE FACTS COME FROM ===`: "Prices, distances, dates, phone numbers and links in our records appear as markers such as {{F3}}. Write the marker where the fact goes; never write the figure yourself."
- `allowedText` is the customer's messages, our earlier messages in this conversation, and the staff instruction.

- [ ] **Step 1: Write the failing tests:**
  - masking `"Price: $36,990 · 41,200 km · harbour.example/cars/T14"` gives three markers, and `restoreFacts` puts the original text back exactly;
  - an AI reply `"It is $31,990."`, with no such figure in `allowedText`, makes `assessReply` fail with code `figure-raw`;
  - `"It is {{F1}}."` restores to `"It is $36,990."` and passes;
  - `"{{F9}}"` fails `marker-unknown` (Review Focus 2);
  - `"Thank you for your offer of $24k."`, with `$24k` in the customer's text, gets no `figure-raw` (Review Focus 3);
  - in full style `factMarkers` is `null` and `assessReply` behaves as on main.
- [ ] **Step 2: Run them.** Run `node --test test/factmarkers.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `assessReply`, when `prompt.factMarkers` is set:
  - run `inventedLiterals` and `unknownMarkers` on the raw AI text first, giving fail checks `figure-raw` and `marker-unknown`, with plain messages in the style of the other checks;
  - then `restoreFacts` on every text field;
  - then the existing pipeline.

  `retryNote` gains one line when either code fired: "Write facts only as their markers."
- [ ] **Step 4: Run** `node --test test/factmarkers.test.js` and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit.** `Drafts: in the compact style code writes every figure and link; an invented one fails`

### Task 7: Measure, replay, and report the gate

No new code. This task spends the AI requests Jim approved, and it does not change the live app.

- [ ] **Step 1: Copy the git-ignored files** the tests and prompts need into the worktree: `.env`, `voice/people.json`, `voice/examples.json`, `knowledge/*.md`, `knowledge/website/`. Run `npm.cmd test`. Expected: PASS.
- [ ] **Step 2: Make a fresh copy of the database** with the stage 1 script (`VACUUM INTO`, live file opened read-only) at `eval/out/replay-db/app-copy.db`. Set `DB_PATH` to it.
- [ ] **Step 3: Measure without AI.** Run `npm.cmd run prompt-size -- --n 30 --style full` and then with `--style compact`. Expected: compact median total at most 6,000 tokens, target 4,000. If it is over, trim the largest section the meter shows, commit, and measure again before spending anything.
- [ ] **Step 4: Dry run.** Run `npm.cmd run replay -- --n 400 --styles full,compact --sample-full <n chosen by Jim> --gap 3`. It prints the case count and the estimate; check that it matches what Jim approved.
- [ ] **Step 5: Run with `--confirm`.** If it stops early, continue with `--resume <run dir>`.
- [ ] **Step 6: Report.** Add a "Stage 2 replay" section to the PRD with:
  - the `summary.json` numbers and the gate result with its reasons;
  - the median tokens in each style;
  - 5 compact drafts that did worse than full, each with one line on why.

  Keep `cases.html` local. Delete the database copy when the report is written.

### Task 8: Pull request

- [ ] **Step 1: Run `npm.cmd test`, `npm.cmd run check-private`, `npm.cmd run check-deps` and `npm.cmd run check-css`.** Expected: all pass.
- [ ] **Step 2: Push the branch and open a pull request to main.** The description gives:
  - what changed;
  - that the default stays `full`;
  - the gate result;
  - how to switch: `PROMPT_STYLE=compact` in `.env`, restart, and change it back the same way.

  No AI attribution.
- [ ] **Step 3: Hand the merge to Jim.** He merges himself, and the live app changes only when he does and sets `PROMPT_STYLE`.
