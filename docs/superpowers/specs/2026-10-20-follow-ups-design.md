# Follow-ups: Wheelman writes again when there is a reason to

Design approved by the owner on 20 October 2026. The implementation plans are in
`docs/superpowers/plans/2026-10-20-follow-ups-pr1.md` and the two that follow it.

## 1. Why

Today Wheelman only writes when the customer wrote last. When our message is the last one the
conversation is `answered` and the message box says "We have replied. Nothing is waiting here."
There is no way to get a draft. The case that prompted this: a customer booked an on-site
inspection of a van for a Wednesday at 2 pm and the owner confirmed it by text. Nothing will prompt
him to write after the inspection, and when he does he wants to ask how it went, never whether the
customer turned up.

The 12 October design (`2026-10-12-sales-first-design.md`, sections 4.7 and 7.7) planned a
"Follow up on request" button, never automatic. It was pull request 8 of 11 and was never built;
that programme stopped after pull request 6. On 20 October the owner decided differently: a
Follow-ups tab that fills itself, with four triggers.

## 2. The owner's decisions (20 October 2026)

1. A **Follow-ups tab** in the Dashboard section beside All and Waiting. It fills itself: a row
   appears when a trigger fires, with the reason on the row. No notices in the All list.
2. The draft is written when he opens the conversation from that tab, not ahead by the worker,
   so no AI spend on conversations he never follows up.
3. All four triggers:
   - **Inspection time has passed**: how it went, written assumptively; the refundable holding
     deposit offered once as the way to take the car off the market.
   - **Quiet 2 to 3 days after our reply**: one nudge with something new.
   - **Stock news about their car**: landed or arrived at Lidcombe, price dropped, or sold (then
     two similar cars from stock).
   - **Inspection reminder the day before**, with the address, written by code.

## 3. Goals, non-goals, anti-goals

**Goals.** A conversation where we wrote last is put in front of the owner when there is a reason
to write again, with the reason and a draft he can send as it stands. Nothing is ever sent by
Wheelman. Nothing is learned from a follow-up. The owner corrects the wording in his own file.

**Non-goals (later asks).** Marketplace, Import Query and Auction follow-ups; outcomes and the
Sales board; the customer read; sending texts through the phone add-on.

**Anti-goals.** A follow-up after a no, an opt-out, to a buyer, to a dismissed conversation, or a
second one while the first stands unanswered. "Just checking in." Asking whether they came. A
notice in the All list. A badge counting follow-ups as unread. The first run after the upgrade
flooding the tab with old conversations.

## 4. Decisions made by the builder (the owner can overrule any)

- Dashboard (SMS) conversations only. Marketplace has many short chats and a self-filling tab
  there would be noise; Auction already has its own due messages.
- Cap: at most two bursts of our messages since the customer last wrote or acted (texts within 15
  minutes count as one burst). A new customer message or booking resets it, and so does a booked
  time passing, otherwise the confirmation and the reminder would block the "how did it go".
- One follow-up per silence: no new row while an open or copied row hangs on the same or a later
  moment of the customer's.
- Copy counts as done, with Put back. Dismiss closes the follow-up and is recoverable.
- Follow-ups never teach Wheelman and never badge as unread. The Follow-ups chip shows its count.
- Rules kept from the 12 October design: Carbarn named in the first sentence, exactly one new
  thing, never "just checking in", greeting and sign-off always on a follow-up, under about 50
  words for a nudge, a failed check gets one retry.
- The reminder and the booking confirmation are written by code from a template, no AI. The
  others are AI-personalised templates through the existing Which message? engine, so the owner
  edits the wording in `voice/dashboard-messages.md` and a Prompt still edits the pick.
- Timings are settings with defaults: quiet after 60 hours; after-inspection 3 hours after the
  booked time; reminder at 4 pm the day before; a follow-up is raised only while our last message
  is under 14 days old; stock news reaches conversations from the last 30 days. Anything due
  outside 9 am to 6 pm Sydney is due at the next 9 am.
