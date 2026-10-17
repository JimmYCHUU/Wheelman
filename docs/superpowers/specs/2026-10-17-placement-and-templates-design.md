# Where a conversation is listed, moving it, and AI + templates in every section

Date: 17 October 2026. Status: approved by the owner; built in five pull requests (below).

## Why

The owner asked for two things.

1. **Imports AU leads belong in Auction, and any lead can be moved.** Leads on the dashboard's
   IMPORTS platform list ("Imports AU") showed in the Dashboard section, never in Auction. He
   also wants to move a conversation himself: a Dashboard lead who asked us to import a car and
   gave the full specification has nothing left to be asked, and should be treated as an auction
   customer.
2. **AI + templates everywhere.** He likes the Auction section's "Which message?" picker, where
   choosing a template rewrites the message, and wants the same in every section, with only the
   templates that fit the conversation offered. The AI still personalises the result; templates
   make it more structured and more efficient.

Why Imports AU leads were never in Auction: the Auction section listed only auction orders
(`ao:` keys from `/sales/auction`). Every lead became a `c:`/`l:` item listed in Dashboard,
whatever its platform. A lead with an order showed twice. Moving existed only between Dashboard
and Import Query, only for an import enquiry. A moved contact-page lead was still answered the
ordinary way, because the car was read only from a form, and a later message with nothing new
never set off an auction search. An order ignored a new text from its customer.

## The idea

A conversation has two properties that used to be mixed up:

- its **channel**, where it came from (a text, a Facebook chat, an email). The channel decides
  how a reply goes out (pasted into the dashboard or Gmail; sent to Facebook from the page), its
  shape, and what it may teach;
- its **section**, how we treat the customer. The section decides which list it is on, which
  templates are offered, and whether it is answered as an import or auction customer.

Moving changes only the section.

## The owner's decisions (17 Oct 2026)

- **Picking a template:** AI-personalised in every section, Auction included. One request fits
  the template to this customer and car. Figures, links and blanks are put in by code and cannot
  change. Switching back to a template already picked costs nothing.
- **The automatic suggestion** starts from the best-fitting template. Wheelman chooses, the box
  says which template it used, and he can switch to another.
- **Making templates:** the first templates for each section are drafted from the best replies
  the team actually sent in similar conversations; he corrects them in a file, as with
  `voice/auction-messages.md`.
- **Moving:** any conversation can move between Dashboard, Auction and Import Query, in every
  direction. A Facebook chat can move out of Marketplace. Nothing moves into Marketplace.

## Calls made in building, for the owner to check

