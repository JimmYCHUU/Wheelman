# Wheelman Tone Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Wheelman's default reply the Warm consultant shape (a first line that names what this person gave us, a plain answer, one step chosen for them) by changing the voice files, the prompt, the code-added blocks, the sales ladder and the checks, as the brief's ten changes say.

**Architecture:** Wheelman writes a suggestion from a system prompt built from `voice/*.md` plus per-request sections (`src/prompt.js`), decides the customer's rung and move from the records (`src/selling.js`), adds fixed blocks under the AI's lines (`src/drafter.js`, `src/firstreply.js`, `src/pricereply.js`) and checks the result (`src/checks.js`). Auction and template messages are the owner's wording fitted by the AI with every fact masked (`src/fitter.js`). Every change here is one of: a sentence in a voice file or prompt section, a condition on a block, a signal or move in the ladder, or a `warn` in the checks. No model, provider or network change.

**Tech Stack:** Node.js (ES modules), `node --test`, `node:sqlite`, stand-in services under `test/support/`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-tone-upgrade-design.md`, which points to `docs/tone-upgrade-brief.md` (local, git-ignored after Task 1) for the change-by-change findings and acceptance ids. Read both. The brief's record ids (`WM-NNN`) are in `eval/tone/turns.json` (local).

## Global Constraints

- No fact rule weakened: WHERE FACTS COME FROM, PROMISES AND TIMES, the hand-over table and every blank stay. Nothing fills a blank. Nothing sends.
- These lines of `voice/house-voice.md` stay word for word: the Register rows `Cheers / Mate / Guys / Arvo / Heaps → (never)`, `No worries / No problem / No probs → Certainly. / Of course. / With pleasure.`, `Yep / Yeah / Sure thing → Yes.`, and the sentence `Never match slang, abbreviations, emoji or capitals.`
- No model, thinking or temperature change. No new provider.
- No new dashboard addresses, no new sections, no UI work: a new `warn` shows where warnings already show.
- Every new check is level `warn` (never `fail`): no second AI request is caused by any of them. Tests assert the warning fires; prompt-driven outcomes are measured in Task 15.
- Jim's fixed wording is his: where a task edits a template (`voice/price-reply.md` notes, `voice/auction-messages.md`, `voice/auction-offer.md`), use the words given in this plan and list the file in the PR under "Jim's wording to check".
- Work in the worktree `.claude/worktrees/tone-upgrade` on branch `tone-upgrade`; Jim's live app serves `D:\Jim\Wheelman` from `main`. Demo on port 3211, never 3210.
- Test-first; one task per commit; `npm.cmd run check-private` before every commit; no AI named in any commit, PR or file (no `Co-Authored-By`, no "Generated with").
- Public repo: never name the two salespeople; every example in a test is invented (the fixtures use the 0491 570 1xx numbers).
- Windows: run npm as `npm.cmd`; write multi-line files with the Write tool, not heredocs.

## Review Focus

1. A customer who repeats our own figure while accepting it ("Ok 22,900 is fine, I'll take it") must still read as `accepted our price`, and a reply that names the customer's figure beside an acceptance verb ("your offer of $15,000, which we can accept") must still fail `customer-figure`. Test in Task 2 and Task 4.
2. "ok see you at 10", "ok 10:30 works" must still count as an acknowledgement after bare figures stop counting as one; "15k", "$17000", "I have15000k", "24 will do" must not. Test in Task 3.
3. A deferral that also asks a question ("I'll let you know. Does it have a tow bar?") must be answered, not only accepted; a buyer after the sale who says "leave it with me" keeps the after-sale move. Test in Task 5.
4. A customer who names a day but no time ("Can I come Saturday?") still gets the invitation block with the link; one who names a time, or whose booking event carries one, does not get it twice or at all. Test in Task 6.
5. A car whose Included list has none of the items the customer's words ask about ("drive away" on a car listing only delivery) gets the full list, never "The price includes ." Test in Task 7.

---

### Task 1: Worktree, the judgement files kept local, the design and plan committed

**Files:**
- Create: worktree `.claude/worktrees/tone-upgrade` (branch `tone-upgrade` from `main`)
- Modify: `.gitignore` (append a block)
- Copy in: `docs/superpowers/specs/2026-10-21-tone-upgrade-design.md`, `docs/superpowers/plans/2026-10-21-tone-upgrade.md` (both exist untracked in `D:\Jim\Wheelman`)

**Interfaces:**
- Produces: the worktree every later task works in; `eval/tone/` and the four `docs/tone-*` files ignored.

- [ ] **Step 1: Create the worktree and install**

Run (from `D:\Jim\Wheelman`): `git worktree add .claude/worktrees/tone-upgrade -b tone-upgrade main`
Then in the worktree: `npm.cmd ci` if `node_modules` is absent, and `npm.cmd test`.
Expected: the suite is green before any change (note the count of passing tests).

- [ ] **Step 2: Copy the spec and this plan into the worktree**

Copy the two files from `D:\Jim\Wheelman\docs\superpowers\...` to the same paths in the worktree. Do not copy `docs/tone-*.md`, `docs/tone-dashboard.html`, `eval/`, or the judgement's own `2026-10-21-tone-judgement*.md` files: they stay in the main folder, untracked.

- [ ] **Step 3: Ignore the judgement files**

Append to `.gitignore`, after the `Auction.txt` block:

```
# The tone judgement of October 2026: real customer messages (redacted) and the findings read
# from them stay on this computer
eval/tone/
docs/tone-judgement.md
docs/tone-upgrade-brief.md
docs/tone-codebook.md
docs/tone-dashboard.html
```

- [ ] **Step 4: Check and commit**

Run: `npm.cmd run check-private`
Expected: passes (prints no setting name as found).

```bash
git add .gitignore docs/superpowers/specs/2026-10-21-tone-upgrade-design.md docs/superpowers/plans/2026-10-21-tone-upgrade.md
git commit -m "Tone upgrade: the design and plan; the judgement files stay local"
```

---

### Task 2: The first sentence names what this person gave us (brief change 1)

**Files:**
- Modify: `voice/house-voice.md:25-26` (bullet "The first sentence answers what was asked"), `:30` (bullet "End on the next step"), `:45-60` (the Instead-of table: one new row), `:88-93` ("Mirror the customer")
- Modify: `src/prompt.js:463` (standardPlan's "one or two short sentences" line)
- Modify: `src/imports.js:385-394` (askPlan lines)
- Modify: `src/checks.js:182-224` (`figureProblems`) and `:252` (the `customer-figure` check)
- Test: `test/selling.test.js`, `test/imports.test.js`, `test/core.test.js`

**Interfaces:**
- Produces: `OWNED_BY_CUSTOMER` (exported from `src/checks.js`): a regex true for a sentence that names a figure as the customer's own. Task 10's trade-in example relies on it.

- [ ] **Step 1: Write the failing tests**

In `test/selling.test.js`, beside the test `the checks refuse pressure and unbacked claims…` (line 203), add:

```js
test('a figure the customer gave may be named as theirs, never as ours', () => {
  const facts = 'Vehicle: 2021 Toyota Noah X. Advertised price $28,900.';
  const run = (body, customerText, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: facts, customerText, ...extra }).map((c) => `${c.level}:${c.code}`);
  assert.ok(!run('Thank you for your offer of $15,000. Regarding your offer, [PRICE?].', 'can do 15k if you are neg').includes('fail:customer-figure'));
  assert.ok(!run('You were hoping for $30,000 for your STI. Our offer of $27,000 stands.', 'I was hoping to get a minimum of $30,000', { allowedText: `${facts}\nWe can offer you $27,000 for your STI.` }).includes('fail:customer-figure'));
  assert.ok(run('We can do $15,000 for you.', 'can do 15k').includes('fail:customer-figure'));
  assert.ok(run('Thank you for your offer of $15,000, which we can accept.', 'can do 15k').includes('fail:customer-figure'), 'an acceptance verb beside their figure still fails');
  assert.ok(run('Your $15,000 offer is a deal.', 'can do 15k').includes('fail:customer-figure'));
});

