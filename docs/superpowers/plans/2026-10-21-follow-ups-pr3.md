# Follow-ups PR 3: stock news. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a car a customer asked about lands at the showroom, drops in price, or sells, the conversations about it from the last month are due a follow-up with that news, the sold one offering two cars like it.

**Architecture:** `upsertVehicle` compares each car with its stored row and keeps a `vehicle_events` row for a change worth telling (landed, price down by $100 or more, sold), only when the stored row was updated within two days. The engine reads the car's fresh events for each conversation and raises a `stock_landed`, `stock_price` or `stock_sold` row for the newest one, hanging on the customer's last word; news replaces an open quiet nudge, and the quiet nudge is skipped while a stock row stands. A second candidate pass reaches conversations of the last `FOLLOW_UP_STOCK_DAYS` days when there are fresh events. Three new parts in `voice/dashboard-messages.md` carry the news; the sold one lists two similar cars from `alternatives`.

**Tech Stack:** Node 24 ES modules, `node:sqlite`, vanilla JS page, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-follow-ups-design.md` (section 2 decision 3 "Stock news", section 4, section 6, section 7 item 3). Branch `follow-ups-stock` is cut from `follow-ups-reminder` (PR 2, #56, open, on `follow-ups`, PR 1, #55, open): everything PRs 1 and 2 built is in place.

## Global Constraints

- Dashboard (`c:`/`l:`) conversations only; nothing is sent by Wheelman; nothing written for a follow-up is learned from.
- Stock news: landed or arrived at Lidcombe (availability becomes `available`), price dropped ($100 or more), or sold (then two similar cars from stock); events only when the previous row was updated within two days; stock news reaches conversations from the last 30 days (`FOLLOW_UP_STOCK_DAYS`, `config.followUp.stockDays`, already 30); the quiet nudge is skipped while a stock row is open (spec sections 4, 6, 7).
- Never for a buyer (`item.deal`), an opt-out, a no, a dismissed conversation; the eligibility rules of PR 1 hold.
- Due times land inside 9 to 18 Sydney (`atSensibleHour`); Carbarn named in the first sentence; never "just checking in".
- Copy strings in the settled words; tests use invented data only (phones from `phoneOf(70)` up); `npm.cmd run check-private` passes; commits in the owner's name only, no AI attribution lines.

## Review Focus

1. The customer who bought the car (a sale on their number) must never be told "it has sold" (Task 3: the buyer gets nothing).
2. A customer we have already told (our text after the event) must not be told again (Task 3).
3. The first sync after this upgrade, or after days of downtime, must not flood the tab: a stored row older than two days yields no event (Task 1).
4. A conversation with an open quiet nudge whose car then sells gets the news instead, not both (Task 3: the quiet row lapses, the stock row stands; and no quiet row is raised while a stock row stands).
5. A price that moves by less than $100, or up, is not news; a sale that is only another customer's deposit is not "sold" (Task 1: `availability().code` decides, not the deposit).

---

### Task 0: Commit this plan

- [ ] **Step 1:** `npm.cmd run check-private` → `Nothing private found. Safe to commit.` (empty `data/.session.json` first if a suite run left the stand-in session there).
- [ ] **Step 2:** `git add docs/superpowers/plans/2026-10-21-follow-ups-pr3.md && git commit -m "Follow-ups: the plan for stock news"`

---

### Task 1: The stock list's changes, kept as events

**Files:**
- Modify: `src/db.js` (SCHEMA after `followups` ~line 70-84; `upsertVehicle` ~731; new readers beside `allVehicles` ~834)
- Test: `test/followup.test.js` (append)

**Interfaces:**
- Produces, exported from `src/db.js`:
  - the table `vehicle_events (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL, stock_no TEXT, event TEXT NOT NULL, at INTEGER NOT NULL, data_json TEXT)` with index `vehicle_events_at ON vehicle_events(at)`; `event` is `'landed' | 'price' | 'sold'`.
  - `upsertVehicle(v, { now = Date.now() } = {})`: before writing, reads the stored row; when one exists and `now - row.updated_at <= 2 * DAY`, compares `availability(prev)` with `availability(v)` (`src/normalize.js`) and the prices: code not `available`/`sold` → `available` is `landed`; code not `sold` → `sold` is `sold`; both prices numbers and `prev.price - v.price >= 100` is `price` with `data: { from: prev.price, to: v.price }` (`landed`/`sold` carry `{ from: prevCode, to: code }`). At most one of `sold`/`landed` and one `price` per call. `updated_at` is written as `now`.
  - `vehicleEventsFor(vehicleId, sinceMs) → row[]` oldest first, and `vehicleEventsSince(sinceMs) → row[]`, rows `{ id, vehicle_id, stock_no, event, at, data }` with `data` parsed (`{}` when null).

- [ ] **Step 1: Write the failing test**

```js
test("the stock list's changes are kept as events: landed, a price down by $100 or more, sold; nothing on first sight or from a stale row", () => {
  const voxy = (extra) => ({ id: 900, stockNo: '9900', title: '2019 Toyota Voxy', year: '2019', make: 'TOYOTA', model: 'Voxy', modelCode: 'ZRR80', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Transit', price: 30000, odometer: 50000, ...extra });
  db.upsertVehicle(voxy({}), { now: NOW - 5 * HOUR });
  assert.deepEqual(db.vehicleEventsFor(900, 0), [], 'first sight');
  db.upsertVehicle(voxy({ stockIn: 'Online' }), { now: NOW - 4 * HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Online', price: 29950 }), { now: NOW - 3 * HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Online', price: 29800 }), { now: NOW - 2 * HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Online', price: 29800 }), { now: NOW - HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Sold', soldStatus: 'Sold', price: 29800 }), { now: NOW });
  assert.deepEqual(db.vehicleEventsFor(900, 0).map((e) => [e.event, e.at, e.data]), [['landed', NOW - 4 * HOUR, { from: 'transit', to: 'available' }], ['price', NOW - 2 * HOUR, { from: 29950, to: 29800 }], ['sold', NOW, { from: 'available', to: 'sold' }]]);
  assert.deepEqual(db.vehicleEventsSince(NOW - 90 * MIN).map((e) => e.event), ['sold']);
  // A row last seen three days ago: whatever changed since is not news.
  db.upsertVehicle(voxy({ id: 901, stockNo: '9901' }), { now: NOW - 3 * DAY });
  db.upsertVehicle(voxy({ id: 901, stockNo: '9901', stockIn: 'Online', price: 20000 }), { now: NOW });
  assert.deepEqual(db.vehicleEventsFor(901, 0), [], 'stale row');
});
```

- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test test/followup.test.js` → FAIL, `db.vehicleEventsFor is not a function`.
- [ ] **Step 3: Implement** as the Interfaces block says. Read the stored row with `SELECT data_json, updated_at FROM vehicles WHERE id = ?` before the upsert; `availability` is imported from `./normalize.js` (check that `normalize.js` does not import `db.js`).
- [ ] **Step 4:** Run `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/list.test.js test/pipeline.test.js` → PASS.
- [ ] **Step 5:** `git add src/db.js test/followup.test.js && git commit -m "Follow-ups: the stock list's changes are kept as events"`

