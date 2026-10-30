# The new Wheelman: the build, PR by PR

Jim's go, 26 Oct 2026: "I want wheelman next to be my wheelman." The redesign is built into this
repository, under the same name and history. **Switch-over (his choice):** once the new page
covers all four sections and every feature the old page has, the new page opens at the normal
address. The old page stays one click away for about two weeks, and is removed after his yes.

**Spec:**
- The redesign's product requirements, recovered locally in `eval/redesign/prd-recovered.md`
  (git-ignored). It has 14 modules (R-numbers), the screens, the tokens and 16 acceptance stories.
- `prototype/`: the clickable design.
- All ten PRD decisions were accepted on 24 Oct 2026.

**Order (my call):** the new page is built on today's server first, so Jim uses it on real
customers as early as possible. The stable IDs and the stored inbox go in underneath afterwards,
without changing what he sees. Until the switch-over, the new page lives at `/new/` and the old
one stays at `/`.

| PR | What Jim gets | PRD |
| --- | --- | --- |
| 1 | **The new page for Dashboard texts**, at `/new/`. Top bar with the four tabs, the list (Needs reply, Follow-ups, All), the conversation, and the message box. The box is an editor with blanks as fill-in pills; it has Copy, the "Instead:" line, "Tell Wheelman…" (just this once), done-after-Copy with Undo, Dismiss with Undo, and status in words. It works at phone width, in dark mode, and from the keyboard. Each page links to the other | R1.1–R1.4, R1.6–R1.7, R2.1–R2.3, R3.1–R3.3, R3.5, R3.8–R3.10, R8.2, R11.1 |
| 2 | **Deal panel and one search.** The Car tab (photos, videos, documents, Copy link, Add to reply, the viewer), the Customer tab (stage line, insider facts), and What Wheelman used. One search over customers, cars and messages | M5, M10 |
| 3 | **The rest of the message box.** Removable code blocks; the trust line with each fact's source; "Remember" with lessons that have a scope and an off switch; Good reply retired (Copy as written counts as approval); lessons proposed from repeated edits | R3.4, R3.6, R3.7, R9.2–R9.4 |
| 4 | **Reply run, answered elsewhere, write ahead for the top 10.** Start replying with Skip and a summary; rows clear when the phone, the dashboard or a colleague answered; drafts ready for the 10 newest waiting Dashboard conversations | R1.5, R4.6, journey 2 |
| 5 | **Marketplace on the new page.** Every section opens on the new page; Facebook chats are written when opened, not in the background; Send on Facebook (Sending, Sent, Try again); one main button per channel. The new page's store is split first | R3.8, R4.6, story 11 |
| 5b | **Imports and Auction on the new page.** Imports replaces Import Query and takes the Imports AU leads out of Auction; the enquiry type menu replaces Move and the import ruling buttons; Copy for Gmail with the research notes; Auction orders with the paste box and Copy for WhatsApp | R2.4, M6, M7 |
| 6 | **Playbook.** Lessons, business facts (Confirmed, Working, Needs answer), templates with a preview on 3 real conversations and every version kept, and voice rules | M9 |
| 7 | **Sales board, This week, Settings and status.** AI per job, keys, budget and usage; sources with their last good read; theme and business identity | M11–M13 |
| 8 | **Switch-over.** The new page opens at `/`, the old page moves to `/old/`, and sign-in lands on the new page. Every item on the feature checklist below is ticked on the preview and on Jim's own use | gate 4 |
| 9 | **Stable IDs, the stored inbox and pushed updates** (server-sent events) under the new page. A one-time move of today's data, after a backup, rehearsed on a copy first | section 11, R4.5 |
| 10 | **After about two weeks and Jim's yes:** the old page is removed; release 1.0 | gate 5 |

PR 5 was split in two on 28 October 2026 (my call): one PR of nine tasks was too much for one final review.

PR 6 was split in two on 29 October 2026 (my call): ten tasks was too much for one final review. PR 6 holds the lessons (their history, and edits proposed as lessons), the business facts (every version kept in the database, the file never written), the trust line naming the facts, and the Playbook page in the Menu. PR 6b holds the templates with their preview on 3 real conversations, the voice rules, and their versions in the same table.

Each PR has its own plan in this folder, written when the one before it is merged, so it starts
from the code as it then is.

## Feature checklist for the switch-over

Every one of these must work on the new page before PR 8. The old page's controls are listed in
the order they appear today.

- **Top bar:**
  - section tabs with new counts;
  - the Menu's Playbook, with its tabs;
  - the browser tab title count;
  - Find a car (merged into search in PR 2);
  - status in words, with the details panel and its Change link;
  - Check now;
  - the AI settings: model per job, provider, another model, key box (on this computer only), Used so far, budget;
  - the team-share address.
- **List:**
  - notices (setup, dashboard down, Marketplace down, draft error, paused, budget used, phone add-on);
  - search;
  - chips per section;
  - row tags (follow-up reason, phone only, folded in Gmail, dismissed, due, check, blank);
  - unread that clears on open;
  - Load older conversations;
  - empty, loading and error states;
  - arrow keys;
  - the first row opens on wide windows;
  - choosing Follow-ups opens and writes the first one.
- **Conversation:**
  - welcome screen;
  - head (back, name, sub line, Order no.);
  - Copy number or email;
  - car strip (stock car, Marketplace listing, auction order);
  - day pills, unanswered pill, staff note, events;
  - photos and links in bubbles;
  - Marketplace auto-reply pills;
  - Load older messages;
  - jump to latest.
- **Message box:**
  - the import judgement line;
  - writing state;
  - Which message? (the "Instead:" line);
  - follow-up states and Put back in Follow-ups;
  - opted out, dismissed, answered, no reply needed (Write a reply anyway);
  - email drafts off;
  - Write it now and Try again;
  - Prompt (Tell Wheelman), holding automatic writing while typing;
  - the auction order box (message picker, paste box with We sent this and They wrote this, Remove, Put back in To do);
  - autosave with "Not saved yet" and retry;
  - head tag, word count and "about N texts";
  - blank and failed-check highlights;
  - advice lines and Bring back the suggestion;
  - Rewrite and Add what you know;
  - Refresh figures;
  - Clear with Ctrl+Z;
  - Copy reply and Copy with blanks (Ctrl+Enter, and a full-selection Ctrl+C);
  - Send reply on Marketplace.
- **Panel:**
  - open or closed remembered;
  - Car tab: another car, photos, auction photos, videos, documents, Copy link, Add to reply, Included, Read again, the viewer;
  - Customer tab: contact, prefers, came from, lead status, asking about;
  - Marketplace, Import Query research notes, Auction order details and Their texts;
  - What the suggestion relies on;
  - Where it is listed;
  - Dismiss this follow-up;
  - Dismiss with Undo.
- **Moves:** the Move menu with Undo (becomes the enquiry type menu in PR 5).
- **Sharing:** sign-in through the tunnel, with a 401 sending the browser to sign-in.
- **Keyboard:** `/` for search; Escape; Ctrl+Enter; arrows.