- Three pull requests, each usable alone, in this order: the tab and engine with the first two
  triggers; the reminder and the booking confirmation; stock news.

## 5. Facts the design rests on (verified in the code on 20 October 2026)

- `finishItem` (`src/items.js`) makes a conversation `answered` when the last `who==='us'` entry
  has nothing from the customer after it, and **staff notes count as ours** (`internal:true`). The
  engine re-derives "our last real message" from non-internal, non-auto entries.
- Booking events come from the raw enquiry text `"Preferred inspection: On-site on 2026-10-21 at
  02:00 PM."` and `"… scheduled time: 2026-02-22 03:00 PM."` for test drives (`src/text.js`
  `readInquiry`). The timeline entry's `at` is when they booked, not the booked time. The booked
  time is parsed from the enquiry text with `parseDashboardTime` (Sydney-naive).
- Vehicle price is `v.price` inside `data_json`; `upsertVehicle` overwrites with no history; the
  vehicle list refreshes every 30 minutes unless forced.
- Similar cars: `alternatives(v, all, max)` in `src/knowledge.js`.
- The Which message? picker shows on answered conversations too, renders a `due` flag as "(due
  now)", a template with no fitter is written word for word with provider `none`, and the template
  reader keeps any extra `@word:` line in `meta` and top-level `@word:` lines as snippets.
- Dashboard tabs have a free third slot. `GET /api/items` whitelists its tabs.
- Orders' due-message pattern: occasions, anchor `out:<occasion>`, handled = copied or dismissed.
- `undismiss(itemKey)` deletes every dismissal for a key: follow-ups keep their own done state.
- Learning: `canLearnFrom` is key-based; `onCopied` → `learnFrom`; `draftsAwaitingOutcome` would
  return a follow-up draft forever unless its anchor is excluded. `FILLER` already matches "just
  following up / checking in" but as a warn, dropped for template drafts.
- The playbook's "## A follow-up our staff asked for" is already in the system prompt; nothing in
  the user prompt triggers it.
- No demo mode exists. Tests use the stand-ins in `test/support/`, invented data only.

## 6. The shared design

### The table

```sql
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL, lead_id INTEGER,
  kind TEXT NOT NULL,        -- inspection_passed | quiet | reminder | stock_landed | stock_price | stock_sold
  occasion TEXT NOT NULL,    -- said once, ever: 'inspection:i:1011', 'quiet:m:88', 'reminder:i:1011', 'stock:5:sold:17'
  since_at INTEGER NOT NULL, -- the customer's last word or act it hangs on (ms); a later one closes the row
  reason TEXT NOT NULL,      -- the row tag: 'Inspection passed', 'Quiet 3 days'
  template TEXT NOT NULL,    -- the dashboard-messages.md part to write from
  due_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  done_at INTEGER, done_how TEXT, draft_id INTEGER,   -- copied | dismissed | answered | lapsed; NULL = open
  data_json TEXT,            -- { bookedAt, where, kind, deposit, vehicleId, event }
  UNIQUE(item_key, occasion)
);
CREATE INDEX IF NOT EXISTS followups_open ON followups(done_at, due_at);
```

`followups` joins the rekey unions (`l:`→`c:`, `ph:`→`c:`) and `oldRowsStamp`.

### The anchor

A follow-up draft is stored under `anchor_key = 'fu:<id>'`, as an order's due message is stored
under `out:<occasion>`: apart from the reply drafts, found again by `latestDraft`, never in
`draftsAwaitingOutcome`.

### The lifecycle

The worker inserts a row only when it is due (no future rows) → the tab shows it → the owner
opens it from the tab → the page writes the draft → Copy marks `copied` (the row leaves the tab,
the box offers Put back) → Dismiss marks `dismissed` (Undo / Put back clears it) → a later
customer message or act closes any open or copied row `answered` → when the rule stops holding
(car gone, opt-out, buyer, aged out) an open row closes `lapsed`. An occasion once raised is never
raised again (the unique key).

