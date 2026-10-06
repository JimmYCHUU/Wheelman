# Changelog

All notable changes to Wheelman. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow `MAJOR.MINOR.PATCH`.

## [Unreleased]

### Added
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
