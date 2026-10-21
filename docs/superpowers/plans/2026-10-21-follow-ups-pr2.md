# Follow-ups PR 2: the inspection reminder and the booking confirmation. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The day before a booked inspection or test drive, a reminder with the address is due under Follow-ups, written by code from the owner's template; and a website booking that has just arrived is answered first with a Booking confirmed message, written by code too.

**Architecture:** A third kind of follow-up row, `reminder`, raised by the engine (`src/followup.js`) at the reminder hour the day before the booked time and hanging on the booked time itself, so a customer's text before the visit does not close it and it never blocks the "how did it go" that follows. Two new parts in `voice/dashboard-messages.md` carry a new `@fit: no` line, which `draftSectionTemplate` honours by writing the part word for word with no AI unless the owner gives a Prompt. The booking in hand (the follow-up's, or the newest booking the customer made) feeds four new facts.

**Tech Stack:** Node 24 ES modules, `node:sqlite`, vanilla JS page, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-follow-ups-design.md` (section 2 decision 3, section 4, section 6 "The message", section 7 item 2). Branch `follow-ups-reminder` is cut from `follow-ups` (PR 1, #55, open): everything PR 1 built is in place.

## Global Constraints

- Dashboard (`c:`/`l:`) conversations only; nothing is sent by Wheelman; nothing written for a follow-up is learned from.
- The reminder and the booking confirmation are written by code from a template, no AI (spec section 4): a part marked `@fit: no` is written word for word; only a Prompt or Rewrite sends it to the AI.
- The reminder is due at `FOLLOW_UP_REMINDER_HOUR` (default 16) Sydney the day before the booked time; booked for today, or after the reminder time, gets none (spec section 7 item 2). Due times land inside 9 to 18 Sydney (`atSensibleHour`).
- The address in every message is `config.site.address` (`136 Frances Street, Lidcombe NSW 2141`); no map link.
- The follow-up checks skip `followup-new` and `followup-long` for `kind === 'reminder'` (already so in `src/checks.js`).
- Copy strings in the settled words; tests use invented data only (phones `0491 570 17x`); `npm.cmd run check-private` passes; commits in the owner's name only, no AI attribution lines.

## Review Focus

1. A customer who texts "Thanks, see you tomorrow" after booking, answered before the reminder hour, must still get the reminder at the reminder hour (Task 4: the row hangs on the booked time, not on their text).
2. A reminder copied the day before must not block "Inspection passed" after the visit (Task 4: `blocked()` ignores reminder rows).
3. Booked today for today, or booked after the reminder hour for tomorrow: no reminder, the confirmation serves (Task 4).
4. "Can't make it" after booking: no reminder (Task 4).
5. A Prompt on a by-code message still goes to the AI, and Booking confirmed comes before Book an inspection for a booking that has just arrived (Tasks 2 and 3).

Known limit, not tested: a booking made more than `FOLLOW_UP_MAX_AGE_DAYS` ahead of the visit gets no reminder, because the worker reads only conversations active in that window (deferred from PR 1's review).

---

### Task 0: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-10-21-follow-ups-pr2.md` (this file)

- [ ] **Step 1: Check nothing private is in it**

