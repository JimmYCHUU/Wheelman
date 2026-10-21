# Changelog

All notable changes to Wheelman. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow `MAJOR.MINOR.PATCH`.

## [Unreleased]

### Changed
- **Marketplace replies have the shape the team sends there.** Learned from every reply sent on
  Facebook Marketplace over 18 to 20 Oct 2026: the content engine's own first reply to each buyer
  (now written for it by an AI, with the buyer's name and the car's figures) and the 68 replies a
  person typed, in the engine's inbox or from this page. The first reply to "is it available?" is
  the engine's three short paragraphs with this car's price, kilometres, auction grade and
  inclusions ("Hi Priya, yes it's still available, $28,900 with only 52,400 km. / It's a grade 4.5
  Japanese import, km verified against the auction documents, and the price includes 6 months
  rego, a fresh roadworthy and a 5-year warranty. / Keen to see it? Send me your number and I'll
  give you a call."), "only" under 60,000 km, the grade left out when none is recorded, and the
  inclusions kept to what the car's Included list has. Every later reply starts with the answer,
  usually 20 to 50 words in short lines: no greeting line of its own, no sign-off and no opening
  thank-you. The next step is the buyer's phone number, booked by a person and confirmed by text,
  not the booking link: no invitation is added under the lines on Marketplace any more, and the
  link goes only when the buyer asks for a link or a Prompt asks for it. A price question or an
  offer is "The lowest we can do on the Noah is [PRICE?]." and then the number, with no price
  reply block under it (the dashboard keeps its block). Finance and a trade-in go to the forms on
  the car's own page, which the AI now sees among the vehicle facts. The Marketplace messages in
  `voice/marketplace-messages.md` are written the same way (Still available, Price question,
  Their offer, Book a viewing, a new Their number: we will call, Finance, Trade-in), with new
  facts for the first reply's kilometres, import line and short inclusions and for the two forms.
  The length warning still starts above 90 words, where the team's longest reply sat. (The
  owner, 20 Oct 2026: "The reply structure for facebook marketplace has changed. Study the last
  two days replies and learn how replies were sent.")
- **Links in a Marketplace reply say `utm_source=marketplace`.** They said `facebook` until now;
  a link already tagged `facebook` is retagged when it is written or sent, and a lead that
  arrives with either tag is still read as a Marketplace lead. (The owner, 20 Oct 2026.)
- **How a Marketplace reply is sent, as the engine now reports it.** The reply still goes to the
  engine's one reply address; the engine now sends it from the account's phone through its
  companion app (its record of the message says `sent_via: companion`). The page's words and the
  README say so; nothing else changed in the sending.

### Added
- **News about the car they asked about.** A fourth reason under Follow-ups: when a car lands at
  the showroom (**Car landed**), its price drops by $100 or more (**Price dropped**, with the old
  and the new price), or it sells (**Car sold**, with two cars like it from stock), the
  conversations about it from the last 30 days (`FOLLOW_UP_STOCK_DAYS`) are due a follow-up with
  that news, written from three new messages of yours in `voice/dashboard-messages.md`. The newest
  news only; it takes the place of a quiet nudge; nobody we have already told, nor the buyer,
  gets it; a car held by another customer's deposit gets no landed or price news; and a change
  seen after the stock list was out of date for more than two days is not news. The stock list's
  changes are kept in a `vehicle_events` table as it is read. (The owner's decision of 20 Oct
  2026: "Stock news about their car: landed or arrived at Lidcombe, price dropped, or sold (then
  two similar cars from stock)".)
- **The reminder the day before a visit, and the booking confirmation, written by code.** A
  third reason under Follow-ups, **Inspection tomorrow**: at 4 pm the day before a visit booked
  through the website (`FOLLOW_UP_REMINDER_HOUR`, Sydney) a reminder with the address is due,
  written word for word from your wording with no AI. None when they booked today for today or
  after the reminder hour, when you have written to them since it, or when they said they cannot
  come; a text of theirs before the reminder hour does not close it, and a copied reminder never
  holds back the follow-up after the visit. A booking that has just arrived, for a visit still to
  come and not yet answered, is offered **Booking confirmed** first in Which message?, written by
  code too: the day and time, and the address or the call for an online inspection. A message marked `@fit: no` in the wording file is
  written word for word; a Prompt or Rewrite still goes to the AI. New facts `{booking_kind}`,
  `{booked_when}`, `{address}`, `{if_onsite}` and `{if_online}`. (The owner's decision of 20 Oct
  2026: "Inspection reminder the day before, with the address, written by code".)
- **Follow-ups: Wheelman writes again when there is a reason to.** A third chip in the Dashboard
  section, **Follow-ups**, fills itself with the conversations we replied to last that are due a
  follow-up, the reason on the row: **Inspection passed** (a website booking's time has gone by,
  three hours on) and **Quiet 3 days** (nothing back for 60 hours after our reply). The
  follow-up is written when you open the conversation from that list, not ahead of time: how
  they found the car, written as if the visit happened, with the refundable holding deposit
  offered once; or one nudge with one new thing, whichever they have not had (the export
  certificate and auction sheet, the walkaround video, a similar car, or a time to come in with
  the booking link). Both are messages of yours in `voice/dashboard-messages.md`, fitted by the
  AI with every fact kept from it, and held to the rules: Carbarn in the first sentence, never
  "just checking in" or "did you come", greeting and sign-off always, about 50 words. Never for
  a buyer, after a no or an opt-out, for a dismissed conversation, for a message of ours older
  than 14 days, or twice for the same silence; due times land inside 9 am to 6 pm Sydney. Copy
  counts as done, with Put back; Dismiss, in the Customer panel, has Undo; a customer who writes
  again closes it by itself. Nothing is sent, and nothing written for a follow-up is learned
  from. Settings: `FOLLOW_UPS`, `FOLLOW_UP_QUIET_HOURS`, `FOLLOW_UP_AFTER_INSPECTION_HOURS`,
  `FOLLOW_UP_MAX_AGE_DAYS`. (The owner, 20 Oct 2026: "for this customer I want to follow up how
  his inspection went … it would be wise not to ask that directly".)
- **"Which message?" in every section, and your Prompt changes the message picked.** Dashboard,
  Marketplace and Import Query each have a list of your messages for that kind of conversation,
  only the ones that fit it, the best fit first (a price question offers Price question, a
  trade-in Trade-in, a sold car Car sold: our other cars, a buyer far away Online video
  inspection). A message picked is written with the conversation's facts (the car, its price,
  links, your price reply and invitation word for word) and fitted to the customer by the AI,
  which cannot change a fact: each is hidden behind a marker and put back by code. With a
  message picked, Prompt and Rewrite change it the way you say, its facts kept; in Auction, what
  you type into the box goes to the AI too. Figures you type go to the AI only as markers as
  well, so an auction order's amounts still never reach it, and one it uses comes back exactly as
  typed. Hours, days, weeks and years in your own wording are now kept from the AI too. The list
  follows the section: a text moved to Import Query gets Import Query's messages, an email or a
  Facebook chat moved to Auction gets Auction's. A customer who asked not to be contacted is
  offered none. The first messages are in
  `voice/dashboard-messages.md`, `voice/marketplace-messages.md` and
  `voice/importquery-messages.md`, written from the team's best replies, for you to edit; each
  says on its `@fits:` line when it is offered. "Can you do any better?" is now read as a price
  question. Step 3 of the templates plan (the owner, 17 Oct 2026: "I want that in every section
  ... the others should have their relevant dropdown options. I still should be able to prompt and
  the dropdown should be edited according to that.").
- **Enquiries in Auction have "Which message?" too.** Since the Imports AU leads joined Auction,
  most of its rows were enquiries, and only orders had the list: it looked as if it had gone. An
  enquiry now has the same list, with the messages that fit before there is an order (Thanks, with
  estimate and deposit; Car found, full or short; Cars coming up; Still searching; Deposit
  reminder), the one that suits where it has got to marked, and the reply to what they wrote as
  the first choice. Each is written from your wording with what the enquiry says, and fitted to the
  customer. (The owner, 17 Oct 2026: "Where are those drop down templates ... you removed from
  the only place I had".)
- **Auction messages are fitted to the customer.** The owner's wording is filled in by code as
  before, then one AI request fits it to this customer and what they last wrote. Before the AI
  sees it, every fact, figure, link, phone number and blank becomes a marker, and code puts each
  back exactly; a lost, repeated or made-up marker, or a figure of the AI's own, means one more
  try and then the wording word for word, which the page says. Each kind of message keeps its own
  suggestion, so switching back asks nothing, and "Car found, short" no longer shows the text of
  "Car found, full". "Add what you know" fills in the facts it names and goes to the AI as what to
  change; written again with the same words (Refresh figures), the fitting is reused with no new
  request. `AUCTION_FIT` and
  `AUCTION_FIT_BACKGROUND` switch it off. Step 2 of the templates plan (the owner, 17 Oct 2026:
  templates "the system is going to polish ... and make it more structured and personalized").
- **Imports AU leads are in Auction, and any conversation can be moved.** A lead on the
  dashboard's Imports list is an auction customer: it is listed in Auction with a stage in plain
  words (Enquiry: asking for details, ready to search, car offered, compliance only), not in
  Dashboard. A **Move** button in the conversation's header moves it between Dashboard, Auction and
  Import Query in every direction, with Undo; a Facebook chat can leave Marketplace and come back,
  nothing else moves into it, and an auction order never moves. A moved conversation keeps its
  messages and is still answered the way it came in. Moved into Auction, a customer who already
  gave the car and what they want is searched for and offered a car, not asked again. (The owner,
  17 Oct 2026: "The Imports AU leads shows on the dashboard, they don't come up in the Auction
  section which it is supposed to do", and a lead who asked us to import a car with the full
  specification should be moved to Auction: "there's nothing to ask him about".)
- **One row per auction customer.** Once a customer has an order under way, the order stands for
  them in Auction. A text or website enquiry from them since the order opened puts the order in To
  do as a reply to what they wrote, written for a text; our text back answers it, and Dismiss sets
  aside everything that was waiting. Anything else from that customer is a row of its own in
  Auction. The order's panel can send their texts to Dashboard and back. The background writer
  writes for these, and for the enquiries listed in Auction.

### Changed
- **Your Prompt comes first, in every section.** The owner, 16 Oct 2026: "When I'm prompting in
  any section this should rule out the constraint of that section... The constraints are just the
  facts and business information." A reply written from the Prompt line or Rewrite now follows it
  on length, tone, layout and greeting, over the section's own rules (Marketplace's length, the
  greeting once a day, the sales move, the examples). The AI is told so in every section, and the
  code no longer undoes it: a greeting it was asked for is kept (Marketplace, or a second text the
  same day), the layout is kept, and the length, two-questions, style and next-step warnings are
  not raised. An import email's "we will check" and an auction opening that states a figure are
  pointed out, not forced out. Only the facts still bind: figures, links, dates, promises, claims
  about other buyers, accidents or approval. With a Prompt, the price reply and the inspection
  invitation are not added under the text (the AI is given the booking link to use itself),
  unless the Prompt asks for the booking link; the first-reply block, the links the customer asked
  for, and the auction and import closing lines are still added. A Could be better note stays a
  lesson, as before.
- **Marketplace replies are warm and sell.** The owner found them "way too much shorter" and
  flat: "Just being professional doesn't mean it can generate sales." They now run to about 90
  words in short lines (was 60): the thank-you, the answer, two or three of the car's strongest
  points for this buyer, what the price includes said as what it means for them ("so it is ready
  to drive away"), and an easy next step with a reason. True selling words are allowed; hype,
  pressure, emoji and slang are not. The deposit rule, the polite close, offers left to a person
  and the invitation once in a chat stay as they were. Dashboard texts are unchanged. Checked on
  the same 13 real chats as before plus two with a Prompt, written by today's Wheelman and the new
  one on copies of the database; nothing was sent.
- **Moves have their own record.** "Moved to Import Query" used to ride on the import ruling;
  existing moves are copied across once, so taking a ruling away no longer moves a conversation
  back. Nothing is learned while a conversation is in Auction (Imports leads used to teach the
  dashboard). An Imports lead's Customer tab now reads "An import enquiry", not "An ordinary
  enquiry".

### Fixed
- **The top bar is one bar, with the sections in its middle.** The section tabs no longer look
  like part of the conversation under them: the bar has no dividing line inside it, the brand sits
  at the left, the four tabs in the middle of the bar, and Find a car with the buttons at the right,
  Check now level with the button below it. The tabs stay centred from 1100 pixels up and always
  keep clear of both sides; under 1440 pixels Find a car waits behind its magnifying glass, and
  under 1000 the brand shows only its mark. Auction and Import Query were cut off at 1180 pixels;
  they now fit. Below 1280 pixels the list keeps to 22rem so the conversation keeps its room. (The
  owner's screenshots, 16 Oct 2026: "marked parts doesn't show good alignment", then "remove that
  border line and move those sections to middle".)
- **The panel's heading is not repeated.** The Customer tab (Buyer on Marketplace, Order, Enquiry)
  no longer starts with a second "Customer" heading.
- **The blue "Needs you" tag on a Marketplace row sits in its line again.** It shared a class name
  with the panel on the right and took the panel's layout; the panel is now styled by its own id.

### Changed
- **The section tabs are pills, and the gaps between the tiles are a little narrower.** The four
  sections sit as pills on a pale rounded track in the middle of the top bar. The chosen one is
  raised off the track (white with a soft shadow in light, a lighter navy in dark) in place of the
  blue line under it. The gaps around and between the tiles are 6 pixels instead of 8 on a computer.
  On a phone the tabs keep their own row under the bar, with no line above it. (The owner, 16 Oct
  2026: "Decrease the border white spaces a little bit, Also make these pills type (poped up)".)
- **The page is four rounded tiles.** The top bar, the conversation list, the conversation and the
  car panel are tiles with rounded corners on a slightly darker ground, with a small gap between
  them in place of the straight dividing lines. Inside each tile nothing changes. In a smaller
  window the car panel floats in as a rounded tile of its own; on a phone the gaps and corners are
  smaller. (The owner, 16 Oct 2026: "How would the Ui look in bento box styled rounded corners
  type. As of now it is straign lines", then, on the preview, "It looks good actually".)
- **Marketplace replies are courteous, and nobody is asked for a deposit while the price is
  open.** The owner found the Marketplace replies "a bit rude, extra brief and very much pushy",
  asking for a deposit when the customer was not matching our price (16 Oct 2026). The cause: a
  booking link we sent counted as an arranged visit, and since Marketplace replies carry that link,
  every buyer who wrote back, "still not worth it" included, was put on "ready to commit" and
  offered the $1,000 deposit. Now:
  - A booking link is an invitation, not an arranged visit. The deposit is proposed only once the
    price is agreed: booked or seen, asked to hold it, or accepted our price or the figure our
    staff gave ("deal", "I'll take it"). Never while the customer is making an offer, says the price
    is too high, or is walking away. This applies on the dashboard too.
  - More offers are recognised as price questions: "would u consider 16k", "23 will do", "can do
    14k if you're neg", "my budget is $14000", "give me fair price", "too dear".
  - The price reply goes once in a conversation. A counter-offer after it (or after a figure our
    staff typed) is thanked and left to a person: "Regarding your offer, [PRICE?]."
  - A customer leaving over the price ("all the best", "keep saving", "not worth it") or being
    rude gets a polite close with no blank, no link, no invitation and no deposit.
  - A reply that turns an offer down or runs it down ("we cannot match that figure", "below what
    we can accept", "too low") fails a check and is written again.
  - Marketplace replies open with a short thank-you ("Thank you for your message, Priya."), run to
    two to four short lines and up to 60 words (was under 45), still with no greeting line and no
    sign-off, and invite the buyer to see the car once in a chat.
  - Checked on 13 real Marketplace chats, each cut back to when its old suggestion was written and
    written again with the same model on a copy of the database; nothing was sent.

### Removed
- **The Standards section and the model replies.** The tab where invented model replies were
  rated is gone from the page, with its routes, `voice/model-replies.md`,
  `voice/model-replies.json` and `src/modelreplies.js`. None of the thirty-seven had been
  approved, so the request never carried one and no reply changes. (The owner's words, 15 Oct
  2026: "I don't want the Standard section. It was decided so there's no purpose of showing in
  the dashboard.")

### Changed
- **The page, redesigned around the conversation and the car.** The four sections are tabs
  across the top bar, with their counts, which gives the list its full height. The long status
  sentence became a few words ("Up to date") that open a status panel with the whole story, and
  the welcome page keeps only what to do. On a wide window a panel sits beside the conversation
  with two tabs: **Car** (the main photo, name, price, kilometres, where it is, the photos,
  auction photos, videos, documents and what is included) and **Customer** (everything the old
  details panel showed, without the large repeated name). The car strip shows the car's first
  photo and **Photos and videos**. Below 1280 pixels the panel is a drawer; on a phone the
  sections take a row of their own. (The owner's choices, 16 Oct 2026: "Chat + car panel", the
  car's files from the conversation and from Find a car.)

### Added
- **The link the customer asked for, in the suggestion.** A customer who asks for a video, photos,
  the auction sheet or the export certificate gets the link under the AI's lines, added by code
  from the car's own media with what it is ("Walkaround 360 video: …"): the walkaround for any
  video, the inside or engine videos when asked, the photos as the car's page (not on a first
  reply, whose block has it). The AI is told not to type them or say "below"; a typed one is
  given once; albums, the import approval and anything at the supplier's own address are never
  added by code. A slow dashboard (five seconds) means no block and the usual "we will check and
  send it". (The owner's choice, 16 Oct 2026.)
- **Find a car, the viewer and Add to reply.** Find a car in the top bar opens any car in the
  stock list in the panel. Photos and videos open large in a dark viewer with a filmstrip, the
  arrow keys and a With voice-over / Without switch for videos. Every photo, video and document
  has **Copy link** and **Add to reply**, which puts the labelled link on its own line in the
  suggestion, at the cursor or before the sign-off, as a change that `Ctrl + Z` takes back.
- **A car's photos, videos and documents, on the server.** Two read-only dashboard addresses,
  by the car's chassis number (now kept with each car in the stock list, never shown to the AI):
  the website's photos and videos, and the car's record, which is read only for its auction
  photos, its older photo lists and its documents (auction sheet, export certificate, import
  approval, the Google Photos albums). Everything else in that record (costs, the supplier, the
  VIN, the buyer, the inspection sheet with the supplier's key, the pro-forma invoice, a signed
  Form 5) is dropped the moment it is read. Each car's answer is kept for half an hour; pictures
  are fetched once and served from Wheelman's own copy; videos play from Carbarn's own storage,
  the one address the page's policy now allows for them. New read-only routes:
  `/api/vehicles?q=` (Find a car), `/api/vehicles/:stock`, `/api/vehicles/:stock/media` and
  `/api/vehicles/:stock/picture/:n`. The stock list is read again once after this update so every
  car gets its chassis number. (The owner's request, 15 Oct 2026: "I should be able to access
  the vehicle photos and videos … export certificate and auction report".)
- **Marketplace links say they came from Facebook.** Every link to the Carbarn website in a
  Marketplace suggestion, and in any text sent with **Send reply** (typed or pasted links
  included), carries `utm_source=facebook`, placed before a booking link's `#inspection=…` so the
  booking form still opens (checked on the live site, in person and video call). A link already
  tagged for somewhere else is re-tagged; links to other sites and dashboard replies are
  untouched. The link check compares links without the tag. A lead whose source is plain
  `facebook` now reads "They came to us from Facebook" rather than as an advertisement. (The
  owner's words, 15 Oct 2026: "for facebook marketplace all the links given to customer should
  have ?utm_source=facebook".)
- **The whole vehicle record, and what the dashboard knows about the customer.** The vehicle
  facts the AI reads now carry the written-off register answer (the dashboard's "no" was being
  dropped), water damage and major repairs, the cylinders, previous owners, the first registration
  and the listing description trimmed to its facts (emoji, claims, urgency and contact lines out).
  "Not recorded as written off" is the register's answer and is never written as "accident-free".
  The lead's own signals come through intake by shape: the engagement score, a finance decision,
  how they found us, whether the video was watched, whether the car was reserved when they asked,
  how many other cars they asked about on Carsales, and the postcode. Other dealers' data about
  the customer is dropped at intake and never stored. The request tells the AI what these mean
  ("a finance application was declined: do not raise finance") and never a number, a name or a
  postcode; a reply that mentions a score, a status, a source, other dealers or a finance decision
  fails the new `insider-leak` check and is written again. The details panel lists which of these
  shaped a suggestion. A postcode outside Greater Sydney makes the online video inspection link an
  option, as a record in another state already did.
- **The price reply and the inspection invitation, in the owner's words, added by code.** When
  a customer asks for the best price, a discount, or makes an offer, the standard price reply
  from `voice/price-reply.md` goes under the AI's lines: what the price includes, built from
  that car's own Included list; that government charges are extra; that we may offer a small
  discount for a serious buyer; and the invitation with the booking link. Whenever a customer
  wants to see a car, the invitation from `voice/inspection-invite.md` goes under the lines:
  the booking link, "Or let us know your preferred date and time, and we'll arrange it for
  you.", "Please call or text before visiting." It is always open: no time slot is ever
  proposed. On a first reply it sits inside the standard block, which no longer says "Book
  your inspection". The AI writes only the sentence around them; a line that repeats them is
  sent back, and a figure below the advertised price fails a new `price-floor` check. The
  business facts for price questions and inspections say the same. (The owner's words, 12 Oct
  2026: his price template, and "open invitation plus the link".)
- **Reviewing changes side by side.** `npm run review` writes the same real past conversations
  two ways, with two voice folders or two models, and the Review page at `/review` shows each
  pair as Left and Right, shuffled, with **Left is better**, **Right is better** and **Both
  poor** (keys 1, 2, 3). A vote is saved to the run under `data\review\` and then says which
  side was A; the top of the page keeps the wins, the sales score, the hard-check failures, the
  median words and the estimated cost per side. A paid model in the run means the cost is
  printed first, the run is capped at 40 cases, a run past the month's budget is refused, and
  `--confirm` is needed. The page is refused through the team link. The sales score is now six
  points in the brand register: a next step, a question only when needed, the length, the
  register, no urgency, and the block or proof that was due; `npm run replay` and `npm run
  report` judge by it too. (The owner, 12 Oct 2026: he judges changes by seeing them side by side.)
- **One model per job, and a monthly budget.** The AI has four jobs: the dashboard, import
  and auction replies; the customer read; Marketplace chats; and the lessons taken from your
  notes. Each has its own model, chosen on the page from the cog: pick the job, then the
  provider and the model. The small jobs start at `SMALL_MODEL` (the old `MARKETPLACE_MODEL` is
  still read) and keep to the free models after it unless told otherwise. Wheelman writes
  `data\ai-prices.json` with every model it knows and no price; fill in what each provider
  charges per million tokens and **Used so far** shows what the month has cost, by model and
  in all, against `AI_MONTHLY_BUDGET_AUD` (A$50). At 80% the panel and the status line warn; at
  100% the small jobs keep to models known to be free until the first of the month, a notice says
  so, and dashboard suggestions continue. `npm run check-model` shows which model each job asks
  first and the month's estimate. (The owner's decision, 12 Oct 2026: about A$50 a month.)
- **Which AI writes**, chosen on the page. The cog at the top right opens a panel with the
  provider (Gemini, ChatGPT from OpenAI, or OpenRouter) and the model, picked from the list the
  provider itself offers right now, or typed by name. The choice is kept in the database and
  survives a restart; the chosen model is asked first and the others follow only when it does not
  answer. A provider without a key is offered with a box to paste one into: the key is tried on
  the provider, written into the `.env` file on this computer when accepted, and used at once,
  with no restart. ChatGPT (`OPENAI_API_KEY`, `OPENAI_MODEL`) is new as a provider and writes
  first whenever it has a key, asked in its own request shape (a reasoning model's own temperature and room to think; a field a model
  refuses is dropped and the request sent again), and an account with no credit left is set aside
  like a used-up allowance. Marketplace keeps to the small free model and never a paid one unless
  **Use it for Marketplace too** is ticked. The welcome panel says which model writes, with a
  **Change** link. (The owner's words: "I want to be able to switch the models from wheelman
  dashboard … it should ask for api key if isn't provided one.")
- **Used so far**, lower in the same panel. Every answer is counted by model, with the tokens
  it used: what went in, and what came out including the model's thinking, which the paid
  providers charge as output. The panel shows each model's requests and tokens today and this
  month, the day's count against Wheelman's cap, and a link to each provider's own usage page,
  where the cost is. `npm run check-model` gives each model its full allowance, so a thinking
  model is no longer cut off mid-answer, and shows the tokens each answer took. (The owner's
  words: "I want a usage details in the dashboard as well.")
- **An ordinary enquiry read as an import enquiry.** Import leads from the dashboard's own list
  and the website's import form were already answered the import way; a customer who wrote in
  from the contact page, or texted, about a car we bring from Japan was answered as if they
  asked about a car on the yard. Now Wheelman reads their words: a model code from the website's
  import list (JZS161, GDH206), a make and model from that list when no such car is on the yard,
  or the words themselves ("can you import", "from Japan", JDM, auction, landed cost). A customer
  asking about a car in stock is never read this way. When it reads one, the reply is written the
  import way (what they are looking for is asked, then the Japan auctions are searched), a line
  above the message box says why, and the details panel has an **Import enquiry** section. The
  owner has the last word: **Not an import enquiry** writes the reply the ordinary way, **Treat
  as an import enquiry** does the opposite for one Wheelman missed, and **Move to Import Query**
  lists the conversation in that section (with **Move back to Dashboard**). A ruling is kept with
  the lead, so it follows into the text conversation that starts later, and the suggestion is
  written again the new way unless its text was already changed. The AI is also asked whether an
  ordinary enquiry looks like an import one; when it thinks so, the line offers the same buttons
  and nothing changes by itself. (The owner's words, 12 Oct 2026: "I want the system to understand
  that the query should be treated as the import query. Also there should be a button, after
  judgement, if I want to move that to import query section.")
- **Prompt** in the message box, before a suggestion exists. Next to **Write it now** sits
  **Prompt**: one line of what the reply should say, for example `we have none of that model,
  we can source one`, and Enter writes the reply from it, in Carbarn's voice, in one request,
  instead of Wheelman's own version first. While the line is open the automatic suggestion for
  that conversation waits a minute and a half, so there is only ever the one request; closed
  unused, it carries on as before. A prompt that failed is kept for **Try again** and for the
  background retry. The three shimmering lines now show whenever a suggestion is being written
  for the open conversation, started from the page or in the background, and the sentence above
  the buttons says when Wheelman tries again while the free models are busy or used up. Nothing
  new is learned from a prompt. (The owner's words: "There should be two buttons: 1 is prompt,
  second is write. I'll use prompt when it's needed, otherwise it'll write.")
- A text the phone add-on sees before the dashboard has it sets off a dashboard check and its
  suggestion at once, as a new lead does, instead of waiting for the next three-minute check.
  `PHONE_WRITE_AT_ONCE=0` leaves it to that check.
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
- **One voice, Carbarn's.** Every reply is written in the formal register the owner settled on
  12 October 2026 ("formal and corporate"): the greeting follows Sydney time ("Good morning",
  "Good afternoon", "Good evening", else "Hello"; a "Hi" the AI writes is changed by code), full
  sentences, "we" never "I", hospitality phrasing in place of "No worries" and apologies, no
  slang, no emoji, at most one exclamation mark, and a question only when the answer is needed
  to proceed: the canned questions ("would a weekday after work or Saturday suit?", "cash or
  finance?", "would you like the auction sheet?") are gone. `voice/house-voice.md` and
  `voice/sales-playbook.md` are rewritten; the versions before the change are kept in
  `voice/previous/` for a side-by-side review. The replies our salespeople really sent are read
  for what they said, never for their wording. New in the message box: a register note on slang
  or an apology, length notes at 70 words for a first reply, 50 inside a conversation and 45 on
  Marketplace (which is now formal but short), and "plus on-roads" is refused. The thirty-seven
  model replies are rewritten in the voice and every one is back under **Standards** to rate.
  Lessons learned before the change are shown as content only, and those about price questions,
  written under the old policy, are no longer shown. The premises are "our Lidcombe showroom" in
  every reply, and the auction and import templates open with "Hello".
- **Our address is 136 Frances Street, Lidcombe NSW 2141**, in the standard first-reply block,
  the import reply, the auction messages and the business facts, and the Google Maps line is
  gone from all of them. The old address lives on in the team's past replies, which the AI
  reads as examples: every such reply is shown with our address replaced by `[our address]`,
  and a suggestion that gives the old address or a map link is sent back and written again.
  (The owner's words: "136 Frances street instead of Unit D3 128-130 Frances street. no need to
  mention shifting, and skip map link for now".)
- One suggestion is written at a time for one customer message. **Write it now** pressed while
  one is being written in the background joins it instead of asking the AI again, and the other
  way round; a reply written from a prompt or an instruction is never overwritten by a plain one
  that finishes after it.
- A staff instruction, typed into Prompt or Rewrite, has the customer's name, number and other
  details removed before it reaches the AI, as every other text does, and the request says it
  decides what the reply says, over the examples and the selling moves, while the rules on
  figures, links, days and promises still hold.
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
- A suggestion written from an instruction that failed because the free models were busy was
  tried again without the instruction, both by **Try again** and by the background retry, and
  so came out as the plain reply the instruction was meant to replace.
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
