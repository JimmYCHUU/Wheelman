# Changelog

All notable changes to Wheelman. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow `MAJOR.MINOR.PATCH`.

## [Unreleased]

### Added
- Sharing with the team. Double-click **Share Wheelman.cmd** (or set `SHARE=1` in `.env`) and
  Wheelman opens a Cloudflare tunnel to the page and prints the address to give colleagues; the
  welcome panel shows it as a link. Colleagues open it in any browser and type the team password
  (`TEAM_PASSWORD` in `.env`) once; their browser remembers it for 30 days. The page still
  listens on this computer only: the tunnel is cloudflared, Cloudflare's own program, which dials
  out from here and is downloaded from Cloudflare's releases the first time. Through the tunnel,
  a request is let in only with the signed sign-in cookie, a POST only from the shared page
  itself, and ten wrong passwords in a row from one address lock the sign-in there for a quarter
  of an hour. A free trycloudflare.com address changes each time Wheelman starts; a named
  tunnel's token (`CLOUDFLARE_TUNNEL_TOKEN`, `SHARE_URL`) gives a fixed address of your own.
  Nothing else changes: a Marketplace reply still goes only when a person presses Send.
- Wheelman says what it reads of the team's own replies. The welcome panel's line "Reads N
  replies the team sent in the last year, whoever sent them and from wherever, and N of our
  salespeople's own replies" (or, under Import Query, "Reads N past import emails the team
  answered"), and under a suggestion "Written with N replies the team sent to customers who asked
  something similar in view". The team's replies are now read from the last year rather than the
  last 45 days, and a reply the team sends from the phone to a dashboard customer teaches like one
  sent from the dashboard once the add-on has seen all of it (one the Messages list cut short does
  not). The dashboard's replies teach the dashboard; the email threads teach Import Query; never
  the other way round. Nothing has to go through Wheelman for any of it.