test('the voice: the first sentence names what the person gave, and a form is already read', () => {
  const voice = promptModule.systemPrompt('sms');
  assert.match(voice, /The first sentence names what this person just gave us/);
  assert.match(voice, /never the opener for an offer, a location, a trade-in or a thank-you/);
  assert.match(voice, /End on one step chosen from what they said/);
  assert.match(voice, /\| Thank you for your message \/ Thank you for your enquiry \| \(nothing: name what they gave us\) \|/);
  assert.match(voice, /A lead form's fields and the engine's auto-reply are the customer's words/);
  assert.doesNotMatch(voice, /The first sentence answers what was asked\./);
  assert.match(voice, /Never match slang, abbreviations, emoji or capitals\./, 'kept word for word');
});
```

In `test/imports.test.js`, in the test that builds the ask plan for a lead whose form gives a year range (grep `ask for the details`; if none builds a form with a year range, add one using that test's helpers), assert the plan's lines joined include `They have already told us:` followed by `years 2022 to 2026` (or that fixture's years) and `do not ask for those again`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test test/selling.test.js test/imports.test.js`
Expected: the three new tests fail (the voice lines are absent; the owned figure fails `customer-figure`).

- [ ] **Step 3: Edit `voice/house-voice.md`**

Replace the bullet at line 25–26 with:

```
- The first sentence names what this person just gave us (their figure, their car, their day, their
  budget, their mood) and answers it. The availability line ("The vehicle is available for inspection
  at our Lidcombe showroom") is for a question about availability only: it is never the opener for an
  offer, a location, a trade-in or a thank-you. The facts come as figures: "48,000 km verified on the
  export certificate", "six months of NSW registration", "auction grade 4.5".
```

Replace the bullet at line 30 with:

```
- End on one step chosen from what they said: interstate, the video call and their postcode; in
  Sydney, a day and time; already on the way, come straight in. Never "You are welcome to inspect it"
  on its own, and never a choice between two routes.
```

Add to the Instead-of table, after the `Let us know if you have any questions` row:

```
| Thank you for your message / Thank you for your enquiry | (nothing: name what they gave us) |
```

Append to the "Mirror the customer, never below professional" paragraph:

```
A lead form's fields and the engine's auto-reply are the customer's words: never ask for them again
(photos already sent, a year range or budget on the form, a time they named) and never read them
back to them (the price, kilometres and inclusions they have just been given).
```

- [ ] **Step 4: Edit the prompt and the import ask plan**

`src/prompt.js:463`: replace `"- one or two short sentences that answer what the customer asked, then one sentence that offers the next step named under THIS CUSTOMER'S NEXT STEP, in words. Under 70 words in all."` with `"- one or two short sentences: the first names what this customer gave us (their question, their figure, their car, their situation) and answers it, then one sentence that offers the next step named under THIS CUSTOMER'S NEXT STEP, in words. Under 70 words in all."`

`src/imports.js` askPlan: after the line `- ask for the details listed above, in one sentence;` add, only when `w.given.length`: `` `- They have already told us: ${wantedLine(w)}. Do not ask for those again, and do not read them back.` ``.

- [ ] **Step 5: Let a figure be named as the customer's own**

In `src/checks.js` add, above `figureProblems`:

```js
/** A sentence that names a figure as the customer's own ("your offer of $15,000", "hoping for $30,000"), not as ours. */
export const OWNED_BY_CUSTOMER = /\b(your (offer|budget|figure|proposal|limit|max(imum)?|price)|(offer|budget|figure) of|you (mentioned|offered|proposed|suggested|named|have|are offering|can do|hoped|were hoping)|hoping (for|to get))\b/i;
/** Beside the customer's figure these mean we took it: still refused. */
const TAKES_FIGURE = /\b(accept\w*|agree\w*|a deal|deal\b|done|match\w*|meet\w*|confirm\w*|take it|we can do|can do that)\b/i;
```

In `figureProblems`, where `fromCustomer.has(n)` pushes to `customerOnly`, first find the sentence holding the figure (as the `policy` branch does with `bodySentences`); if `OWNED_BY_CUSTOMER.test(sentence) && !TAKES_FIGURE.test(sentence)`, `continue` without pushing. No other change to the check.

- [ ] **Step 6: Run the tests**

Run: `npm.cmd test`
Expected: all green. If a test asserted the old voice sentence or the old standardPlan line, update its expectation to the new wording.

- [ ] **Step 7: Commit**

```bash
git add voice/house-voice.md src/prompt.js src/imports.js src/checks.js test/selling.test.js test/imports.test.js
git commit -m "Tone: the first sentence names what the person gave us, and a figure may be named as theirs"
```

---

### Task 3: A bare figure is an offer, and the Marketplace shape is checked (brief change 2)

**Files:**
- Modify: `src/text.js:46-59` (`isAcknowledgement`), `src/situations.js:13-19` (`price_negotiation`), `src/prompt.js:31-47` (`MARKETPLACE_RULES`, the Price bullet), `src/checks.js:34` (`SECTION_RULES`) and `:279-315` (style checks), `src/drafter.js:252-253` (beside `listingPriceCheck`)
- Test: `test/quality.test.js`, `test/core.test.js`, `test/selling.test.js`, `test/marketplace.test.js`

**Interfaces:**
- Produces: check codes `opener` and `unasked-link` (both `warn`, both in `SECTION_RULES`); `MONEY_LIKE` (not exported) in `src/text.js`.

- [ ] **Step 1: Write the failing tests**

`test/quality.test.js`, in the test `happy noises and laughter need no reply…`: add to the false list `'15k'`, `'$17000'`, `'I have15000k'`, `'24 will do'`, `'17,500'`, `'Hi would u consider 17k'`; add to the true list `'ok see you at 10'`, `'ok 10:30 works'`, `'k'`.

`test/core.test.js`, beside the `classify` tests (line ~255): `for (const t of ['15k', '$17000', 'I have15000k', '24 will do', '17,500', 'I have 15000']) assert.ok(classify(t).all.includes('price_negotiation'), t);` and `for (const t of ['2017 model', '22', 'see you at 1030', 'Rego 4 months']) assert.ok(!classify(t).all.includes('price_negotiation'), t);`

`test/selling.test.js`, new test `on Marketplace an opening thank-you and an unasked link are pointed out`:
```js
const run = (body, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X.', channel: 'marketplace', inConversation: true, ...extra }).map((c) => `${c.level}:${c.code}`);
assert.ok(run('Thank you for your message. Yes, it is available.').includes('warn:opener'));
assert.ok(run('Thank you for your enquiry, {{NAME}}. Yes.').includes('warn:opener'));
assert.ok(!run('Thank you for your offer. The lowest we can do on the Noah is [PRICE?].').includes('warn:opener'), 'an offer is something they gave');
assert.ok(!run('Yes, it is available.').includes('warn:opener'));
assert.ok(!checks.checkDraft({ reply: 'Thank you for your message.', body: 'Thank you for your message.', channel: 'sms' }).some((c) => c.code === 'opener'), 'SMS keeps its own rules');
assert.ok(run('Thank you for your message. Yes.', { instructed: true }).every((c) => c.code !== 'opener'), 'a Prompt sets it aside');
```

`test/marketplace.test.js`, new test `an unasked "More details" link is pointed out, and a link the buyer asked for is not`: with chat 502 (the buyer asked "Is this still available?"), script the AI to answer `Yes, it is still available.\nMore details:\n${url}` and assert the draft's checks include `{ level: 'warn', code: 'unasked-link' }`; add a chat whose buyer wrote "Can you send me the link to the photos?" and assert no `unasked-link`. (Use the file's `row`/`message`/`seed` helpers and the `/api/items/mp:…/draft` route the existing tests use.)

`test/selling.test.js` (prompt rules): `assert.match(promptModule.systemPrompt('marketplace'), /A bare figure \("15k", "\$17000", "24 will do", "I have15000k"\) is an offer/);`

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test test/quality.test.js test/core.test.js test/selling.test.js test/marketplace.test.js`
Expected: the new assertions fail (`isAcknowledgement('15k')` is true today because "k" is an ack word).

- [ ] **Step 3: `isAcknowledgement` refuses money**

In `src/text.js` add `const MONEY_LIKE = /\$\s?\d|\b\d+(?:[.,]\d+)?\s?k\b|\b\d{1,3},\d{3}\b|\b\d{4,6}\b(?!\s?(am|pm|:))|\b\d{1,3}\s+(will do|is my (max|limit|best|offer)|tops|max|cash|ono|neg)\b/i;` and in `isAcknowledgement`, after the `?` test: `if (MONEY_LIKE.test(raw)) return false;`.

- [ ] **Step 4: `price_negotiation` reads a bare figure**

In `src/situations.js` append to the `price_negotiation` regex alternatives for: a message that is only a figure (`(^|\n)\s*\$?\d{1,3}(\.\d)?\s?k\s*\??\s*($|\n)`, `(^|\n)\s*\$\s?\d{3,6}\s*($|\n)`, `(^|\n)\s*\d{2},\d{3}\s*($|\n)`, `(^|\n)\s*\d{4,6}\s*($|\n)`), and "I have …" with a figure (`\bi have\s?\$?\d{1,3}(\.\d)?\s?k\b`, `\bi have\s?\$?\d{4,6}\b`). A bare two-digit number and a four-digit year followed by a word are not offers (the tests in Step 1 pin both).

- [ ] **Step 5: The Price bullet and the two checks**

`src/prompt.js` `MARKETPLACE_RULES`, Price bullet: after `On a price question or an offer, write the team's shape with the blank:` insert `A bare figure ("15k", "$17000", "24 will do", "I have15000k") is an offer. Thank them for it in a few words, then the blank first:`.

`src/checks.js`: add `'opener'` and `'unasked-link'` to `SECTION_RULES`. In `checkDraft`, in the `channel === 'marketplace'` branch of the length check (line 284), also: `if (/^\s*thank(s| you) for (your|the) (message|enquiry|inquiry|interest)\b/i.test(body)) add('warn', 'opener', 'Opens on a thank-you for the message. On Marketplace the first line is the answer, or names what they gave us (their offer, their number, a time).');`

`src/drafter.js`: add `function unaskedLinkCheck(item, body)` beside `listingPriceCheck`: returns `{ level: 'warn', code: 'unasked-link', tokens: [], message: "The buyer did not ask for details, photos or a link: leave the car's page link out and end on the next step." }` when the buyer's pending text does not match `/\b(details?|photos?|pics?|pictures?|images?|link|url|info|information|specs?|listing|page|website)\b/i` and the body has a line that is only `More details:` or the vehicle page link (untagged, without `#`); else `null`. Call it in `assessReply` where `listingPriceCheck` is called, for chats only.

- [ ] **Step 6: Run the tests, then the whole suite**

Run: `npm.cmd test`
Expected: green. (If an existing Marketplace test scripts a reply with `More details:` for a buyer who did not ask, it now carries a `warn`; tests that assert `fails(d)` are unaffected since the level is `warn`.)

- [ ] **Step 7: Commit**

```bash
git add src/text.js src/situations.js src/prompt.js src/checks.js src/drafter.js test/quality.test.js test/core.test.js test/selling.test.js test/marketplace.test.js
git commit -m "Marketplace: a bare figure is an offer, and an opening thank-you or an unasked link is pointed out"
```

---

### Task 4: The deposit is gated on the buyer, not the occasion (brief change 3)

