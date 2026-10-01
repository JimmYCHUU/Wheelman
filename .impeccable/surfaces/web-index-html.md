---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: ["web/styles.css","web/app.js"]
---

# Surface brief: Wheelman main page

Scope: the single page at `/` (web/index.html, web/styles.css, web/app.js).
Visitor mode: Operate.

## Audience and job

One user, the owner, answering 30 to 50 customer SMS enquiries a day for a car dealership. He keeps this page beside the dealership's dashboard and moves between the two. Job: see who is waiting, read what they wrote, check the suggested reply, fix any blank, copy it, send it from the dashboard.

## What the previous layout got wrong (user's own words, 29 Sep 2026)

- Too much at once: every customer fully open on one long page.
- Could not tell the customer's words, our earlier replies and the suggestion apart.
- Coloured notes and blanks such as [PRICE?] were unclear.
- Small labels and tabs were hard to follow.

## Constraints

- The page never sends. The primary action copies.
- Customer text is inserted as text, never HTML. No inline styles or scripts (strict content security policy). No external assets or libraries.
- Every existing function stays: copy, rewrite with an instruction, dismiss, rate, check now, three groups, time window, setup and error notices.

## Direction contract

THESIS: One conversation at a time, in the shape of a messaging app. The agent's suggestion is an unsent draft waiting in the message box, never a bubble in the thread. It refuses the dashboard card wall, where every customer is open at once and the suggestion sits in a form beside the conversation.

OWN-WORLD: The familiar chat idiom of WhatsApp Web. A warm neutral thread ground; white incoming bubbles on the left; pale green outgoing bubbles on the right carrying the sender's name; centred pills for dates and system events; one green accent reserved for selection, unanswered-message badges and the primary action. System sans throughout. The message box is a raised white sheet; blanks are highlighted amber inside the text itself and unverified figures red.

STORY: the owner sees at a glance who is waiting and how many messages each has unanswered. He opens one. He knows who said what without reading labels. He reads the draft, replaces the highlighted blank, copies, and sends from the dashboard.

FIRST VIEWPORT: At 1440 by 900. Left column 400px: app name and sync status, search, three filter chips, conversation rows with avatar, name, time, preview and green badge. Right: chat header with avatar, name, phone and one line naming the car; thread scrolled to the latest message; message box docked at the bottom holding the draft, with one plain sentence above it and the primary action, Copy reply, at its bottom right.

SIGNATURE INTERACTION: Pressing a named blank above the draft selects that blank inside the text, so typing replaces it. Motion grammar: 160ms press feedback, 200 to 240ms strong ease-out for panels and the arriving draft, nothing animated on keyboard navigation.

FORM: WhatsApp Web played straight, the category standard, chosen by the user by name. Position 1 on the ordered list. Seed key 4246da0b.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- None blocking. No logo or brand assets exist; the page ships no raster images.