- Import Query learns from the past. The email threads sent from Gmail, including the old ones,
  show the AI how the team really answered similar import enquiries ("How we answered similar
  import emails" in the request), with the other customer's name, address, staff name, figures
  and links taken out. Good reply, Could be better and a reply changed before copying teach for
  emails as they do for the dashboard, and a reply later sent from Gmail is compared with the
  suggestion. Every lesson carries its kind: an email's lessons serve emails only, a text's serve
  texts and Marketplace chats only. Marketplace and auction orders still teach nothing.
- Import Query replies are researched on the website before they are written. The model codes
  and names in an email are matched against carbarn.com.au's list of import-eligible models,
  read once a day into `data\eligible-models.json`; the reply carries the model's eligibility
  and build years, the estimated landed and complied cost with its parts, the refundable
  deposit, the model's page link, and the process facts from the guide pages, each figure
  checked against that research like any other. A sentence that puts the answer off ("we will
  check and get back to you") is refused and the reply written again; a model code the customer
  named must be answered. What the website does not have becomes a blank (`[ELIGIBILITY?]`,
  `[LANDED COST?]`, `[DEPOSIT?]`, `[TIMELINE?]`) in a full sentence, with research notes in the
  details panel saying what was looked up and where. If the website cannot be read, the list
  on this computer and the saved pages stand in, with a warning. Settings: `SITE_API_URL`,
  `IMPORT_RESEARCH_DAILY`, `IMPORT_AUCTION_SNAPSHOT`.
- The Import Query section: import enquiries that arrive by email. The browser add-on gains a
  **Send to Wheelman** button in Gmail; pressed on an open email, it hands the whole thread
  (subject, each message's sender, time and text, with the quoted history removed) to Wheelman,
  which lists it under the new section and shows it in the usual thread, the customer on the
  left and the team's replies on the right. Sent again after a reply, only what is new is added,
  and a message Gmail had folded is filled in. Our side is any sender at `@carbarn.com.au`
  (`MAIL_OUR_DOMAINS`); `MAIL_INTAKE=0` switches the intake off. Nothing is learned from a thread
  and no reply is written for one yet: that comes with the research step. The add-on is now
  "Wheelman reader", with a second route and header for Gmail; four section tabs sit two by two,
  and five (with Standards) put Standards on a full third row.
- Marketplace replies are sent from the page. **Send reply** in a Marketplace chat hands the
  text in the box to the content engine's own reply address, the one its inbox page uses, and
  the engine's phone types it into the chat. The reply shows in the conversation marked
  "Sending" until the engine reports it sent, the chat leaves Waiting at once, a blank such as
  `[PRICE?]` is never sent, a second press while the first is under way is refused, and a
  refused or unreachable engine changes nothing. Copy and paste still works there. Dashboard
  and auction replies are unchanged: copy and paste only. Nothing is learned from a sent reply.
- Backups: one dated zip file of everything that lives only on this computer (the database, the
  `.env` settings, the staff names, the voice files, the private business facts and notes),
  written when the black window closes, once a day while Wheelman is open, and by hand with
  **Back up Wheelman.cmd** (`npm run backup`). **Restore Wheelman.cmd** (`npm run restore`) puts
  one back, on this computer or another, after keeping what was there as a "before restore"
  file. The folder is `Documents\Wheelman backups` (`BACKUP_DIR`), the newest 20 are kept
  (`BACKUP_KEEP`), `BACKUPS=0` switches the automatic ones off, and the welcome panel says when
  the last one was written. The database is now closed cleanly on the way out, so its side file
  is folded in. The zip is written and read with Node's own zlib: still no dependencies.
- The dashboard's notification feed is read every 45 seconds (`NOTIFICATIONS_SECONDS`): a new
  lead sets off a check at once, a car's price change or sale refreshes the car list, and an
  enquiry from another Carbarn site, which the Sydney lead list never carries, is counted and
  left alone. The feed is read and never marked as read.
- Model replies: thirty-seven invented scenarios in `voice/model-replies.md`, rated one by one
  under a Standards section on the page. An approved one is shown to the AI as the standard for
  messages like it; nothing from a scenario is learned.
- Selling by text: every reply aims one rung up a ladder (interest, proof, fit, commitment,
  buyer) with one next step and at most one question; the deposit is proposed once interest is
  clear; new checks refuse pressure wording and unbacked claims; the next step and the rung are
  saved with each suggestion and scored by the replay and the report. `docs/selling-by-text.md`
  holds the evidence.
- The invented world and the stand-in services for the dashboard, the Marketplace engine, the
  live-auction feed and the AI live in `test/support/`, shared by every test. (A demo mode built
  on them was tried and removed the same day.)
- `GET /api/health`: alive, version, database readable, last check.
- Repository hygiene: this changelog, a security policy, contributing notes, an explicit
  all-rights-reserved licence, issue and pull request templates, a pre-push hook, line-ending and
  editor settings.
- The page's shell rebuilt: a bar across the top with the status in words, the three sections as
  tabs above the list, and a list column made of components (one tag, one badge, one avatar,
  rounded notices, empty states, loading shapes) on a small state store and a section registry.
- Photos in texts shown in their bubbles, fetched once from the address the dashboard holds and
  kept under `data/media`.
- "Load older messages" at the top of a conversation, twenty at a time, and "Load older
  conversations" under the list, twenty at a time.
- `IGNORED_SENDERS`: senders that are never customers (a label saved on the phone, a finance
  company, a courier) are kept but never listed.
- A name for a number wherever one can be found: from an earlier enquiry with the same number, or
  the name the customer signed in a text (shown only; never given to the AI).

### Changed
- RULE-0 "never sends" is now "sends nothing by itself": the one send is the Marketplace Send
  button. The Marketplace client keeps its three read addresses and gains the one reply address.
- Marketplace suggestions carry links: the car's page on a first reply, and the inspection
  booking link whenever the buyer asks to see the car, each on its own line. Until now a
  Marketplace chat got neither, because both lived in the standard block that only dashboard
  replies carry, and a buyer who asked to see a car got a red flag instead of a link.
- The list is "All": every conversation ever stored, newest message first whoever wrote it, with
  "Waiting" as the filter for the ones that need a reply. No time window, no "No reply needed",
  no "Not customers". Only a text from the last fortnight counts as new for the blue numbers.
- The search asks the server, which looks through every conversation.
- Design tokens: every colour, size, space, corner, shadow and duration the page uses is named in
  `web/css/tokens.css`, and a check keeps the other stylesheets on those scales.
- The dashboard's own web address and the dealer's other phone number moved out of the code into
  `.env` (`DASHBOARD_ORIGIN`, `BUSINESS_PHONES`).
- The real business facts and operations guide are now private (git-ignored); example files with
  invented figures are published in their place, and Wheelman reads the example whenever the real
  file is missing.
- `check-private` treats the real knowledge files as private, compares the new settings, and takes
  a `PRIVATE_WORDS` list from the environment for CI.

### Changed
- The Standards tab is on the page only while a model reply is waiting for a rating. Once every
  one is approved or set aside it leaves the page, and the page goes back to the Dashboard; the
  approved ones keep setting the standard. A scenario added to the file, or a rating taken back,
  brings the tab back.

### Fixed
- A lead announced by the notification feed while a suggestion was being written for someone
  else, or while a check was already under way, was not checked for until the next three-minute
  check, and that check waited for its own drafting to finish first: a new lead could take ten
  minutes to appear. It is now listed as soon as the dashboard has it, its suggestion follows
  once the AI is free, and a line in the log says when each announced lead was checked and how
  long it took.
- Running the tests no longer overwrites this computer's `voice/examples.json` with the invented
  world's examples, and no longer reads this computer's ratings of the model replies: both are
  pointed at scratch files, so the checks pass whatever has been rated here.

## [0.2.0] - 2026-10-06

### Added
- Buyers answered as buyers, about their own car, recognised by phone, email or lead status.
- The team's standard first reply, exact to the character, on every brand-new enquiry.
- Checks on promises, days, times and places; a reply that overreaches is sent back once.
- Learning from the replies that were really used: copied, sent, approved with "Good reply", or
  coached with "Could be better".
- Import and auction enquiries: the asking reply, then an offer from the website's live auction
  with the bid from what similar cars sold for, never below the website's suggested bid.
- The message box as an editor: saved as you type, Clear, the suggestion brought back, Good reply
  on your own version.
- Marketplace chats written by the small AI model, so the better models stay free for dashboard
  customers.
- The Auction section: every order at every stage, the next message to the customer written from
  the team's own wording with no AI, a paste box for WhatsApp replies, Copy counting as done.
- A message is always written, with blanks for what cannot be looked up; search covers every list.
- The phone add-on: a browser extension that reads the Google Messages list and hands Wheelman the
  texts the dashboard missed, labelled as seen on the phone; numbers the dashboard never saw as
  "Phone only" rows; nothing from the phone learned from.

### Changed
- The phone add-on's state on a footer line of its own, so the status line is never cut short.
- No suggestion written unasked for a Phone only conversation.

## [0.1.0] - 2026-10-01

### Added
- The page: conversations on the left, one open chat, the suggestion waiting in the message box,
  light and dark.
- Reading the dealer dashboard (leads, conversations, messages, stock) and the Marketplace
  content engine, read-only through allowlisted clients.
- Suggested replies in the dealership's voice from free AI models, with every figure and link
  checked against the records and blanks for what only a person can decide.
- Customer details removed before any text goes to an AI, and put back afterwards.
- The greeting and sign-off once a day; in-person and online inspection links; Dismiss with undo;
  unread counts that clear on opening.
- `check-private`, so nothing from `.env`, the session or the staff list can be published.

[Unreleased]: https://github.com/JimmYCHUU/Wheelman/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/JimmYCHUU/Wheelman/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JimmYCHUU/Wheelman/releases/tag/v0.1.0
