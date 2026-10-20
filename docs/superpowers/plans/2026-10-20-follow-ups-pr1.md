# Follow-ups PR 1: the tab and the engine. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Follow-ups tab in the Dashboard section that fills itself when an inspection's booked time has passed or a customer has been quiet after our reply, and writes the follow-up when the conversation is opened from it.

**Architecture:** A `followups` table of due occasions, raised by a pure engine (`src/followup.js`) that the worker runs each cycle with no AI. A follow-up draft lives under its own anchor `fu:<id>` and is written by the existing Which message? template engine from two new parts in `voice/dashboard-messages.md`. The page gets a third chip, a reason tag on rows, and a composer branch for the follow-up. Copy and Dismiss close the row; both can be put back. Nothing is sent, nothing is learned.

**Tech Stack:** Node 24 ES modules, `node:sqlite`, vanilla JS page, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-follow-ups-design.md`

## Global Constraints

- Dashboard (`c:`/`l:`) conversations only; never Marketplace, Import Query or Auction.
- Nothing is sent by Wheelman; nothing written for a follow-up is learned from.
- A follow-up is never raised for a buyer, an opt-out, a decline/parting/insult, a dismissed conversation, or while another follow-up for the same silence is open or copied; at most two bursts of ours since the customer's last word or act.
- Carbarn is named in the first sentence; exactly one new thing; never "just checking in" or "did you come"; greeting and sign-off always; under about 50 words for a nudge.
- Settings: `FOLLOW_UPS` on, `FOLLOW_UP_QUIET_HOURS` 60, `FOLLOW_UP_AFTER_INSPECTION_HOURS` 3, `FOLLOW_UP_MAX_AGE_DAYS` 14; due times land inside 9 to 18 Sydney.
- Copy strings in the settled words (`test/page.test.js`): nothing reads as "Send:", "the agent" or "Needs a person".
- Tests use invented data only; new phone numbers in the `0491 570 12x` range; `npm.cmd run check-private` passes.
- Commits in the user's name only; no AI attribution lines.

## Review Focus

1. A customer text followed only by a staff note ("SMS Sent") is `answered` today; the engine must never nudge someone we never actually texted (test in Task 4: staff note only → no quiet row).
2. The owner replies in three texts within five minutes; that is one burst, not three, so the nudge is still allowed (Task 4: burst test).
3. A booked time passes while the conversation is `awaiting` because the customer wrote after booking: the ordinary reply, not a follow-up (Task 4: awaiting → none).
4. The first worker cycle after the upgrade must not flood the tab with months-old conversations (Task 4: `lastOurs` 20 days old → none).
5. Pressing Copy on a follow-up must not teach Wheelman and must not leave the draft in `draftsAwaitingOutcome` forever (Task 7: learned count unchanged; awaiting-outcome list excludes it).

---

### Task 0: Commit the design and this plan

**Files:**
- Create: `docs/superpowers/specs/2026-10-20-follow-ups-design.md` (already written)
- Create: `docs/superpowers/plans/2026-10-20-follow-ups-pr1.md` (this file)

- [ ] **Step 1: Check nothing private is in them**

Run: `npm.cmd run check-private`
Expected: exit 0, no findings.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-20-follow-ups-design.md docs/superpowers/plans/2026-10-20-follow-ups-pr1.md
git commit -m "Follow-ups: the design and the plan for the tab and the engine"
```

---

### Task 1: Read the booked time off an enquiry

**Files:**
- Modify: `src/text.js` (beside `readInquiry`, ~line 93)
- Modify: `src/items.js:212-221` (`buildTimeline`, the enquiry entry)
- Test: `test/core.test.js` (next to the `readInquiry` booking cases, ~line 170)

**Interfaces:**
- Produces: `bookingFrom(inq) → { kind: 'inspection'|'test_drive', where: 'onsite'|'online'|'', at: number|null } | null` exported from `src/text.js`. Timeline enquiry entries gain `booking` (the same object) when the enquiry is a booking.

- [ ] **Step 1: Write the failing tests**

```js
test('the booked time is read off a booking enquiry, in Sydney time', () => {
  const b = bookingFrom({ type: 'product_page_inspection', text: 'Preferred inspection: On-site on 2026-10-21 at 02:00 PM.' });
  assert.deepEqual([b.kind, b.where, b.at], ['inspection', 'onsite', parseDashboardTime('2026-10-21T14:00')]);
  assert.deepEqual(bookingFrom({ type: 'product_page_inspection', text: 'Preferred inspection: Online on 2026-10-21 at 09:30 AM.' }).where, 'online');
  const t = bookingFrom({ type: 'Book Inspection', text: 'A Test Drive has been requested by the user for the scheduled time: 2026-02-22 03:00 PM. Please review and confirm the request.' });
  assert.deepEqual([t.kind, t.at], ['test_drive', parseDashboardTime('2026-02-22T15:00')]);
  assert.equal(bookingFrom({ type: 'product_page_inspection', text: 'Preferred inspection: On-site on 2026-10-21.' }).at, null);
  assert.equal(bookingFrom({ type: 'Carsales', text: 'Is it still available?' }), null);
});
```

Import `bookingFrom` from `../src/text.js` and `parseDashboardTime` from `../src/time.js` at the top of `test/core.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test test/core.test.js`
Expected: FAIL, `bookingFrom` is not exported.

- [ ] **Step 3: Implement `bookingFrom` in `src/text.js`**

Two regexes on `inq.text`: `/^preferred inspection:\s*(on-?site|online)?\s*(?:on\s+)?(\d{4}-\d\d-\d\d)(?:\s+(?:at\s+)?(\d{1,2}):(\d\d)\s*([AP]M)?)?/i` and `/scheduled time:\s*(\d{4}-\d\d-\d\d)\s+(\d{1,2}):(\d\d)\s*([AP]M)?/i`. Convert the 12-hour time to 24-hour and call `parseDashboardTime(`${date}T${hh}:${mm}`)`; `at` is `null` when no time was given. `where` is `'onsite'` for "On-site", `'online'` for "Online", else `''`.

