# Wheelman tone upgrade: design

Written 2026-10-21 for Jim (Carbarn). Builder: Claude Code. This document records what Jim
decided on 21 October and points to `docs/tone-upgrade-brief.md` for the changes themselves: the
brief is the specification, change by change, with the finding, the file, the change and the
acceptance check. Read with `docs/tone-judgement.md` (the findings), `docs/tone-codebook.md`
(how a suggestion's tone is labelled) and `eval/tone/turns.json` + `eval/tone/labels.json` (the
280 labelled suggestions, redacted). Record ids (`WM-NNN`) are in those two files.

## Intent

Wheelman's suggestions read as an information desk: correct, calm, addressed to nobody in
particular. 127 of 280 were labelled Information desk, 89 Warm consultant, 24 Pushy closer. The
judgement traced every finding to a template, a code-added block, a prompt rule or a missing
check, not to the model. Jim's words: "Let's leave the model aside. Let's upgrade according to
the suggestions." The upgrade makes Wheelman's default shape the Warm consultant shape the 89
already share: the first line names what this person gave us, a plain answer, one step chosen
for them.

## Goals

- Carry out the ten changes in `docs/tone-upgrade-brief.md`, in its priority order, on the
  model Wheelman uses today (the model is out of scope).
- Re-measure at the end with the brief's protocol ("How to verify an upgrade"): re-draft the
  acceptance ids, label them with the codebook, compare with `eval/tone/labels.json`.
- `npm test` green, with a test for each new check.

## Non-goals and anti-goals

- No model change, no new provider, no change to thinking or temperature.
- No fact rule weakened: WHERE FACTS COME FROM, PROMISES AND TIMES, the hand-over table and
  every blank stay. Nothing in the upgrade fills a blank. Nothing sends.
- The register rules that keep Mate at 0 of 280 stay word for word (brief, change 11): the
  Register rows "Cheers / Mate / Guys / Arvo / Heaps → (never)", "No worries → Certainly." and
  "Never match slang, abbreviations, emoji or capitals". One "mate", "bro", "cheers", "no
  worries", "yep", an emoji outside the SMS footer or a second exclamation mark in a re-drafted
  suggestion is a regression.
- No new dashboard addresses, no new sections, no UI work beyond a new warning showing where
  warnings already show.
- The work does not touch Jim's live folder: branch work happens in a git worktree, demoed on
  port 3211.

## Constraints

- Test-first (`npm test`), one change at a time, each change its own commit, so a change can be
  taken out alone.
- Jim's fixed wording (templates and blocks) is his. Where the brief proposes new wording for a
  template, the builder uses the brief's wording and lists it in the PR so Jim can reword.