---

### Task 2: The three messages and their facts

**Files:**
- Modify: `voice/dashboard-messages.md` (three parts after `inspection_reminder`; the header's signals and facts)
- Modify: `src/sectiontemplates.js` (`SIGNALS` ~35: `'car landed', 'price dropped', 'car sold news'`; `CAR_FACTS` ~50: `'old_price', 'similar_cars', 'if_no_similar_cars'`; `FOLLOW_UP_WORDS` ~52: `stock_landed: 'car landed', stock_price: 'price dropped', stock_sold: 'car sold news'`; `composeSectionTemplate` values ~280)
- Test: `test/followup.test.js`

**Interfaces:**
- Consumes: `alternatives(v, all, max)` (`src/knowledge.js`), `allVehicles()` (`src/db.js`), `money` (`src/imports.js`), `item.followUp.data` for stock kinds: `{ event, from, to }`.
- Produces: facts `old_price` (`money(fu.data.from)` when `fu.kind === 'stock_price'` and `from` is a number, else null); `similar_cars` (for `fu.kind === 'stock_sold'`: `similarCarsText(v)`, else null); `if_no_similar_cars` (`fu?.kind === 'stock_sold' && !similar_cars`). Exported `similarCarsText(v, { max = 2 } = {}) → string | null`: `alternatives(v, allVehicles(), max)` as one paragraph per car, `${title}, ${money(price)}, ${Number(odometer).toLocaleString('en-AU')} km:\n${url}`, joined by a blank line; null when none. The parts:

```
# News about the car they asked about: landed, the price dropped, or sold (then two like it).
===== stock_landed =====
@label: Car landed
@fits: car landed
@not: buyer, car sold
{greeting}

Team Carbarn here. The {car} you asked about has arrived at our Lidcombe showroom and can be seen now.

{invitation}

{sign_off}

===== stock_price =====
@label: Price dropped
@fits: price dropped
@not: buyer, car sold
{greeting}

Team Carbarn here. The {car} you asked about is now {price}, down from {old_price}.

{invitation}

{sign_off}

===== stock_sold =====
@label: Car sold: two like it
@fits: car sold news
@not: buyer
{greeting}

Team Carbarn here. The {car} you asked about has now been sold.

{if_similar_cars}We have these, if one of them suits:

{similar_cars}

{if_no_similar_cars}You can see the cars we have available now here:
{stock_link}

{sign_off}
```

Header: signals `car landed, price dropped, car sold news (news about the car they asked about, on a follow-up)`; facts `{old_price}   the price before it dropped, on that follow-up`, `{similar_cars}   two cars like the one that sold, each with its price, kilometres and page, on that follow-up`, `{if_no_similar_cars}   keeps its paragraph when there are none`.

- [ ] **Step 1: Write the failing test** (the compose step alone: the follow-up is handed in as a row-shaped object, no engine yet)

```js
test('the news messages: the price before, two cars like the one that sold, and the showroom when there are none', async () => {
  const noah = items.itemFromKey('c:201');   // Priya's Noah 1159; the second Noah 1160 was pushed into stock in before()
  const soldRow = { id: 0, kind: 'stock_sold', reason: 'Car sold', template: 'stock_sold', data: { event: 'sold' } };
  const s = await st.composeSectionTemplate({ ...noah, followUp: soldRow }, 'stock_sold', { now: NOW });
  assert.match(s.values.similar_cars, /^2020 Toyota Noah Si, \$27,900, 70,000 km:\nhttps:\/\/www\.carbarn\.com\.au\/vehicles\/toyota\/noah\/zrr80w\/1160$/);
  assert.match(s.text, /Team Carbarn here\. The 2021 Toyota Noah X \(8 Seater\) you asked about has now been sold\.\n\nWe have these, if one of them suits:\n\n2020 Toyota Noah Si/);
  const serena = items.itemFromKey('c:205');   // Yuki's Serena: nothing like it in stock
  const none = await st.composeSectionTemplate({ ...serena, followUp: soldRow }, 'stock_sold', { now: NOW });
  assert.deepEqual([none.values.similar_cars, none.values.if_no_similar_cars, /available now here:\nhttps:\/\/www\.carbarn\.com\.au\/used-cars/.test(none.text)], [null, true, true]);
  const price = await st.composeSectionTemplate({ ...noah, followUp: { id: 0, kind: 'stock_price', reason: 'Price dropped', template: 'stock_price', data: { event: 'price', from: 29900, to: 28900 } } }, 'stock_price', { now: NOW });
  assert.match(price.text, /is now \$28,900, down from \$29,900\.\n\n/);
  assert.match(price.text, /#inspection=onsite/);
  assert.deepEqual(st.checkTemplates(), []);
});
```

- [ ] **Step 2:** Run → FAIL (`similar_cars` undefined / the parts missing).
- [ ] **Step 3: Implement** the parts, the signals, the fit words and the facts.
- [ ] **Step 4:** Run `node --disable-warning=ExperimentalWarning --test test/followup.test.js test/sectiontemplates.test.js test/templates.test.js` → PASS.
- [ ] **Step 5:** `git add voice/dashboard-messages.md src/sectiontemplates.js test/followup.test.js && git commit -m "Follow-ups: the three news messages and their facts"`

---

### Task 3: The engine: news for the conversations about that car

**Files:**
- Modify: `src/followup.js` (`dueFollowUps` ~89-160: a stock branch before the quiet branch; the quiet branch skipped while a stock candidate or an open stock row exists; `refreshFollowUps` ~175: the per-item work extracted and a second pass over the last `stockDays` days when there are fresh events)
- Test: `test/followup.test.js`

**Interfaces:**
- Consumes: `vehicleEventsFor`, `vehicleEventsSince` (Task 1), `cfg.stockDays`.
- Produces: in `dueFollowUps`, for `v = item.vehicles?.[0]`, the newest event `e` of `vehicleEventsFor(v.id, now - cfg.stockDays * DAY)` with `e.at > (lastTheirs?.at || 0)`, `e.at > (lastOurs?.at || 0)` and `e.at <= now` gives `{ kind: 'stock_' + e.event, occasion: 'stock:' + v.id + ':' + e.event + ':' + e.id, sinceAt: lastTheirs.at, reason: { landed: 'Car landed', price: 'Price dropped', sold: 'Car sold' }[e.event], template: 'stock_' + e.event, dueAt: atSensibleHour(e.at), data: { event: e.event, from: e.data.from, to: e.data.to, vehicleId: v.id } }`; a `landed` or `price` event is skipped when `availability(v).code === 'sold'` now (the sold news covers it, and the car may be reserved); a stock candidate never calls `blocked()`; the quiet branch runs only when there is no stock candidate and no open row (`!done_how`) whose kind starts with `stock_`. `refreshFollowUps`: the per-item routine is one function `refreshItem(item, { now, cfg, seen })`; after the main loop, when `vehicleEventsSince(now - 2 * DAY)` is not empty, a second loop over `listItems({ source: 'dashboard', states: ['answered', 'ack'], maxAgeHours: cfg.stockDays * 24, limit: Infinity })` runs `refreshItem` for items not yet seen whose `vehicles?.[0]?.id` is among those events' `vehicle_id`s.

- [ ] **Step 1: Write the failing tests** (events come from a forced stock sync at the real clock, so these refresh at `LATER()`, a day on, when any due time of today has passed; the candidate windows are measured from the real clock too)

```js
const LATER = () => Date.now() + DAY;
const restock = async (id, patch) => { Object.assign(standins.world.vehicles.find((v) => v.id === id), patch); await sync.syncAll({ vehicles: { force: true } }); };

test('a car that lands is news to the conversations about it from the last month, with the invitation; the buyer and a customer we told get nothing', async () => {
  // The Prius 1500 (id 6) is in transit. Kim asked three weeks ago; Lou bought it; Oli was told by us after it landed.
  const kim = replied(70, 'Kim', { inAt: NOW - 20 * DAY, outAt: NOW - 20 * DAY + HOUR, stocks: ['1500'] });
  const lou = replied(71, 'Lou', { inAt: NOW - 8 * DAY, outAt: NOW - 8 * DAY + HOUR, stocks: ['1500'] });
  db.upsertSale({ vehicleId: 6, saleId: 9071, stockNo: '1500', stage: 'PENDING_PAYMENT', soldAt: NOW - 2 * DAY, paid: 'part', phones: normalize.phoneKeys(phoneOf(71)), email: '' });
  const oli = replied(72, 'Oli', { inAt: NOW - 6 * DAY, outAt: NOW - 6 * DAY + HOUR, stocks: ['1500'] });
  await restock(6, { stockIn: 'Online', status: 'PUBLISHED' });
  msg(372, 'OUT', 'Hello Oli, the Prius has arrived, come and see it.', Date.now() + 1000);
  followup.refreshFollowUps({ now: LATER() });
  const r = openFor(kim)[0];
  assert.deepEqual([r?.kind, r?.reason, r?.template, r?.data.event, r?.data.vehicleId], ['stock_landed', 'Car landed', 'stock_landed', 'landed', 6]);
  assert.deepEqual([openFor(lou), openFor(oli)], [[], []], 'not the buyer, not someone we told');
  ai.behave = echoFit;
  let d;
  try { d = (await post(`/api/items/${kim}/draft`, { followup: r.id, message: 'stock_landed' })).json.item.draft; } finally { ai.behave = null; }
  assert.match(d.reply, /Team Carbarn here\. The 2017 Toyota Prius S you asked about has arrived at our Lidcombe showroom and can be seen now\.\n\n[\s\S]*#inspection=onsite/);
  assert.ok(!d.checks.some((c) => c.code === 'followup-new'), 'the news is the new thing');
});

test('a price drop replaces the landed news; a sale replaces that and offers two like it; the quiet nudge waits while news stands', async () => {
  const kim = 'c:370';
  const landed = openFor(kim)[0];
  await restock(6, { auPublishPrice: 18500 });
  followup.refreshFollowUps({ now: LATER() });
  const price = openFor(kim)[0];
  assert.deepEqual([openFor(kim).length, price?.kind, price?.data.from, price?.data.to, db.getFollowUp(landed.id).done_how], [1, 'stock_price', 18900, 18500, 'lapsed']);
  // Nia asked about the Noah two and a half days ago: a quiet nudge is due; the Noah sells first.
  const nia = replied(73, 'Nia', { inAt: NOW - 62 * HOUR, outAt: NOW - 61 * HOUR, stocks: ['1159'] });
  await restock(1, { status: 'UNPUBLISHED', soldStatus: 'Sold', stockIn: 'Sold' });
  followup.refreshFollowUps({ now: LATER() });
  assert.deepEqual(openFor(nia).map((x) => x.kind), ['stock_sold'], 'the news, not the nudge');
  const sold = openFor(nia)[0];
  ai.behave = echoFit;
  let d;
  try { d = (await post(`/api/items/${nia}/draft`, { followup: sold.id, message: 'stock_sold' })).json.item.draft; } finally { ai.behave = null; }
  assert.match(d.reply, /has now been sold\.\n\nWe have these, if one of them suits:\n\n2020 Toyota Noah Si, \$27,900, 70,000 km:\nhttps:\/\/www\.carbarn\.com\.au\/vehicles\/toyota\/noah\/zrr80w\/1160/);
  db.closeFollowUp(sold.id, 'copied');
  followup.refreshFollowUps({ now: LATER() });
  assert.deepEqual(openFor(nia), [], 'no quiet nudge on the silence the news answered');
});
```

(Kim's quiet nudge: at `LATER()` her last text is 21 days old, past `maxAgeDays`, so only the news can reach her; the second pass finds her. Nia is in both windows. The Prius fixture: `car(6, '1500', '2017 Toyota Prius S', …, { fuel: 'Hybrid', status: 'UNPUBLISHED', stockIn: 'Transit' })`, price 18900. Selling the Noah 1159 also reaches other fixture conversations about it that are answered; they are not asserted on.)

- [ ] **Step 2:** Run → FAIL (no stock row).
- [ ] **Step 3: Implement** as the Interfaces block says. Update the module's top comment (four reasons).
- [ ] **Step 4:** Run `node --disable-warning=ExperimentalWarning --test test/followup.test.js` → PASS, PR 1 and PR 2 tests included.
- [ ] **Step 5:** `git add src/followup.js test/followup.test.js && git commit -m "Follow-ups: news about the car they asked about reaches the conversations of the last month"`

---

### Task 4: What the AI is told, the checks, the page's words, the setting and docs

**Files:**
- Modify: `src/prompt.js` (~778-790: the FOLLOW-UP rules by kind), `src/fitter.js` (~153: the follow-up line by kind), `src/checks.js` (~398: `followup-new` skipped for kinds starting with `stock_`; `followup-long` skipped for `stock_sold` as for `reminder`)
- Modify: `web/sections/registry.js` (`empty.followups[1]`: "… a visit is booked for tomorrow, there is news about their car, or a customer has gone quiet …")
- Modify: `.env.example` (after `FOLLOW_UP_REMINDER_HOUR`: `# How far back a conversation is told news about its car (landed, price dropped, sold), in days` / `FOLLOW_UP_STOCK_DAYS=30`), `README.md` ("### Follow-ups": a fourth reason bullet, "Four reasons", the table row), `CHANGELOG.md` (Unreleased › Added, above the reminder entry)
- Test: `test/followup.test.js`

**Interfaces:**
- Produces: for `fu.kind` starting with `stock_`, the FOLLOW-UP section's rule line is `This is news about the car they asked about: ${fu.reason}${price: " (from $18,900 to $18,500)"}. Name us in the first sentence ("Team Carbarn here") and say the news plainly; the message carries it and the one thing to offer with it. Nothing else new, no urgency, no question beyond the invitation the message has. Never "just checking in", "just following up" or "touching base". If their last message was a no, write nothing and set hold to true.`; the fitter's line is `This is news about the car they asked about (see FOLLOW-UP below): keep the news and every figure as the message has them, add no question, and never "just checking in" or "just following up".`

- [ ] **Step 1: Write the failing test**

```js
test('the AI is told it is news about the car, and the checks do not ask the news for something new', async () => {
  const price = openFor('c:370')[0];
  assert.equal(price?.kind, 'stock_price');
  ai.behave = echoFit;
  let out;
  try { out = await post('/api/items/c:370/draft', { followup: price.id, message: 'stock_price', instruction: 'add that it is a hybrid' }); } finally { ai.behave = null; }
  assert.equal(out.status, 200);
  const asked = ai.seen[ai.seen.length - 1].messages[1].content;
  assert.match(asked, /news about the car they asked about: Price dropped \(from \$18,900 to \$18,500\)/);
  assert.doesNotMatch(asked, /as if the visit happened|still to come/);
  assert.deepEqual(checks.followUpChecks({ body: 'Team Carbarn here. The 2017 Toyota Prius S you asked about is now $18,500, down from $18,900.', kind: 'stock_price' }), []);
  assert.deepEqual(checks.followUpChecks({ body: `Team Carbarn here. The car you asked about has now been sold. ${'word '.repeat(60)}`, kind: 'stock_sold' }), []);
  assert.ok(checks.followUpChecks({ body: `Team Carbarn here. ${'word '.repeat(60)}`, kind: 'stock_price' }).some((c) => c.code === 'followup-long'));
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the prompt and fitter lines, the checks, the page line, the setting and the docs. README bullet: `**Car landed, Price dropped, Car sold**: news about the car they asked about, for the conversations of the last 30 days (`FOLLOW_UP_STOCK_DAYS`): it has arrived at the showroom and can be seen, its price has dropped by $100 or more (the old and the new price), or it has sold, with two cars like it from stock. The newest news only; it takes the place of a quiet nudge, and nobody we have already told, nor the buyer, gets it. A change seen after the stock list was out of date for more than two days is not news.` Table row: `| `FOLLOW_UP_STOCK_DAYS` | How far back a conversation is told news about its car, in days | `30` |`. CHANGELOG: one Added entry in the owner's words ("Stock news about their car: landed or arrived at Lidcombe, price dropped, or sold (then two similar cars from stock)", 20 Oct 2026).
- [ ] **Step 4:** `npm.cmd test` → the suite passes except the two pre-existing failures (`test/imports.test.js`, `test/orders.test.js`); then empty `data/.session.json` and `npm.cmd run check-private` → nothing found.
- [ ] **Step 5:** `git add src/prompt.js src/fitter.js src/checks.js web/sections/registry.js .env.example README.md CHANGELOG.md test/followup.test.js && git commit -m "Follow-ups: what the AI is told about news, the checks, the setting, the README and the changelog"`

---

## Verification in the browser

The PR 2 demo script (session scratchpad `demo-followups.mjs`) pointed at this worktree, with one more conversation about the Prius 1500 three weeks old, the Prius set `stockIn: 'Online', status: 'PUBLISHED'` in `standins.world.vehicles` after the first sync, then `sync.syncAll({ vehicles: { force: true } })` before `refreshFollowUps()`. Expected: a row tagged **Car landed**; opening it writes "The 2017 Toyota Prius S you asked about has arrived at our Lidcombe showroom and can be seen now." with the invitation.
