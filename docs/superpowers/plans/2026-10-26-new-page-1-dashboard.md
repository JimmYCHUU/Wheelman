# The new page, PR 1: Dashboard texts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a new page at `/new/`, built from the prototype's design, that Jim can use every day for Dashboard texts on his real data, through today's server API, while the old page stays at `/` unchanged.

**Architecture:**
- **Page files.** The new page lives in `web/new/`. It is plain ES modules plus the prototype's vendored Preact + htm file, loaded as a classic script that sets `globalThis.htmPreact`; there is no build step.
- **Testable logic.** Pure modules (`model.js`, `route.js`, `store.js`) hold every rule that can be tested in Node. The components in `web/new/js/ui/` only render the store and call its actions.
- **Server.** The server changes in one place: it serves a folder's `index.html` for `/new/` and redirects `/new` to `/new/`.
- **Preview.** A preview script runs the whole app on invented data on port 3211, for screenshots and checks in a browser.

**Tech Stack:** Node ≥22.13 (built-in test runner, node:sqlite), Preact 10 + htm 3.1.1 (`prototype/vendor/htm-preact.umd.js`, copied unchanged), CSS layers and tokens, Playwright (the MCP browser) for checks on the preview.

**Spec:**
- `eval/redesign/prd-recovered.md` (local, git-ignored): sections 5 (R-numbers), 7, 9, 10, 13 and 14.
- `prototype/` (its `js/ui-thread.js` Composer/Editor/Seg and `js/ui-inbox.js` are the design to port).
- The series: `docs/superpowers/plans/2026-10-26-new-page-programme.md`.

## Global Constraints

- **No dependencies, no build step:**
  - Node `>=22.13`;
  - `npm.cmd run check-deps` passes;
  - the only third-party code is `web/new/vendor/htm-preact.umd.js`, a byte-for-byte copy of `prototype/vendor/htm-preact.umd.js`.
- **The server's security headers are unchanged** (`src/server.js:59`):
  - no inline `<script>` or `<style>`;
  - no `style="…"` in HTML;
  - nothing loaded from another host. Fonts come from `web/fonts/` through `url('../../fonts/…')`.
  - Setting a style from script is allowed only for a computed value, such as a scroll position, never for design values.
- **The old page and today's API behave exactly as before.** The only allowed changes:
  - the static handler change (Task 1);
  - one "Try the new page" link on the old top bar (Task 9).
  
  No API route changes. The new page uses only the routes listed in this plan, with the parameters they take today.
- **Nothing is sent by itself.** PR 1 has no Send: Dashboard replies are copied. Copy is the one main button. There is no "Open in dashboard" button, because the dashboard has no address for each conversation.
- **Words on screen** (PRD section 10):
  - sentence case, plain words, no codes;
  - "Wheelman", never "the agent";
  - times in Sydney time, using `web/lib/format.js`;
  - every button says what it does;
  - red, amber and green always come with a sentence;
  - a blue number means unread and nothing else carries a number;
  - no reminders or notices in the list, only real problems.