- Public repo rules: never name the two salespeople; names, addresses and evidence stay in
  git-ignored local files (the judgement files among them, see Jim's call 5);
  `npm.cmd run check-private` before any commit.
- No attribution of Claude or any AI in commits, PRs or files.

## Jim's calls (decided 21 October 2026)

1. **Marketplace step after an accepted figure (brief change 10b).** The buyer's phone number,
   and an invitation to inspect. The reply asks for their number and a day and time that suits
   them. This keeps the 20 October shape; the work is to make the existing rule fire every
   time, not to change it.
2. **Reflection line (brief change 10a).** Yes. One short line the AI writes at the top of a
   Marketplace first reply and an auction occasion message, picking up something the customer
   said ("twins on the way", "I'm in Adelaide", "needs to tow 2 tonnes"), before Jim's fixed
   wording begins. Nothing is added when the customer gave nothing to pick up ("Rego include?"
   is not something to pick up; kids, a trade, a suburb or a deadline is).
3. **lots_coming template (brief change 8).** "Happy bidding!" goes. The inspection sentence
   becomes: "Our inspection team in Japan inspects every vehicle before the final purchase." Jim's
   correction: the bidding team does not inspect; the inspection team inspects. "detailed" goes
   from "a detailed condition report" (a rating word). Everything else in the template stays as
   he wrote it.
4. **The deposit on a dashboard text (brief change 3).** A customer who accepts our figure, or
   asks to hold the car, is proposed the $1,000 deposit, as the playbook says now, whether or not
   they have seen the car. A booking, a finance application, a thumbs-up, the tail of another
   answer or a deferral no longer proposes it. The licence and email are asked for only after
   they say yes to the deposit. On Marketplace an accepted figure leads to the number and the
   inspection (call 1), never the deposit, unless they ask to hold it.
5. **Privacy.** The judgement files quote real customer messages (names, numbers and plates
   removed) and stay on this computer: `eval/tone/`, `docs/tone-judgement.md`,
   `docs/tone-upgrade-brief.md`, `docs/tone-codebook.md`, `docs/tone-dashboard.html` and
   `eval/tone/rewrite_check.md` are git-ignored. This design and its plan are committed. The PR
   describes the changes in its own words and does not link to the brief.
6. **Re-measure.** The acceptance ids the brief names (about 40) are re-drafted on the current
   model and labelled; not all 280.

## The builder's calls (from the builder check)

- **Price reply (change 5).** The block stays Jim's words and the AI still never rewrites,
  shortens or repeats it. The change is above and inside it: when the block will follow, the AI's
  line above names what the customer gave (their offer figure, their budget, "drive away") and
  never the showroom placing line, with `[PRICE?]` only when they press for a figure; the code
  picks the inclusions the customer's words ask about (rego, CTP and the roadworthy for "drive
  away", "on road", "rego"; the warranty items for "warranty", "import", "reliable", "Japan") and
  gives the full list when they named nothing.
- **"Seen the car"** (for the row and for `allowsUrgency`): a visit we confirmed ("see you")
  whose time has passed and the customer wrote again without declining; their own words saying
  they inspected, test drove or watched the video; or the online inspection recorded as done.
  "Started the online purchase steps" stays a commit signal (the brief does not remove it).
- **Marketplace baseline (change 2).** Most judged Marketplace drafts predate PR #54 (20
  October), which already turned the price and invitation blocks off there. The bare-figure fix
  and the two warnings are built as the brief says; the re-measure is read against the old
  labels with a note of what #54 already changed.
- **New checks warn only**, as the brief says: no second AI request on a warning. Tests assert
  that each warning fires on the named drafts; the prompt-driven outcomes are measured in the
  re-measure.
- **Labelling the re-measure.** A fresh subagent given only the codebook and the new drafts,
  never `labels.json`, labels them; the comparison is written up locally beside the judgement.

## The brief's proposed wording, adopted as the builder's call

Jim said to upgrade according to the suggestions, so where the brief proposes wording for one of
his templates the builder uses it and names it in the PR for him to reword:

- **Price reply (change 5).** The price line (or the blank's sentence) ahead of "The price
  includes {inclusions}"; the request picks from the inclusions the items that answer this person
  (registration, CTP and the roadworthy for "drive away"; the warranty for a buyer wary of an
  import); the full list only on a first reply where it is the proof.
- **first_estimate caveat (change 7).** Figures and the deposit step first; the caveat said to
  the person: "Your final landed figure will move a little with the winning bid, the exchange
  rate, shipping timing and the car's condition"; keep "We will not place a bid without your
  confirmation".
- **lot_offer order (change 9).** Open with the landed total and the bid and the two facts that
  decide it (kilometres and grade); keep the cost lines for first_estimate; end on one step, the
  deposit link; drop "if you have your own preferred bid amount, please let us know".

## What the builder measures

The acceptance checks in the brief, change by change, and at the end the shares: Information
desk down, Warm consultant up on first replies, Pushy closer and Hedger near zero, Hype zero,
Mate still zero. The new warnings (`urgency` under the new condition, the Marketplace opener and
"More details:" warnings, the promise check beside a blank, the rating-word warning) must fire on
the current drafts of the ids the brief names and not on the ids it says already follow the
shape.

## Left to the builder

- The order of commits within the brief's priority order, and how the ten changes split into
  pull requests (one PR is fine if each change is its own commit).
- The exact regular expressions for the new checks, and where in `src/checks.js` they sit.
- How the reflection line is produced for auction occasions: through the existing auction fit
  (`AUCTION_FIT`) or a separate request, as long as the figures stay as code put them in.
- How re-drafting the acceptance ids is driven (`npm run replay`, the dashboard, or a small
  script over `eval/tone/turns.json`), and where the re-measure is written up.