**Files:**
- Modify: `src/selling.js:255-285` (signals and `told`), `:116-181` (`MOVES.propose_deposit`, `confirm_step`, `ask_trade_in_details`), `:340-362` (`stageLines`)
- Modify: `src/checks.js:328` (the `urgency` warn message) and the style checks (new `deposit-early` warn)
- Modify: `src/text.js:13-15` (`isReaction`)
- Modify: `voice/sales-playbook.md:18-19`, `:36`, `:162-173`
- Test: `test/selling.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SEEN_WORDS`, `DEPOSIT_MENTION`, `LICENCE_ASK`, `AGREES_DEPOSIT` (exported from `src/selling.js`); `stage.told.depositAgreed: boolean`; `stage.signals` no longer contains `'booked an inspection or test drive'` or `'applied for finance'`; new signal strings `'they have seen the car'` and `'the visit we arranged has taken place and they wrote again'`; check code `deposit-early` (`warn`).

- [ ] **Step 1: Write the failing tests**

In `test/selling.test.js`:

Update the test `where the customer is…`: the `arranged` case (we said "See you Saturday at 10." an hour ago, they wrote again) now expects `assert.notEqual(arranged.rung, 'commit', 'a visit not yet taken is not a commitment')`; the `booked` case now expects `assert.deepEqual([booked.rung, booked.move, booked.allowsUrgency], ['interest', 'confirm_or_link', false])`.

Add:

```js
test('the deposit waits for the buyer: a booking, a finance application or a visit still to come is not a commitment; seeing the car, holding it or accepting the figure is', () => {
  const finance = stage({ vehicles: car, situations: ['finance'], events: ['Customer submitted a finance application through the website.'] });
  assert.notEqual(finance.rung, 'commit'); assert.equal(finance.allowsUrgency, false);
  const seen = stage({ vehicles: car, texts: [{ who: 'customer', text: 'Thanks for the test drive yesterday, does it come with two keys?' }] });
  assert.deepEqual([seen.rung, seen.move], ['commit', 'propose_deposit']);
  assert.ok(seen.signals.includes('they have seen the car'), seen.signals.join('; '));
  const video = stage({ vehicles: car, texts: [{ who: 'customer', text: 'I watched the walkaround video, looks good' }] });
  assert.equal(video.rung, 'commit');
  const past = selling.saleStage(plain({ vehicles: car, texts: [{ who: 'customer', text: 'Can I come Saturday at 10?' }, { who: 'us', text: 'See you Saturday at 10.' }, { who: 'customer', text: 'Great car. Does it have a tow bar?' }] }), { now: now + 9 * DAY });
  assert.ok(past.signals.includes('the visit we arranged has taken place and they wrote again'), past.signals.join('; '));
  assert.equal(past.rung, 'commit');
  assert.equal(stage({ vehicles: car, situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it for me until Saturday?' }] }).move, 'propose_deposit');
  assert.equal(stage({ vehicles: car, situations: ['deposit_hold'], events: ['Customer started the online purchase steps on the website.'] }).rung, 'commit');
});

test('the licence and email are asked for only once they say yes to the deposit', () => {
  const proposed = [{ who: 'customer', text: 'Can you hold it?' }, { who: 'us', text: 'A $1,000 refundable holding deposit takes it off the market for you.' }];
  const yes = stage({ vehicles: car, situations: ['deposit_hold'], texts: [...proposed, { who: 'customer', text: "Yes let's do it, how do I pay?" }] });
  assert.deepEqual([yes.move, yes.told.deposit, yes.told.depositAgreed], ['confirm_step', true, true]);
  assert.match(selling.stageLines(yes).join('\n'), /ask for a photo of their driver licence and their email address/);
  const notYet = stage({ vehicles: car, situations: ['deposit_hold'], texts: [...proposed, { who: 'customer', text: 'Is the deposit refundable?' }] });
  assert.equal(notYet.told.depositAgreed, false);
  assert.match(selling.stageLines(notYet).join('\n'), /do not ask for their licence or email/);
  assert.doesNotMatch(selling.MOVES.propose_deposit.text, /licen[cs]e/);
  assert.match(selling.MOVES.ask_trade_in_details.text, /No deposit is proposed with a trade-in figure/);
});

test('a deposit, a licence ask or "remains for sale" before the buyer is there is pointed out', () => {
  const run = (body, stage) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X.', stage, situation: { all: ['general'] } }).map((c) => `${c.level}:${c.code}`);
  const interest = { rung: 'interest', move: 'confirm_or_link', allowsUrgency: false, aim: 'x', told: { deposit: false, depositAgreed: false } };
  const early = run('Yes, 9:00 am suits well. To take the vehicle off the market while you decide, we suggest securing it with a $1,000 refundable holding deposit. Until a deposit is paid, the vehicle remains for sale.', interest);
  assert.ok(early.includes('warn:deposit-early') && early.includes('warn:urgency'), early.join(' '));
  assert.ok(run('To proceed with the invoice, please send through a photo of your driver licence and your email address.', interest).includes('warn:deposit-early'));
  const agreed = { rung: 'commit', move: 'confirm_step', allowsUrgency: false, aim: 'x', told: { deposit: true, depositAgreed: true } };
  assert.ok(!run('Please send through a photo of your driver licence and your email address, and we will email the invoice.', agreed).includes('warn:deposit-early'));
  const commit = { rung: 'commit', move: 'propose_deposit', allowsUrgency: true, aim: 'x', told: { deposit: false, depositAgreed: false } };
  assert.ok(!run('A $1,000 refundable holding deposit takes the Noah off the market for you.', commit).includes('warn:deposit-early'));
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'A $1,000 refundable holding deposit takes it off the market.', stage: interest, instructed: true }).some((c) => c.code === 'deposit-early'), 'a Prompt sets it aside');
});
```

In `test/quality.test.js` (the acknowledgement test): `assert.equal(text.isReaction("👍 to ' We register the vehicle when the deposit is paid. '"), true);` and `assert.equal(text.isReaction('👍 see you tomorrow'), false);`