Run: `npm.cmd run check-private`
Expected: `Nothing private found. Safe to commit.` (empty `data/.session.json` first if a suite run left the stand-in session there; it is git-ignored).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-10-21-follow-ups-pr2.md
git commit -m "Follow-ups: the plan for the reminder and the booking confirmation"
```

---

### Task 1: The booking in hand and its words

**Files:**
- Modify: `src/sectiontemplates.js` (`CAR_FACTS` ~line 47; next to `bookedDayWords` ~148; `composeSectionTemplate` values ~269-273)
- Test: `test/followup.test.js` (append after the review tests)

**Interfaces:**
- Produces, exported from `src/sectiontemplates.js`:
  - `bookedWhenWords(bookedAt, now = Date.now()) → 'today' | 'tomorrow' | 'on Wednesday 21 October'` (same day words as `bookedDayWords`, looking forward).
  - `bookingInHand(item) → { kind: 'inspection' | 'test_drive', where: 'onsite' | 'online' | '', at: number } | null`: the follow-up's booking when `item.followUp?.data?.bookedAt` (its `kind`, `where`, `bookedAt`), else the newest customer timeline entry with `booking?.at` (its `booking.kind`, `booking.where`, `booking.at`), else null.
  - New facts in `CAR_FACTS` and `composeSectionTemplate`: `booking_kind` (`'inspection'` | `'test drive'`), `booked_when` (`bookedWhenWords(b.at, now)`), `address` (`config.site.address`), `if_onsite` (`b.where !== 'online'`), `if_online` (`b.where === 'online'`), all `null`/`false` when there is no booking in hand; `booked_time` now comes from the booking in hand (`bookedTimeWords(b.at)`). `booked_day` is unchanged (the follow-up's `bookedAt` only).

- [ ] **Step 1: Write the failing tests**

```js
test('the words for when a booking is: today, tomorrow, or the day', () => {
  const wed = parseDashboardTime('2026-10-21T14:00');
  assert.deepEqual([st.bookedWhenWords(wed, wed - 2 * HOUR), st.bookedWhenWords(wed, wed - DAY), st.bookedWhenWords(wed, wed - 3 * DAY)], ['today', 'tomorrow', 'on Wednesday 21 October']);
});

test('the booking in hand: the newest booking the customer made, and its facts', async () => {
  const visit = NOW + DAY;
  const key = replied(50, 'Tara', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - HOUR })], ours: [] });
  conv(350, 350, phoneOf(50), 'Tara Invented', NOW - HOUR, 'IN');
  const item = items.itemFromKey(key);
  assert.deepEqual(st.bookingInHand(item), { kind: 'inspection', where: 'onsite', at: visit });
  const { values } = await st.composeSectionTemplate(item, 'price_question', { now: NOW });
  assert.deepEqual([values.booking_kind, values.booked_when, values.booked_time, values.address, values.if_onsite, values.if_online], ['inspection', 'tomorrow', '2 pm', '136 Frances Street, Lidcombe NSW 2141', true, false]);
  assert.equal(st.bookingInHand(items.itemFromKey('c:305')), null, 'no booking, nothing in hand');
  assert.equal((await st.composeSectionTemplate(items.itemFromKey('c:305'), 'price_question', { now: NOW })).values.booked_when, null);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL, `st.bookedWhenWords is not a function`.