- **Section names on the new page:** Dashboard, Marketplace, Imports (the server's `importquery`), Auction. In PR 1 only Dashboard works on the new page; the other three tabs show one line and a link to that section on the old page.
- **Design tokens, exactly as in PRD section 10:**
  - Tray `#E8EDF3` / dark `#0A121C`;
  - Surface `#FFFFFF` / `#111B27`;
  - Surface quiet `#F4F7FA` / `#172331`;
  - Text `#0B1B2B` / `#E7EEF6`;
  - Text secondary `#46586B` / `#A9B7C6`;
  - Line `#DCE3EB` / `#24324A`;
  - Accent `#0073EA` (Carbarn blue) / `#5B9BFF`;
  - Accent soft `#E7F0FD` / `#15294A`;
  - Good `#0F7B4B` on `#E3F4EC` / `#57C892` on `#11301F`;
  - Needs you `#8A5A00` on `#FFF2D3` / `#F0B44C` on `#33270C`;
  - Problem `#B42318` on `#FDECEA` / `#FF8A7E` on `#3A1512`;
  - type Manrope 12/13/14/16/18/24 px, weights 500/600/700, line height 1.45;
  - space 4/8/12/16/20/24/32/40, tile gap 6 px (4 on a phone);
  - corners 6/10/14/18/full;
  - two shadows;
  - motion 120/180/240 ms, none under reduced motion;
  - controls 36 px, 44 px touch targets on a phone, rows 64 px, top bar 56 px;
  - widths: from 1280 px, list 340 + conversation + panel 360; 900–1279 px, the panel is a drawer; under 900 px, one column.
- **Code size and layers.** No file over 400 lines. The page's CSS uses `@layer tokens, base, components, views, utilities`. `npm.cmd run check-css` covers `web/new/css` against `web/new/css/tokens.css`, with the same zero limits.
- **Tests and data.**
  - Tests use invented data only (phones in the `0491 570 1xx` range).
  - `npm.cmd test`, `npm.cmd run check-private`, `npm.cmd run check-deps` and `npm.cmd run check-css` pass.
  - Never open `data/app.db` or port 3210. Browser checks run on the preview at `http://127.0.0.1:3211`.
- **No AI attribution** anywhere: no Co-Authored-By, no "Generated with", no AI name in a file or commit. Commits are in the repo's "Area: what changed" style.

## Review Focus

1. **A poll arriving while Jim types must never replace his text.** The page refreshes every 20 s, so this is the most likely way to lose work.
   - When the open conversation's draft changes and the box holds typed text, the typed text stays.
   - If the customer sent a new message, a context line says so and offers "Use the new suggestion".
   - Pinned in Task 3: `refresh keeps typed text when the draft changes`.
2. **Reply text must survive the pill editor unchanged.** That includes brackets that are not blanks (`[sic]`, `[price]`), several blanks, blank lines, emoji and a trailing newline: parsing into pills and joining back gives the identical string.
   - Pinned in Task 2: `segments and joinSegments round-trip any text`.
3. **A failed copy must not count as copied.**
   - When the clipboard write throws (no permission, page not focused), the page does not mark the row done and does not tell the server it was copied.
   - It says "Could not copy. Select the text and copy it yourself."
   - Pinned in Task 3: `copy that fails leaves the row waiting and the server untold`.
4. **Autosave fails, or the window closes mid-save.** The text stays in the box, the note reads "Not saved yet", a retry follows every 5 s, and the last edit goes out with `keepalive` when the page is hidden.
   - Pinned in Task 3: `a failed save is retried and says Not saved yet`.
5. **Signed-out or shared access.** Any 401 from the API sends the browser to `/signin`, and `/new/` sits behind the same team sign-in as `/`.
   - Pinned in Task 1 (the gate covers `/new/`) and Task 3 (`a 401 goes to the sign-in page`).

---

### Task 1: The server serves the new page, and a preview runs it on invented data

**Files:**
- Modify: `src/server.js:1004-1010` (`serveStatic`)
- Modify: `scripts/check-css-budget.js` (also check `web/new/css`)
- Create: `web/new/index.html` (shell only: the title "Wheelman", the two stylesheets, the vendor script, `js/main.js` as a module, and one `<div id="app">`)
- Create: `web/new/vendor/htm-preact.umd.js` (copy of `prototype/vendor/htm-preact.umd.js`)
- Create: `web/new/css/tokens.css`, `web/new/css/app.css` (empty layers for now, filled in Task 4)
- Create: `web/new/js/main.js` (renders "Wheelman" into `#app` for now)
- Create: `test/support/preview.js`
- Test: `test/newpage-serve.test.js`

**Interfaces:**
- Produces: `GET /new` → 303 with `location: /new/`. `GET /new/` → `web/new/index.html`. `GET /new/<path>` → that file under `web/new/`, with the existing content types and headers.
- Produces: `checkCssBudget(folder)`, now also run on `web/new/css` by the script's main block. Each folder is checked against its own `tokens.css`, and the existing export keeps its signature.
- Produces: `node test/support/preview.js`:
  - it applies the test environment (`applyTestEnv`) and starts the stand-ins (`startStandins` with `fixtures.world()` and a stand-in AI that answers with a plain reply holding one `[PRICE?]` blank);
  - it points config at them (`pointConfigAt`) and sets `config.port = 3211`;
  - it starts the server and runs one sync and one draft pass, then prints `Preview: http://127.0.0.1:3211/new/ (invented data)`;
  - it never reads `.env`, because it is run with plain `node`.

- [ ] **Step 1: Write the failing tests** in `test/newpage-serve.test.js`, starting the server as `test/editor.test.js:15-28` does:
  - `the new page is served at /new/`: `GET /new/` gives 200 and `text/html`, the body contains `<title>Wheelman</title>`, and the `content-security-policy` header is the same string as for `GET /`.
  - `/new redirects to /new/`: with `redirect: 'manual'`, the response is 303 and `location` is `/new/`.
  - `files under /new/ are served and nothing outside web/ is`: `GET /new/js/main.js` gives 200 `text/javascript`; `GET /new/vendor/htm-preact.umd.js` gives 200; `GET /new/..%2f..%2fpackage.json` gives 404.
  - `the old page is unchanged`: `GET /` still returns `web/index.html`, byte for byte.
  - `the team sign-in covers /new/`: through a request carrying `cf-connecting-ip` with sharing on and no cookie, `GET /new/` gives 303 to `/signin`. Follow how `test/share.test.js` sets sharing on.
  - `the CSS check covers the new page`: `checkCssBudget(path.join(root,'web','new','css'))` returns no offenders.
- [ ] **Step 2: Run** `node --test test/newpage-serve.test.js`. Expected: the four `/new` tests fail with 404.
- [ ] **Step 3: Implement.**
  - In `serveStatic`, a path ending in `/` serves that folder's `index.html`, and `/` itself is unchanged.
  - In `handle`/`startServer`, add a redirect from `/new` to `/new/`, before static, for GET only.
  - Keep the `web/` containment check exactly.
  - Create the shell files and the preview script.
- [ ] **Step 4: Run** `node --test test/newpage-serve.test.js` and `npm.cmd test`. Expected: all pass.
- [ ] **Step 5: Run** `node test/support/preview.js` in the background and open `http://127.0.0.1:3211/new/` with Playwright. Expected: the word "Wheelman" and no console errors. Stop the preview afterwards.
- [ ] **Step 6: Commit:** `Server: the new page is served at /new/, and a preview runs Wheelman on invented data`

### Task 2: The page model: rows, people, blanks, checks, the main button, status

**Files:**
- Create: `web/new/js/model.js`. Pure: no DOM, no globals. It imports `../../lib/blank.js` and `../../lib/format.js`.
- Test: `test/newpage-model.test.js`

**Interfaces:**
- Produces, with exact copy:
  - `SECTIONS`: `[{id:'dashboard',label:'Dashboard',ready:true},{id:'marketplace',label:'Marketplace',ready:false},{id:'importquery',label:'Imports',ready:false},{id:'auction',label:'Auction',ready:false}]`.
  - `CHIPS`: `[{id:'waiting',label:'Needs reply'},{id:'followups',label:'Follow-ups'},{id:'all',label:'All'}]`. These ids are the server's `tab` values.
  - `rowView(row, { now, doneAnchor })` returns `{ key, name, when, car, preview, reason, unread, done }`:
    - `name` is `row.name || row.phone || row.email || 'Unknown number'`;
    - `car` is `row.car || ''`;
    - `when` is `listTime(row.lastAt, now)`;
    - `preview` is `'You: '` plus the text when `row.preview.who === 'us'`, and `'Photo'` when there is media and no text;
    - `done` is `doneAnchor === row.anchor`;
    - `unread` is `done ? 0 : row.unread`;
    - `reason` is the first match of: done → `'Copied, waiting for it to show on the dashboard'`; `row.followUp` → `'Follow-up: ' + row.followUp.reason`; flag `'fail'` → `'Check failed'`; flag `'input'` → `'Blank to fill'`; flag `'error'` → `'Not written yet'`; `row.phoneOnly` → `'Phone only'`; otherwise `''`.
  - `whoLabel(m, customerName)` returns `null` for `m.event`; otherwise:
    - a customer message → `customerName || 'Customer'`;
    - ours with `m.auto` → `'Auto-reply'`;
    - ours with `m.phone` → `'Us, from the phone'`;
    - ours with `m.by` → `'Us · ' + m.by`;
    - any other of ours → `'Us'`.
  - `segments(text)` returns `[{kind:'text',text}|{kind:'blank',label,raw}]`, from `blanksIn`. `joinSegments(segs)` returns the string; a blank becomes its `raw`. `fillBlank(segs, i, value)` turns the i-th segment, a blank, into text when `value.trim()` is non-empty, and returns a new array.
  - `boxText(draft)` gives `draft.edited` when it is not `null` (a cleared box is `''`), otherwise `draft.reply`, and `''` when there is no draft.
  - `checkLines(checks)` returns `{ fails, warns, inputs }`, each the `message` strings at that level, in order.
  - `mainAction({ text, checks, overridden })`:
    - a fail that has not been overridden → `{kind:'blocked',label:'Fix the check first',secondary:null}`;
    - otherwise, with n blanks in `text` → `{kind:'fill',label: n===1?'Fill 1 blank':'Fill '+n+' blanks',secondary: n===1?'Copy with the blank':'Copy with the blanks'}`;
    - otherwise → `{kind:'copy',label:'Copy reply',secondary:null}`.
  - `statusWords(status, now)` returns `{tone,text}`:
    - `missing.length` → `bad`, `'Set-up needed: ' + listOf(missing)`, using `web/lib/copy.js`;
    - `syncing` → `busy`, `'Checking for new messages'`;
    - `drafting` → `busy`, `'Writing'`;
    - `lastSync.ok` → `ok`, `'Up to date, checked ' + ago(lastSync.at, now)`;
    - `lastSync` not ok → `bad`, `'Dashboard not reached since ' + clock(lastSync.at)`;
    - no `lastSync` → `busy`, `'Starting'`.
  - `insteadOptions(item)` returns `[{id,label}]`, at most 3, best first. It is taken from `item.templates`, skipping `item.template`. When `item.template` is not `''`, the first option is `{id:'',label:'A reply to what they wrote'}`.
  - `wordCount(text)` returns `{ words, texts }`, where `texts` is `Math.ceil(length/160)` for text messages.

- [ ] **Step 1: Write the failing tests**, one per function, with the exact strings above. Include:
  - `segments and joinSegments round-trip any text`, over `['', 'Hello', 'Price [PRICE?] and [TRADE-IN VALUE?].', 'A [sic] note [price]', 'Two\n\nlines\n', 'Emoji 🙂 [PRICE?]', '[PRICE?][PRICE?]']`;
  - `fillBlank` with a blank value keeps the pill;
  - `mainAction` with 2 blanks and no fail gives `Fill 2 blanks` and `Copy with the blanks`;
  - `rowView` of a done row has unread 0 and the done reason.
- [ ] **Step 2: Run** `node --test test/newpage-model.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `web/new/js/model.js`.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit:** `New page: the page model, in plain words`

### Task 3: API, route and store

**Files:**
- Create: `web/new/js/api.js`, `web/new/js/route.js`, `web/new/js/store.js`. None of them touches the DOM except `api.js`'s 401 redirect, which goes through an injectable `go(url)`.
- Test: `test/newpage-store.test.js`, with a fake API, clipboard, storage and timers. No server.

**Interfaces:**
- Consumes: `model.js` (Task 2).
- Produces:
  - `createApi({ fetch, go })` returns `api(path, body)`:
    - with `body` undefined, a GET; otherwise a POST with `content-type: application/json`;
    - a 401 calls `go('/signin')` and throws;
    - a non-ok response throws `Error(data.error || 'HTTP ' + status)`.
  - `parseRoute(hash)` returns `{ section, chip, key }`, with defaults `dashboard`, `waiting` and `null`; `hashFor({section,chip,key})` gives `#/dashboard/waiting/c%3A123`. The two round-trip.
  - `createStore({ api, clipboard, storage, now, timers, keepalive })` returns `{ get, subscribe, actions }`. `timers` is `{ set(fn,ms), clear(id) }` and `keepalive(path, body)` is `navigator.sendBeacon`-like.
  - State: `{ section, chip, rows, total, counts, unread, listState:'loading'|'ready'|'error', listError, limit:20, key, item, itemState:'idle'|'loading'|'ready'|'error', typed:null, save:{state:'idle'|'saving'|'saved'|'failed', at}, overridden:false, done:{[key]:anchor}, status, toast:null, context:null }`.
    - `typed` is `null` while the box shows the server's text untouched by this page.
    - `done` is loaded from and saved to `storage` under `wheelman.new.done`.
- Actions:

  | Action | What it does |
  | --- | --- |
  | `boot(route)` | `refresh()`, then opens `route.key`, or on wide windows the first row (the UI passes `wide`) |
  | `refresh()` | `GET /api/status`; then `GET /api/items?section=dashboard&tab=<chip>&limit=<limit>`; then, if a conversation is open, `GET /api/items/<key>` |
  | `setChip(id)` | Sets the chip and refreshes. For `followups`, it opens the first row and calls `write({followup})`, as the old page does after PR #59 |
  | `more()` | Raises `limit` by 20 and refreshes |
  | `open(key, {followup})` | `GET /api/items/<key>` (`?followup=<id>` when given), then `POST /api/items/<key>/seen`. Sets `typed` to `null` |
  | `type(text)` | Sets `typed`, then after 600 ms of quiet `POST /api/drafts/<id>/edit {text}`. A failure sets `save.state` to `'failed'` and retries every 5 s |
  | `flush()` | Sends a pending edit at once through `keepalive` |
  | `clear()` | Same as `type('')` |
  | `bringBack()` | Same as `type(draft.reply)` |
  | `write({instruction, message, followup})` | `POST /api/items/<key>/draft`, then sets `item` from the reply and `typed` to `null` |
  | `tell(instruction)` | Same as `write({instruction})`. "Just this once": nothing else is stored |
  | `holdTell(on)` | `POST /api/items/<key>/hold {on}`, renewed every 30 s while on. The UI turns it on while the Tell field has text, and off when the field is empty or the conversation changes, so automatic writing never replaces a draft while Jim types an instruction (as the old Prompt line does) |
  | `instead(id)` | `GET /api/items/<key>?message=<id>`. If that template has no draft yet, then `write({message:id})` |
  | `override()` | Sets `overridden` to true |
  | `copy({withBlanks})` | `await clipboard.writeText(text)`, then `POST /api/drafts/<id>/copied {text}`, then `done[key] = item.anchor` (saved), then a toast `'Copied'` with action `'Put back in Needs reply'` that deletes `done[key]`. If the clipboard throws: none of that, and a toast `'Could not copy. Select the text and copy it yourself.'` |
  | `dismiss()` | `POST /api/items/<key>/dismiss`, then a toast `'Dismissed'` with `'Undo'`, which calls `POST /api/items/<key>/restore` |
  | `dismissFollowUp()` | `POST /api/followups/<id>/dismiss`, with Undo through `/restore` |
  | `copyNumber()` | Copies the number, toast `'Number copied'` |

  - Rows hidden from Needs reply: those whose `done[key]` equals their `anchor`. The waiting count shown is `counts.waiting` minus those rows.
  - `refresh` with an open conversation, when the new `item.draft.id` or `item.anchor` differs from the old one:
    - if `typed` is not `null`, keep `typed` and set `context` to `'New message from the customer. Your text is kept.'`, with the action `'Use the new suggestion'` (sets `typed` to `null`);
    - otherwise take the new draft.
  - Toasts last 9 s with an action and 4 s without.

- [ ] **Step 1: Write the failing tests**:
  - `a 401 goes to the sign-in page`;
  - `routes round-trip`;
  - `refresh keeps typed text when the draft changes`;
  - `typing saves after 600 ms of quiet` (fake timers);
  - `a failed save is retried and says Not saved yet`;
  - `copy marks the row done, tells the server, and Undo puts it back`;
  - `copy that fails leaves the row waiting and the server untold`;
  - `done rows leave Needs reply until a new customer message`: the anchor changes, so the row returns;
  - `choosing Follow-ups opens and writes the first one`;
  - `instead fetches the template and writes it only when it has no draft`;
  - `dismiss offers Undo, which restores`;
  - `the Tell hold is renewed every 30 s and released on close`.
- [ ] **Step 2: Run** `node --test test/newpage-store.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules.
- [ ] **Step 4: Run** the test file and `npm.cmd test`. Expected: PASS.
- [ ] **Step 5: Commit:** `New page: the store, the route and the API client`

### Task 4: Shell, design system and top bar

**Files:**
- Modify: `web/new/index.html`, `web/new/css/tokens.css`, `web/new/css/app.css` (split into `base.css`, `components.css` and `views.css` if any file passes 400 lines), `web/new/js/main.js`
- Create: `web/new/js/ui/html.js` (`export const { html, render, useState, useEffect, useRef, useLayoutEffect } = globalThis.htmPreact`), `web/new/js/ui/app.js`, `web/new/js/ui/topbar.js`, `web/new/js/ui/toast.js`

**Interfaces:**
- Consumes: `createStore`, `parseRoute`/`hashFor` (Task 3); `SECTIONS`, `statusWords` (Task 2).
- `main.js` builds the store with the real `fetch`, `navigator.clipboard`, `localStorage` (wrapped in try/catch), `setTimeout` and `navigator.sendBeacon`, all hidden behind the same names. It renders `App` and keeps the hash in step with the store. It calls `refresh` every 20 s and `flush` on `pagehide`.
- **Top bar:**
  - the Wheelman mark from `web/assets/brand.svg`, used with `<use>`;
  - the four tabs from `SECTIONS`, each with its unread number when above 0. A tab that is not ready shows, in the list column: "Marketplace is still on the old page." with a link "Open it there", pointing to `/#marketplace`, or the old page's own way of opening a section, if it has one;
  - status words with a dot and the colour of their tone;
  - a menu with Theme (Light / Dark / Follow the computer; saved as `wheelman.new.theme`; sets `data-theme` on `<html>`) and "Old page" (`/`).
- The browser tab title is `(N) Wheelman` when N new, else `Wheelman`.
- The toast is a live region (`role="status"`) with its action button.
- Tokens: exactly the Global Constraints values, as CSS custom properties, with dark both under `prefers-color-scheme: dark` (when no `data-theme` is set) and under `[data-theme="dark"]`. Fonts are loaded with `@font-face` from `../../fonts/manrope-latin.woff2` and `../../fonts/montserrat-latin.woff2`.
- Port the prototype's top bar look (`prototype/css/app.css:29-51`, `prototype/js/ui-inbox.js:14-61`). Drop the demo pieces: no "for {dealer}", no demo bar, no Demo controls.

- [ ] **Step 1: Implement** the shell, tokens and top bar.
- [ ] **Step 2: Run** `npm.cmd run check-css`. Expected: `Ad hoc values: none` for both folders.
- [ ] **Step 3: Check on the preview** at 1440×900 and 390×844, light and dark:
  - the tabs and status words show, and Imports, Marketplace and Auction each show their one line and link;
  - the theme choice survives a reload;
  - the console shows no errors.
  
  Save the screenshots to `.playwright-mcp/new-page/` (git-ignored).
- [ ] **Step 4: Commit:** `New page: the shell, the tokens and the top bar`

### Task 5: The list column

**Files:**
- Create: `web/new/js/ui/list.js`
- Modify: the CSS files from Task 4

**Interfaces:**
- Consumes: `rowView`, `CHIPS` (Task 2); the actions `setChip`, `open` and `more`, and the state fields `rows`, `counts`, `listState`, `done` and `total` (Task 3).
- **Chips:** Needs reply (count), Follow-ups (count), All.
- **Rows:**
  - avatar initials (`initials` and `hue` from format.js), name, time, preview, the one reason in words, and the unread badge;
  - the selected row is marked.
- **States:**
  - "Load older conversations" with "N more", while `rows.length < total`;
  - skeleton rows while loading;
  - empty: "No one is waiting." on Needs reply, "No follow-ups are due." on Follow-ups;
  - error: "Wheelman is not responding. It tries again every 20 seconds."
- **Keyboard:** Up, Down, Home and End move between rows with a roving `tabindex`.
- **Opening:** clicking a row sets the hash and calls `open`.
- Port the look from `prototype/js/ui-inbox.js:63-145` and `prototype/css/app.css:71-113`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Check on the preview:**
  - the invented waiting customers show with their reasons;
  - Follow-ups opens the first one and writes it;
  - opening a row clears its blue number;
  - Load older adds rows;
  - arrow keys move between rows;
  - a 390 px width has no sideways scroll.
- [ ] **Step 3: Commit:** `New page: the list, with Needs reply, Follow-ups and All`

### Task 6: The conversation

**Files:**
- Create: `web/new/js/ui/conversation.js`, `web/new/js/ui/menu.js`
- Modify: the CSS files

**Interfaces:**
- Consumes: `whoLabel` (Task 2); `item`, `itemState` and the actions `dismiss`, `dismissFollowUp` and `copyNumber` (Task 3); `GET /api/items/<key>/thread?shown=<n>&limit=20` for Load older.
- **Head:**
  - back (phone width only), the name, and a sub line (situation, or "Writing a suggestion…" while `item.writing`);
  - a menu button that opens Dismiss, "Dismiss this follow-up" (when `item.followUp`) and Copy number (or "Copy email").
- **Car strip** when `item.vehicle`: title, price (`money`), kilometres (`km`), `availability.text`, and "Open listing" to `vehicle.url` in a new tab.
- **Thread:**
  - day separators (`dayLabel`), customer bubbles on the left, ours on the right;
  - the `whoLabel` line on each bubble;
  - events as pills;
  - photos from `/api/media/<msg>/<n>`, links clickable (http and https only), text only, never HTML;
  - "Load older messages" at the top keeps the scroll position;
  - the thread stays at the bottom unless scrolled up.
- **Welcome** when nothing is open: "Choose a customer on the left."
- On a phone, one column at a time: list, then conversation, with back.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Check on the preview:**
  - who wrote what is obvious;
  - Load older keeps the place;
  - Dismiss leaves the list with Undo, and Undo brings it back;
  - Copy number copies;
  - at 390 px the back button returns to the list.
- [ ] **Step 3: Commit:** `New page: the conversation`

### Task 7: The message box

**Files:**
- Create: `web/new/js/ui/messagebox.js`, `web/new/js/ui/editor.js`
- Modify: the CSS files

**Interfaces:**
- Consumes:
  - from Task 2: `segments`, `joinSegments`, `fillBlank`, `boxText`, `checkLines`, `mainAction`, `insteadOptions`, `wordCount`;
  - from Task 3: the actions `type`, `clear`, `bringBack`, `write`, `tell`, `instead`, `override`, `copy`, and the state fields `typed`, `save`, `context` and `overridden`.
- **Layout, top to bottom, nothing else at rest (PRD section 9):**
  1. The context line, when there is one.
  2. The editor:
     - an obvious editor with an outline and the label "Suggested reply · not sent";
     - blanks shown as amber pills (`<input>`, with `aria-label` "Fill in: <label in words>");
     - typing in a pill and leaving it fills it (`fillBlank`), and an empty pill stays a pill;
     - text is edited in place, and paste is plain text only;
     - the word count, with "about N texts" when there is more than one.
  3. The check sentences:
     - fails in red, each with "Copy anyway" (calls `override`);
     - warnings in amber;
     - when there is no fail, warning or blank, "Figures and links match" in green words.
  4. The "Instead:" line, from `insteadOptions(item)`.
  5. The foot row:
     - "Tell Wheelman what to say…" on the left (Enter calls `tell`; Escape clears; `holdTell(true)` while it has text, `holdTell(false)` when emptied, sent or closed);
     - Clear (with "Bring back the suggestion" once cleared) and the main button from `mainAction` on the right;
     - "Fill N blanks" moves focus to the first empty pill, and the secondary button copies with the blanks;
     - Ctrl+Enter does what the main button does.
- **Other states:**
  - "Writing…" with three shimmer lines while `item.writing` or a write is in flight;
  - no draft and not writing: "No suggestion yet." with Write it now;
  - a failed draft: its error in words with Try again;
  - `state` answered, opted out or no reply needed: one sentence, plus "Write a reply anyway", which calls `write`;
  - done: "Copied at 9:40." with "Put back in Needs reply".
- **Save note:** "Saving…", "Your changes are saved · 9:40" or "Not saved yet".
- Port the editor from `prototype/js/ui-thread.js:198-250` (Editor/Seg) and `121-191` (Composer/MainButton), with the box made of text and blank segments only. Fact chips and code blocks come in PR 3.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Check on the preview** (journey 1):
  - open a waiting customer: the draft is there with a `[PRICE?]` pill;
  - the main button reads "Fill 1 blank", and clicking it focuses the pill;
  - type a price: the button becomes "Copy reply";
  - Copy shows the "Copied" toast with "Put back in Needs reply", and the row leaves Needs reply;
  - Undo brings it back;
  - reload: the typed edit is still there;
  - Tell Wheelman "Make it shorter" rewrites;
  - an Instead option swaps the draft;
  - Clear and then Bring back work;
  - at 390 px the box and its buttons fit, with 44 px targets.
- [ ] **Step 3: Commit:** `New page: the message box, with fill-in blanks, Instead and Tell Wheelman`

### Task 8: Accessibility, phone width and reduced motion pass

**Files:**
- Modify: any `web/new/` file the checks below show needs it.

- [ ] **Step 1: Keyboard only** through journey 1:
  - Tab reaches every control;
  - focus is always visible;
  - menus open with Enter, close with Escape and return focus to their button;
  - `/` focuses nothing yet (search comes in PR 2), so it must not throw.
- [ ] **Step 2: Contrast and focus:**
  - text contrast is 4.5:1 in light and dark, checked on the token pairs;
  - every icon-only button has a label;
  - status words and toasts are live regions.
- [ ] **Step 3: Motion and size:**
  - with `prefers-reduced-motion: reduce` emulated, nothing animates;
  - at 200% zoom, nothing is cut off;
  - at 360, 390 and 430 px wide, there is no sideways scroll.
- [ ] **Step 4: Commit:** `New page: keyboard, contrast, phone width and reduced motion checked`

### Task 9: The link between the pages, the README, and the walkthrough

**Files:**
- Modify: `web/views/TopBar.js` (one quiet link "Try the new page" to `/new/`, beside the cog), and `web/lib/copy.js` (`'top.newPage': 'Try the new page'`)
- Modify: `README.md` ("The page": a short "The new page" part with what PR 1 covers, and that the old page stays at `/`; "Commands": `node test/support/preview.js`; "Project layout": `web/new/`)

- [ ] **Step 1: Implement** the link and the README parts.
- [ ] **Step 2: Walkthrough on the preview** at 1440×900 and 390×844, light and dark:
  - journey 1 end to end;
  - Follow-ups;
  - Dismiss with Undo;
  - Tell Wheelman;
  - Instead;
  - the other three tabs' links;
  - the old page's new link.
  
  The console must show no errors, and the network must show only `127.0.0.1:3211` requests. Save the screenshots in `.playwright-mcp/new-page/`.
- [ ] **Step 3: Run** `npm.cmd test`, `npm.cmd run check-private`, `npm.cmd run check-deps` and `npm.cmd run check-css`. Expected: all pass. A fresh worktree without the real `knowledge/business-facts.md` shows the two known `leaked: 0491` failures; copy the real file in to run the full suite, since it is git-ignored.
- [ ] **Step 4: Commit:** `README: the new page at /new/, and the preview on invented data`