1. An auction order never moves. A customer with an order under way (not finished), from any
   platform, is an auction customer. The conversation the order reads (the one on the order's
   number, else its lead's) is listed under the order: one row per customer. Anything else from
   that customer is a row of its own in Auction. The order's panel sends their texts to Dashboard
   and back.
2. Every Imports AU lead goes to Auction, compliance-only ones included.
3. The first reply after the owner moves a conversation into Auction (or that reply written
   again) searches the live auction with what the customer asked for, so moving such a customer
   in leads to an offer, not questions. After that, as for any import enquiry, only something new
   sets off a search. (First built as "every reply until a car is offered"; narrowed after review,
   since it applied to every Imports lead.)
4. A text or website enquiry counts as waiting on an order only if it came after the order
   opened and within the last week; older ones show in the thread. Dismiss sets aside the message
   it was pressed on and every one before it.
5. Nothing is learned while a conversation is in Auction, and nothing written while it was
   there teaches after it leaves. Facebook chats never teach, wherever they are listed. The
   team's real sent replies are still read as examples.
6. The template picker shows only templates that fit, plus "A reply to what they wrote"
   (Wheelman's own words) as its first choice. A missing fit is fixed in the template's `@fits`
   line, not by showing every template.
7. A Prompt before writing uses Wheelman's own words unless a template is picked. Rewrite keeps
   the template.
8. Auction messages are personalised in the background too, with an off switch
   (`config.auction.fitInBackground`): AI requests where Auction used none, about one per due
   message.
9. Import Query is a destination only while the mail intake is on.

## Part 1: placement and moving (PR 1, built)

- `src/placement.js`: `naturalSection` (Marketplace for `mp:`, Import Query for `em:`, Auction
  for an order, an Imports lead or a lead with a live order, else Dashboard), `sectionFor` (the
  owner's move wins while that section is on), `movesFor` (the movable sections it is not in,
  in tab order, plus its own section when moved away).
- `item_moves` table, kept by key and by lead; a one-off migration copies moves that rode on
  `item_rulings`. Every item builder sets `item.section`, `item.home`, `item.move` and, in
  Auction, `item.underOrder`. `listItems` keeps only items listed in the section asked for, plus
  the keys moved into it; source `auction` reads Imports leads and moved keys.
- `POST /api/items/<key>/move {section}` returns `{ item, from, writing }`; Undo is a move back
  to `from`. The `/ruling` route keeps only the import ruling and forwards a `section`.
- Auction lists enquiry rows beside order rows (`enquiryStage` in `src/imports.js`). Orders read
  their customer's texts (`orderTexts` in `src/orders.js`); `replyVia` says whether to answer by
  text or WhatsApp. The background writer covers both.
- Page: `web/views/MoveMenu.js` (button and popover in the conversation's header), Move to
  Auction on the import line, "Where it is listed" in the Customer tab.

## Part 2: AI + templates (PRs 2 to 5)

### Template files

One file per section, in the syntax `src/templates.js` already reads: `===== name =====` parts,
`#` notes, `{fact}`, `{if_fact}`, `{{NAME}}`, `[BLANK?]`. New: `@` lines inside a part are that
part's metadata, so the owner can add a template himself:

```
===== price_question =====
@label: Price question
@fits: price question
@not: buyer
Good afternoon {{NAME}},
...
{price_reply}
```

`@fits`, `@needs` and `@not` use plain-word signals Wheelman already works out for free: the
topics from `classify` (price question, finance, trade-in, inspection, photos and video ...), the
sale step, first or later reply, buyer, far away, car on offer or sold, the enquiry and order
stages, email topics. A template may include the fixed blocks by name (`{price_reply}`,
`{invitation}`, `{first_reply_block}`, `{media_links}`, `{auction_offer}`, `{import_ask}`), so the
owner's own wording stays word for word inside it.

Files: `voice/dashboard-messages.md`, `voice/marketplace-messages.md`,
`voice/importquery-messages.md`, and enquiry parts added to `voice/auction-messages.md`.

### Fitting a template to the customer

1. Code fills the template twice: once with the real values (kept as the word-for-word
   fallback) and once with markers in place of every fact, block, blank, link, phone number and
   figure (extending the amount masking in `src/ordermessages.js`).
2. One AI request gets the masked template under "THE MESSAGE TO FIT TO THIS CUSTOMER" with the
   conversation: keep every marker, reshape the wording for this customer, add a sentence or two
   only for anything else they asked.
3. Code checks every marker came back exactly once, restores them, and runs the fact checks
   (style checks off, as for a Prompt). On failure it tries once more, then gives the code-filled
   template word for word with a note. A reply is always given.
4. Each template has its own saved draft (`drafts.template`), so switching back costs nothing.

### Step 3 as built (every section, and the Prompt changes the message picked)

The owner, 17 Oct 2026: "I want that in every section not just in auction. But the others
should have their relevant dropdown options. I still should be able to prompt and the dropdown
should be edited according to that."

- `src/sectiontemplates.js`: `fitSignals(item)` reads what the conversation shows with no AI
  (the topics from `classify`, first or later reply, buyer, far away from `farAway`, their offer
  from `priceFigures`, parting from `PARTING`/`DECLINED`, the car's state from `availability` and
  `reservedByAnother`, and for an email the topics from `topicsIn` and whether the model is on the
  eligible list). `templatesFor(item)` offers each part whose `@fits` matches one signal, whose
  `@needs` all hold and whose `@not` none do, ranked by the number of `@fits` signals matched, the
  customer's main topic counting once more; ties keep the file's order. The first is marked
  **(best fit)** when it matched more than `any`.
- `composeSectionTemplate` fills a part with the conversation's facts: the greeting by the hour
  and the sign-off only on the first message of the day (Marketplace: `{thanks}`, neither), the
  car, its link, price, kilometres and where it is, `{price_reply}` (`priceBlock`),
  `{invitation}` (`inviteBlock`, the online link when far away), `{first_reply_block}` and
  `{address_block}` (`standardBlock`); for an email, the model, build range, landed cost and
  deposit from `researchFor`, or blanks.
- `src/templatedraft.js` is shared with the Auction messages: it saves the draft under the
  template's name, fits it with `draftFor` (every fact hidden, `src/fitter.js`), and writes it word
  for word when fitting gives nothing usable.
- A Prompt or Rewrite with a template shown goes to the AI as the staff instruction for that
  template ("=== INSTRUCTION FROM OUR STAFF FOR THIS DRAFT ==="); markers may then be left out but
  never changed or made up. The same instruction and wording again reuses the earlier fitting
  (`context.asked`).
- `checkTemplates()` lists slips in the three files (no label, no `@fits`, a signal nothing
  shows, a fact Wheelman does not fill in); a test keeps it empty.

Calls made in step 3, for the owner to check:

10. Section templates are always fitted by the AI when one is available; there is no switch like
    `AUCTION_FIT`. With no AI to ask they are written word for word.
11. In Auction, what is typed into **Add what you know** also goes to the AI as what to change
    (before, it only filled in facts).
12. A template picked earlier can still be written after the customer writes again, even when it
    no longer fits; only the list offered follows the conversation.
13. Hours, days, weeks, years and kilometres in the owner's own wording ("open 7 days from 8 AM
    to 5 PM", "6 to 10 weeks") are hidden from the AI like other figures.
14. "Can you do any better?" and "is that the best you can do" are read as price questions, in
    every section (they were "general").
15. First sets are smaller than the plan's table: Import Query has three (Eligible: landed cost
    and deposit, which also covers a model not on the list; How it works and how long it takes,
    which covers timeline, payment and compliance only; Ready to search). Dashboard has no
    "After the sale" message: every Dashboard message is `@not: buyer` except Polite close,
    because what a buyer needs is in the conversation, not a template. More can be added in the
    files.
16. Picking an Import Query message looks the model up on the website (counted against the
    day's allowance of website requests), as writing a reply does. No model found, the answer is
    still written, with [MODEL?], [BUILD YEARS?], [LANDED COST?] and [DEPOSIT?] to fill in.
17. What the owner types for a template (Prompt, Rewrite, Add what you know) goes to the AI with
    every figure, link and amount as a marker (`maskInstruction`): a fact of the message it
    repeats is that fact's marker, anything else a marker of its own that the AI may use or
    leave out. So an auction order's amounts, and our costs typed there, never reach the AI.
18. The car's records (VEHICLE FACTS, and an email's research) still go to the AI with a
    template, as with any reply, so it can answer what else the customer asked; a figure it
    writes itself is checked against the records. The facts in the message are the markers.
19. The list follows the section, not where the conversation came from: Dashboard, Marketplace
    and Import Query each have their file; any conversation in Auction with no order gets the
    enquiry messages. The format (greeting, sign-off, links tagged for Facebook) follows where it
    came from.
20. Could be better on a picked message writes Wheelman's own reply again, and the pick is
    dropped. Learning by template is step 5.
21. A pick is for the customer message it was made on: when they write again, the box shows the
    reply for the new message.
22. A customer who asked not to be contacted is offered no template, and none is written.

### The PRs

| PR | What |
|---|---|
| 1 | Placement and moving (above). |
| 2 | Template engine; the picker generalised from "Which message?"; Auction on it, personalised. Needs #49 (Prompt first) merged, for style-free checking. |
| 3 | Template files for Dashboard, Marketplace and Import Query, drafted from the team's best real replies grouped by topic and outcome (a one-off script kept outside the repo); the picker in every section. |
| 4 | The automatic suggestion starts from the best-fitting template; checked with `npm run review` before and after. |
| 5 | Learning by template: Good reply, copying and Could be better record the template, and same-template rows rank first. |

## Not in this programme

- Wheelman offering new wording for a template the owner keeps changing the same way.
- Ranking templates by what they led to, once outcome learning lands.
- Follow-up templates: they belong to the approved Follow up step.