Also assert in a voice test: `assert.match(promptModule.systemPrompt('sms'), /A booking confirmation, a finance application, a thumbs-up or a deferral is not the moment/);`

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test test/selling.test.js test/quality.test.js`
Expected: the new and updated assertions fail.

- [ ] **Step 3: The signals**

In `src/selling.js` add, beside `CANNOT_COME`:

```js
/** The customer says they have seen or driven the car, or watched its video. */
export const SEEN_WORDS = /\b(saw it|seen it|inspected it|test[\s-]?drove|test[\s-]?drive (yesterday|today|the other day|last|on)|drove it|had a look at it|looked at it (yesterday|today|on|last)|came (in|down|by|past) (yesterday|today|on|last)|visited (yesterday|today|on|last)|after (the|my|our) (inspection|visit|test[\s-]?drive)|thanks for (showing|the test[\s-]?drive|your time (yesterday|today|the other day))|(watched|seen) the (walkaround |video|walkaround))\b/i;
/** A deposit proposed in a reply. */
export const DEPOSIT_MENTION = /\$1,000 (refundable )?(holding )?deposit|\bholding deposit\b|\b(secur|reserv)\w* (it|the \w+( \w+)?) with a deposit\b/i;
/** The licence photo and email address asked for. */
export const LICENCE_ASK = /\b(driver'?s? licen[cs]e|licen[cs]e photo|photo of your licen[cs]e)\b/i;
/** Yes to the deposit we proposed. */
export const AGREES_DEPOSIT = /\b(yes|ok(ay)?|sure|let'?s do (it|that)|i can do that|go ahead|sounds good|happy to|i'?ll (pay|put|place|send|transfer) (the |a )?deposit|how do i pay|send (me |through )?the invoice|(bank|account) details|where do i pay)\b/i;
```

In `saleStage`:
- Remove the two `signals.push` lines for `booked (an inspection|a test drive)` and `finance application`. Keep `online purchase steps` and `asked to hold or secure it`.
- Replace the `arranged` block: find the last recent `see you` of ours as now; the signal `'the visit we arranged has taken place and they wrote again'` is pushed only when the customer wrote after it without `DECLINED`/`CANNOT_COME` **and** the visit has passed: the latest date `dayRefs(ourText, ourAt, { loose: true })` gives (import `dayRefs` from `./promises.js`) is before `sydneyDay(now)` (import from `./time.js`), or no date is readable and `now - ourAt > DAY`.
- Push `'they have seen the car'` when a recent customer text matches `SEEN_WORDS`.
- `told.depositAgreed`: `told.deposit && AGREES_DEPOSIT.test(item.pendingText || '') && !PRICE_OBJECTION.test(item.pendingText || '')`.

`allowsUrgency` stays `rung === 'commit' && !told.deposit`.

- [ ] **Step 4: The moves and the lines**

`MOVES.propose_deposit.text` → `'Propose the $1,000 refundable holding deposit as the next step: it takes the car off the market for them; it is refundable if they do not go ahead after inspecting it, or if their finance is not approved; registration and preparation start once it is paid. Two or three short sentences. Do not ask for their driver licence or email address yet: that comes once they say yes.'`

`MOVES.confirm_step.text` → `'The deposit has already been proposed. Answer, and confirm the step they are on without proposing it again.'` and in `stageLines`, after the `told.deposit` line: `if (stage.told.deposit) L.push(stage.told.depositAgreed ? 'They have said yes to the deposit: ask for a photo of their driver licence and their email address, so the invoice can be sent.' : 'They have not yet said yes to the deposit: do not ask for their licence or email.');`

`MOVES.ask_trade_in_details.text`: append `' No deposit is proposed with a trade-in figure.'`

- [ ] **Step 5: The checks and the reaction**

`src/checks.js`: change the `urgency` warn message at line 328 to `'Says the deposit takes the car off the market. Say this only once the customer has accepted our figure, asked to hold the car, or seen it and is ready to commit.'`. Add, after it:

```js
if (stage && !instructed && !['commit', 'buyer'].includes(stage.rung) && !situation?.all?.includes('deposit_hold') && !situation?.all?.includes('after_sale')) {
  const early = String(body).match(DEPOSIT_MENTION);
  if (early) add('warn', 'deposit-early', 'Proposes the deposit before the customer has accepted the figure, asked to hold the car or seen it. Answer, and offer the next step instead.', [early[0]]);
}
if (stage && !instructed && stage.rung !== 'buyer' && !stage.told?.depositAgreed) {
  const licence = String(body).match(LICENCE_ASK);
  if (licence) add('warn', 'deposit-early', 'Asks for a driver licence or email address before the customer has said yes to the deposit.', [licence[0]]);
}
```

(import `DEPOSIT_MENTION`, `LICENCE_ASK` from `./selling.js`; add `'deposit-early'` to `SECTION_RULES`.)

`src/text.js` `isReaction`: also true for `/^\s*[\p{Extended_Pictographic}]+\s*(to|on)\s+['"‘“]/u`.

- [ ] **Step 6: The playbook**

`voice/sales-playbook.md`:
- Line 18–19 (rung 4) → `4. Commitment: the holding deposit, the online purchase steps, delivery arranged. A booking or a finance application shows interest, not commitment: no deposit is proposed on them.`
- Row 36 → `| Interest is clear and the price is agreed: they have seen the car, asked to hold it, started the online purchase steps, or accepted our figure | The $1,000 refundable holding deposit: what it does, that it is refundable, and what follows in two short steps. The photo of their driver licence and their email address are asked for only once they say yes to the deposit, never as the tail of another answer. The one true urgency lives here: until a deposit is paid, the vehicle remains for sale. If we have already proposed it, confirm the step they are on and do not propose it again. |`
- "Holding the car" first paragraph: replace `Once interest is clear (an inspection booked or done, the online inspection done, a request to hold the car), propose` with `Once interest is clear (they have seen the car in person or by video, asked to hold it, started the online purchase steps, or accepted our figure), propose`; replace `to send the invoice we need a photo of their driver licence and their email address;` with `once they say yes, we ask for a photo of their driver licence and their email address for the invoice;`. Add a second paragraph: `A booking confirmation, a finance application, a thumbs-up or a deferral is not the moment: answer, and leave the deposit for when they are there.`

- [ ] **Step 7: Run the tests, then the suite**

Run: `npm.cmd test`
Expected: green. Tests in `test/selling.test.js:100-105` (`later` case) and `test/scenarios.test.js` that relied on `booked` → commit need their expectations updated as in Step 1.

- [ ] **Step 8: Commit**

```bash
git add src/selling.js src/checks.js src/text.js voice/sales-playbook.md test/selling.test.js test/quality.test.js
git commit -m "Selling: the deposit waits for the buyer, and the licence is asked for only after a yes"
```

---

### Task 5: A deferral is answered like a no (brief change 4)

**Files:**
- Modify: `src/selling.js` (`DEFERRED`, `MOVES.accept_deferral`, `QUIET_MOVES`, `saleStage`), `src/checks.js` (`quiet-close` warn), `voice/sales-playbook.md:38` (new row) and `:184-187`, `voice/house-voice.md:117-123`
- Test: `test/selling.test.js`

**Interfaces:**
- Consumes: Task 4's `DEPOSIT_MENTION`, `LICENCE_ASK`.
- Produces: `DEFERRED` (exported regex); move `accept_deferral` (in `QUIET_MOVES`); check code `quiet-close` (`warn`, in `SECTION_RULES`).

- [ ] **Step 1: Write the failing tests**

```js
test('a deferral is answered like a no: accepted in a line, nothing sold', () => {
  for (const text of ["I'll let you know in the next couple of days", "It's ok I can come another time", 'I am not coming today, stuck at work', "Leave it with me, I'll chat with my partner", 'Need to think about it']) {
    const s = stage({ vehicles: car, texts: [...visitSet, { who: 'customer', text }] });
    assert.deepEqual([s.move, s.question, s.allowsUrgency], ['accept_deferral', '', false], text);
    assert.notEqual(s.rung, 'commit', text);
    assert.match(selling.stageLines(s).join('\n'), /offer no next step/i, text);
  }
  const asked = stage({ vehicles: car, situations: ['vehicle_details'], texts: [{ who: 'customer', text: "I'll let you know. Does it have a tow bar?" }] });
  assert.equal(asked.move, 'accept_deferral');
  assert.match(asked.moveText, /Answer anything they asked/);
  const buyer = stage({ situations: ['after_sale'], deal: { source: 'lead_status' }, texts: [{ who: 'customer', text: 'Leave it with me, I will chat with my partner about the balance.' }] });
  assert.equal(buyer.move, 'after_sale_step', 'a buyer after the sale keeps the after-sale move');
  assert.equal(stage({ vehicles: car, texts: [{ who: 'customer', text: "Thanks but I've found another car, I'll pass." }] }).move, 'accept_no', 'a no is still a no');
  assert.ok(selling.QUIET_MOVES.has('accept_deferral'));
});

test('a deposit, a link or a blank in a polite close is pointed out', () => {
  const run = (body, stage) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X. https://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300#inspection=onsite', stage, situation: { all: ['general'] } }).map((c) => `${c.level}:${c.code}`);
  const deferral = { rung: 'interest', move: 'accept_deferral', allowsUrgency: false, aim: 'x', told: { deposit: false, depositAgreed: false } };
  const r = run('That is completely fine. Until a deposit is paid the Noah remains for sale, so we suggest securing it with a $1,000 refundable holding deposit.', deferral);
  assert.ok(r.includes('warn:quiet-close') && r.includes('warn:urgency'), r.join(' '));
  assert.ok(run('Certainly. You can book here:\nhttps://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300#inspection=onsite', deferral).includes('warn:quiet-close'));
  const fine = run('Thank you for letting us know. The Noah remains available at our Lidcombe showroom.', deferral);
  assert.ok(!fine.includes('warn:quiet-close') && !fine.includes('warn:next-step'), fine.join(' '));
  const parting = { rung: 'fit', move: 'part_well', allowsUrgency: false, aim: 'x', told: { deposit: false, depositAgreed: false } };
  assert.ok(run('Thank you for the offer. Our best price is [PRICE?].', parting).includes('warn:quiet-close'), 'a buyer leaving over the price is not quoted');
  assert.ok(!run('Thank you for the offer, and all the best with your search.', parting).includes('warn:quiet-close'));
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'A $1,000 holding deposit secures it.', stage: deferral, instructed: true }).some((c) => c.code === 'quiet-close'));
});
```

Also, in the voice test: `assert.match(promptModule.systemPrompt('sms'), /They have deferred \(a later day, a "not today", an "I'll let you know"\)/);`

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test test/selling.test.js`
Expected: fail (`accept_deferral` does not exist).

- [ ] **Step 3: The move**

In `src/selling.js` add, beside `CANNOT_COME`:

```js
/** They have put it off: a later day, a "not today", an "I'll let you know". Not a no, not a commitment. */
export const DEFERRED = /\b(i'?ll|i will|we'?ll|we will|let me|(i |we )?need to|(i|we) have to|i'?d like to|i want to) (let you know|get back to you|be in touch|think about it|have a think|think it over|think on it|come back to you|decide|discuss|talk (to|with)|speak (to|with)|chat (to|with)|sleep on it|check with)\b|\b(not (coming|today|this week|right now|yet|ready)|can'?t (come|make it|do) today|another (time|day)|some other (time|day)|next (week|month|time)|later (in the|this) (week|month)|still (deciding|thinking)|need (some |more |a bit of )?time|maybe later|hold off|leave it with me|in (the next )?(couple|few) (of )?(days|weeks))\b/i;
```

`MOVES.accept_deferral = { text: "They have put it off: a later day, a 'not today', or an 'I'll let you know'. Answer anything they asked in a sentence (with its blank where a person decides), then one sentence that accepts the wait, with the availability fact when it is true (the vehicle remains available at our Lidcombe showroom), and stop. No deposit, no licence or email, no 'remains for sale', no second question, no link.", question: '' }`. Add `'accept_deferral'` to `QUIET_MOVES`.

In `saleStage`: `const deferred = !item.deal && !declined && !parting && (DEFERRED.test(item.pendingText || '') || CANNOT_COME.test(item.pendingText || ''));` The rung: `commit` requires `!deferred`. The move: after `part_well` and before `gone`: `else if (deferred) move = 'accept_deferral';`.

- [ ] **Step 4: The check**

In `src/checks.js`, after the `deposit-early` block:

```js
if (stage && !instructed && QUIET_MOVES.has(stage.move)) {
  const sold = String(body).match(DEPOSIT_MENTION) || String(body).match(LICENCE_ASK);
  if (sold) add('warn', 'quiet-close', `"${sold[0]}": they are leaving or waiting. Thank them, and sell nothing more.`, [sold[0]]);
  if (findUrls(body).length) add('warn', 'quiet-close', 'A link in a polite close. They are leaving or waiting: thank them and stop.', findUrls(body));
  if (stage.move === 'part_well' && markers.length) add('warn', 'quiet-close', 'A buyer leaving over the price is thanked, not quoted: no blank.', markers);
}
```

Add `'quiet-close'` to `SECTION_RULES`.

- [ ] **Step 5: The playbook and the voice**

`voice/sales-playbook.md`: after the row `| They have said no | …` add `| They have deferred (a later day, a "not today", an "I'll let you know") | Anything they asked is answered first. Then one sentence that accepts it, the availability fact if it is true, and stop. No deposit, no licence, no "remains for sale", no second question. |`. In "Accepting a no", append: `A deferral ("I'll let you know", "not today", "another time") is accepted the same way: one sentence, the car remains available, and stop.`

`voice/house-voice.md` "Saying no, and accepting a no": add a bullet `- When the customer puts it off ("I'll let you know", "not today", "another time"), accept it in one sentence and stop: nothing is sold to someone who has asked for time.`

- [ ] **Step 6: Run the suite**

Run: `npm.cmd test`
Expected: green. `test/selling.test.js:100-105` (`later`: "It's ok I can come another time") now has `move === 'accept_deferral'`; update that assertion.

- [ ] **Step 7: Commit**

```bash
git add src/selling.js src/checks.js voice/sales-playbook.md voice/house-voice.md test/selling.test.js
git commit -m "Selling: a deferral is accepted like a no, and a polite close that still sells is pointed out"
```

---

### Task 6: The inspection invitation is not added over a settled step (brief change 5, invitation)

**Files:**
- Modify: `src/checks.js` (export `CONFIRMS_TIME`, `NAMED_TIME`), `src/drafter.js:64-81` (`inspectionCheck`), `:185-187` (`confirmedTime`, `invite`), `:196` (`tidyOpening` call), `src/prompt.js:294-381` (`inspectionPlan`: a booked event)
- Test: `test/scenarios.test.js`, `test/inspection.test.js`

**Interfaces:**
- Produces: `confirmsTime(body: string): boolean` (exported from `src/checks.js`): true when the reply confirms a visit at a time, so no invitation is added under it and no link is missing; `inspectionPlan` returns `{ …none, booked: true, lines: […] }` when the pending events include a booking.

- [ ] **Step 1: Write the failing tests**

`test/scenarios.test.js`, extend the test at line 939 (`a later request to see the car…`):

```js
// The AI wrote the page link itself: the line goes, the invitation is added once.
const doubled = await draft(262, `Yes, Saturday is fine to inspect the Noah at Lidcombe.\nYou can arrange the inspection here:\n${NOAH}`);
assert.equal((doubled.d.reply.match(/#inspection=onsite/g) || []).length, 1, doubled.d.reply);
assert.ok(!doubled.d.reply.includes(`${NOAH}\n`), 'the bare page link line is dropped');
// They named a time and the AI confirmed it in words: no invitation under it.
msg(262, 'IN', 'Is it ok to visit tomorrow around 9 am?', 2 * MIN);
const timed = await draft(262, 'Yes, tomorrow at 9:00 am suits well. We will have the Noah ready for you.');
assert.ok(!timed.d.reply.includes('book an inspection'), timed.d.reply);
assert.deepEqual(fails(timed.d), [], JSON.stringify(timed.d.checks));
```

New test `a booking made on the website is confirmed in words, with no invitation under it`: a lead whose pending event is a booking (an inquiry that `readInquiry` turns into `Customer booked an inspection through the website: …` with a day and time; see `test/core.test.js` around line 150–170 for the inquiry shape, and `test/inspection.test.js` for how an item with an event is built). Assert: the request (`ask(id)`) contains `has booked an inspection through the website`; the reply to `Your inspection of the Noah is booked for Wednesday 21 October at 2:00 pm.` carries no `book an inspection here` and no `inspection-link` fail.

`test/inspection.test.js`: `a customer who names a day but no time still gets the invitation`: "Can I come Saturday?" → the reply carries the booking link once (existing test at line 54 may already cover; if so, assert the count is 1).

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test test/scenarios.test.js test/inspection.test.js`
Expected: `doubled` fails (two `#inspection=onsite`); `timed` fails (the invitation is added since "suits well" is not recognised); the booking test fails.

- [ ] **Step 3: One definition of a confirmed time**

In `src/checks.js` export `confirmsTime(body)`, built from three regexes kept beside it:
- `CONFIRMS`: `/\bsee you\b|\bready for you\b|look forward to seeing you|\bcome straight in\b|\b(booked|confirmed) for\b|\bwe (will|'ll) have (it|the \w+( \w+)?) (ready|out)\b/i` (strong on its own);
- `AGREES`: `/\b(is|are|would be|sounds) (fine|good|great|perfect|no problem)\b|\bsuits? (us|well|fine|perfectly)\b/i` (counts only beside a clock time: "Saturday is fine" on its own is a day agreed, not a time confirmed, and the customer still needs the link to pick a time);
- `CLOCK`: `/\b\d{1,2}([:.]\d{2})?\s?(am|pm)\b|\b\d{1,2}[:.]\d{2}\b/i`.

`confirmsTime(body) = CONFIRMS.test(body) || (AGREES.test(body) && CLOCK.test(body))`.

`src/drafter.js`: `confirmedTime = confirmsTime(text)`; in `inspectionCheck` replace `/see you/i.test(body)` with `confirmsTime(body)`.

- [ ] **Step 4: No invitation over a settled step**

`src/drafter.js` `invite`: also require `!prompt.inspection.booked`. (A customer who named a time that the AI did not confirm still gets the block: the link is then the step, and the prompt's INSPECTION lines already ask the AI to confirm a named time.)

`tidyOpening` call: add the vehicle page link when a block of ours follows: `(invite || price) ? (item.vehicles[0]?.url || '') : ''` as one more argument.

`src/prompt.js` `inspectionPlan`: before `asksNow`, `const bookedNow = (item.events || []).some((e) => /booked (an inspection|a test drive)/i.test(e));` and when true return `{ ...none, booked: true, lines: ['The customer has booked an inspection through the website (the booking, with its day and time, is in the conversation). Confirm it in one sentence and say the vehicle will be ready for them. No invitation or booking link is added under your text; do not ask for a date or time.'] }`.

- [ ] **Step 5: Run the suite**

Run: `npm.cmd test`
Expected: green (`test/scenarios.test.js:569` "a customer who asks to inspect tomorrow gets the invitation… whatever the AI typed" still passes: "tomorrow" is a day, not a time).

- [ ] **Step 6: Commit**

```bash
git add src/checks.js src/drafter.js src/prompt.js test/scenarios.test.js test/inspection.test.js
git commit -m "Inspection: no invitation under a confirmed time or a booking, and the link once"
```

---

### Task 7: The price reply only where it answers, with the inclusions this person asked about (brief change 5, price reply; change 9, lists)

**Files:**
- Modify: `src/prompt.js:391-413` (`pricePlan`), `src/pricereply.js:22-45` (`inclusionsSentence`) and `:69-77` (`priceBlock`), `src/drafter.js:184` (the `priceBlock` call), `voice/price-reply.md:1-13` (notes only)
- Test: `test/firstreply.test.js`, `test/selling.test.js`, `test/scenarios.test.js`

**Interfaces:**
- Produces: `inclusionsSentence(vehicle, { asked = '' } = {})`; `pickInclusions(items: string[], asked: string): string[]` (exported); `priceBlock({ …, asked = '' })`.

- [ ] **Step 1: Write the failing tests**

`test/firstreply.test.js`:

```js
test("the inclusions a price reply names are the ones this customer asked about, the full list when they named nothing", () => {
  const car = { outline: ['6 Months NSW Registration', '5-Year Extended Warranty', '1 Year Roadside Assistance', 'CTP Insurance', 'Fresh Roadworthy Certificate', 'Doorstep Delivery (Greater Sydney)', '3 Month Dealer Warranty'] };
  assert.equal(inclusionsSentence(car, { asked: 'Is that drive away?' }), '6 months NSW registration, CTP insurance and a fresh roadworthy certificate');
  assert.equal(inclusionsSentence(car, { asked: 'does the warranty cover the hybrid battery, it is an import' }), 'a 5-year extended warranty, 1 year roadside assistance and a 3-month dealer warranty');
  assert.equal(inclusionsSentence(car, { asked: 'rego and warranty included?' }), '6 months NSW registration, a 5-year extended warranty, 1 year roadside assistance, CTP insurance, a fresh roadworthy certificate and a 3-month dealer warranty');
  assert.equal(inclusionsSentence(car, { asked: 'best price?' }), inclusionsSentence(car), 'nothing named: the full list');
  assert.equal(inclusionsSentence({ outline: ['Doorstep Delivery (Greater Sydney)'] }, { asked: 'drive away?' }), 'Greater Sydney delivery', 'nothing matches: the full list, never an empty sentence');
  assert.ok(priceBlock({ vehicle: car, inspectionUrl: '', asked: 'Is that drive away?' }).startsWith('The price includes 6 months NSW registration, CTP insurance and a fresh roadworthy certificate. Government charges are extra.'));
});
```

`test/selling.test.js`, in the test at line 324 (`a buyer leaving over the price gets no price reply…`) add: an item with situations `['price_negotiation', 'trade_in']` ("I have an offer of $31,000 for my van from Carsales, is the Noah hybrid?") → `pricePlan(item, vehicle, { stage }).on === false`; an item whose stage move is `propose_deposit` (accepted figure) → off; and `assert.match(buildPrompt(priceItem).user, /names what this customer gave us/)` with `assert.doesNotMatch(…, /place the vehicle: that it is available for inspection at Lidcombe/)`. (`pricePlan` reads `item.situation.all`, `item.deal`, `item.channel`, `item.timeline`, `item.lead` and `vehicle.url`: give the `plain` helper's item a vehicle with `url: 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300'`, `price: 23900`, `soldStatus: 'UnSold'`, `stockIn: 'Online'`, `status: 'PUBLISHED'`.)

`test/scenarios.test.js:903`: keep the exact-reply assertion (the Vellfire's list is unchanged for "best price?"); add a draft for `'Is that drive away?'` on the same conversation and assert the reply's block starts `The price includes 6 months NSW registration, CTP insurance and a fresh roadworthy certificate.`

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test test/firstreply.test.js test/selling.test.js`
Expected: fail (`asked` is ignored today).

- [ ] **Step 3: Pick the inclusions**

In `src/pricereply.js`:

```js
const ASKS_ON_ROAD = /drive.?away|on.?road|\brego\b|registration|\bctp\b|roadworthy|blue slip|pink slip|stamp duty|government charges|transfer fee/i;
const ASKS_COVER = /warrant|\bimport|japan|reliab|cover|roadside|breakdown|mechanical/i;
/** The inclusions that answer what the customer asked; all of them when they asked about nothing in particular, or none of theirs is listed. */
export function pickInclusions(items, asked) { … }
```

`pickInclusions`: items matching `/registration|CTP|roadworthy/` when `ASKS_ON_ROAD` matches; items matching `/warranty|roadside/` when `ASKS_COVER` matches; both when both; the union keeps the owner's order (`items` order); when nothing was asked or the pick is empty, `items`. `inclusionsSentence(vehicle, { asked = '' } = {})` builds `out` as now and returns `list(pickInclusions(out, asked))`. `priceBlock` takes `asked` and passes it. `src/drafter.js:184` passes `asked: item.pendingText`.

- [ ] **Step 4: The price reply only where it answers**

In `pricePlan`, after the first `return off` line: `if (stage && stage.move !== 'invite_before_price') return off;` and `if (item.situation.all.includes('trade_in')) return off;`.

Replace the second line of `lines` (`'Write only the greeting, when one is due, and one or two sentences that answer anything else they asked and place the vehicle: …'`) with: `'Write only the greeting, when one is due, and one or two sentences whose first names what this customer gave us and answers it in their terms: their offer ("Thank you for your offer of $15,000": their figure may be named as theirs, ours never), their budget, or the question they asked. When the block\'s first line answers it (a "drive away" question), the greeting alone is enough. Never open on the car being available for inspection: the block invites them. Do not repeat the advertised price, do not name a figure of ours, and do not accept or refuse an offer. Do not write inclusions, a discount, an invitation or a link: the block says them.'`

`voice/price-reply.md` notes: change the `{inclusions}` note to say `built by code from that vehicle's own Included list, in this order and these words (…); when the customer's words ask about something in particular (drive away, rego, the warranty, an import), only the items that answer it; the full list otherwise`.

- [ ] **Step 5: Run the suite**

Run: `npm.cmd test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/prompt.js src/pricereply.js src/drafter.js voice/price-reply.md test/firstreply.test.js test/selling.test.js test/scenarios.test.js
git commit -m "Price reply: only where it answers, opening on what the customer gave, with the inclusions they asked about"
```

---

### Task 8: No address block on a spam, newsletter or audio-only message (brief change 5, address block)

**Files:**
- Modify: `src/items.js:255` (export `looksLikeNonCustomer`), `src/prompt.js:452-473` (`standardPlan`)
- Test: `test/scenarios.test.js`

**Interfaces:**
- Produces: `looksLikeNonCustomer(pending)` exported from `src/items.js`; `standardPlan` returns `{ on: false }` for a media-only (non-image) pending or a non-customer message.

- [ ] **Step 1: Write the failing test**

`test/scenarios.test.js`:

```js
test('a spam pitch, a newsletter or an audio clip gets no address block', async () => {
  lead(50, 270, 'Seo', '0421 000 050'); conv(270, 50, 'Seo Test', '+61421000050');
  msg(270, 'IN', 'Get High-Quality SEO Services to Boost Your Website Ranking. Reply STOP to unsubscribe.', 5 * MIN);
  assert.doesNotMatch(ask(270), /=== STANDARD FIRST REPLY ===/);
  const { d } = await draft(270, 'Hello {{NAME}},\nThank you, we do not need SEO services at this time.');
  assert.ok(!d.reply.includes('📍'), d.reply);
  lead(51, 271, 'Audio', '0421 000 051'); conv(271, 51, 'Audio Test', '+61421000051');
  msg(271, 'IN', '', 5 * MIN, { mediaType: 'audio' });
  assert.equal(item(271).state, 'awaiting');
  assert.doesNotMatch(ask(271), /=== STANDARD FIRST REPLY ===/);
  assert.match(ask(271), /sent an audio clip/);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test test/scenarios.test.js`
Expected: fails (the block is planned for both).

- [ ] **Step 3: Implement**

`src/items.js`: `export function looksLikeNonCustomer(pending)`. `src/prompt.js` `standardPlan`: return the off shape when `looksLikeNonCustomer(item.pending)` or when `item.pending.length && item.pending.every((e) => !e.text && e.media && !/image|photo|picture/i.test(e.media))`. In `buildPrompt`, after the SITUATION line, when the pending is media-only (same test) push: `'The customer sent an audio clip and no text. We cannot hear it here: say so courteously in one sentence and ask them to text what they need. No block is added under your text.'` (the wording "sent an audio clip" is what the test pins).

- [ ] **Step 4: Run the suite, commit**

Run: `npm.cmd test` → green.

```bash
git add src/items.js src/prompt.js test/scenarios.test.js
git commit -m "First reply: no address block on a spam, a newsletter or an audio clip"
```

---

### Task 9: No holding line beside a blank (brief change 6)

**Files:**
- Modify: `src/prompt.js:95`, `:100-101`, `:237`, `:251`; `voice/sales-playbook.md:242-245`; `src/checks.js` (move `HOLDING_LINE`/`PROCESS_LINE`/`BLANK_IN`/`sentencesOf` above `checkDraft`; two new warns)
- Test: `test/selling.test.js`, `test/scenarios.test.js`

**Interfaces:**
- Produces: check codes `holding-blank` and `two-deferrals` (`warn`, in `SECTION_RULES`).

- [ ] **Step 1: Write the failing tests**

`test/selling.test.js`:

```js
test('a holding line beside a blank, or two deferrals, is pointed out; a plain blank with a step is not', () => {
  const run = (body, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X.', ...extra }).map((c) => `${c.level}:${c.code}`);
  assert.ok(run('Regarding your offer, we will confirm whether that figure is possible: [PRICE?].').includes('warn:holding-blank'));
  assert.ok(run('We will check on the deposit and confirm with you shortly: [CHECK?].').includes('warn:holding-blank'));
  assert.ok(run('We will have our team review them and come back to you shortly with a trade-in value: [TRADE-IN VALUE?].').includes('warn:holding-blank'));
  assert.ok(!run('If you decide not to go ahead, the deposit is [CHECK?]. Let us know either way.').includes('warn:holding-blank'));
  assert.ok(!run('From those, the trade-in value we can offer is [TRADE-IN VALUE?]. If that works for you, let us know a time to see the Noah.').includes('warn:holding-blank'));
  assert.ok(run('We will check the progress on the registration [CHECK?]. We will confirm shortly so you can collect the vehicle.').includes('warn:two-deferrals'));
  assert.ok(!run('Before we bid, our team in Japan inspects the car. We will send the auction sheet once it is listed.').includes('warn:two-deferrals'), 'what we do as a process is not a deferral');
  assert.ok(!run('Thank you for letting us know. We are looking into this and will come back to you shortly.').includes('warn:two-deferrals'), 'the one complaint holding line stays');
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'We will check and confirm: [CHECK?].', instructed: true }).some((c) => c.code === 'holding-blank'));
  const voice = promptModule.systemPrompt('sms');
  assert.match(voice, /Never a holding line beside a blank/);
  assert.doesNotMatch(voice, /Otherwise write "We will check and come back to you shortly\."/);
  assert.match(voice, /After the sentence with its blank, one step the person can take now/);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test test/selling.test.js` → fails.

- [ ] **Step 3: The prompt and the playbook**

`src/prompt.js`:
- Line 101 (the non-email branch) → `'- Promise an action (sending, calling, booking, holding, fixing, delivering) only if our staff said we would, in the instruction for this draft or earlier in this conversation. Otherwise give the answer itself, or the sentence with its blank ([CHECK?], [PRICE?], [DATE?], [TRADE-IN VALUE?]) and the one step the customer can take now. Never a holding line beside a blank: no "we will check", "we will confirm" or "shortly" in the same sentence as a blank. At most one deferral in a reply, never two.'`
- Line 95: replace `If the reply depends on it, thank them and say we will take a look, and use [CHECK?].` with `If the reply depends on it, thank them and write the sentence with its blank for what the photo decides (a trade-in: "From those, the trade-in value we can offer is [TRADE-IN VALUE?]."), then the step they can take now.`
- Line 237: replace `say we will check, and use [CHECK?].` with `write the sentence with [CHECK?] for it ("Your registration is [CHECK?].").`
- Line 251: replace `Say we will check and send it, with [CHECK?] where a person has to find it,` with `Write the sentence with [CHECK?] where a person has to find it ("Your invoice is [CHECK?]."),`.

`voice/sales-playbook.md:242-245`: replace `say we will confirm it, with` with `write the sentence with` and append a paragraph: `After the sentence with its blank, one step the person can take now, from this channel's own moves: on Marketplace their number and a time; for a trade-in the rego, kilometres and photos; after a sale, "let us know either way". A blank is already the hand-over to a person: the words around it never say we will check, confirm or come back shortly.`

- [ ] **Step 4: The checks**

Move `HOLDING_LINE`, `PROCESS_LINE`, `BLANK_IN` and `sentencesOf` above `checkDraft` in `src/checks.js`. In `checkDraft`, after the `filler` check, for `channel !== 'email'` and `!instructed`:
- `holding-blank`: a sentence where `BLANK_IN` matches and (`HOLDING_LINE` or `/\bshortly\b/i`) matches and `PROCESS_LINE` does not → `add('warn', 'holding-blank', `"${match}" beside a blank. The blank is already the hand-over: write the answer with its blank, then the step the customer can take now.`, [match])`.
- `two-deferrals`: two or more sentences matching `HOLDING_LINE` and not `PROCESS_LINE` → `add('warn', 'two-deferrals', 'Two deferrals in one reply. Give the answer, or one sentence with its blank, and the step they can take now.')`.
Add both codes to `SECTION_RULES`.

- [ ] **Step 5: Run the suite**

Run: `npm.cmd test` → green. If `test/scenarios.test.js:66` (a buyer asking for a document) asserts the old line 251 wording in the request, update it to the new one.

- [ ] **Step 6: Commit**

```bash
git add src/prompt.js src/checks.js voice/sales-playbook.md test/selling.test.js test/scenarios.test.js
git commit -m "Promises: the answer with its blank and a step, never a holding line beside the blank"
```

---

### Task 10: Say the rule for the person, not the dealership (brief change 7)

**Files:**
- Modify: `voice/house-voice.md:37` (Register), `:108-115` (Bad news), `:117-123` (Saying no); `voice/sales-playbook.md:30` (finance row); `voice/auction-messages.md:44-82` (first_estimate)
- Test: `test/selling.test.js`, `test/orders.test.js`

- [ ] **Step 1: Write the failing tests**

`test/selling.test.js` (voice test):
```js
const v = promptModule.systemPrompt('sms');
assert.match(v, /Formal, addressed to the person, plain\./);
assert.doesNotMatch(v, /Formal, corporate, plain/);
assert.match(v, /A reply never opens on the dealership's reasons/);
assert.match(v, /say what this person can do instead, addressed to them and their car/);
assert.match(v, /the first sentence shows we heard it, and the figure still does not move/);
assert.match(v, /You were hoping for \$30,000 for your STI/);
assert.match(v, /"No softening" means the figure holds/);
assert.match(v, /say what the next step will show them/);
```

`test/orders.test.js`, in `every kind of message has its wording…` or beside it: `const fe = (await compose(501, 'first_estimate')).text; assert.ok(fe.indexOf('[DEPOSIT LINK?]') < fe.indexOf('Once the deposit is received'), 'the deposit step comes before the process'); assert.match(fe, /Your final landed figure will move a little with the winning bid, the exchange rate, shipping timing and the car's condition\./); assert.doesNotMatch(fe, /Please note the final landed price/); assert.match(fe, /We will not place a bid without your confirmation\./);`

- [ ] **Step 2: Run the tests to see them fail** → fail.

- [ ] **Step 3: The voice**

`voice/house-voice.md`:
- Line 37: `Formal, corporate, plain.` → `Formal, addressed to the person, plain.` and add a bullet after it: `- A reply never opens on the dealership's reasons ("As a dealership, we have to consider…"). The first sentence is about their car, their figure or their question; the rule, if it is still needed, comes after it in one line.`
- "Saying no" first bullet → `- When we cannot do what was asked (hold a car without a deposit, deliver for free, quote a price by text, meet a trade-in figure), say what this person can do instead, addressed to them and their car, with the figure or the step. When they have objected to a figure, the first sentence shows we heard it, and the figure still does not move. Never "we don't do that".`
- "Bad news": after the sold-car example add: `A refused trade-in figure: the fact is the figure that stands, the alternative is a step towards our car. "No softening" means the figure holds, not that the person's hope goes unmentioned.` and the example block:
```
    You were hoping for $30,000 for your STI. Our offer of $27,000 stands, subject to seeing it when
    you come in, and it goes straight towards the Crown, which you are welcome to inspect at our
    Lidcombe showroom.
```

`voice/sales-playbook.md:30` (finance row): append `Asked whether they will be approved, say what the next step will show them: the application starts with a soft check that does not affect their credit score, and our finance partner then contacts them. Never who decides, never a likelihood.`

- [ ] **Step 4: first_estimate (Jim's wording, from the brief)**

In `voice/auction-messages.md` first_estimate: move the paragraph `You can place the deposit using the link below:\n[DEPOSIT LINK?]` to directly after `The refundable auction deposit required to start bidding is {deposit_amount} AUD.`; replace `Please note the final landed price may change slightly depending on the actual winning auction price, exchange rate, shipping timing and vehicle condition.` with `Your final landed figure will move a little with the winning bid, the exchange rate, shipping timing and the car's condition.` and keep it as the last paragraph before `Regards,`. Keep `We will not place a bid without your confirmation.`

- [ ] **Step 5: Run the suite** → green (`test/templates.test.js:147` still finds its first_estimate lines).

- [ ] **Step 6: Commit**

```bash
git add voice/house-voice.md voice/sales-playbook.md voice/auction-messages.md test/selling.test.js test/orders.test.js
git commit -m "Voice: the rule said for the person, and the first estimate with its figures and step first"
```

---

### Task 11: The adjective ban becomes a rule, checked (brief change 8)

**Files:**
- Modify: `voice/house-voice.md:67-68`; `src/prompt.js:39` (`MARKETPLACE_RULES` "No hype" clause); `src/selling.js` (export `RATING`); `src/checks.js:22-30` (`BANNED` first row) and the style checks; `voice/auction-messages.md:104-121` (lots_coming)
- Test: `test/selling.test.js`, `test/core.test.js:349`, `test/orders.test.js`

**Interfaces:**
- Produces: `RATING` (exported regex); check code `rating` (`warn`, in `SECTION_RULES`). The `BANNED` marketing row is removed (its words are in `RATING`).

- [ ] **Step 1: Write the failing tests**

`test/selling.test.js`:
```js
test('a word that rates the car or the deal is pointed out; the grade scale and a variant name are not', () => {
  const run = (body) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 1995 Mitsubishi GTO. Odometer 18,052 km. Auction grade 4.5. Variant G Limited.' }).map((c) => `${c.level}:${c.code}`);
  for (const b of ['The GTO is an exceptional classic with only 18,052 km.', 'It is a superb luxury hybrid sedan.', 'An excellent 8-seater family van, so it is ready to drive away.', 'A rare 4WD classic.', 'The 5-year warranty is there for your peace of mind.', 'Remarkably efficient at 5.0 L/100 km.', 'What an amazing car.'])
    assert.ok(run(b).includes('warn:rating'), b);
  for (const b of ['Auction grade 4.5 is excellent with minor marks.', 'The G Limited has 18,052 km on the export certificate.', 'The price includes 6 months NSW registration.'])
    assert.ok(!run(b).includes('warn:rating'), b);
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'A superb car.', instructed: true }).some((c) => c.code === 'rating'));
  assert.match(promptModule.systemPrompt('sms'), /No adjective or adverb that rates the car or the deal/);
  assert.match(promptModule.systemPrompt('marketplace'), /Register under VOICE still applies here/);
});
```
`test/orders.test.js`: `const lc = (await compose(501, 'lots_coming')).text; assert.ok(!lc.includes('!'), lc); assert.match(lc, /Our inspection team in Japan inspects every vehicle before the final purchase\./); assert.doesNotMatch(lc, /experienced|carefully|detailed|Happy bidding/);`

- [ ] **Step 2: Run the tests to see them fail** → fail.

- [ ] **Step 3: The rule and the check**

`voice/house-voice.md:67-68` → `- No adjective or adverb that rates the car or the deal (amazing, stunning, incredible, unbeatable, perfect, excellent, exceptional, superb, rare, ideal, remarkably, great choice, don't miss out, hurry, limited), and no feeling hung on an inclusion ("for peace of mind", "so it is ready to drive away", "no surprises"). A fact is a figure with its unit; the one meaning you may add is what an inclusion saves the buyer doing ("the roadworthy is done, so there is nothing to arrange before registration").`

`src/prompt.js` `MARKETPLACE_RULES` line 39: replace `No hype (amazing, stunning, unbeatable, don't miss out), no pressure or other buyers` with `No adjective or adverb that rates the car or the deal (amazing, stunning, unbeatable, excellent, exceptional, superb, rare, ideal, remarkably, perfect), and no feeling hung on an inclusion ("peace of mind", "ready to drive away"): a fact is a figure with its unit. Register under VOICE still applies here. No pressure or other buyers`.

`src/selling.js`: `export const RATING = /\b(amazing|stunning|incredible|unbeatable|fantastic|awesome|outstanding|exceptional|superb|excellent|perfect|immaculate|pristine|gorgeous|beautiful|lovely|rare|ideal|remarkabl[ey]|great (choice|buy|value|car|deal)|don'?t miss (out|it)|hurry|limited (time|offer|stock|number)|peace of mind|no surprises|ready to drive away)\b/i;`

`src/checks.js`: delete the first `BANNED` row (marketing wording). In `checkDraft` beside the `register` warns: find `RATING` in the body; skip the match when the word is `excellent` or `good` and its sentence contains `grade`; otherwise `add('warn', 'rating', `"${m}" rates the car or the deal. A fact is a figure with its unit; the one meaning you may add is what an inclusion saves the buyer doing.`, [m])`. Add `'rating'` to `SECTION_RULES`. `test/core.test.js:349` keeps passing (`warn`).

- [ ] **Step 4: lots_coming (Jim's wording, decided 21 October)**

`voice/auction-messages.md` lots_coming: line 114 → `Our inspection team in Japan inspects every vehicle before the final purchase. We will provide you with up-to-date photos and a condition report so you can review everything before confirming the purchase.`; delete the line `Happy bidding!`.

- [ ] **Step 5: Run the suite** → green.

- [ ] **Step 6: Commit**

```bash
git add voice/house-voice.md src/prompt.js src/selling.js src/checks.js voice/auction-messages.md test/selling.test.js test/orders.test.js
git commit -m "Voice: no word that rates the car, checked; the lots-coming message without its cheer"
```

---

### Task 12: The lot offer opens on the landed figure; an import email names one model (brief change 9)

**Files:**
- Modify: `voice/auction-offer.md`; `src/imports.js:245-276` (`vehicleLines`, `offerBlock`); `src/prompt.js:49-59` (`EMAIL_RULES`)
- Test: `test/imports.test.js:146` region, `test/orders.test.js:302`, `test/selling.test.js`

**Interfaces:**
- Produces: `decidesLine(lot): string` (exported from `src/imports.js`); `offerBlock` fills `{decides}`; `{cost_lines}` leaves the offer (it stays in first_estimate).

- [ ] **Step 1: Write the failing tests**

`test/imports.test.js` (the test asserting the offer block, around line 146): the block now begins `Based on a ¥…bid, the estimated landed and complied cost is approximately AUD $….\nIt has … km and auction grade ….` then the bid sentence, then `Vehicle details:`; assert `indexOf('Based on a')` < `indexOf('Vehicle details:')`; no `including:` and no `- ` cost line; no `preferred bid amount`; the deposit paragraph and `We do not bid blindly.` still present. `test/orders.test.js:302` likewise. `test/selling.test.js`: `assert.match(promptModule.systemPrompt('email'), /name one, the closest to what they asked about/);` and `decidesLine({ km: 128000, grade: 'R' }) === 'It has 128,000 km and auction grade R.'`, `decidesLine({ km: 0, grade: '' }) === ''`, `decidesLine({ km: 53000 }) === 'It has 53,000 km.'`.

- [ ] **Step 2: Run the tests to see them fail** → fail.

- [ ] **Step 3: The template (Jim's wording from the brief) and the block**

`voice/auction-offer.md`: note `{decides}` in the header (`the two facts that decide it: kilometres and auction grade, as one sentence; left out when the lot gives neither`); drop `{cost_lines}` from the header notes; the two `@suggested*` snippets lose their second sentence (`However, if you have your own preferred bid amount, please let us know and we can proceed with that amount.`); `@own` stays. The body becomes:

```
Based on a {bid} bid, the estimated landed and complied cost is approximately AUD {total}.
{decides}

{bid_sentence}

Vehicle details:
{vehicle_lines}

You can view the vehicle and photos here:
{lot_url}

{if_deposit}If you would like us to proceed, you can use the deposit link below:
[DEPOSIT LINK?]

We do not bid blindly. Our Japan-side team will inspect the vehicle first and share the photos, auction sheet and inspection feedback. We will only place the final bid once you are happy and confirm us to proceed.

Kind regards,
{sender}
```

`src/imports.js`: `export function decidesLine(lot)` as the tests pin; `offerBlock` fills `decides: decidesLine(lot)` and no longer passes `cost_lines`.

- [ ] **Step 4: One model in an import email**

`src/prompt.js` `EMAIL_RULES` bullet 3: append ` When more than one model could fit what they asked, name one, the closest to what they asked about, with its page link, and give the eligible-models page for the rest: never a list of models with build ranges.`

- [ ] **Step 5: Run the suite** → green.

- [ ] **Step 6: Commit**

```bash
git add voice/auction-offer.md src/imports.js src/prompt.js test/imports.test.js test/orders.test.js test/selling.test.js
git commit -m "Auction offer: the landed figure first and one step; an import email names one model"
```

---

### Task 13: One reflection line before the template (brief change 10a)

**Files:**
- Modify: `src/prompt.js:33-37` (`MARKETPLACE_RULES`, the first-reply bullet); `src/fitter.js:142-153` (`templatePlan` lines)
- Test: `test/selling.test.js`, `test/templates.test.js`

- [ ] **Step 1: Write the failing tests**

`test/selling.test.js`: `assert.match(promptModule.systemPrompt('marketplace'), /one short line above the three paragraphs reflects it/);` and `assert.match(promptModule.systemPrompt('marketplace'), /"Rego include\?" gives nothing/);`

`test/templates.test.js`: `assert.match(templatePlan(tpl).lines.join('\n'), /one short line directly after the greeting line/)` (build `tpl` as the file's fitting tests do); and a fitting mode `'reflect'` in that file's stand-in behaviour that returns the masked template with `Adelaide is no trouble: we deliver Australia-wide.` inserted after the `Hello {{NAME}},` line → the draft is `ready`, `provider !== 'none'`, and the reply contains that line once and every figure as before.

- [ ] **Step 2: Run the tests to see them fail** → fail.

- [ ] **Step 3: The two lines**

`MARKETPLACE_RULES` first bullet, after `No link and no other sentence.`: ` When the buyer's message gives something of theirs to pick up (a family on the way, a suburb or a state, a trade, what the car is for, a deadline), one short line above the three paragraphs reflects it in plain words ("Congratulations on the twins." / "Adelaide is no trouble: we deliver Australia-wide."); nothing is added when it gives nothing to pick up ("Rego include?" gives nothing).`

`templatePlan` lines, after `- Change the wording only where…`: `'- When what the customer wrote, or their notes on the order, gives something of theirs to pick up (their suburb or state, a deadline, what the car is for, towing), you may add one short line directly after the greeting line that reflects it, with no figure, link or promise in it. Add nothing when there is nothing to pick up.'`

- [ ] **Step 4: Run the suite** → green.

- [ ] **Step 5: Commit**

```bash
git add src/prompt.js src/fitter.js test/selling.test.js test/templates.test.js
git commit -m "Templates: one line that reflects the customer may go above the fixed wording"
```

---

### Task 14: The re-draft script (local measure of the upgrade)

**Files:**
- Create: `scripts/tone-redraft.js`
- Modify: `package.json` (script `tone-redraft`)
- Create (local, ignored): `eval/tone/acceptance-ids.txt`
- Test: `test/tone-redraft.test.js` (the matching only; no AI)

**Interfaces:**
- Produces: `matchTurnToDraft(turn, drafts): draft | null` (exported from `scripts/tone-redraft.js`, pure); the script writes `eval/tone/redraft/turns-new.json` in the shape of `turns.json` plus `checks` and `model` per record, and prints one line per id: `WM-003  Marketplace  old: Information desk  warnings: opener, unasked-link`.

- [ ] **Step 1: Write the failing test**

`test/tone-redraft.test.js`: `matchTurnToDraft({ suggestion: 'Hello [NAME],\nYes, the Noah is here.' }, [{ reply: 'Hello Priya,\nYes, the Noah is here.' }, { reply: 'Hello Priya,\nNo.' }])` returns the first; a turn whose chunks match no draft returns `null`; `[PHONE]`/`[EMAIL]`/`[REGO]`/`[ADDRESS]`/`[NUMBER]` are wildcards.

- [ ] **Step 2: Run it to see it fail** → fails (no script).

- [ ] **Step 3: Write the script**

`scripts/tone-redraft.js` (`npm run tone-redraft -- --ids WM-003,WM-058` or `--ids-file eval/tone/acceptance-ids.txt`): exports `matchTurnToDraft` and runs its main only when invoked directly (`import.meta.url === pathToFileURL(process.argv[1]).href`), so the test can import it without a run; opens the database (`openDb`), loads `eval/tone/turns.json`, matches each id to a stored draft (`matchTurnToDraft`: split the redacted suggestion on the bracket tokens, keep chunks of 12+ characters, a draft matches when its reply contains every chunk in order), rebuilds the item as it stood when that draft was written (SMS: `buildItem({ conversationId })` then `itemAt(full, cut, created_at)` from `src/replaycases.js` with `cut` the index of the first timeline entry after `created_at`; Marketplace: the chat item builder in `src/items.js` with the timeline cut the same way; an auction occasion: `draftOrderMessage(item, { type, save: false, fitWith: draftFor })` when the order still exists), re-drafts with `draftFor(item, { save: false, holdOutConversation: true, now: created_at })`, and writes the results. Ids that cannot be rebuilt (the order moved on, the chat is gone) are listed under `skipped` with the reason. One request per id; stop on `daily`.

- [ ] **Step 4: Run the matcher test, then the script on the acceptance ids**

Write `eval/tone/acceptance-ids.txt` with the ids the brief names in its acceptance lines (changes 1–10; about 45). Run: `npm.cmd run tone-redraft -- --ids-file eval/tone/acceptance-ids.txt`
Expected: `eval/tone/redraft/turns-new.json` written; the printout shows the warnings per id. Note which ids were skipped and why.

- [ ] **Step 5: Commit the script and the test (not the eval files)**

```bash
git add scripts/tone-redraft.js package.json test/tone-redraft.test.js
git commit -m "Tone: a script that re-drafts labelled turns to measure a voice change"
```

---

### Task 15: Label the re-drafts blind, compare, write it up (local)

**Files:**
- Create (local, ignored): `eval/tone/redraft/labels-new.json`, `eval/tone/redraft.md`

- [ ] **Step 1: A fresh reader labels**

Dispatch a fresh subagent with `docs/tone-codebook.md` and `eval/tone/redraft/turns-new.json` only (never `labels.json`, never the old suggestions): one label, the tags and a note per id, written to `eval/tone/redraft/labels-new.json` in the codebook's shape.

- [ ] **Step 2: Compare**

Write `eval/tone/redraft.md`: a table per acceptance id (old label → new label, the brief's expected outcome, met / not met), the share of Warm consultant, Information desk, Pushy closer, Hedger, Hype and Mate before and after on these ids, the grep for `mate|bro|cheers|no worries|yep|arvo|heaps`, an emoji outside the footer and a second `!` on the new suggestions (any hit is a regression), the ids skipped and why, and a note that most Marketplace ids predate PR #54.

- [ ] **Step 3: Act on what fails**

For an acceptance id that did not come out as the brief says, read why (prompt line, block condition, check) and fix it in the task that owns it, as its own commit, then re-run the script for that id. Stop when every id either meets its acceptance or is listed with the reason it cannot (the order moved on, the AI ignored the rule twice).

---

### Task 16: Finish: suite, privacy, demo, pull request

- [ ] **Step 1: The whole suite and the privacy check**

Run: `npm.cmd test` and `npm.cmd run check-private`
Expected: both green; `npm.cmd run check-css` and `npm.cmd run check-deps` too.

- [ ] **Step 2: Demo for Jim**

Start the worktree app on port 3211 (`PORT=3211 npm.cmd start` from the worktree, with its own `.env` copied from the main folder) so he can judge a few live suggestions beside the main app on 3210.

- [ ] **Step 3: Pull request**

Push `tone-upgrade` and open one PR to `main`. The description, in Jim's words: what changed per brief change (ten short bullets), the new warnings and what each means on the page, the re-measure summary from `eval/tone/redraft.md` (numbers only, no customer text), and a section **Jim's wording to check** listing: `voice/price-reply.md` (notes), `voice/auction-messages.md` (first_estimate order and caveat; lots_coming), `voice/auction-offer.md` (the new order and the dropped sentence), the Bad-news trade-in example in `voice/house-voice.md`, the deferral row and the deposit paragraph in `voice/sales-playbook.md`. No link to the brief or the judgement (they are local). No AI attribution.