- [ ] **Step 4: Add `booking` to the enquiry timeline entry in `buildTimeline`**

In the `entries.push({ who: 'customer', … key: \`i:${inq.id}\` })` object add `booking: bookingFrom(inq) || undefined`. Nothing else reads it yet.

- [ ] **Step 5: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/core.test.js test/thread.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/text.js src/items.js test/core.test.js
git commit -m "Follow-ups: the booked time is read off a booking enquiry"
```

---

### Task 2: The `followups` table and its queries

**Files:**
- Modify: `src/db.js` (SCHEMA after `dismissed` ~line 61; `rekeyLeadItems` ~671; `oldRowsStamp` ~388; `draftsAwaitingOutcome` ~859; `rekeyPhoneThreads` ~1301; new functions beside the `dismissed` helpers ~880)
- Test: `test/followup.test.js` (new; its first tests need no stand-ins)

**Interfaces:**
- Produces, all exported from `src/db.js`:
  - `insertFollowUp({ itemKey, leadId = null, kind, occasion, sinceAt, reason, template, dueAt, data = null, now = Date.now() }) → id | null` (`INSERT OR IGNORE`; `null` when the occasion exists)
  - `getFollowUp(id) → row | null`, `followUpsFor(itemKey) → row[]`, `openFollowUps() → row[]` (done_at NULL, due_at descending), `openFollowUpFor(itemKey) → row | null`
  - `closeFollowUp(id, how, { draftId = null, now = Date.now() } = {})`, `reopenFollowUp(id)`
  - `lastDismissedAt(itemKey) → number` (0 when none)
  - Row shape: `{ id, item_key, lead_id, kind, occasion, since_at, reason, template, due_at, created_at, done_at, done_how, draft_id, data }` with `data` parsed from `data_json` (`{}` when null).

- [ ] **Step 1: Write the failing tests** (top of `test/followup.test.js`, `applyTestEnv()` first, `db = await import('../src/db.js')` in `before`)

```js
test('a follow-up occasion is raised once, closed, reopened, and moves with a rekeyed lead', () => {
  const id = db.insertFollowUp({ itemKey: 'l:900', leadId: 900, kind: 'quiet', occasion: 'quiet:m:1', sinceAt: 1000, reason: 'Quiet 3 days', template: 'quiet_nudge', dueAt: 2000, data: { a: 1 } });
  assert.ok(id > 0);
  assert.equal(db.insertFollowUp({ itemKey: 'l:900', leadId: 900, kind: 'quiet', occasion: 'quiet:m:1', sinceAt: 1000, reason: 'x', template: 'quiet_nudge', dueAt: 2000 }), null, 'the same occasion is never raised twice');
  assert.deepEqual([db.getFollowUp(id).data, db.openFollowUpFor('l:900').id, db.openFollowUps().map((r) => r.id)], [{ a: 1 }, id, [id]]);
  db.closeFollowUp(id, 'copied', { draftId: 7 });
  assert.deepEqual([db.getFollowUp(id).done_how, db.getFollowUp(id).draft_id, db.openFollowUpFor('l:900')], ['copied', 7, null]);
  db.reopenFollowUp(id);
  assert.equal(db.getFollowUp(id).done_how, null);
  db.upsertLead({ id: 900, conversationId: 901, firstName: 'Quin', lastName: 'Marsh', phone: '0491570121', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: 1, updatedAt: 1, stocks: [], inquiries: [] });
  db.rekeyLeadItems();
  assert.equal(db.getFollowUp(id).item_key, 'c:901');
  assert.equal(db.lastDismissedAt('c:901'), 0);
  db.dismiss('c:901', 'm:5');
  assert.ok(db.lastDismissedAt('c:901') > 0);
});