### Eligibility

Checked every worker cycle, and again when a row is opened or drafted:

1. Key `c:`/`l:`, listed in the dashboard section, not under an order, not an import enquiry, with
   a lead record or a name.
2. State `answered` (the quiet nudge) or `answered`/`ack` (the triggers that hang on an event).
3. Never when: a buyer (`item.deal`); any customer text is an opt-out; the customer's last text is
   a decline, a parting or an insult; the conversation was dismissed after their last message and
   we have not texted since.
4. `lastOurs` = the last entry `who==='us' && !internal && !auto` with text or media; `lastTheirs` =
   the last customer entry with text, event or media.
5. Cap: fewer than two bursts of ours since the customer's last word or act (a passed booked time
   counts as an act). No open or copied row with `since_at` at or after the candidate's.
6. A future booking suspends the quiet nudge (the reminder covers it).

### Due time

`atSensibleHour(ms)`: inside 9 to 18 Sydney return it, else the next 9:00.

### Settings

`FOLLOW_UPS` (on), `FOLLOW_UP_QUIET_HOURS` 60, `FOLLOW_UP_AFTER_INSPECTION_HOURS` 3,
`FOLLOW_UP_MAX_AGE_DAYS` 14, `FOLLOW_UP_REMINDER_HOUR` 16, `FOLLOW_UP_STOCK_DAYS` 30.

### The message

Each trigger has a template in `voice/dashboard-messages.md`, offered to a follow-up only (new
fit words `inspection passed`, `quiet`, `reminder`, `car landed`, `price dropped`), marked due in
the picker and written when the conversation is opened from the tab. New facts: `booked_day`
("Wednesday 21 October", "yesterday", "today"), `booked_time` ("2 pm"), `booked_when`,
`deposit_offer` (only when the deposit has not been offered yet), `new_thing` (the one new thing,
from snippets at the top of the file: documents, the walkaround video, a similar car, a time to
come in), `similar_cars`. Greeting and sign-off are always on a follow-up.

The prompt tells the AI it is a follow-up (a `=== FOLLOW-UP ===` section with the reason, the
quiet hours, what we already offered and the one new thing; "THERE IS NO NEW MESSAGE" with the
customer's last message quoted) and the checks hold it to the rules: `followup-identify` (fail:
Carbarn missing from the first sentence), `followup-banned` (fail: "just checking in" family, or
asking whether they came), `followup-new` (warn), `followup-long` (warn over 50 words). One retry.

### The page

A Follow-ups chip in the Dashboard section with its own count. Rows carry the reason as a tag.
Opening a row writes the draft (a shimmer, then the editor headed "Follow-up: <reason>"). Copy
counts as done and the row leaves the tab, with Put back; Dismiss in the details panel, with Undo.
A conversation with a due follow-up opened from All shows "A follow-up is due" with a Write button
and no automatic write.

## 7. The three pull requests

1. **Follow-ups tab and the engine**: the table, `src/followup.js`, the tab, the composer, Copy
   and Dismiss, the two templates `after_inspection` and `quiet_nudge`, the prompt section, the
   checks, the learning guards, settings, tests.
2. **Inspection reminder and booking confirmation by code**: trigger `reminder` (due 4 pm the day
   before; booked for today → none), template `inspection_reminder` with `@fit: no` (word for
   word, no AI); a `booking_confirmed` template offered first in the waiting state when a booking
   event arrives (none exists today).
3. **Stock news**: a `vehicle_events` table written by `upsertVehicle` when availability becomes
   `available` (landed), becomes `sold`, or the price falls by $100 or more, only when the
   previous row was updated within two days; the three templates; `stock_sold` filled with two
   similar cars; the quiet nudge skipped while a stock row is open.

## 8. Left to the builder

File and function names inside `src/followup.js`; the exact regexes; the wording of toasts and
empty states (in the settled words: no "Send:", no "agent"); the test fixtures (invented names,
the 0491 570 1xx numbers).