- [ ] **Step 3: Implement** the two functions and the facts as the Interfaces block says. `bookedWhenWords`: `sydneyDay(bookedAt)` equal to `sydneyDay(now)` → `'today'`; equal to `sydneyDay(now + DAY_MS)` → `'tomorrow'`; else the same `on <weekday> <day> <month>` string `bookedDayWords` builds.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/sectiontemplates.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sectiontemplates.js test/followup.test.js
git commit -m "Follow-ups: the booking in hand, and the words for when it is"
```

---

### Task 2: A message marked `@fit: no` is written by code

**Files:**
- Modify: `src/sectiontemplates.js` (`draftSectionTemplate` ~line 307)
- Modify: `voice/dashboard-messages.md` (the header's "Each part starts with its details" list, ~line 8-12)
- Test: `test/followup.test.js`

**Interfaces:**
- Consumes: `draftFromTemplate(item, { …, fitWith, okWords })` (`src/templatedraft.js`), `template(file).meta[id].fit`.
- Produces: `draftSectionTemplate` passes `fitWith: null` and `okWords: `Written by code from your wording "${label}", with the facts from your records. No AI.`` when `/^(no|0|off|false)$/i.test(meta.fit || '')` and `instruction` is empty; otherwise unchanged. The header line: `@fit: no  (optional) written by code, word for word, with no AI; a Prompt or Rewrite still goes to the AI`.

This task's test needs a `@fit: no` part: write `booking_confirmed` now (Task 3's wording, below) so the test has one; Task 3 then tests its offering and its text.

- [ ] **Step 1: Write the failing test** (define `const echoFit = (req) => { const m = (req.messages?.[1]?.content || '').match(/<<<\n([\s\S]*?)\n>>>/); return { reply: m ? m[1] : 'Hello {{NAME}},\n\nTeam Carbarn here.', next_step: '', facts_used: [], needs_human: [], hold: false }; };` at module scope beside `refresh`)

```js
test('a message marked @fit: no is written by code, word for word; a Prompt still goes to the AI', async () => {
  const seenBefore = ai.seen.length;
  const out = await post('/api/items/c:350/draft', { message: 'booking_confirmed' });
  const d = out.json.item.draft;
  assert.deepEqual([out.status, d.status, d.template, d.provider, d.model, ai.seen.length - seenBefore], [200, 'ready', 'booking_confirmed', 'none', 'your wording', 0]);
  assert.match(d.checks.map((c) => c.message).join('\n'), /Written by code from your wording "Booking confirmed"/);
  ai.behave = echoFit;
  try { assert.equal((await post('/api/items/c:350/draft', { message: 'booking_confirmed', instruction: 'add that we are closed on Sunday' })).status, 200); } finally { ai.behave = null; }
  assert.equal(ai.seen.length - seenBefore, 1, 'a Prompt goes to the AI');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL (the template is not in the file, or the AI was asked).

- [ ] **Step 3: Implement** `draftSectionTemplate` as the Interfaces block says, add the header line, and add the part (Task 3's exact text) to `voice/dashboard-messages.md` after `polite_close`.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/sectiontemplates.test.js test/templates.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sectiontemplates.js voice/dashboard-messages.md test/followup.test.js
git commit -m "Follow-ups: a message marked @fit: no is written by code, word for word"
```

---

### Task 3: Booking confirmed, offered first when a booking arrives

**Files:**
- Modify: `src/sectiontemplates.js` (`SIGNALS` ~35; `fitSignals` ~64)
- Modify: `voice/dashboard-messages.md` (the part from Task 2; the header's signals and facts lists)
- Test: `test/followup.test.js`

**Interfaces:**
- Produces: signal `'booking made'` in `SIGNALS` and from `fitSignals` when the newest customer entry with text, event or media has `booking?.at`. The part:

```
===== booking_confirmed =====
@label: Booking confirmed
@fits: booking made, inspection_booking
@not: buyer, car sold
@fit: no
{greeting}

Team Carbarn here. Your {booking_kind} of the {car} is booked for {booked_when} at {booked_time}.

{if_onsite}We are at {address}. If the time no longer suits, let us know and we will find another.

{if_online}We will call you at that time on this number and walk you around the car on video.

{sign_off}
```

Header additions: under "What the conversation can show": `booking made (their newest message is a booking through the website), reminder (a visit is booked for tomorrow)`; under "Facts": `{booking_kind} {booked_when}   "inspection" or "test drive", and "today", "tomorrow" or "on Wednesday 21 October", for the booking in hand (the follow-up's, else the newest one they made)`, `{address}   136 Frances Street, Lidcombe NSW 2141`, `{if_onsite} {if_online}   keeps its paragraph only for a visit to the yard / an online video inspection`.

- [ ] **Step 1: Write the failing tests**

```js
test('a booking just made is answered first with Booking confirmed; online and test-drive bookings read right', async () => {
  const list = (await get('/api/items/c:350')).item.templates;
  assert.deepEqual([list[0].id, list[0].best], ['booking_confirmed', true]);
  const d = (await post('/api/items/c:350/draft', { message: 'booking_confirmed' })).json.item.draft;
  assert.match(d.reply, /^Good (morning|afternoon|evening) Tara,\n\nTeam Carbarn here\. Your inspection of the 2020 Toyota Hiace DX is booked for (today|tomorrow) at 2 pm\.\n\nWe are at 136 Frances Street, Lidcombe NSW 2141\. If the time no longer suits, let us know and we will find another\.\n\nRegards,\nTeam Carbarn$/);
  const online = replied(55, 'Yara', { inText: '', inquiries: [inquiry(`Preferred inspection: Online on ${sydneyNaive(NOW + DAY).slice(0, 10)} at 09:30 AM.`, { type: 'product_page_inspection', at: NOW - HOUR })], ours: [] });
  conv(355, 355, phoneOf(55), 'Yara Invented', NOW - HOUR, 'IN');
  const o = (await post(`/api/items/${online}/draft`, { message: 'booking_confirmed' })).json.item.draft;
  assert.match(o.reply, /at 9:30 am\.\n\nWe will call you at that time on this number and walk you around the car on video\./);
  assert.doesNotMatch(o.reply, /Frances Street/);
  const drive = replied(56, 'Zed', { inText: '', inquiries: [bookingInquiry(NOW + DAY, { bookedAt: NOW - HOUR, testDrive: true })], ours: [] });
  conv(356, 356, phoneOf(56), 'Zed Invented', NOW - HOUR, 'IN');
  assert.match((await post(`/api/items/${drive}/draft`, { message: 'booking_confirmed' })).json.item.draft.reply, /Your test drive of the 2020 Toyota Hiace DX is booked/);
  assert.ok(!(await get('/api/items/c:305')).item.templates.some((t) => t.id === 'booking_confirmed'), 'not offered without a booking');
  assert.deepEqual(st.checkTemplates(), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL on `list[0].id` (Booking confirmed is not first, or not offered) or on the online/test-drive text.

- [ ] **Step 3: Implement** the signal and the header lines; fix the part's wording only if a test shows it wrong.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/sectiontemplates.test.js test/page.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sectiontemplates.js voice/dashboard-messages.md test/followup.test.js
git commit -m "Follow-ups: a booking that has just arrived is answered first with Booking confirmed"
```

---

### Task 4: The reminder in the engine

**Files:**
- Modify: `src/followup.js` (`dueFollowUps` ~89-137: `blocked`, a new reminder branch before the quiet branch)
- Test: `test/followup.test.js`

**Interfaces:**
- Consumes: `cfg.reminderHour` (`config.followUp`, default 16), `CANNOT_COME` (`src/selling.js`), `atSensibleHour`, `sydneyDay`, `parseDashboardTime`.
- Produces: a due item `{ kind: 'reminder', occasion: `reminder:${entry.key}`, sinceAt: booking.at, reason: 'Inspection tomorrow' | 'Test drive tomorrow', template: 'inspection_reminder', dueAt, data: { bookedAt: booking.at, where: booking.where, kind: booking.kind } }` for the newest booking entry with `booking.at > now`, where `dueAt = atSensibleHour(parseDashboardTime(`${sydneyDay(booking.at - DAY)}T${String(cfg.reminderHour).padStart(2, '0')}:00`))`, and all of: `entry.at <= dueAt` (they booked before the reminder time: booked today for today, or last evening after the hour, gets none); no customer text after the entry matching `CANNOT_COME`; not `lastOurs && lastOurs.at >= dueAt` (we have not written since the reminder time). The reminder never calls `blocked()`, and `blocked()` ignores rows with `kind === 'reminder'`: `have.some((r) => r.kind !== 'reminder' && r.occasion !== occasion && r.since_at >= sinceAt)`. `dueAt <= now` filters it like the others.

- [ ] **Step 1: Write the failing tests** (all with an explicit `now`)

```js
const tomorrowAt2 = () => parseDashboardTime(`${sydneyDay(NOW + DAY)}T14:00`);
const fourToday = () => parseDashboardTime(`${sydneyDay(NOW)}T16:00`);

test('a booking for tomorrow raises a reminder at four the day before, hanging on the booked time', () => {
  const visit = tomorrowAt2();
  const key = replied(51, 'Uma', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 3 * DAY })], ours: [[NOW - 3 * DAY + HOUR, 'Hello Uma, your inspection of the Hiace is booked. See you then.']] });
  followup.refreshFollowUps({ now: NOW });
  assert.equal(openFor(key).length, 0, 'two in the afternoon: not yet');
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  const r = openFor(key)[0];
  assert.deepEqual([r.kind, r.reason, r.template, r.since_at, r.due_at, r.data], ['reminder', 'Inspection tomorrow', 'inspection_reminder', visit, fourToday(), { bookedAt: visit, where: 'onsite', kind: 'inspection' }]);
  followup.refreshFollowUps({ now: fourToday() + HOUR });
  assert.equal(openFor(key).length, 1, 'raised once');
});

test('no reminder when they booked after the reminder time, or we have written since it, or they cannot come', () => {
  const visit = tomorrowAt2();
  const late = replied(52, 'Vik', { inText: '', inquiries: [bookingInquiry(NOW + 3 * HOUR, { bookedAt: NOW - HOUR })], ours: [[NOW - 30 * MIN, 'Hello Vik, see you at five.']] });
  const evening = replied(53, 'Wes', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: fourToday() + 10 * MIN })], ours: [[fourToday() + 15 * MIN, 'Hello Wes, your inspection is booked for tomorrow at 2 pm.']] });
  const wrote = replied(54, 'Xan', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 2 * DAY })], ours: [[fourToday() + 5 * MIN, 'Hello Xan, just confirming tomorrow at 2 pm.']] });
  const cannot = replied(57, 'Ana', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 2 * DAY })], ours: [[NOW - 2 * DAY + HOUR, 'Hello Ana, your inspection is booked.']] });
  msg(357, 'IN', "Sorry, can't make it tomorrow after all.", NOW - HOUR);
  msg(357, 'OUT', 'No problem Ana, let us know another day.', NOW - 30 * MIN);
  conv(357, 357, phoneOf(57), 'Ana Invented', NOW - 30 * MIN);
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  assert.deepEqual([openFor(late), openFor(evening), openFor(wrote), openFor(cannot)], [[], [], [], []]);
});

test('their "see you tomorrow", answered before the hour, keeps the reminder; a copied reminder never blocks the follow-up after the visit', () => {
  const visit = tomorrowAt2();
  const key = replied(58, 'Bea', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 2 * DAY })], ours: [[NOW - 2 * DAY + HOUR, 'Hello Bea, your inspection is booked for tomorrow at 2 pm.']] });
  msg(358, 'IN', 'Thanks, see you tomorrow', NOW - 2 * HOUR);
  msg(358, 'OUT', 'See you then Bea.', NOW - HOUR);
  conv(358, 358, phoneOf(58), 'Bea Invented', NOW - HOUR);
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  const r = openFor(key)[0];
  assert.equal(r?.kind, 'reminder');
  db.closeFollowUp(r.id, 'copied');
  followup.refreshFollowUps({ now: visit + 4 * HOUR });
  assert.deepEqual(openFor(key).map((x) => x.kind), ['inspection_passed'], 'how did it go, the day after the reminder');
  assert.equal(db.getFollowUp(r.id).done_how, 'copied', 'the reminder row is left as it was');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL, no reminder row.

- [ ] **Step 3: Implement** the reminder branch and the `blocked()` change in `dueFollowUps`, as the Interfaces block says. Update the module's top comment (three reasons).

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: PASS, including PR 1's tests (the quiet nudge is still held back by a booking to come).

- [ ] **Step 5: Commit**

```bash
git add src/followup.js test/followup.test.js
git commit -m "Follow-ups: a reminder is due at four the day before a booked visit"
```

---

### Task 5: The reminder's message, the fit word, the page's words

**Files:**
- Modify: `voice/dashboard-messages.md` (the part after `booking_confirmed`)
- Modify: `src/sectiontemplates.js` (`SIGNALS` 'reminder'; `FOLLOW_UP_WORDS.reminder = 'reminder'` ~line 52)
- Modify: `web/sections/registry.js` (`empty.followups`, the second line)
- Test: `test/followup.test.js`

**Interfaces:**
- Produces the part:

```
===== inspection_reminder =====
@label: Inspection reminder
@fits: reminder
@not: buyer, car sold
@fit: no
{greeting}

Team Carbarn here. A reminder of your {booking_kind} of the {car} {booked_when} at {booked_time}.

{if_onsite}We are at {address}. If the time no longer suits, let us know and we will find another.

{if_online}We will call you at that time on this number and walk you around the car on video.

{sign_off}
```

and `empty.followups[1]`: `A conversation appears here when an inspection time has passed, a visit is booked for tomorrow, or a customer has gone quiet after our reply. Open it and the follow-up is written for you to check.`

- [ ] **Step 1: Write the failing test** (the draft route judges "still due" with the real clock, so the reminder hour is set to 0 for the call, which makes any booking for tomorrow due from 9 am the day before)

```js
test('the reminder is written by code when opened from Follow-ups, first in Which message? and marked due', async () => {
  const r = openFor('c:351')[0];
  assert.equal(r?.kind, 'reminder');
  const list = (await get(`/api/items/c:351?followup=${r.id}`)).item.templates;
  assert.deepEqual([list[0].id, list[0].due], ['inspection_reminder', true]);
  const seenBefore = ai.seen.length;
  const was = config.followUp.reminderHour;
  config.followUp.reminderHour = 0;
  let d;
  try { d = (await post('/api/items/c:351/draft', { followup: r.id, message: 'inspection_reminder' })).json.item.draft; } finally { config.followUp.reminderHour = was; }
  assert.deepEqual([d.status, d.provider, ai.seen.length - seenBefore, d.checks.filter((c) => /^followup-/.test(c.code))], ['ready', 'none', 0, []]);
  assert.match(d.reply, /^Good (morning|afternoon|evening) Uma,\n\nTeam Carbarn here\. A reminder of your inspection of the 2020 Toyota Hiace DX (today|tomorrow) at 2 pm\.\n\nWe are at 136 Frances Street, Lidcombe NSW 2141\. If the time no longer suits, let us know and we will find another\.\n\nRegards,\nTeam Carbarn$/);
  assert.equal((await get('/api/items?section=dashboard&tab=followups')).items.find((x) => x.key === 'c:351').followUp.reason, 'Inspection tomorrow');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL (`inspection_reminder` is not offered, or `checkTemplates` names `reminder` as a signal no conversation shows).

- [ ] **Step 3: Implement** the part, the signal, the fit word and the page line.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/sectiontemplates.test.js test/page.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add voice/dashboard-messages.md src/sectiontemplates.js web/sections/registry.js test/followup.test.js
git commit -m "Follow-ups: the reminder's message, written by code, with the address"
```

---

### Task 6: Settings, docs, the whole suite, privacy

**Files:**
- Modify: `.env.example` (after `FOLLOW_UP_MAX_AGE_DAYS`: a comment line and `FOLLOW_UP_REMINDER_HOUR=16`)
- Modify: `README.md` ("### Follow-ups": a third reason bullet, the confirmation, a table row)
- Modify: `CHANGELOG.md` (Unreleased › Added, above the Follow-ups entry)

- [ ] **Step 1: Write the docs.** README bullet: `**Inspection tomorrow**: a visit booked through the website is tomorrow; at 4 pm the day before (by default) a reminder with the address is due, written by code from your wording, no AI. None when they booked today for today or after the reminder time, when you have written to them since it, or when they said they cannot come.` After the reasons: `A booking that has just arrived is answered first with **Booking confirmed** in Which message?, written by code too: the day and time, and the address, or the call for an online inspection. A message marked `@fit: no` in the wording file is written word for word; a Prompt or Rewrite still goes to the AI.` Table row: `| `FOLLOW_UP_REMINDER_HOUR` | The hour (Sydney) of the reminder the day before a booked visit | `16` |`. CHANGELOG, one Added entry in the owner's words (the spec's decision 3: "Inspection reminder the day before, with the address, written by code").

- [ ] **Step 2: Run everything**

Run: `npm.cmd test` then (after emptying `data/.session.json` if the stand-in session is there) `npm.cmd run check-private`
Expected: the suite passes except the two pre-existing failures in `test/imports.test.js` and `test/orders.test.js` (on `main` too); check-private finds nothing.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md CHANGELOG.md
git commit -m "Follow-ups: the reminder's setting, the README and the changelog"
```

---

## Verification in the browser

From the worktree, the PR 1 demo script (`demo-followups.mjs` in the session scratchpad, or the same shape: test stand-ins in-process, `startServer()` on 3211, invented data) with one more conversation: a booking for tomorrow 2 pm confirmed three days ago, and `FOLLOW_UP_REMINDER_HOUR=0` in the environment so the reminder is due now. Expected: a fourth row tagged **Inspection tomorrow**; opening it shows the editor at once (no shimmer) headed "Follow-up: Inspection tomorrow" with the address; a conversation whose newest message is a booking offers **Booking confirmed (best fit)** first in Which message?, and picking it writes the confirmation at once.