test('a follow-up draft is never waiting for an outcome', () => {
  const a = db.insertDraft({ itemKey: 'c:901', anchorKey: 'fu:1', status: 'ready', reply: 'x' });
  const b = db.insertDraft({ itemKey: 'c:901', anchorKey: 'm:5', status: 'ready', reply: 'y' });
  assert.deepEqual(db.draftsAwaitingOutcome().map((d) => d.id).filter((x) => x === a || x === b), [b]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL, `insertFollowUp` is not a function.

- [ ] **Step 3: Implement**

Add the table from the spec (section 6) to `SCHEMA`. Write the functions with the signatures above (`parseFollowUp` maps `data_json` to `data`). Add `followups` to both rekey `UNION`s and an `UPDATE followups SET item_key = ? WHERE item_key = ?` in both loops. Add `(SELECT COUNT(*) || ':' || IFNULL(MAX(id), 0) || ':' || IFNULL(MAX(done_at), 0) FROM followups) || '/' ||` to `oldRowsStamp`. Add `AND anchor_key NOT LIKE 'fu:%'` to `draftsAwaitingOutcome`.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/list.test.js test/pipeline.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.js test/followup.test.js
git commit -m "Follow-ups: the followups table and its queries"
```

---

### Task 3: Settings

**Files:**
- Modify: `src/config.js` (beside `autoDraftMaxAgeHours`, ~line 205)
- Modify: `.env.example` (if the file exists; the four knobs with one comment line each)

**Interfaces:**
- Produces `config.followUp = { on, quietHours, afterInspectionHours, maxAgeDays, reminderHour, stockDays }`.

- [ ] **Step 1: Add the block**

```js
// Follow-ups: when Wheelman puts a conversation we replied to last in front of you again.
followUp: {
  on: !/^(0|false|no|off)$/i.test((env.FOLLOW_UPS ?? '1').trim()),
  quietHours: num(env.FOLLOW_UP_QUIET_HOURS, 60),
  afterInspectionHours: num(env.FOLLOW_UP_AFTER_INSPECTION_HOURS, 3),
  maxAgeDays: num(env.FOLLOW_UP_MAX_AGE_DAYS, 14),
  reminderHour: num(env.FOLLOW_UP_REMINDER_HOUR, 16),
  stockDays: num(env.FOLLOW_UP_STOCK_DAYS, 30),
},
```

- [ ] **Step 2: Assert in `test/followup.test.js`**

```js
test('the follow-up settings have their defaults', () => {
  assert.deepEqual(config.followUp, { on: true, quietHours: 60, afterInspectionHours: 3, maxAgeDays: 14, reminderHour: 16, stockDays: 30 });
});
```

- [ ] **Step 3: Run, then commit**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: PASS.

```bash
git add src/config.js test/followup.test.js .env.example
git commit -m "Follow-ups: the settings"
```

---

### Task 4: The engine (`src/followup.js`)

**Files:**
- Create: `src/followup.js`
- Modify: `src/items.js:802-812` (`itemFromKey`)
- Test: `test/followup.test.js`

**Interfaces:**
- Consumes: `bookingFrom` entries (Task 1), the db functions (Task 2), `config.followUp` (Task 3), `listItems`/`itemFromKey` (`src/items.js`), `isOptOut` (`src/items.js`), `DECLINED`, `PARTING`, `RUDE`, `CANNOT_COME` (`src/selling.js`), `availability` (`src/normalize.js`), `reservedByAnother` (`src/deal.js`), `sydneyHour`/`sydneyDay`/`parseDashboardTime` (`src/time.js`).
- Produces, exported from `src/followup.js`:
  - `atSensibleHour(ms, { from = 9, to = 18 } = {}) → ms`
  - `lastTheirsOf(item) → entry | null`, `lastOursOf(item) → entry | null`, `burstsSince(item, sinceAt) → number`
  - `followUpEligibility(item, { now = Date.now(), cfg = config.followUp } = {}) → { allowed, why, lastOurs, lastTheirs, bookings }` (`bookings`: customer entries with `booking.at`, oldest first)
  - `dueFollowUps(item, { now, cfg, rows = followUpsFor(item.itemKey) }) → [{ kind, occasion, sinceAt, reason, template, dueAt, data }]` (only those with `dueAt <= now`)
  - `stillDue(item, row, { now, cfg }) → { ok, why, how }` (`how` is `'answered'` or `'lapsed'` when not ok)
  - `refreshFollowUps({ now = Date.now(), cfg = config.followUp } = {}) → { opened, closed }`
  - `itemFromKey(key, { message, followUp })`: with `followUp` (an id whose row belongs to this key) sets `item.followUp = row`, `item.anchorKey = 'fu:<id>'`, `item.templatePick = opts.message ?? row.template`, `item.isFirstReply = false`, `item.isNewEnquiry = false`; without it, `item.followUp = openFollowUpFor(item.itemKey)` for `c:`/`l:` keys (information only, no anchor change).

The rules, as the spec's section 6 states them. Pinned values: a burst is our texts within 15 minutes of the previous one; `inspection_passed` needs `booking.at + afterInspectionHours*3600e3 <= now`, `booking.at >= now - 7*DAY`, no customer text after the booking entry matching `CANNOT_COME`, `lastTheirs.at <= booking.at`, state `answered` or `ack`; the newest passed booking only; `data = { bookedAt, where, kind, deposit: !told.deposit }` with `told.deposit` = any of our non-internal texts matching `/\bdeposit\b/i`; `reason` is `'Inspection passed'` or `'Test drive passed'`; `sinceAt = booking.at`. `quiet` needs state `answered`, `lastOurs.at > lastTheirs.at`, `lastOurs.at + quietHours*3600e3 <= now`, `lastOurs.at >= now - maxAgeDays*DAY`, no booking with `booking.at > now` and none with `booking.at` in `[now - 7*DAY, now]`, a car in `item.vehicles[0]` whose `availability(v).code` is not `sold` and `!reservedByAnother(v, item.deal)`, our last text not matching `/if you are looking again|should you look again|glad to help|pleased to help|all the best/i`; `occasion = 'quiet:' + lastOurs.key`, `sinceAt = lastTheirs.at`, `reason = 'Quiet N days'` (`N = Math.max(1, Math.round((now - lastOurs.at) / DAY))`, singular "day"), `template = 'quiet_nudge'`, `data = {}`. Both: `dueAt = atSensibleHour(trigger)`, blocked while `rows.some((r) => r.occasion !== occasion && (!r.done_how || r.done_how === 'copied') && r.since_at >= sinceAt)` or `burstsSince(item, sinceAt) >= 2`.

`refreshFollowUps`: candidates `listItems({ source: 'dashboard', states: ['answered', 'ack'], maxAgeHours: cfg.maxAgeDays * 24, limit: Infinity })`; per item: close open/copied rows whose `since_at < lastTheirs.at` as `answered`; compute `due`; close open rows whose occasion is not in `due` as `lapsed`; insert the due ones not yet raised. Then every open row whose item was not a candidate: no item → `lapsed`; the customer wrote after `since_at` or state `awaiting` → `answered`; else `lapsed`.

- [ ] **Step 1: Write the failing tests**

Add to `test/followup.test.js` (stand-ins as in `test/sectiontemplates.test.js`: `startStandins({ world: world(realNow), ai })`, `pointConfigAt`, `sync.syncAll()` so the stock list exists; conversations for the scenarios are inserted with `db.upsertLead` / `db.upsertConversation` / `db.upsertMessage` as `test/list.test.js` does, ids 300+, phones `0491 570 121` upwards). Use a fixed `now` = 14:00 Sydney today, or yesterday when 14:00 today is still to come:

```js
const NOW = (() => { const d = parseDashboardTime(`${sydneyDay(Date.now())}T14:00`); return d <= Date.now() ? d : d - DAY; })();
const naive = (ms) => sydneyNaive(ms); // from test/support/fixtures.js
const booking = (id, stockNo, at) => ({ id, type: 'product_page_inspection', subject: 'Inspection', text: `Preferred inspection: On-site on ${naive(at).slice(0, 10)} at ${new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(at))}.`, stockNo, at: at - 26 * HOUR, staffNotes: [], url: '' });
```

(Check the enquiry keys against `normalizeLead`, `src/normalize.js:83-106`, and `parseLead`, `src/db.js:772`, before relying on `at` and `staffNotes`.)

Scenarios, each a conversation, then `followup.refreshFollowUps({ now: NOW })` and `db.openFollowUps()`:

```js
test('an inspection whose booked time has passed raises one follow-up at a sensible hour', ...)
// c:301: booking for NOW - 4h (10:00), our confirmation text at NOW - 28h → one row: kind inspection_passed,
// reason 'Inspection passed', template 'after_inspection', since_at = booked time, due_at = NOW - 1h, data.deposit true.
test('a test drive reads the same way', ...)                       // 'Test drive passed'
test('they said they cannot come: no follow-up', ...)             // customer 'Sorry, can't make it today' after the booking entry → none
test('they wrote after the booked time: the ordinary reply, not a follow-up', ...) // customer text at NOW - 2h → state awaiting → none
test('a reply 61 hours ago with nothing since is quiet', ...)     // c:305: IN at NOW - 62h, OUT at NOW - 61h, stock 1159 → 'Quiet 3 days', due_at NOW - 1h
test('30 hours is not quiet yet', ...)
test('a staff note is not a reply: nothing is raised', ...)       // IN at NOW - 62h, lead inquiry with staffNotes [{ text: 'SMS Sent' }], no OUT → none
test('three texts in five minutes are one burst, so the nudge is still allowed', ...)
test('two bursts since they last wrote: nothing more', ...)        // OUT at NOW - 70h and OUT at NOW - 61h → none
test('a future booking, a no, an opt-out, a buyer and a dismissed conversation get nothing', ...)
//   future: booking for NOW + DAY; no: last IN 'not interested' then our close; opt-out: IN 'STOP'; buyer: db.upsertSale on the number;
//   dismissed: db.dismiss(key, anchor) after their last message with no text of ours after
test('our last message 20 days ago is left alone', ...)
test('a car that has sold suspends the quiet nudge', ...)          // stock 1200
test('a new customer message closes the row as answered; the car selling closes it as lapsed', ...)
//   insert IN after → refresh → done_how 'answered'; for a quiet row: mutate standins.world so stock sells, syncAll({ vehicles: { force: true } }), refresh → 'lapsed'
test('due times fall inside working hours', () => {
  const two = parseDashboardTime('2026-10-21T02:00'), seven = parseDashboardTime('2026-10-21T19:00'), eleven = parseDashboardTime('2026-10-21T11:00');
  assert.deepEqual([followup.atSensibleHour(two), followup.atSensibleHour(seven), followup.atSensibleHour(eleven)], [parseDashboardTime('2026-10-21T09:00'), parseDashboardTime('2026-10-22T09:00'), eleven]);
});
test('a conversation opened with its follow-up carries the anchor and the template', () => {
  const row = db.openFollowUpFor('c:301');
  const item = items.itemFromKey('c:301', { followUp: row.id });
  assert.deepEqual([item.anchorKey, item.templatePick, item.followUp.id, item.isFirstReply], [`fu:${row.id}`, 'after_inspection', row.id, false]);
  assert.equal(items.itemFromKey('c:301').followUp.id, row.id, 'opened from All it still knows a follow-up is due');
  assert.equal(items.itemFromKey('c:301').anchorKey.startsWith('fu:'), false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL, cannot find module `../src/followup.js`.

- [ ] **Step 3: Implement `src/followup.js` and the `itemFromKey` change**

Keep the module pure except `refreshFollowUps` (db writes). `atSensibleHour`: read `sydneyHour(ms)`; if `from <= hour < to` return `ms`; else take `sydneyDay(ms)` (next day when `hour >= to`) and return `parseDashboardTime(`${day}T09:00`)`. In `itemFromKey` import `getFollowUp`, `openFollowUpFor` from `./db.js` (not from followup.js, to avoid a cycle).

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/followup.js src/items.js test/followup.test.js
git commit -m "Follow-ups: the engine that finds a passed inspection or a quiet customer"
```

---

### Task 5: Routes, the tab's rows, the worker

**Files:**
- Modify: `src/server.js` (`GET /api/items` ~618; `sectionRows` ~440; `present` ~330; `GET /api/items/:key` ~655; `POST /draft` ~712; `POST /api/drafts/:id/copied` ~883; new routes after `/restore` ~856; `POST /api/sync` ~646)
- Modify: `src/worker.js` (`cycle`, after `updateOutcomes()` ~270)
- Test: `test/followup.test.js`

**Interfaces:**
- Consumes: Task 4's functions.
- Produces: `GET /api/items?section=dashboard&tab=followups` → rows `{ ...summary, followUp: { id, kind, reason, dueAt, done, template } }` and `counts.followups`; `GET /api/items/:key?followup=<id>`; `POST /api/items/:key/draft { followup, message, instruction }`; `present().followUp` (null or the shape above); `POST /api/drafts/:id/copied` → `{ ..., followUpDone: true }` for a `fu:` anchor; `POST /api/followups/:id/dismiss` and `POST /api/followups/:id/restore` → `{ ok, item }`.

- [ ] **Step 1: Write the failing tests**

```js
test('the Follow-ups list shows the due rows with their reason, and All carries no tag', async () => {
  const list = await get('/api/items?section=dashboard&tab=followups');
  const row = list.items.find((r) => r.key === 'c:301');
  assert.deepEqual([row.followUp.reason, row.followUp.done, list.counts.followups > 0, row.anchor.startsWith('fu:')], ['Inspection passed', '', true, true]);
  const all = await get('/api/items?section=dashboard&tab=all');
  assert.equal(all.items.find((r) => r.key === 'c:301').followUp, undefined);
  assert.equal((await get('/api/items?section=marketplace&tab=followups')).items.length, 0);
});
test('a closed or stale follow-up is refused a draft', async () => {
  // a row closed 'dismissed' → 400 'This follow-up is done'; a row whose customer has since written → 400 and the row closes 'answered'
});
test('Dismiss and Put back', async () => {
  const id = db.openFollowUpFor('c:305').id;
  assert.equal((await post(`/api/followups/${id}/dismiss`)).json.item.followUp.done, 'dismissed');
  assert.ok(!(await get('/api/items?section=dashboard&tab=followups')).items.some((r) => r.key === 'c:305'));
  assert.equal((await post(`/api/followups/${id}/restore`)).json.item.followUp.done, '');
  assert.ok((await get('/api/items?section=dashboard&tab=followups')).items.some((r) => r.key === 'c:305'));
});
test('Check now refreshes the follow-ups', async () => { /* insert a due conversation, POST /api/sync, the row is there */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL (empty lists, 404s).

- [ ] **Step 3: Implement**

`followUpOf(row) = { id: row.id, kind: row.kind, reason: row.reason, dueAt: row.due_at, done: row.done_how || '', template: row.template }` in `server.js`. In `sectionRows`, dashboard only: `value.followups = openFollowUps().map((r) => { const item = itemFromKey(r.item_key, { followUp: r.id }); return item && item.section === 'dashboard' ? { ...summary(item), followUp: followUpOf(r) } : null; }).filter(Boolean)`; other sections `[]`; `value.all` unchanged. `GET /api/items`: the whitelist gains `'followups'`; `counts.followups = here.followups.length`. `present()`: `followUp: item.followUp ? followUpOf(item.followUp) : null`. `GET /api/items/:key` and `POST /draft` read `followup` (query / body) and pass `{ message, followUp: Number(followup) || undefined }` to `itemFromKey`; `POST /draft` with a follow-up: `if (item.followUp.done_how) return send(res, 400, { error: 'This follow-up is done. Put it back first.' })`; `const still = stillDue(item, item.followUp); if (!still.ok) { closeFollowUp(id, still.how); return send(res, 400, { error: still.why }); }`; the rest of the route is unchanged (the template branch writes it). `/copied`: after `onCopied`, `if (/^fu:\d+$/.test(draft.anchor_key)) { closeFollowUp(Number(draft.anchor_key.slice(3)), 'copied', { draftId: draft.id }); result.followUpDone = true; }`. New routes `/api/followups/(\d+)/(dismiss|restore)`: 404 when no row; dismiss → `closeFollowUp(id, 'dismissed')`; restore → `reopenFollowUp(id)`; both answer `{ ok: true, item: present(itemFromKey(row.item_key, { followUp: id })) }`. Worker `cycle()` and `POST /api/sync`: after `updateOutcomes()`, `if (config.followUp.on) { try { refreshFollowUps(); } catch (e) { logLine('followups', `Finding follow-ups failed: ${e.message}`); } }`.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/list.test.js test/workspace.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.js src/worker.js test/followup.test.js
git commit -m "Follow-ups: the list, the routes and the worker's refresh"
```

---

### Task 6: The two templates and their facts

**Files:**
- Modify: `voice/dashboard-messages.md` (header lines; snippets above the first part; two new parts after `polite_close`)
- Modify: `src/sectiontemplates.js` (`SIGNALS` ~33, `CAR_FACTS` ~43, `fitSignals` ~56, `templatesFor` ~87, `composeSectionTemplate` ~134)
- Test: `test/followup.test.js`, `test/sectiontemplates.test.js` (the `checkTemplates()` → `[]` case already exists; keep it green)

**Interfaces:**
- Consumes: `item.followUp` (Task 4), `alternatives`/`inspectionLinks` (`src/knowledge.js`), `vehicleMedia` (`src/vehiclemedia.js`), `allVehicles` (`src/db.js`), `money` (`src/imports.js`).
- Produces: signals `'inspection passed'`, `'quiet'`, `'follow-up'`; facts `booked_day`, `booked_time`, `deposit_offer`, `new_thing`; `templatesFor` marks the follow-up's template `due: true` and lists it first; `composeSectionTemplate` forces greeting and sign-off on a follow-up; exported `bookedDayWords(bookedAt, now) → 'today' | 'yesterday' | 'Wednesday 21 October'` and `bookedTimeWords(bookedAt) → '2 pm' | '2:30 pm'`; `newThingFor(item, media) → { kind: 'documents'|'video'|'similar'|'visit', values } | null` (pure; `media` may be null).

The snippets, at the top of the file under the header comments (the `\n` is a line break, as `templates.js` reads it):

```
@new_documents: We can send you the export certificate, which carries the odometer history, and the auction sheet:\n{documents}
@new_video: There is a walkaround video of it here:\n{video_link}
@new_similar: We also have a {similar_car} at {similar_price} with {similar_km}, if that is of interest:\n{similar_link}
@new_visit: You are welcome to come and see it any day between 8 am and 5 pm. You can book a time here:\n{booking_link}
```

The parts:

```
===== after_inspection =====
@label: After the inspection
@fits: inspection passed
@not: buyer, car sold
{greeting}

Team Carbarn here. How did you find the {car} {booked_day}?

{deposit_offer}

{sign_off}

===== quiet_nudge =====
@label: Follow-up: one new thing
@fits: quiet
@not: buyer, car sold
{greeting}

Team Carbarn here, following on from the {car}.

{new_thing}

{sign_off}
```

`deposit_offer` text: `A $1,000 refundable holding deposit takes it off the market for you; until then it stays for sale.` (only when `item.followUp.data.deposit`, else null so the paragraph is left out). `new_thing` order: documents (an `EXPORT_CERTIFICATE` or `AUCTION_SHEET` document with `shareable !== false` in `media.documents`, and none of our texts matching `/export certificate|auction sheet/i`) → video (`media.videos[0]` shareable, and none of our texts matching `/\b(video|walkaround)\b/i` and no enquiry with `videoViewed`) → similar (`alternatives(v, allVehicles(), 1)[0]`) → visit (`availability(v).code === 'available'` and `v.url`, and none of our texts matching the `invited` test of `saleStage`, `src/selling.js:368`). `media` comes from `Promise.race([vehicleMedia(v.stockNo), 5-second null])` inside a try, only when the follow-up's kind is `quiet`. The header's fact and signal lists gain the new words so the owner knows them.

- [ ] **Step 1: Write the failing tests**

```js
test('the follow-up templates are offered to a follow-up only, the due one first', async () => {
  const row = db.openFollowUpFor('c:301');
  const list = (await get(`/api/items/c:301?followup=${row.id}`)).item.templates;
  assert.deepEqual([list[0].id, list[0].due], ['after_inspection', true]);
  assert.ok(!(await get('/api/items/c:301')).item.templates.some((t) => t.id === 'after_inspection'), 'not on the ordinary list');
  assert.ok(!(await get('/api/items/c:202')).item.templates.some((t) => /after_inspection|quiet_nudge/.test(t.id)));
});
test('the words for the booked day and time', () => {
  const wed = parseDashboardTime('2026-10-21T14:00');
  assert.deepEqual([bookedDayWords(wed, wed + 2 * HOUR), bookedDayWords(wed, wed + DAY), bookedDayWords(wed, wed + 3 * DAY), bookedTimeWords(wed), bookedTimeWords(wed + 30 * 60e3)], ['today', 'yesterday', 'Wednesday 21 October', '2 pm', '2:30 pm']);
});
test('the one new thing: documents, then the video, then a similar car, then a time to come in', () => {
  // item with stock 1159 and no media → similar (the Serena? check alternatives) or visit; with media documents → documents; our text mentioning the auction sheet → video; etc.
});
test('a follow-up written word for word names Carbarn, the booked day and the deposit, and greets even when we wrote today', async () => {
  // config.llm keys off or ai.down = true so the template is written word for word; POST /draft { followup, message: 'after_inspection' }
  // assert reply matches /^Good (morning|afternoon|evening) Quin,\n\nTeam Carbarn here\. How did you find the .* today\?\n\nA \$1,000 refundable holding deposit/ and ends with the sign-off
});
test('checkTemplates still finds nothing wrong', () => assert.deepEqual(checkTemplates(), []));
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`fitSignals`: when `item.followUp`, add `'follow-up'` and `{ inspection_passed: 'inspection passed', quiet: 'quiet' }[item.followUp.kind]`. `templatesFor`: after sorting, if `item.followUp` and the list has `item.followUp.template`, move it first with `due: true` (and `best: false` on the rest). `composeSectionTemplate`: `const again = !chat && !email && !item.followUp && …`; the four new values (null when not a follow-up of that kind); `new_thing` from `fill(snippet, values)` of the chosen snippet (`template(file).snippets`). `FACTS`/`CAR_FACTS` gain the four names.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/sectiontemplates.test.js test/templates.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add voice/dashboard-messages.md src/sectiontemplates.js test/followup.test.js
git commit -m "Follow-ups: the two messages and their facts"
```

---

### Task 7: The prompt, the checks, the learning guards

**Files:**
- Modify: `src/prompt.js` (`buildPrompt`: THIS IS ~543; after the conversation ~754; the waiting section ~765)
- Modify: `src/fitter.js:128-155` (`templatePlan`)
- Modify: `src/checks.js` (new `followUpChecks` after `emailChecks`; `retryNote`)
- Modify: `src/drafter.js` (`assessTemplate` ~147, `assessReply` ~213, `writeDraft` ~301: `again`, `context.followUp`, pass `followUp` to `templatePlan`)
- Modify: `src/templatedraft.js:28-33` (`context.followUp`)
- Modify: `src/learn.js` (`teachesHere` ~48, `learnFrom` ~107, `onCopied` ~160, `onEdited` ~189, `onApproved` ~211)
- Test: `test/followup.test.js`

**Interfaces:**
- Produces: `followUpChecks({ body, kind = '' }) → check[]` exported from `src/checks.js`; drafts for a follow-up carry `context.followUp = { id, kind }`; `teachesHere(item)` is false when `item.anchorKey` starts with `fu:`; every learn entry point answers `{ learned: false, why: 'a follow-up' }` for a draft whose `anchor_key` starts with `fu:`.

Prompt text. THIS IS, when `item.followUp`: `THIS IS: a follow-up our staff asked for, not a reply. The customer has not written since our last message ${ago} ago. Reason: ${reason}.` (appended to the fitting sentence when fitting). After the conversation: `\n=== FOLLOW-UP ===` then `Reason: ${reason}.`, `Quiet for ${hours} hours.`, `Already offered in this conversation: ${told list or 'nothing yet'}.`, `The one new thing to offer: ${new thing kind or 'none'}.`, `Name us in the first sentence. Never ask whether they came or made it. No urgency beyond the holding deposit when the message carries it. Under 50 words. If their last message was a no, write nothing and set hold to true.` In place of THE CUSTOMER IS WAITING FOR: `\n=== THERE IS NO NEW MESSAGE ===\nTheir last message was:\n<customer_message>\n${redacted last customer text or event}\n</customer_message>`. `templatePlan(tpl, { orderPlan, followUp })` adds the line `This is a follow-up our staff asked for (see FOLLOW-UP): keep it under 50 words, add no question the message does not have, never "just checking in" or "just following up", never ask whether they came.`

Checks: `followup-identify` **fail** when the first sentence after an optional greeting line (`/^(good (morning|afternoon|evening)|hello|hi)\b[^\n]*\n+/i` stripped) lacks `/carbarn/i`; `followup-banned` **fail** on `/\bjust (following up|checking in|touching base|reaching out)\b|\bfollowing up on\b|\bchecking in (on|to)\b|\btouch(ing)? base\b/i` or `/\bdid you (end up )?(come|coming|make it|making it|visit|attend|get (here|there|in|down|along))\b|\bwere you able to (come|make it|visit|attend)\b/i`; `followup-new` **warn** (not for `kind === 'reminder'`) when nothing matches `/export certificate|auction sheet|video|walkaround|similar|also have|another|come (in|and see|down|by)|welcome to|book|deposit|#inspection=/i`; `followup-long` **warn** when `wordCount(body) > 50` (not for `reminder`). `retryNote` gains: `fails.some((c) => c.code === 'followup-identify') ? '\nName Carbarn in the first sentence: "Team Carbarn here, …".' : ''` and `fails.some((c) => c.code === 'followup-banned') ? '\nNever "just checking in", "just following up" or "touching base", and never ask whether they came or made it: write as if the visit happened and ask how it went.' : ''`.

- [ ] **Step 1: Write the failing tests**

```js
test('the follow-up checks', () => {
  const codes = (body) => followUpChecks({ body }).map((c) => `${c.level}:${c.code}`);
  assert.deepEqual(codes('Good afternoon Quin,\n\nTeam Carbarn here. How did you find the van today?\n\nA $1,000 refundable holding deposit takes it off the market for you.\n\nRegards,\nTeam Carbarn'), []);
  assert.deepEqual(codes('Hello Quin,\n\nJust checking in on the van. Did you make it on Tuesday?'), ['fail:followup-identify', 'fail:followup-banned', 'warn:followup-new']);
  assert.ok(codes('Team Carbarn here. ' + 'word '.repeat(60)).includes('warn:followup-long'));
  assert.deepEqual(followUpChecks({ body: 'Team Carbarn here. A reminder of your inspection tomorrow.', kind: 'reminder' }), []);
});
test('a banned reply is sent back once, and the second answer stands', async () => {
  ai.script.push({ reply: 'Hello {{NAME}},\n\nJust checking in on the {{K1}}. Did you make it?', needs_human: [], facts_used: [], hold: false }, /* then a good fitting that keeps every marker */);
  const seenBefore = ai.seen.length;
  const out = await post('/api/items/c:305/draft', { followup: db.openFollowUpFor('c:305').id, message: 'quiet_nudge' });
  assert.equal(ai.seen.length, seenBefore + 2);
  assert.ok(!out.json.item.draft.checks.some((c) => c.code === 'followup-banned'));
  assert.match(ai.seen[ai.seen.length - 1].messages[1].content, /=== FOLLOW-UP ===/);
  assert.match(ai.seen[ai.seen.length - 1].messages[1].content, /=== THERE IS NO NEW MESSAGE ===/);
  assert.doesNotMatch(ai.seen[ai.seen.length - 1].messages[1].content, /THE CUSTOMER IS WAITING FOR/);
});
test('Copy on a follow-up counts as done and teaches nothing; Put back makes it due again', async () => {
  const before = db.countRows('learned');
  const item = (await get(`/api/items/c:305?followup=${id}`)).item;
  assert.equal(item.teaches, false);
  const out = await post(`/api/drafts/${item.draft.id}/copied`, { text: item.draft.reply + ' Changed.' });
  assert.deepEqual([out.json.followUpDone, out.json.learned, db.getFollowUp(id).done_how, db.countRows('learned')], [true, false, 'copied', before]);
  assert.ok(!db.draftsAwaitingOutcome().some((d) => d.id === item.draft.id));
  assert.equal((await post(`/api/drafts/${item.draft.id}/rating`, { rating: 'good' })).json.learned, false);
  await post(`/api/followups/${id}/restore`);
  assert.equal(db.getFollowUp(id).done_how, null);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** as specified above. In `writeDraft`: `const again = !chat && !email && !item.followUp && writtenToday(item, now)`; `context.followUp = item.followUp ? { id: item.followUp.id, kind: item.followUp.kind } : null`; `templatePlan(tpl, { orderPlan, followUp: item.followUp || null })`. In both assess functions, last thing before `return`: `if (item.followUp) { const fu = followUpChecks({ body, kind: item.followUp.kind }); if (fu.length) checks = [...checks.filter((c) => c.level !== 'ok'), ...fu]; }`.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/quality.test.js test/pipeline.test.js test/selling.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompt.js src/fitter.js src/checks.js src/drafter.js src/templatedraft.js src/learn.js test/followup.test.js
git commit -m "Follow-ups: what the AI is told, the checks, and nothing learned"
```

---

### Task 8: The page

**Files:**
- Modify: `web/sections/registry.js:14-18` (the third slot), `empty.followups`
- Modify: `web/views/ListColumn.js` (`rowTags` ~29; the chip counts ~107; the row's `onOpen` ~129)
- Modify: `web/app.js` (`state` ~27: `followUp: null`, `counts` gains `followups: 0`; `composerSignature` ~547; `renderComposer` ~681, before the `answered` branch; `mountEditor`'s copy toast ~1000 and `noteCopied` ~974; the details panel's Dismiss section ~1329; `open` ~1737; `write` ~1770; `refreshDetail` ~1985; `showSection` ~2027; new `dismissFollowUp(item)` and `restoreFollowUp(item)` beside `dismissItem`)
- Modify: `web/lib/copy.js` (new keys)
- Test: `test/page.test.js` (tabs assertion ~119; `rowTags` cases ~150)

**Interfaces:**
- Consumes: Task 5's routes and `item.followUp`.
- Produces: `actions.open(key, followUpId)`; `state.followUp`; copy keys `followup.head`, `followup.due`, `followup.write`, `followup.copied`, `followup.dismissed`, `followup.putBack`, `followup.dismiss`, `followup.dismiss.help`, `toast.followUpCopied`, `toast.followUpDismissed`, `toast.followUpBack`; `empty.followups`.

Copy:

```
'followup.head': 'Follow-up: {reason}',
'followup.due': '{reason}. A follow-up is due. Nothing is sent by itself: write it, check it, then copy it.',
'followup.write': 'Write the follow-up',
'followup.copied': 'You copied this follow-up. It has left Follow-ups.',
'followup.dismissed': 'You dismissed this follow-up.',
'followup.putBack': 'Put back in Follow-ups',
'followup.dismiss': 'Dismiss this follow-up',
'followup.dismiss.help': 'Takes it out of Follow-ups, for example when you phoned them instead. Nothing is deleted: it can be put back.',
'toast.followUpCopied': 'Copied. Paste it into the dashboard to send. It leaves Follow-ups.',
'toast.followUpDismissed': 'Dismissed. It leaves Follow-ups.',
'toast.followUpBack': 'Back in Follow-ups',
```

`empty.followups: ['No follow-ups due', 'A conversation appears here when an inspection time has passed or a customer has gone quiet after our reply. Open it and the follow-up is written for you to check.']`.

Composer branch (after the picker, before `optout`):
```
if (item.followUp) {
  const fu = item.followUp; const mine = item.anchor === `fu:${fu.id}`;
  if (fu.done === 'dismissed') → quiet box: t('followup.dismissed') + button t('followup.putBack') → restoreFollowUp(item); return
  if (fu.done === 'copied') → a 'draft-head' line t('followup.copied') + Put back button; then if (mine && d?.status === 'ready') mountEditor(...); return
  if (mine && d && d.status === 'ready') → 'draft-head' line t('followup.head', { reason }) then mountEditor(...); return
  → quiet box: t('followup.due', { reason }), prompt.button, writeBtn(t('followup.write')), prompt.row; return
}
```
`open(key, followUpId = null)`: `state.followUp = followUpId`; fetch with `?followup=` when set; after `renderChat`, `if (followUpId && item.followUp && !item.followUp.done && !(item.draft?.status === 'ready' && item.anchor === \`fu:${followUpId}\`) && !item.writing) write(item, '')`. `write`: `const fu = state.followUp || (item.followUp && !item.followUp.done ? item.followUp.id : null); if (fu) state.followUp = fu;` and post `{ instruction, message, followup: fu || undefined }`. `refreshDetail`: append `followup=${state.followUp}` (as a second query parameter when `?message=` is already there). `showSection` and `open` reset `state.followUp = null` first. `noteCopied`: `if (out.followUpDone) { refreshList(); refreshDetail(); }`; `doCopy`'s toast: `item.followUp && item.anchor === \`fu:${item.followUp.id}\` ? t('toast.followUpCopied') : …`. The details panel: when `item.followUp && !item.followUp.done` a section with `h4 'Dismiss'`, the help line and the button `t('followup.dismiss')` → `dismissFollowUp(item)` (on the Follow-ups tab the row leaves the list and the next row opens, as `dismissItem` does; elsewhere only a toast with Undo → `restoreFollowUp`). `rowTags`: first, `if (r.followUp && !r.followUp.done) tags.push({ text: r.followUp.reason, tone: 'warning' })`. Chip counts: `count: tb.counted ? n : tb.countOf ? (state.counts[tb.countOf] || 0) : 0`. The row: `onOpen: (key) => actions.open(key, r.followUp?.id || null)`; `composerSignature` adds `item.followUp?.id, item.followUp?.done, state.followUp`.

- [ ] **Step 1: Write the failing tests** (in `test/page.test.js`)

```js
assert.deepEqual(SECTIONS.dashboard.tabs.map((x) => x && x.id), ['all', 'waiting', 'followups'], 'every conversation first, Waiting as a filter, then the follow-ups that are due');
assert.equal(SECTIONS.dashboard.empty.followups.length, 2);
assert.deepEqual(rowTags({ section: 'dashboard', state: 'answered', followUp: { reason: 'Inspection passed', done: '' } }, state), [{ text: 'Inspection passed', tone: 'warning' }]);
assert.deepEqual(rowTags({ section: 'dashboard', state: 'answered', followUp: { reason: 'Quiet 3 days', done: 'copied' } }, state), []);
assert.equal(t('followup.head', { reason: 'Quiet 3 days' }), 'Follow-up: Quiet 3 days');
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test test/page.test.js`
Expected: FAIL on the tabs assertion.

- [ ] **Step 3: Implement** as specified.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test test/page.test.js test/editor.test.js test/workspace.test.js`
Expected: PASS.

- [ ] **Step 5: Look at it in a browser** (see Verification below) and fix what reads wrong.

- [ ] **Step 6: Commit**

```bash
git add web/sections/registry.js web/views/ListColumn.js web/app.js web/lib/copy.js test/page.test.js
git commit -m "Follow-ups: the tab, the reason on the row, and the follow-up in the message box"
```

---

### Task 9: Docs, the whole suite, privacy

**Files:**
- Modify: `README.md` ("The list on the left" ~719, "The message box" ~746, "What gets no suggestion" ~320, "How Wheelman learns" ~1327 one line, "Commands"/settings table if one lists `.env` knobs)
- Modify: `CHANGELOG.md` (Unreleased › Added)

- [ ] **Step 1: Write the docs.** README: the third chip and what fills it; the follow-up in the message box (the reason, Copy counts as done, Put back, Dismiss with Undo, a conversation opened from All shows "A follow-up is due"); follow-ups are never written in the background and never learned from; the four settings. CHANGELOG: one **Added** entry in the owner's words ("the owner, 20 Oct 2026: for this customer I want to follow up how his inspection went… it would be wise not to ask that directly").

- [ ] **Step 2: Run everything**

Run: `npm.cmd test` then `npm.cmd run check-private`
Expected: the suite passes except the two pre-existing `leaked: 0491` failures in `test/imports.test.js` and `test/orders.test.js` (present on `main` before this branch); check-private finds nothing.

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "Follow-ups: the README and the changelog"
```

---

## Verification in the browser

No demo mode exists. From the worktree, with a scratch database:

1. Write `C:\Users\jimca\AppData\Local\Temp\claude\d--Jim-Wheelman\e686b100-7b8e-4481-ab71-852978bec819\scratchpad\seed-followups.mjs`: sets `DB_PATH` to a scratch file, imports `src/db.js`, inserts an invented stock car, a lead with a booking enquiry for yesterday 2 pm with our confirmation text after it, a lead with our reply 61 hours ago, then calls `refreshFollowUps`.
2. Run the app from the worktree on port 3211 with `DB_PATH` the scratch file, `FOLLOW_UP_QUIET_HOURS=1`, no dashboard login (the sync fails harmlessly; the list still serves).
3. In Chrome (Playwright when the extension is off): the Follow-ups chip shows 2; the rows carry "Inspection passed" and "Quiet 3 days"; opening one shows the shimmer then the editor headed "Follow-up: Inspection passed" with Carbarn in the first sentence, the booked day in words and the deposit line; Copy → the toast, the row leaves the tab, the box says it was copied with Put back; Put back → the row is back; Dismiss in the panel → Undo; the same conversation opened from All shows "A follow-up is due" and a Write button, and nothing is written until it is pressed. Screenshots from this invented data go in the PR.
