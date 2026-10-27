# Wheelman 🛞

[![CI](https://github.com/JimmYCHUU/Wheelman/actions/workflows/ci.yml/badge.svg)](https://github.com/JimmYCHUU/Wheelman/actions/workflows/ci.yml)
![Node.js 22.13 or newer](https://img.shields.io/badge/node-%E2%89%A522.13-339933)
![Dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)
![AI models](https://img.shields.io/badge/AI-free%20models%2C%20or%20ChatGPT-blue)
![Sends only on Send](https://img.shields.io/badge/sending-Marketplace%20Send%20button%20only-orange)

Carbarn's reply assistant. Wheelman reads new enquiries from the Carbarn dashboard and new
chats from Facebook Marketplace, works out who is waiting for an answer, and writes a suggested
reply for each one in the dealership's own voice: brief, factual and polite, with a little
warmth and no pressure. It also follows every auction order, and has the next message to that
customer written and waiting. Every figure and
link in a suggestion is checked against our own stock and policy records before it is shown,
and anything only a person can decide is left as a marked blank. A person reads the suggestion,
edits it, copies it and sends it. Nothing is ever sent from Wheelman.

The whole thing is one page in the browser, laid out like a messaging app: conversations on the
left, one open chat, and the suggestion waiting in the message box. It looks like Carbarn on
purpose.

`Node.js 24` · `node:sqlite` · `No dependencies` · `Gemini free tier` · `OpenRouter free models` · `ChatGPT (OpenAI), if chosen`

---

## Table of contents

- [The idea](#the-idea)
- [The voice](#the-voice)
- [How a suggestion is written](#how-a-suggestion-is-written)
- [Buyers, first replies and promises](#buyers-first-replies-and-promises)
- [Import and auction enquiries](#import-and-auction-enquiries)
- [Non-negotiable rules](#non-negotiable-rules)
- [Install & run](#install--run)
- [The daily workflow](#the-daily-workflow)
- [Backups and another computer](#backups-and-another-computer)
- [Sharing with the team](#sharing-with-the-team)
- [The page](#the-page)
- [The Marketplace section](#the-marketplace-section)
- [The Auction section](#the-auction-section)
- [The Import Query section](#the-import-query-section)
- [The browser add-on](#the-browser-add-on)
- [What Wheelman knows](#what-wheelman-knows)
- [How Wheelman learns](#how-wheelman-learns)
- [Rules as Carbarn confirmed them](#rules-as-carbarn-confirmed-them)
- [AI models and budget](#ai-models-and-budget)
- [Reviewing changes side by side](#reviewing-changes-side-by-side)
- [Privacy](#privacy)
- [Commands](#commands)
- [Where your files live](#where-your-files-live)
- [Troubleshooting](#troubleshooting)
- [Tests](#tests)
- [Project layout](#project-layout)
- [Contributing, security and licence](#contributing-security-and-licence)
- [Status](#status)

---

## The idea

Answering enquiries by hand means, for every message, every day: open the conversation, work
out which car they mean, look up its price, kilometres and whether it is still at the yard,
remember what is included with it, recall the deposit and delivery rules, find the right
booking link, and then write it the way the dealership writes. Thirty to fifty messages a day
need that, on the dashboard and on Marketplace.

Wheelman does the looking-up and the first draft. The facts come only from our own records,
what to say from a couple of hundred replies our salespeople typed themselves (templates and
AI-polished messages removed), and how to say it from Carbarn's own voice guide. What it cannot know, such as a discount, a
trade-in value or a delivery quote, it hands to the person as a highlighted blank instead of
guessing. It keeps learning from the replies that were really used and from the edits made to
its suggestions.

## The voice

Wheelman writes in one voice: Carbarn's. Formal, courteous and exact, the way a good dealership
writes when it is shortened to fit a phone screen. The owner settled the register on 12 October
2026: "formal and corporate", a brand rather than a copy of any one person.

**The shape.** The greeting follows Sydney time ("Good morning", "Good afternoon", "Good
evening", else "Hello"), once a day; "Hi" is never used, and one the AI writes is changed by code.
The first sentence answers what was asked, with facts as figures ("48,000 km verified on the
export certificate"). One idea per sentence, a link on its own line, and the reply ends on the next
step. Code adds the sign-off "Regards, Team Carbarn" and the standard blocks; the AI never types
them.

**The register.** Full sentences, Australian English, "we" never "I", no slang, no emoji, at most
one exclamation mark, no marketing words, and no apologising for the business. Hospitality phrasing
in place of casual phrasing:

| Instead of | Wheelman writes |
|---|---|
| No worries / No problem | Certainly. / Of course. / With pleasure. |
| Sorry for the delay | Thank you for your patience. |
| Just checking in / Sorry to bother you | (nothing: it says what the message is for) |
| Feel free to / Don't hesitate to | You are welcome to |
| Let us know if you have any questions | (nothing: it ends on the next step) |
| Our yard | Our Lidcombe showroom |

**Questions.** Only when the answer is needed to proceed: which car they mean, a postcode for a
delivery quote, the details of a trade-in. There is no canned question; the invitation to inspect
is the next step.

**Length.** Up to 70 words on a first reply (before the standard block), up to 50 inside a
conversation, usually 20 to 50 on Marketplace (up to about 90 when several things were asked),
about 180 in an import email. A customer who writes one line gets two or three sentences. A reply over the band, or one with slang or an apology in it,
is pointed out in the message box; it is never refused for that alone.

**What the team's replies teach.** The replies our salespeople really sent are still read for
every suggestion, for their content: what they chose to say, offer and leave out. Their wording
is not borrowed; the register is this voice. Lessons learned before the voice changed are read the
same way, and those about price questions, written under the old policy, are no longer shown. The
names of the salespeople are not in this repository (`voice/people.json`, local only). The voice is
`voice/house-voice.md`; the version before 12 October 2026 is kept in `voice/previous/` so the two
can be compared on the Review page.

## How a suggestion is written

```
 Carbarn dashboard ──► leads · SMS conversations · stock      (read-only, four addresses)
 Content engine    ──► Facebook Marketplace chats             (three read addresses, one send address)
                                   │
        ┌──────────────────────────▼──────────────────────────┐
        │ 1. WHO IS WAITING   did the customer write last?     │──► NO REPLY NEEDED (thanks, STOP)
        │                     duplicates and templates removed │──► NOT CUSTOMERS (suppliers, codes)
        └──────────────────────────┬──────────────────────────┘
        ┌──────────────────────────▼──────────────────────────┐
        │ 2. WHAT IT IS ABOUT keyword rules, no AI call        │
        │                     the car, from the stock number   │
        │                     a new enquiry, or already a buyer│
        └──────────────────────────┬──────────────────────────┘
        ┌──────────────────────────▼──────────────────────────┐
        │ 3. PRIVACY          name · phone · email · rego ·    │
        │                     VIN · address · bank details out │
        └──────────────────────────┬──────────────────────────┘
        ┌──────────────────────────▼──────────────────────────┐
        │ 4. THE REQUEST      vehicle facts · business facts   │
        │                     how Carbarn works · website      │
        │                     our salespeople's real replies   │
        │                     what the team sent lately        │
        │                     what you changed last time       │
        │                     what our records say, unstated   │
        │                     your prompt, when you gave one   │
        └──────────────────────────┬──────────────────────────┘
        ┌──────────────────────────▼──────────────────────────┐
        │ 5. FREE AI MODEL    six models, tried in order       │──► PAUSED (day's allowance used)
        └──────────────────────────┬──────────────────────────┘
        ┌──────────────────────────▼──────────────────────────┐
        │ 6. CHECKS           every figure and link traced to  │──► one retry, then a RED FLAG
        │                     our records · greeting and       │──► BLANK TO FILL ([PRICE?] ...)
        │                     sign-off once a day              │
        │                     promises · days · places backed  │
        └──────────────────────────┬──────────────────────────┘
                       SUGGESTED REPLY · not sent
        ┌──────────────────────────▼──────────────────────────┐
        │ 7. A PERSON         edit · copy · paste · send       │──► learned from (dashboard only)
        └─────────────────────────────────────────────────────┘
```

Every suggestion is stored in SQLite with the checks it passed or failed and the model that
wrote it. When the reply later appears in the dashboard conversation, Wheelman compares what
was really sent with what it suggested.

## Buyers, first replies and promises

Three things decide what kind of reply a customer gets.

### Is this person already a buyer?

Someone who has paid a deposit must not be answered like a new enquiry. Wheelman decides from
what it already receives, in this order:

1. **A sale record** on a car, matched to the conversation by phone number or email. `+61 4…`
   and `04…` count as the same number.
2. **The lead's status**: car sold, deposit received or closed won, unless the sale fell
   through afterwards.
3. **Our own earlier texts**, such as "we have received your deposit". This one is marked
   "appears to be a buyer".

For a buyer, the car in question is their own car, even when no stock number is in the
conversation. The AI is told the stage of the sale and which dates are on file (registration,
inspection report, blue slip). A date that is not on file is neither "done" nor "not done":
the reply says we will check, with a `[CHECK?]` blank. A buyer is never asked which car they
mean, never offered an inspection booking link or other cars, and never told an amount paid or
owing. A reply that treats a buyer as a new enquiry is sent back for one rewrite.

A car that still shows as available but has another customer's deposit on it is described as
reserved, with no booking link.

### The standard first reply

A brand-new enquiry in the Dashboard section gets the reply we always send: one or two lines
that answer the question, then the standard block with the car's page, the invitation to
inspect with the booking link when the customer asked to see the car, the address (136 Frances
Street, Lidcombe), the opening hours and the phone number. No map link is sent in any message.
The AI writes only the opening lines. The block is added by code from `voice/first-reply.md`, so
its wording and symbols are always exact, and it takes the place of the sign-off on that message.
Edit that file to change the block.

- No car matched, or the car is sold or reserved: the "Vehicle details" lines are left out.
- The customer asks to see the car: the block carries the invitation (below). Otherwise those
  lines are left out.
- If the AI types the address, hours, phone number or one of those links itself, the line is
  dropped or the reply is sent back. The old address (Unit D3, 128-130 Frances Street) and a
  Google Maps link are refused outright: both live on in the team's past replies, which are
  shown to the AI with the address replaced by a label.
- Buyers, later replies in a conversation, holding replies, Marketplace chats and anyone who
  writes to a staff member by name do not get it.

### The inspection invitation

Whenever a customer wants to see a car (they ask now, asked earlier and were not given the link,
ask where we are, or our staff ask for it in a prompt), the invitation is added under the AI's
lines by code, in the owner's words from `voice/inspection-invite.md`:

```
You can book an inspection here:
<the car's booking link>
Or let us know your preferred date and time, and we'll arrange it for you.
Please call or text before visiting.
```

The invitation is always open: no time slot is ever proposed. On a first reply it sits inside
the standard block, which already asks the customer to call or text first, so that last line is
left out there. For a customer who says they are far away the first line offers the online video
inspection instead. On Marketplace the invitation is not added: the next step there is the
buyer's number (see [The Marketplace section](#the-marketplace-section)); when a link is given
there anyway, its last line reads "Please message or call before visiting."
The AI writes the sentence that says the car is available to inspect, and nothing about days,
times, slots or the link: a link line it types anyway is dropped, and a line that repeats the
invitation's own words is sent back. When the AI confirms a time the customer named ("See you
on Saturday"), no invitation is added. A car that cannot be inspected yet gets no invitation.

### The price reply

When a customer asks for the best price, a discount, or makes an offer, the owner's standard
price reply is added under the AI's lines by code, from `voice/price-reply.md`:

```
The price includes 6 months NSW registration, a 5-year extended warranty, 1 year roadside
assistance, CTP insurance, a fresh roadworthy certificate and Greater Sydney delivery.
Government charges are extra.

We generally keep our prices competitive considering everything included, but we may offer a
small discount for a serious buyer.

You can book an inspection here:
<the car's booking link>
Or let us know your preferred date and time, and we'll arrange it for you.
Please call or text before visiting.
```

What the price includes is built from that car's own Included list on the dashboard, in the
owner's words and order: an inclusion the car does not list is left out, and a car with none of
them gets "The advertised price excludes government charges." The invitation is left out when the
car cannot be inspected yet. The AI writes only the greeting when one is due and one or two
sentences that answer anything else asked: never the advertised price again, never a figure, and
never a yes or a no to an offer. A figure the customer named gets a `[PRICE?]` sentence for a
person ("Regarding your offer, [PRICE?]."); a figure below the advertised price in the AI's own
lines fails the `price-floor` check and the reply is written again. Marketplace chats get the same
block. (The owner's words, 12 Oct 2026.)

The price reply goes once in a conversation. When the customer comes back with an offer after it,
or after a figure our staff typed, the reply thanks them and leaves the figure to a person, with
no second block. A reply that turns an offer down or runs it down ("we cannot match that figure",
"below what we can accept", "too low") fails a check and is written again. A customer who is
leaving over the price ("all the best", "still not worth it") or is rude gets a polite close:
thanks, and that they are welcome to message us if their plans change, with no blank, no link, no
invitation and no deposit.

The $1,000 holding deposit is proposed only once the price is agreed: when the customer has
booked or seen the car, asked to hold it, or accepted our price or the figure our staff gave.
Never while they are making an offer, saying the price is too high, or walking away. A booking
link we sent is an invitation, not an arranged visit. (The owner's decision, 16 Oct 2026.)

### Photos, videos and documents a customer asks for

When the customer's waiting messages ask for a video, photos, the auction sheet or the export
certificate, the links are added under the AI's lines by code, from the car's own media (see
[A car's photos, videos and documents](#a-cars-photos-videos-and-documents)), each with what it
is:

```
Walkaround 360 video: <the walkaround, with the voice-over>
Auction sheet: <the auction sheet>
Export certificate: <the export certificate>
Photos: <the car's page on the website>
```

Only what was asked for: the walkaround for any video, the inside or engine videos too when those
are asked for, the photos as the car's page (and not at all on a first reply, whose standard block
already carries that page, or for a car not yet listed). The albums and the import approval are
never added by code; Add to reply on the page puts them in by hand. An auction sheet kept at the
supplier's own address is never added at all, so the supplier's address never reaches a customer;
one on Carbarn's own storage is. The AI is told the links are
added and writes the answer around them in its own words; a link it types anyway is given once,
and a reply that points at the links with "below" is written again. If the dashboard does not
answer within five seconds, nothing is added and the usual rule stands: say we will check and send
it. (The owner's choice, 16 Oct 2026: "Yes, when asked".)

### Promises, days and places

After the figures and links, each suggestion is checked for things that sound fine but that
nobody agreed to. It is sent back for one rewrite when it:

- names a part of today that has already passed ("this afternoon" at 8:44 pm);
- arranges something on a day nobody in the conversation mentioned ("see you tomorrow" when
  the customer said "this morning"). Each message is read from the time it was written, so
  "tomorrow" in yesterday's message means today;
- promises an action or a readiness with a time attached that nobody on our side gave. Only
  the instruction for the draft or our own recent messages count; the customer asking for it
  does not;
- names a state or city the customer never mentioned.

A promise with no time attached ("we will send it shortly") shows one quiet note. An
instruction typed into **Prompt** or **Rewrite** still decides what to say, and a figure,
link or promise in it counts as given by staff, but it never overrides these rules. A
customer's name or number typed into it is removed before the AI sees it, like everything else.

### What gets no suggestion

Thank-yous and laughter, login codes and missed-call notices, texts of ours that failed to
send (the customer is still waiting), and messages more than a day old. Those older messages
stay listed with **Write it now**. A conversation where we wrote last gets no reply either:
when there is a reason to write again it appears under **Follow-ups** (see "Follow-ups" under
The page), and the follow-up is written when you open it from there.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `FIRST_REPLY_SENDER` | The name on the last lines of the standard block | `Team Carbarn` |
| `AUTO_DRAFT_MAX_AGE_HOURS` | Older messages are listed, but written only when asked | `24` |

## Import and auction enquiries

Customers who ask us to find a car from Japan come in through the website's importing pages
and live auction pages. The dashboard keeps them on a separate list from the car portals, and
Wheelman reads that list too. For each one it also reads the auction request our staff keep
for that customer (which car, which years, the budget, a target bid), and the conversation as
usual. The details panel shows it under **Looking for, from Japan**.

### An ordinary enquiry read as an import enquiry

Not every import enquiry arrives on that list. A customer may write in from the contact page,
or text the yard's number, about a car we bring from Japan. Wheelman reads their own words
for three signs, in this order: a model code from the website's import-eligible list (JZS161,
GDH206); a make and model from that list when no such car is on the yard; or the words
themselves ("can you import", "from Japan", JDM, auction, landed cost, compliance). A customer
asking about a car in stock is never read this way, and a model name alone is not enough
("Note" and "March" are models too): the make must be there as well. The list is the one the
Import Query section reads from the website once a day; without it, only the words count.

When Wheelman reads one, the reply is written the import way, a line above the message box
says why, and the details panel has an **Import enquiry** section. You have the last word:

- **Not an import enquiry** writes the reply the ordinary way.
- **Treat as an import enquiry** does the opposite for one Wheelman missed. The details panel
  offers it on every dashboard conversation.
- **Move to Auction** lists it with the auction customers: what they asked for is searched for
  in the Japan auctions. **Move to Import Query** lists it there instead. See
  [Moving a conversation](#moving-a-conversation-to-another-section).

A ruling is kept with the lead, so it follows into the text conversation that starts later.
After a ruling the suggestion is written again the new way, unless you had already changed its
text. The AI is also asked whether an ordinary enquiry looks like an import one; when it thinks
so, the line offers the same buttons, and nothing changes until you choose.

### Moving a conversation to another section

The **Move** button in a conversation's header lists the sections it can go to, each with a
sentence on how the customer is answered there:

| Section | How the customer is answered |
|---|---|
| **Dashboard** | As an ordinary enquiry about our cars |
| **Auction** | As an auction customer: what they want is searched for in the Japan auctions |
| **Import Query** | As an import question, with the facts from our importing pages |

Moving works in every direction between those three. A Facebook chat can leave Marketplace and
come back, but nothing else moves into Marketplace: it is Facebook's inbox. An auction order
never moves. The conversation keeps its messages and its key, and the reply still goes out the
way it came in: a text is pasted into the dashboard, a Facebook chat still has Send reply, an
email is still answered in Gmail. Only the list it sits on, and how the customer is answered,
change. The toast has **Undo**, and back in its own section the move is forgotten.

A move is kept with the lead, so it follows into the text conversation that starts later. Moved
into Auction or Import Query, a conversation is answered as an import enquiry, its car read from
the customer's words even when a car of that model is on the yard. The first reply after you
move it into Auction searches the live auction with what they asked for, however far the
conversation has gone, so a customer who already gave the car and the details gets an offer, not
the same questions again; after that, as for any import enquiry, only something new sets off a
search. Nothing is
learned while a conversation is in Auction, and nothing written while it was there teaches
after it leaves. A Facebook chat never teaches, wherever it is listed.

What the reply is depends on how much we know.

### We do not know what they are after yet

The reply thanks them for the enquiry and asks for what is missing: year range, maximum
odometer, grade or specification, landed budget, and colour or feature preferences. It ends
with the address, phone number and hours. The wording is in `voice/import-ask.md`. When the
customer only filled in the website form, it is used exactly as written and no AI request is
spent. When they also wrote something of their own, the AI answers that and still asks.

### We know enough to look

Once the customer has given a year, a kilometre limit, a grade, a budget or a bid, Wheelman
searches the website's live auction for that make and model, picks one car, asks the
website's own cost calculator what that car would cost landed and complied, and lays out the
offer:

- the car: year and model, kilometres, auction grade, engine, drive, seats;
- the link to its page in the live auction;
- the suggested bid, and the estimated landed and complied cost with each part of it;
- a blank for the deposit link, `[DEPOSIT LINK?]`, which you paste in yourself;
- that we inspect before bidding, and the sign-off.

The AI writes only the greeting and a sentence on why the car may suit. Everything else is
put in by code from the auction feed and `voice/auction-offer.md`, so the figures are exactly
the website's. An opening that states a figure or a link is sent back. If no AI model is
free, a plain opening is used and the offer is still written.

- **Which car.** Repaired and ungraded cars (R, RA) go last. Then a car inside the budget
  comes before one a little above it, then under the kilometres asked, then inside the years
  asked, then the better grade and the lower kilometres. A car more than half as much again
  over the budget is never offered. Cars the website marks as not eligible, or as needing a
  manual check, are left out.
- **Which bid.** Worked out from what similar cars really sold for. The website lists up to
  ten recent sales for each car ("Japan auction sold prices"). Wheelman takes the three
  closest to this one (the same auction grade first, then the nearest kilometres), averages
  what they sold for, and rounds up to the next ¥50,000. Sales of ¥401,000, ¥388,000 and
  ¥178,000 average ¥322,333 and give ¥350,000. With fewer than three sales it uses what there
  is. **It is never below the website's own suggested bid**, which the customer sees on the
  car's page: when similar cars sold for less, or there are no sales to go by, the website's
  suggested bid is rounded up and used instead. The message names both figures ("The
  website's suggested bid is … We usually suggest around … to improve the chance of
  winning"). A bid the customer named, or one you type in, is used as it is; if yours is
  below the website's, a note says so. The sales it looked at are listed in the details panel.
- **The deposit paragraph** is left out once the customer has paid a deposit.
- **Telling it otherwise.** In **Rewrite**, paste a live-auction link (or type
  "lot 2006629") to offer that car, type "bid 280000" to cost it at that bid, or "find
  another one" to search again. The same happens when the customer sends a link or a bid.
- **When nothing fits.** The reply says nothing suitable is in the coming auctions and that
  we are keeping the search going. It names no car.

The auction changes every day and the costs move with the exchange rate, so the suggestion
shows when the figures were read and when the auction is. Write it again if it is sent much
later. The feed shows the next few auction days only. Once a deposit is paid, or the request
has moved past its first stage, Wheelman stops offering cars and answers as usual.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `AUCTION_BID_STEP_YEN` | The average of the sold prices is rounded up to the next step of this size | `50000` |
| `AUCTION_BUDGET_SLACK` | How far over the budget still counts as "a little above": `0.15` is 15% | `0.15` |
| `AUCTION_FIT` | Whether an auction message is fitted to the customer by the AI (one request each); `0` writes it word for word | `1` |
| `AUCTION_FIT_BACKGROUND` | Whether the message that is due is fitted in the background too, or only when you pick or write one | `1` |
| `AUCTION_API_URL` | Where the live auction is read from | The dashboard's address |

## Non-negotiable rules

Enforced in code, not by convention.

- **RULE-0 Sends nothing by itself.** One code path sends a message: a Marketplace reply, to
  the content engine's own reply address, when a person presses **Send reply** on the page. It
  sends exactly the text in the box, refuses while a blank is still to be filled, and never
  runs on its own. Dashboard and auction replies leave only by a person's copy and paste.
- **RULE-1 Read-only.** The dashboard client can sign in and GET six addresses: the leads, the
  conversations, their messages, the cars, the auction orders, and the notification feed, which
  is only ever read and never marked as read. The content engine client can GET three and
  POST a reply to one; it cannot mark a chat read, archive it, retry a message or touch the
  engine's auto-reply. The live auction client uses no login: it can GET three
  addresses (the cars coming up, one car, what similar cars sold for) and ask the website's
  cost calculator for one figure. That one request is a
  POST, because that is how the website's own page asks. It carries the bid amount and
  nothing else, places no bid and stores nothing. The eligible-models client, also with no
  login, can GET two addresses: the website's list of import-eligible models, and one model's
  figures. Any other address or method is refused
  before a request is made. Reading does not mark anything as read, and never triggers the
  dashboard's own drafts or the engine's auto-reply. The phone add-on reads the list in the
  Messages tab of your own browser: it opens nothing, clicks nothing and marks nothing read,
  and it never types or sends.
- **RULE-2 Customer details stay here.** Names, phone numbers, emails, rego plates, VINs,
  street addresses and bank details are removed on this computer before any text goes to an
  AI service. The first name is put back afterwards.
- **RULE-3 Never guess.** A figure or link that cannot be traced to our records fails the
  check. A price that only the customer mentioned is theirs, not ours. What a person must
  decide becomes a blank: `[PRICE?]`, `[TRADE-IN VALUE?]`, `[DELIVERY COST?]`, `[DATE?]`,
  `[CHECK?]`. The same goes for a time that has passed, a day nobody mentioned, a dated
  promise nobody on our side made, and a place the customer never said. An email about
  importing never says we will check and come back: the sentence carries the exact figure
  from the website, or its blank.
- **RULE-4 Marketplace never teaches.** Learning accepts dashboard conversations and import
  emails, each kept to its own kind: what an email taught is used only for emails, and what a
  text taught only for texts and Marketplace chats. Marketplace chats, numbers seen only on the
  phone with no dashboard record, and auction orders are refused in three places: the learning
  code, the copy route and the database helper. A reply the team sends from the phone to a
  dashboard customer teaches like one sent from the dashboard once the add-on has seen all of
  it; one the Messages list cut short does not. The example bank, which sets the voice, takes
  only replies whose author it knows: never a text typed on the phone, never an email.
- **RULE-5 No costs, no sale amounts.** Purchase cost, shipping cost and margin are never
  stored and never sent anywhere. From a sale record Wheelman keeps the stage and the date,
  and whether a deposit or the full amount is recorded. It keeps no amount and no buyer name,
  and the buyer's phone and email only as scrambled match keys. An auction order is the one
  exception, because its messages have to state what is due: Wheelman keeps what the
  customer has been charged and has paid on it, and puts those figures into a message by
  code. They are never sent to an AI. Our own costs on the car are never kept.
- **RULE-6 STOP means stop.** Nothing is ever drafted for a customer who opted out.
- **RULE-7 Nothing on the page is final.** Dismiss can be undone, and a dismissed
  conversation stays findable.

---

## Install & run

### One click: `Start Wheelman.cmd`

Double-click **Start Wheelman.cmd**. A black window opens and stays open, and the page opens
in your browser at http://localhost:3210. Leave the window open while you work; the page
refreshes by itself. Close the window to stop Wheelman: a backup is written as it closes. For a
desktop shortcut, right-click the file, then **Send to > Desktop (create shortcut)**. To let
colleagues use the page from their own computers, double-click **Share Wheelman.cmd** instead:
see [Sharing with the team](#sharing-with-the-team).

No exe and no installer on purpose: Wheelman has no packages to install. Node.js is all it
needs.

### What you need first

| | |
|---|---|
| Node.js | 24 (22.13 or newer works) |
| Dashboard login | Your own Carbarn dashboard username and password |
| AI key | A free Gemini key from https://aistudio.google.com/apikey, or a ChatGPT (OpenAI) key from https://platform.openai.com/api-keys, which is paid by the request |
| Backup AI key | Optional. A free OpenRouter key from https://openrouter.ai/keys |

### One-time setup

Copy `.env.example` to `.env` and open it in any text editor. Write each value straight after
the `=` with no spaces and no quote marks, save, then start Wheelman.

| Setting | What to put |
|---|---|
| `DASHBOARD_API_URL` | The address of the dashboard's data service |
| `DASHBOARD_USERNAME` | Your dashboard username |
| `DASHBOARD_PASSWORD` | Your dashboard password |
| `GEMINI_API_KEY` | The free Gemini key |
| `OPENAI_API_KEY` | A ChatGPT (OpenAI) key, if you use it. The page can also take one: see [Free AI models](#free-ai-models) |
| `OPENROUTER_API_KEY` | Optional backup key |
| `MARKETPLACE_URL` | The address of the Marketplace inbox. Leave empty to keep that section off |
| `DASHBOARD_ORIGIN` | The address of the dashboard's own website, sent as the origin of each read. Leave empty to use the data service's address |
| `BUSINESS_PHONES` | Any other phone numbers of ours that may appear in a text, comma-separated. Optional |

None of these addresses is written in the code on purpose. Then copy
`voice/people.example.json` to `voice/people.json` and put in the real names and logins of the
two people whose voice Wheelman learns, and the first names of other staff.

A fresh copy has no website pages. To give Wheelman the policy pages, guides, blog posts and
import pages, run this once (about ten minutes):

```bat
npm.cmd run fetch-website -- --all
```

In Windows PowerShell, type `npm.cmd` wherever these instructions say `npm`. Plain `npm` is
blocked by a Windows security setting and shows "running scripts is disabled on this system".
In Command Prompt, plain `npm` works.

To catch texts that reach the business phone but not the dashboard, load the browser add-on
once: see [The browser add-on](#the-browser-add-on).

### Check it worked

```bat
npm.cmd run check-login     :: can Wheelman read the dashboard?
npm.cmd run check-model     :: which AI models are answering right now?
npm.cmd test                :: the automated checks, no internet needed
```

---

## The daily workflow

1. Double-click **Start Wheelman.cmd** and leave the black window open.
2. The browser tab shows a number when a customer has sent something new: `(2) Wheelman`.
3. Pick a customer from the list. Their number clears once you have opened the conversation.
4. Read the suggestion in the message box. Fill in anything highlighted. If nothing is written
   yet and you already know what the reply should say, press **Prompt**, type it in one line and
   press Enter: Wheelman writes the reply from your words in one request, instead of its own
   version first. Otherwise leave it, or press **Write it now**.
5. Press **Copy reply**, paste it into the dashboard, and send it. In a Marketplace chat, press
   **Send reply** instead and it goes to the buyer from here (Copy still works there too).
6. The customer leaves **Waiting** by themselves once the reply appears in the conversation.
   Wheelman then compares what was sent with what it suggested, and learns from it.

Wheelman checks the dashboard and the Marketplace inbox every three minutes. Between checks it
reads the dashboard's own notification feed every 45 seconds (`NOTIFICATIONS_SECONDS`; 0 switches
it off). A new lead announced there sets off a check at once, so the lead's text is in Wheelman
within about a minute without anyone pressing "Check for new messages now", even while a
suggestion is being written for someone else or a check is already under way; its own suggestion
follows as soon as the AI is free. A price change or a sale refreshes the car list straight away.
A text the phone add-on sees before the dashboard has it sets off a check and the suggestion
the same way, so it is answered within a minute rather than at the next check
(`PHONE_WRITE_AT_ONCE=0` leaves it to the next check).
Each announced lead is noted in `data\wheelman.log` with how long the check took. The feed covers every Carbarn site, but the
Sydney lead list that the dashboard and Wheelman both read is filtered to the Australian
platform, so an enquiry from another site (a bare phone number from "Lead Service", say) is
announced and never listed: Wheelman runs one check for it, finds it is not there, and leaves it
alone. The status line says when the feed was last read.

At the end of the day, close the black window. A backup is written on the way out.

## Backups and another computer

Everything Wheelman has learned lives in files on this computer that git never sees: the
database, the `.env` settings, the staff names, the voice files and the private business
facts. A backup is one dated zip file holding all of them, such as
`Wheelman backup 2026-10-08 17.32.05.zip`.

- **By itself.** A backup is written when the black window closes (Ctrl+C, the window's X, or
  Windows shutting down), and once a day while Wheelman is open, in case it is never closed
  properly. The welcome panel on the page says when the last one was written.
- **By hand.** Double-click **Back up Wheelman.cmd**, or run `npm run backup`. This works while
  Wheelman is open.
- **Where.** `Documents\Wheelman backups`, outside the Wheelman folder on purpose. The newest
  20 are kept and the oldest removed. Set `BACKUP_DIR` in `.env` to a folder on a USB drive, or
  one that OneDrive or Google Drive syncs, so a backup survives the computer. A backup holds the
  dashboard password and the AI keys from `.env`: keep it where only you can open it.
- **Left out.** Photos, the downloaded website pages and the raw history, because they can be
  fetched again.

To use Wheelman on another computer, with everything it has learned:

1. On this computer, double-click **Back up Wheelman.cmd** and copy the newest file from the
   backup folder to a USB drive.
2. On the other computer, install Node.js and get the Wheelman folder (clone it from GitHub, or
   copy this folder across).
3. Drop the backup file onto **Restore Wheelman.cmd** and type `yes`. With no file dropped on
   it, it restores the newest backup in that computer's backup folder. Then start Wheelman as
   usual.

A restore replaces the database, `.env`, the voice files and the private notes with what is in
the backup, after keeping what was there as a "Wheelman before restore" file in the backup
folder, so a restore can itself be undone. Wheelman must be closed first; the restore says so
if it is not.

Two computers learn separately: a reply approved at the office is not known at home until a
backup is carried across. Carry the newest backup each way and restore it before starting, or
use Wheelman on one computer at a time. Never put the Wheelman folder itself in a synced folder
such as OneDrive while Wheelman runs on both computers: the database would be damaged. The
backup folder is fine to sync.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `BACKUPS` | `0` stops the backup on closing and the daily one. **Back up Wheelman.cmd** still works | `1` |
| `BACKUP_DIR` | Where the backups go | `Documents\Wheelman backups` |
| `BACKUP_KEEP` | How many to keep; the oldest are removed | `20` |

## Sharing with the team

Wheelman runs on one computer. To let colleagues use the same page from their own computers
or phones, double-click **Share Wheelman.cmd** instead of Start Wheelman.cmd. It starts
Wheelman as usual and opens a Cloudflare tunnel to the page. The black window prints the
address to give them, and the welcome panel on the page shows it as a link:

```
==========================================================
Shared with the team at:  https://some-words.trycloudflare.com
==========================================================
```

Colleagues open that address in any browser and type the **team password** once; their browser
remembers it for 30 days. Set the password in `.env` first:

| Setting | What to put |
|---|---|
| `TEAM_PASSWORD` | The password the team types. Sharing stays off while it is empty |
| `SHARE` | `1` to share every time Wheelman starts, even from **Start Wheelman.cmd**. `0` to share only from **Share Wheelman.cmd** |

What to know:

- **Everyone sees the same page.** The lists, what is read and what is dismissed are shared:
  when one person opens a conversation, its blue number clears for everyone. The free AI
  allowance is shared too.
- **The address changes each time Wheelman starts.** A free trycloudflare.com address needs no
  account; give colleagues the new one from the welcome panel. For a fixed address of your own,
  make a named tunnel in the Cloudflare dashboard (Zero Trust > Networks > Tunnels, with its
  public hostname pointed at `http://localhost:3210`), put its token in `CLOUDFLARE_TUNNEL_TOKEN`
  and the address in `SHARE_URL`.
- **Nothing is opened on this computer.** The tunnel is cloudflared, Cloudflare's own program,
  which dials out from this computer; the page still listens on this computer only, and only
  what comes through the tunnel with the team's sign-in reaches it. The first time, Wheelman
  downloads cloudflared (about 55 MB) from Cloudflare's own releases into
  `%LOCALAPPDATA%\Wheelman`.
- **The rules do not change.** A Marketplace reply goes only when a person presses Send, from
  this computer or a colleague's; everything else is still copy and paste.
- **Ten wrong passwords in a row** from one address lock the sign-in there for a quarter of an
  hour. Changing `TEAM_PASSWORD` signs everyone out at once.
- **Close the black window to stop sharing.** The address stops working at once.
- The phone add-on and the Gmail button talk to Wheelman on this computer only. They do not
  work from a colleague's browser.

## The page

### The new page

A new page is being built beside this one, at http://127.0.0.1:3210/new/. The old page has a
quiet link, **Try the new page**, next to the cog. For now the new page covers the Dashboard
texts: the list (Needs reply, Follow-ups and All), the open conversation, and the message box
with its fill-in blanks, **Instead**, the "Tell Wheelman what to say…" line, and **Copy**, with
**Put back in Needs reply**. Marketplace, Imports and Auction are tabs on the new page too, but
each shows a line and a link to that section on the old page. The old page stays at the normal
address until the switch-over, and nothing else about it has changed. The new page is built from
`prototype/`.

Beside the open conversation is the **deal panel** (a column on a wide screen, a drawer on a
medium one, a sheet from the bottom on a phone; it remembers whether you left it open). Its
**Car** tab shows the car the customer asked about: photos, auction photos, videos and documents,
each with **Copy link** and **Add to reply**, which puts the link into the message box where the
cursor is. Photos and videos open large in a viewer you can move through with the arrow keys.
A link that is for you only, such as a supplier's, can be opened but not copied or added to a
reply. Its **Customer** tab shows **How far they have got**: five steps from enquiry to sold,
with where the record says they are. It also shows the facts that **Shaped the reply, never
stated**, and **What Wheelman used** lists the model, the provider and what was read to write the
suggestion. A car found by search opens in the panel as **Another car**, with a button back to
the customer.

In the message box, the parts Wheelman's code builds are shown in the reply with a label and a
**Remove** button: **Price reply**, **Invitation to see the car**, **First-reply details**,
**Links you asked for**, **Sign-off** and **Auction offer**. A removed block can be brought back
with **Put back**, and what you typed beside a block is copied as shown. Under the reply, the
**trust line** says how many facts were checked. It is green only when nothing is wrong; if a
figure or link cannot be traced to our records, it says so in red and names how many facts are
not in your records. Once the text differs from what Wheelman wrote, whether you typed in it or
removed a block, it reads **Changed since it was checked.** Open it to see each fact and where it
came from: the stock record, our earlier messages, business facts, the website, what the
customer said, your instruction or your wording file.

After you ask Wheelman to rewrite with **Tell Wheelman what to say…**, it offers **Remember for**
that kind of reply. Choosing it keeps your instruction as a lesson for later texts or emails of
that kind, never for Marketplace chats, and **Undo** switches the lesson off again. If the same
instruction was already remembered for that kind of reply, it says **Already remembered** and
offers no Undo, so the lesson you had stays on. Remember is not offered on a follow-up or in the
Auction section, because those teach nothing. **Just this once** keeps nothing. **What Wheelman
used** now also lists the lessons it followed and the rules that applied. A list of all lessons
comes in a later update.

The **search box** in the top bar looks across customers, cars and the words in messages, in
every section. A Dashboard result opens on the new page. A Marketplace, Imports or Auction
result says **Opens on the old page** and goes there until those sections move over.

### The top bar

- **The sections** are tabs in the middle of the top bar: **Dashboard** (leads and text messages),
  **Marketplace** (Facebook Marketplace chats), **Auction** (auction orders) and **Import Query**
  (import emails). A section that is switched off has no tab. The number beside a tab counts
  conversations with new messages you have not looked at.
- **Find a car** finds any car in the stock list by its stock number or by words of its name
  ("1033", "hiace", "toyota noah"). Cars on offer come first, sold ones last. Pick one with the
  mouse or the arrow keys and Enter, and it opens in the panel on the right, with its photos,
  videos and documents, beside whatever conversation is open.
- **The status** says in a few words how Wheelman is doing: "Up to date", "Checking",
  "Dashboard not reached". Press it for the whole story: when the dashboard was last checked,
  the AI requests used today and the month's budget, the lead alerts, the phone add-on, which AI
  models write and in what order (with **Change**), what Wheelman reads of the team's replies and
  has learned, the last backup, and the team link when the page is shared.
- The cog chooses which AI writes. The round arrow checks for new messages now.

### The list on the left

Every row is one conversation, newest first.

- A **blue number** on a row is how many new messages that customer has sent since you last
  opened the conversation. Opening it clears the number.
- The numbers on **Waiting**, on the section tabs and in the browser tab count
  conversations with new messages you have not looked at. They clear the same way. A customer
  stays under Waiting until a reply is sent.
- **Blank to fill:** at the start of a row means the suggestion has a gap only you can fill.
- **Check the reply:** means a figure or link in the suggestion is not in our records.
- Three chips choose what is shown (Auction has its own three: To do, In progress, Finished):
  - **All**: every conversation, newest message first, whoever wrote it. A dismissed one stays,
    marked.
  - **Waiting**: customers who said something and have not been answered.
  - **Follow-ups** (Dashboard only): conversations we replied to last that are due a follow-up,
    the reason on the row (**Inspection passed**, **Quiet 3 days**). The number on the chip is
    how many are due; it is never counted as unread. See "Follow-ups" below.
  Texts from suppliers, couriers and marketers on the same phone are never listed.
- The search box finds a name, part of a phone number, or a word from a message.
- The list column shows a notice only for a problem that needs action now.

### The open conversation

- Customer messages are on the left in white. Ours are on the right in pale blue, with the
  name of whoever sent them.
- Small centred notes show dates, website events such as a booked inspection, and staff notes.
- The strip under the customer's name shows the car: its first photo, price, kilometres and
  availability, **Photos and videos** with how many there are, and **Open listing**.

### Follow-ups

Wheelman writes when the customer wrote last. A conversation where our message is the last one
used to get nothing more; now it is put in front of you again when there is a reason to write,
under **Follow-ups** in the Dashboard section, the reason on the row. Four reasons:

- **Inspection passed**: the customer booked an inspection or a test drive through the website
  and the booked time has gone by (three hours after it, by default). The follow-up asks how
  they found the car, written as if the visit happened and never whether they came, and offers
  the refundable holding deposit as the way to take the car off the market, once.
- **Quiet 3 days**: we replied and they have said nothing for 60 hours (by default). One nudge
  with one new thing, whichever they have not been offered yet: the export certificate and the
  auction sheet, the walkaround video, a similar car we have, or a time to come in with the
  booking link. A booking for a day still to come holds the nudge back.
- **Inspection tomorrow**: a visit booked through the website is tomorrow. At 4 pm the day
  before (by default) a reminder with the address is due, written by code from your wording, no
  AI. None when they booked today for today or after the reminder hour (your confirmation
  serves), when you have written to them since that hour, or when they said they cannot come. A
  text of theirs before the reminder hour does not close it (a question after that hour is
  answered as usual, and the reminder is dropped), and a reminder you copied never holds back the
  "how did it go" after the visit.
- **Car landed, Price dropped, Car sold**: news about the car they asked about, for the
  conversations of the last 30 days (`FOLLOW_UP_STOCK_DAYS`): it has arrived at the showroom and
  can be seen, its price has dropped by $100 or more (the old and the new price), or it has sold,
  with two cars like it from stock (never one another customer has a deposit on). The newest
  news only, and only while it still holds of the car (a sale undone or a price put back up is
  not news; a car lands once); it takes the place of a quiet nudge, and nobody we have already
  told, nor the buyer, gets it. A car held by another customer's deposit gets no landed or price
  news. After two texts of ours with nothing back, no news either. A change seen after the stock
  list was out of date for more than two days is not news.

A booking that has just arrived, for a visit still to come and with nobody's reply yet, is
answered first with **Booking confirmed** in Which message?, written by code too: the day and
time, and the address, or the call for an online inspection. A message marked `@fit: no` in the
wording file is written word for word; a Prompt or Rewrite on it still goes to the AI.

A follow-up is never raised for a buyer, after a no or an opt-out, for a conversation you
dismissed, for a message of ours older than 14 days, while a car has sold, or while another
follow-up for the same silence stands; once we have texted twice in a row with nothing back
(texts within fifteen minutes count as one), nothing more is raised. Rows appear when the
follow-up is due, inside working hours: anything that falls due outside 9 am to 6 pm Sydney is
due at the next 9 am. The first check after this upgrade does not fill the list with old
conversations, for the same 14-day reason.

Nothing is written ahead: the follow-up is written when you open the conversation from the
Follow-ups list, so no AI request is spent on one you never open. Each kind is a message of
yours in `voice/dashboard-messages.md` (**After the inspection**, **Follow-up: one new thing**
and **Inspection reminder**), offered to a follow-up only and marked **(due now)** in Which
message?, written with the conversation's facts and fitted to the customer by the AI with every
fact kept from it, as any message there is (the reminder is written by code, word for word); the
deposit line and the four new-thing wordings are the `@deposit_offer:` and `@new_...:` lines at
the top of that file. The AI is told it is a follow-up and held to it:
Carbarn named in the first sentence, never "just checking in" or "did you come", greeting and
sign-off always (even on a day we already wrote), about 50 words for a nudge. An answer that
breaks a rule is sent back once. Nothing is sent by Wheelman, and nothing written for a
follow-up is learned from.

In the message box the editor is headed **Follow-up: Inspection passed** (or the reason it has).
**Copy message** counts as done: the row leaves Follow-ups and the box offers **Put back in
Follow-ups**. **Dismiss this follow-up**, in the Customer panel, takes it out too, for when you
phoned them instead, with **Undo**; nothing is deleted. A customer who writes again closes the
follow-up by itself, and the conversation is back under Waiting as usual. The same conversation
opened from **All** says **A follow-up is due** with **Write the follow-up**, and writes nothing
until you press it. (The owner, 20 Oct 2026: "for this customer I want to follow up how his
inspection went … it would be wise not to ask that directly".)

| Setting in `.env` | What it does | Default |
|---|---|---|
| `FOLLOW_UPS` | Whether follow-ups are found at all; `0` switches the list off | `1` |
| `FOLLOW_UP_QUIET_HOURS` | Hours of silence after our reply before the quiet nudge is due | `60` |
| `FOLLOW_UP_AFTER_INSPECTION_HOURS` | Hours after the booked time before "how did it go" is due | `3` |
| `FOLLOW_UP_MAX_AGE_DAYS` | A message of ours older than this gets no follow-up | `14` |
| `FOLLOW_UP_REMINDER_HOUR` | The hour (Sydney) of the reminder the day before a booked visit | `16` |
| `FOLLOW_UP_STOCK_DAYS` | How far back a conversation is told news about its car, in days | `30` |

### The message box

The suggestion waits in the message box, marked **not sent**. The box is an editor.

- **Which message?**, in every section. Above the box is a list of your own messages for this
  kind of conversation, only the ones that fit it, the best fit first and marked
  **(best fit)**. A price question offers Price question; a trade-in offers Trade-in; a car that
  has sold offers Car sold: our other cars; someone far away who wants to see the car offers
  Online video inspection rather than Book an inspection. Pick one and it is written with this
  conversation's facts (the car, its price, its links, your price reply and invitation word for
  word), then fitted to the customer by the AI, which cannot change a fact: each one is hidden
  behind a marker and put back by code. The first choice, **A reply to what they wrote**, is
  Wheelman's own reply as before. Each message keeps its own suggestion, so switching back to one
  asks nothing. With a message picked, **Prompt** and **Rewrite** change that message the way you
  say (`also say we are open this Sunday`), its facts kept. A figure you type goes to the AI
  only as a marker too, and comes back exactly as you typed it (`offer $27,500`). The list
  follows the section a conversation is in: a text you moved to Import Query gets Import Query's
  messages. A customer who asked not to be contacted is offered none. **Could be better** writes
  Wheelman's own reply again, not the message picked. The messages are in `voice/dashboard-messages.md`,
  `voice/marketplace-messages.md` and `voice/importquery-messages.md`; Auction's are in
  `voice/auction-messages.md`. Each one says on its `@fits:` line when it is offered. Edit the
  wording, or add a message of your own: it takes effect on the next message. (The owner, 17 Oct
  2026: "I want that in every section ... the others should have their relevant dropdown options.
  I still should be able to prompt and the dropdown should be edited according to that.")
- **Prompt**, before a suggestion exists. When nothing has been written yet, the box shows two
  buttons: **Prompt** and **Write it now**. If you already know what the reply should say,
  press **Prompt**, type it in one line, for example `we have none of that model, we can source
  one if they tell us which`, and press Enter. Wheelman writes the reply from your words, in
  Carbarn's voice, in one request, instead of writing its own version first for you to redo.
  While the line is open the automatic suggestion for that conversation waits a minute and a
  half, so there is only ever the one request; close the line and it carries on as before.
  Your Prompt comes first, in every section: it decides what the reply says, how long it is, its
  tone, its layout and its greeting, over the section's own rules (Marketplace's length, the
  greeting once a day, the sales move, the examples). Only the facts still bind: every figure,
  link, date and promise comes from the records or from your Prompt, and nothing the records
  cannot back is claimed. With a Prompt your price reply and the inspection invitation are not
  added under the text (the AI gives the booking link itself if it invites them), unless the
  Prompt asks for the booking link; the first-reply block, the links the customer asked for, and
  the auction and import closing lines are still added. The same goes for **Rewrite**. (The
  owner's decision, 16 Oct 2026.)
  **Write it now** writes without a prompt. A try that failed is tried again with the prompt it
  had. The sentence above the buttons says when Wheelman will try again by itself if the free
  models are busy or used up. The three shimmering lines show whenever a suggestion is being
  written for the open conversation, whether you or Wheelman started it, and only one is ever
  written at a time for one message.
- **Change it.** Click in the text and type. What you type is saved a moment after you stop,
  so it is still there after a reload, a restart or a look at another conversation. The top
  right of the box says when it was saved.
- **Clear** empties the box so you can write your own reply. `Ctrl + Z` undoes it.
- **Bring back the suggestion** returns the box to what Wheelman wrote. It appears as soon as
  the text differs from the suggestion.
- **Copy reply** copies what is in the box. `Ctrl + Enter` also copies, and so does selecting
  the whole text and pressing `Ctrl + C`. When you had changed the text, Wheelman learns from
  the change. Copied unchanged, with no blank left, it counts as **Good reply** (see
  [How Wheelman learns](#how-wheelman-learns)).
- **Rewrite** takes an instruction, for example `offer $27,500` or `make it shorter`. It
  changes this reply only, and replaces what is in the box. A prompt you typed while a
  suggestion landed by itself is waiting here, ready to write again.
- **Good reply** approves the reply as it stands in the box: the suggestion as written, or
  with your changes. Wheelman keeps it as the model for similar messages. If you change the
  text afterwards, the model follows. Press the button again to take the approval back.
- **Could be better** is for coaching: say how this kind of message should be handled, for
  example `too long`, or `invite them to inspect before talking price`. Wheelman takes a
  lesson from what you wrote, shows you the lesson, writes this reply again, and keeps the
  lesson for similar messages. It keeps the lesson, not your words: your note is never sent
  to a customer.
  Neither button appears in the Marketplace section, because nothing there is learned from.

| What you see | Meaning | What to do |
|---|---|---|
| A part highlighted amber, such as `[PRICE?]` | A gap only you can fill | Click its name above the box, then type over it |
| A figure or link highlighted red | It is not in our records | Check it, correct it or remove it |
| A red note about a day, a time, a promise or a place | The reply says something nobody agreed to | Correct it, or use Rewrite |
| A blue note | The reply needs a person's decision | Read the note before sending |
| A blue tick | Figures and links match our records | Read it and send |
| "You have changed the text" | What you typed has not been checked | Check your own figures |
| "The suggestion is cleared" | The box is empty | Type your own reply, or bring the suggestion back. If no reply is needed at all, use Dismiss |
| "Not saved yet" in red at the top right of the box | Wheelman did not answer when the text was being saved | Keep the page open. It is tried again every few seconds |

| Gap | When |
|---|---|
| `[PRICE?]` | Any discount, best price or counter-offer |
| `[TRADE-IN VALUE?]` | The value of a customer's trade-in |
| `[DELIVERY COST?]` | A delivery price there is no record of |
| `[DATE?]` | An arrival or pickup date it cannot know |
| `[CHECK?]` | Extra work on the car, or a fact it was not given |

### The car and customer panel

On a wide window (1280 pixels and more) a panel sits to the right of the conversation, with two
tabs. It stays open or closed the way you left it; the button at the top right of the
conversation, or the cross in the panel, opens and closes it. On a narrower window it slides in
over the conversation when you ask for it.

- **Car**: the car the customer is asking about. Its main photo, its name, price, kilometres and
  where it is, a link to its page on the website, then its photos, auction photos, videos and
  documents, and what is included with it.
- **Customer** (**Order** for an auction order, **Enquiry** for an import email): the customer's
  details, the Marketplace, email or order details, the facts the suggestion relied on, and which
  of our records' notes on the customer shaped it (a finance decision, how they found us, how
  widely they are enquiring): those are never said to the customer. For an import or auction
  enquiry it shows what the customer asked us to find: the model, the years, the kilometre limit,
  the budget, and what we still do not know.

Pressing the customer's name opens the Customer tab; pressing the car's photo or **Photos and
videos** on the car strip opens the Car tab.

**Dismiss** is at the bottom of the Customer tab, away from Copy and Rewrite. It takes a
conversation out of Waiting, for example when you have already phoned the customer. Nothing is
deleted: press **Undo** in the message that appears, or open the conversation later under
**No reply needed** and press **Put back in Waiting**. It also comes back by itself if the
customer writes again.

### A car's photos, videos and documents

Read from the dashboard when the car is first opened, and kept for half an hour (**Read again**
at the foot of the Car tab asks again).

- **Photos**: the website's photos, in the order a buyer walks round the car (front, side, rear,
  seats, dashboard, odometer, boot). An older car without them shows its older photos.
- **Auction photos**: the photos from the auction in Japan.
- **Videos**: the walkaround, the inside front and rear, the engine bay and tyres, for cars that
  have been filmed at the yard. They play with the voice-over, as on the website, or without.
- **Documents**: the auction sheet, the export certificate, the import approval (VIA) and the
  Google Photos albums (Sydney photos, raw footage, compliance photos). Each opens in a new tab.

Pressing a photo or a video opens the viewer over the page: large, with the arrow keys or the
side buttons to move, a strip of the others underneath, and **Escape** to close.

Every photo, video and document has **Copy link** and **Add to reply**. Add to reply puts the
link, with what it is ("Walkaround 360 video: https://…"), on its own line in the suggestion:
where your cursor was, or else just before the sign-off or the standard block. It counts as a
change you made; `Ctrl + Z` takes it out.

The exception is anything kept at the Japanese supplier's own address, which is most auction
photos and many auction sheets. Those open for you only, marked "for you only", with no Copy link
or Add to reply, so the supplier's address never reaches a customer. (The owner's choice, 16 Oct
2026.) An auction sheet kept on Carbarn's own storage can be shared like any document.

Never shown: the inspection sheet (its address carries the supplier's key), the pro-forma
invoice (our purchase cost) and a customer's signed Form 5. Wheelman drops them, our costs, the
supplier and the buyer the moment the car's record is read.

### Narrow windows, light and dark

Below 1440 pixels Find a car waits behind the magnifying glass in the top bar, so the sections stay
in the middle. Below 1280 pixels the panel is a drawer over the conversation. Beside the dashboard
in a narrow window (860 pixels and less) the list and the conversation take turns, the arrow at the
top left goes back to the list, and the sections sit on a row of their own under the bar. The
status always says how Wheelman is doing in words. The page follows the computer's light or dark
setting; the photo viewer is dark in both.

## The Marketplace section

Wheelman reads the Facebook Marketplace chats from the content engine and suggests a reply for
every chat where the buyer wrote last. It works like the Dashboard section, with these
differences:

- **The shape the team sends.** Learned from the replies sent on Marketplace over 18 to 20 Oct
  2026: the content engine's own first reply to every buyer (written for it by an AI, with the
  buyer's name and the car's figures) and the replies a person typed, in the engine's inbox or
  from this page. The first reply to "is it available?" is the engine's three short paragraphs
  with this car's price, kilometres, grade and inclusions, and nothing else:

  ```
  Hi Priya, yes it's still available, $28,900 with only 52,400 km.

  It's a grade 4.5 Japanese import, km verified against the auction documents, and the price
  includes 6 months rego, a fresh roadworthy and a 5-year warranty.

  Keen to see it? Send me your number and I'll give you a call.
  ```

  Every later reply starts with the answer: no greeting line of its own, no sign-off, no opening
  thank-you ("Thank you, Priya." only when they gave us something). Usually 20 to 50 words in two
  to four short lines; up to about 90 when they asked several things. Hype, pressure, emoji and
  slang are still out. (The owner, 20 Oct 2026: "The reply structure for facebook marketplace
  has changed. Study the last two days replies and learn how replies were sent.")
- **The next step is their number.** When a buyer wants to see the car, or accepts our figure,
  the reply asks them to send their number and the day and time that suit them, and says we will
  get the inspection booked and confirm it by text; a person books it from the number. When they
  say they are coming, the location and hours go on two lines at the end. The booking link is not
  added under the lines on Marketplace any more, and is given only when the buyer asks for a link
  or a Prompt asks for it. The number is asked for once in a chat.
- **Never pushy.** An offer is thanked and left to a person, never called too low: a price
  question or an offer is answered in the team's shape, "The lowest we can do on the Noah is
  [PRICE?]." and then the number, with no price reply block under it (the dashboard keeps the
  block). A buyer leaving over the price gets a polite close, and the deposit comes up only once
  the price is agreed.
- **Links in the reply.** The finance form and the trade-in form are the ones on the car's own
  page (`…#finance`, `…#trade-in`), each on its own line under a short lead-in, with "let us
  know once it is done". The car's page goes in only when the buyer asks for details or photos.
- **Links say they came from Marketplace.** Every link to the Carbarn website in a Marketplace
  reply carries `utm_source=marketplace` (it was `facebook` until 20 Oct 2026), so the website,
  and the lead it records, shows where the visit came from. The tag goes before a booking link's
  `#inspection=…` part, so the booking form still opens. Links you type or paste into the box are
  tagged on **Send reply** too, and a link already tagged `facebook` is retagged. Links to other
  sites, and dashboard replies, are left as they are.
- **Send from here.** **Send reply** hands the text in the box to the content engine's own reply
  address, the one its inbox page uses. The engine sends it from that account's phone (since
  October 2026 through its companion app on the phone; its record of the message says
  `sent_via: companion`). The reply shows in the conversation marked "Sending" until the engine
  reports it sent, and the chat leaves **Waiting** at once. A blank such as `[PRICE?]` is never
  sent: fill it in first. If the phone is offline the reply is queued and goes when it is back;
  if the engine refuses, nothing changes and the reason is shown. **Copy reply** is still there
  for pasting it yourself. This is the only section that sends.
- **Auto-reply.** Messages the engine sent by itself are labelled **Auto-reply**. Messages a
  person sent are labelled **Typed by a person**.
- **Needs a person.** When the engine has handed a chat to a person, or one of its replies
  failed to send, the row says so and moves to the top.
- **Stuck auto-reply.** If the engine wrote an answer but has not sent it, a note in the chat
  says how long it has been waiting.
- **Prices.** A price that appears only in an auto-reply or in the engine's notes is not
  treated as ours. If the price on the Facebook listing differs from the dashboard price, the
  suggestion says so.
- **No learning.** The text copied from this section is not kept. What you type over a
  suggestion is saved so it is not lost, and is never learned from.
- **The small AI model.** Marketplace chats are written by `gemini-3.5-flash-lite` and the
  models after it in the list. The three better models are never asked, so their small daily
  allowance is kept for dashboard customers. When Marketplace's models are busy or used up,
  only Marketplace waits.

Dashboard customers are drafted first, and Marketplace has its own allowance so it cannot use
up the day's free AI requests.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `MARKETPLACE_URL` | Where the inbox is read from | Empty: the section stays off |
| `MARKETPLACE_ENABLED` | Set to `0` to switch the section off | `1` |
| `MARKETPLACE_DAILY_DRAFTS` | Most Marketplace suggestions in any 24 hours | `60` |
| `MARKETPLACE_MODEL` | Marketplace chats use this model and the ones after it in the list. Leave empty to let Marketplace use every model | `gemini-3.5-flash-lite` |

If the content engine cannot be reached, the Dashboard section keeps working and the
Marketplace section says so.

## The Auction section

Customers who ask us to buy a car for them at auction in Japan each have an order on the
dashboard, which moves through stages. Most of them are written to on WhatsApp, which Wheelman
cannot read. This section lists every order, says where it has got to, and has the next
message to that customer written and waiting.

It lists the auction customers who have no order yet too: every lead on the dashboard's
Imports list, and any conversation you moved here. Their rows say where the enquiry has got to
(Enquiry: asking for details · ready to search · car offered · compliance only), and they are
answered the import way: what they are looking for is asked first, then the Japan auctions are
searched and the best car is offered. They have the same **Which message?** list as an order,
with the messages that fit before there is one: Thanks, with estimate and deposit · Car found,
full or short · Cars coming up · Still searching · Deposit reminder. The one that suits where the
enquiry has got to is marked "due now"; the first choice is the reply to what they wrote. Each is
written from your wording with what the enquiry says (the car, years, kilometres, budget), the
deposit amount a blank since there is no order yet, and fitted to the customer as an order's is.
**One row per customer:** once a customer has an order
under way, the order stands for them and the conversation it reads (the one on the order's
number, else its lead's) is no longer a row of its own. A text or website enquiry from them
since the order opened (within the last week) puts the order in To do as a reply to what they
wrote, written for a text and pasted into the dashboard; our text back answers it, and Dismiss
sets aside everything that was waiting. Anything else from that customer, such as a new lead on
the same number, is a row of its own in Auction, never lost. The order's panel has **Their
texts**, with **Answer their texts in Dashboard** (and back) when you would rather answer that
conversation as an ordinary one.

### The three lists

| List | What is in it |
|---|---|
| **To do** | The customer wrote and has no reply yet, or a message is due for the order's stage |
| **In progress** | Orders that are under way with nothing due |
| **Finished** | Completed, cancelled and refunded orders. Ended orders are kept for 60 days |

The bottom of the list says how many orders and enquiries were read from the dashboard and how many are
on each list, so it can be checked against the dashboard's own page. **Search looks through
all three lists at once**: an order found on another list carries a small tag saying which.
An order with nothing due is under In progress, not To do.

Each row shows the customer, the car they want or the car secured, what is due, and the
stage in plain words: Looking for a car · Bid placed, result due · Car secured · Shipping and
compliance · On the way to Australia · Arrived, compliance under way · Completed.

### The message that is due

The message box holds the message for the order's stage, written from your own wording in
`voice/auction-messages.md` with the facts filled in. Figures and links come from the order,
the website's live auction and its cost calculator, and our stock list. What only a person
knows is a highlighted blank.

**Fitted to the customer.** One AI request then fits your wording to this customer and what
they last wrote, without touching a fact: before the AI sees the message, every fact, figure,
link, phone number and blank in it is replaced by a marker such as `{{K1}}`, and code puts each
one back exactly. If the AI loses, repeats or makes up a marker, or adds a figure of its own, it
is asked once more; then your wording is used word for word, and the page says so. With no AI
to ask, it is word for word too, and while you leave it unchanged it is fitted on a later check:
there is always a message. Nothing the AI is not shown in the first request (an amount, a name)
reaches it in a second one either. Each kind of message keeps its own
suggestion, so going back to one already written asks nothing. What you type into **Add what you
know** fills in the facts it names and goes to the AI as what to change, the way a Prompt does
elsewhere, its figures only as markers; written again with the same words and the same wording around them (Refresh
figures), the fitting is reused with no new request. `AUCTION_FIT=0` in the `.env` file writes every message word for word with no AI, and
`AUCTION_FIT_BACKGROUND=0` fits only the messages you pick or write on the page.

| Message | Due when | Blank for a person |
|---|---|---|
| Thanks, with estimate and deposit | A new order with no deposit | The deposit link |
| The car you wanted has closed | The auction for their car has passed, no deposit | The deposit link |
| Cars coming up, bid on the website | Several cars come up and nothing says which suits | |
| Car found, full or short | A matching car is in the coming auctions | The deposit link, while no deposit is paid |
| Still searching | A follow-up is due and nothing suitable has come up | |
| Deposit reminder | A follow-up is due and no deposit is paid | The deposit link |
| Deposit received | A deposit appears on the order | |
| Bid lost | The auction has been held | What the car sold for |
| Bid lost, with cars from our stock | The same, and that model is in our stock in Japan or on the way | What it sold for, the arrival date |
| A stock car priced | Picked by hand | Which car, purchase price, landed price |
| Car secured | The order moves to "car secured" | The winning price |
| Payment due | A payment is outstanding and a follow-up is due | |
| Shipping booked | The order moves to shipping and compliance | The ship, sailing and arrival dates |
| On the water | The stock record shows the car has left Japan | The arrival date |
| Arrived, compliance under way | The stock record shows it has arrived | The ready date |
| Ready to collect or deliver | Picked by hand | |
| Thank you | The order is completed | |
| Refund update | The order is refunded | The date |
| Progress update | A follow-up is due on the dashboard and nothing is owing | The next step |

- **A message is always written.** When Wheelman cannot look something up (no car of that
  model in the website's coming auctions, nothing in our stock, the auction not answering),
  the message is written anyway with blanks for you: `[WHICH AUCTION?]`, `[YEAR?]`, `[KM?]`,
  `[GRADE?]`, `[PHOTO LINK?]`, `[BID?]`, `[LANDED PRICE?]`. A note above it says why. This is
  also how to offer a car found outside the website's list: type
  `2021, 14,200 km, grade 4, tomorrow, bid 1.15m, landed 20400` and the link to its photos
  into **Add what you know** and the blanks are filled in one go.
- A message about a step is only suggested while the step is recent (7 days; 14 for a
  completed or refunded order), so nobody is congratulated three weeks late.
- **Which message?** lists every message for the order's stage. Pick another and it is
  written at once.
- **Add what you know** takes the place of Rewrite. Type `we bid 1.2m, sold for 1.31m`,
  `ETA 14 Nov, ship Hoegh Trader`, `stock T91, purchase 2.38m, landed 35900`, `bid 280000`
  or a live-auction link, and the blanks are filled in. Only what is plainly said is used.
  It also goes to the AI as what to change, so `say we will try again next week` works too.
- **Refresh figures** reads the live auction again for a message that quotes it.
- **Copy** counts as done: Wheelman cannot see WhatsApp, so the copied message is shown in
  the conversation and the order leaves To do. **Put back in To do** undoes that when it was
  not sent after all. Dismiss, in the details panel, is for when you told them another way.
- When an order has two messages due, the second comes up once the first is copied.
- A car that misses the variant, the kilometre limit, the years or the grade on the order is
  still offered, with a note above the message saying what it misses.
- With nothing to choose a car by (no years, budget, bid or variant on the order), Wheelman
  picks no car. It points the customer to the cars coming up instead.

The parts of `voice/auction-messages.md` marked FIRST DRAFT were written without a real
example. Correct them in the file; a change takes effect on the next message.

### When the customer writes back

Press **Paste their message**, paste what they wrote on WhatsApp (or type what they said on
the phone) and press **They wrote this**. It joins the conversation and a reply is suggested
that knows their order. This is the one place the section asks an AI, on the better models.

- WhatsApp's own "[time, date] Name:" in front of a copied message is taken off.
- The order's amounts never go to the AI. It is given markers such as `{{DUE}}` and what each
  means, and the figures are put into its reply afterwards. A marker it made up is caught.
- **We sent this** adds a message you sent by hand, so the conversation here stays true. No
  reply is written for it.
- **Remove**, beside a pasted message, takes out one pasted on the wrong order.

### What is read, kept and learned

- The orders come from the dashboard address already used for import enquiries, read as one
  list on every check. An order that leaves the dashboard leaves the section.
- An order that names no lead is matched to the customer's lead and text conversation by
  phone number. Their texts then show in the order's conversation too.
- Kept for each order: the order number and stage, the customer's name, phone and email, what
  they asked for, the auction car or the car secured, what has been charged and paid, how they
  prefer to be contacted, whether the dashboard marks a follow-up as due, and each staff note
  as it appears. The dashboard's "quiet" mark is ignored.
- Never kept: street address, licence, date of birth, the deposit link, the salesperson, who
  wrote a note, photos, how a payment was made, and every cost of ours on the car.
- The live auction is looked at for each order that is still searching, at most once an hour.
- Nothing is learned from this section. The wording is corrected in its file.

## The Import Query section

Customers also ask about importing by email to the business mailbox: whether a model can be
imported, what it would land for, how the process works. The mailbox holds much else besides, so
Wheelman does not read it. Instead you hand each import enquiry over yourself: open the email in
Gmail, press **Send to Wheelman**, and the whole thread appears in the Import Query section in
the usual conversation, the customer on the left and the team's replies on the right. Nothing in
Gmail changes.

- **One press per thread.** The button reads the subject and every message that is open on the
  page: who sent it, when, and its text, with the quoted history under a reply left out. A
  message Gmail has folded cannot be read: the row says **Folded in Gmail**, the thread shows
  where it sits, and pressing **Expand all** in Gmail and then the button again fills it in.
- **Send it again after you reply.** The same press after replying in Gmail adds the reply to
  the thread; nothing already there is added twice.
- **Our side** is any message from an address at `carbarn.com.au` (`MAIL_OUR_DOMAINS`). Everything
  else is the customer, named from the first such message.
- **Copy and paste.** A reply is copied from the message box and pasted into your reply in
  Gmail. Nothing is sent from here.
- **It learns from the past.** Send the old import threads from Gmail too, one press each. What
  the team wrote back in them becomes "how we answered similar import emails" in the request
  for a new one: the moves, what was included, the order, the length, with the other
  customer's name, address, figures and links taken out. Good reply, Could be better, and a
  reply you change before copying teach the same way, as email lessons that never reach a text
  message; and a reply you later send from Gmail and send to Wheelman again is compared with
  the suggestion like a dashboard reply is. The SMS example bank never sees an email.

### The exact answer, researched

An import email is answered from the website, not from memory. Before a reply is written,
Wheelman looks the question up:

- **The model.** Model codes in the email (GDH206, AGH30W, JF3) and make and model names
  ("Alphard Welcab", "N-Box") are matched against the website's list of import-eligible
  models, which Wheelman reads from carbarn.com.au once a day and keeps in
  `data\eligible-models.json`. For each model found: whether it can be imported and for which
  build years, the engines and odometer limits, the SEVS approval, the estimated landed and
  complied cost with its parts, the refundable auction deposit, and the model's page on the
  website. What the customer said (a year, a budget, kilometres) is set against those facts.
- **The process.** The deposit bands, the timeline, the payment stages, VIA approval,
  compliance and the warranty come from the saved guide pages (how importing works, how
  compliance works, the live auction) and from the business facts.
- **What is coming up.** The live auction is looked at for the model: how many are coming up,
  the cheapest estimated landed cost, and the next auction date.

All of it goes to the AI as the research for that email, every figure with the page it came
from, and the reply must carry the figures and the model's page link. Two rules are enforced
by the checks, not by hoping:

- **Never "we will check and get back to you".** A sentence that puts the answer off is
  refused and the reply is written again. The one exception is what the website itself
  promises about the process, such as inspecting before any bid.
- **Every model asked about is answered.** A model code the customer named must be answered:
  eligible or not, with its figure or its page link, or with a blank.

When the answer is not on the website, the reply gets a blank inside a full sentence, and the
details panel's **Research notes** say what was looked up, where, and what was not found:

| Blank | When |
|---|---|
| `[ELIGIBILITY?]` | A model, code or year the eligible-models list does not have |
| `[LANDED COST?]` | A model the website shows as price on request |
| `[DEPOSIT?]` | A deposit amount neither the model nor the deposit table gives |
| `[TIMELINE?]` | A timeframe that is not on our pages |

If the website cannot be read, the list already on this computer is used, then the saved
importing pages (with the day they were saved); the reply is still written, marked so you
open the page link before sending. Email replies are written by the better AI models, not
the small one Marketplace uses.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `MAIL_INTAKE` | Set to `0` to switch the section and the intake off | `1` |
| `MAIL_OUR_DOMAINS` | The domains whose senders are our side of a thread, comma-separated | `carbarn.com.au` |
| `MAIL_AUTO_DRAFT_MAX_AGE_DAYS` | An email older than this is listed but not written for unasked | `7` |
| `SITE_API_URL` | Where the eligible-models list is read from | The website |
| `IMPORT_RESEARCH_DAILY` | Most emails researched with live website requests in a day; beyond it the list on this computer is used | `60` |
| `IMPORT_AUCTION_SNAPSHOT` | Set to `0` to leave the live auction out of the research | `1` |

## The browser add-on

The dashboard gets its texts through a Pushbullet link to the business phone, and now and then
one does not arrive. The phone is also paired to Google Messages for web, which shows them all.
A small add-on for Chrome or Edge, in the `extension` folder, reads the list of conversations
in that tab and hands what it sees to Wheelman on this computer. Nothing else changes: Wheelman
still reads the dashboard as before, and the add-on fills the gaps.

What it does, and does not do:

- It reads the **latest message of each conversation** from the list, every 30 seconds while
  the browser is open. It never opens a conversation, never clicks, never types and never
  sends, so nothing is marked read on the phone. If a customer sends three texts within half
  a minute, only the last is caught; the dashboard usually has the rest.
- It talks to Wheelman only, at `127.0.0.1:3210`, and to nothing else. Wheelman takes its
  reports on one route, from a browser add-on only, with the add-on's own header, so no web
  page can post anything there. `PHONE_ADDON_ID` in `.env` can pin it to one add-on.
- The texts stay on this computer, in their own tables, apart from the dashboard's. A reply the
  team sent from the phone to a dashboard customer teaches what to say, like one sent from the
  dashboard, once the add-on has seen all of it; none of them is ever used for the example bank,
  which sets the voice and takes only replies whose author it knows. A text that gets a
  suggestion goes through the same removal of names and numbers as any other before an AI sees it.

What you see:

- A conversation the dashboard has, with a text it missed: the text appears in the thread
  labelled **Seen on the phone, not on the dashboard**, the conversation goes to Waiting, and
  a reply is suggested as usual. A text the dashboard also has is shown once, as the
  dashboard's copy.
- A number the dashboard has never seen: a row tagged **Phone only**, Waiting when the
  customer wrote last. Nothing is written for it unasked (there is no customer record), as
  for any unknown number; **Write it now** works. Once the dashboard has the number, the row
  moves under the dashboard's conversation with its suggestion and marks.
- Login codes, couriers and short codes land under **Not customers**, as now.
- A reply someone typed on the phone itself shows as ours, labelled **Sent from the phone,
  not on the dashboard**. After a quarter of an hour with no dashboard copy it counts as the
  reply and teaches like one sent from the dashboard, unless the Messages list cut it short
  (shown with "…"): half a reply is not what was said, so that one teaches nothing.
- A line at the foot of the list says when the add-on last reported and how many
  conversations are on the phone. If the browser or the tab is closed, a notice says the
  add-on has not reported since when, and Wheelman keeps working from the dashboard. When the
  browser is back, each conversation's latest text is caught up.
- A saved contact shows its name on the phone, not its number. Wheelman then matches the
  exact name on the dashboard; failing that, it is a Phone only row under that name. A
  contact saved on the business phone is as likely a supplier or a colleague as a customer,
  so nothing is written for it unasked either.
- Texts already on the list when the add-on is installed get a rough time ("Yesterday",
  "Mon"). Everything seen from then on is timed to the minute.

Installing it, once:

1. In Chrome, open `chrome://extensions` (in Edge, `edge://extensions`), switch on
   **Developer mode** at the top right, press **Load unpacked** and choose the `extension`
   folder inside the Wheelman folder.
2. Click the puzzle-piece icon in the toolbar and pin **Wheelman reader**.
3. Open https://messages.google.com/web in that browser and sign in if it asks. Leave the tab
   open: the add-on pins it, and opens it again at the next start.
4. In Chrome's settings, under Performance, add `messages.google.com` to **Always keep these
   sites active**, so the tab is not put to sleep.
5. Click the add-on's icon. It should say "Connected to Wheelman". **Read now** reads at once.

Chrome shows a "Disable developer mode extensions" bubble at each start; press **Cancel**. It
is the price of an add-on that is not in the store. The add-on's icon says in plain words when
something is wrong: the tab is not open, the browser put it to sleep, Wheelman is not running,
or Messages for web is signed out. Google changes its page now and then; if the list can no
longer be read, the icon says so, and **Copy page details** copies the shape of the page (its
element names, no words) to fix the reader with. The names it looks for are in one table at
the top of `extension/reader.js`.

### Send to Wheelman in Gmail

The same add-on puts a **Send to Wheelman** button at the bottom right of Gmail while an email
is open. Pressing it reads that conversation and hands it to Wheelman for the Import Query
section; see [The Import Query section](#the-import-query-section) for what happens then. It
reads only when pressed, and it never clicks, marks read, types or sends anything in Gmail.

After updating Wheelman, open `chrome://extensions`, press the add-on's reload arrow, and accept
the new permission for mail.google.com when Chrome asks. The button says in plain words what
happened: "Sent to Wheelman · 3 messages", "Wheelman is not running on this computer", or why
Wheelman refused the thread. If Gmail's page has changed and the email cannot be read, the
button offers **Copy page details** (the add-on's icon has the same under "Copy Gmail page
details"), which copies the shape of the page, element names only, to fix the table at the top
of `extension/mail.js` with.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `PHONE_ADDON` | Set to `0` to stop taking the phone reader's reports | `1` |
| `PHONE_ADDON_ID` | The add-on's id as `chrome://extensions` shows it, so no other add-on is listened to, on either of its routes | Empty: any add-on on this computer |
| `PHONE_STALE_MINUTES` | After this long without a report, the page says the add-on has gone quiet | `10` |
| `PHONE_WRITE_AT_ONCE` | A new text seen on the phone sets off a dashboard check and its suggestion at once, as a new lead does; `0` leaves it to the next few-minute check | `1` |
| `IGNORED_SENDERS` | Senders that are never customers and are never listed: a contact saved on the phone under a label, a finance company, a courier. Comma-separated; spaces and case are ignored | `Not customer, OTP, Delivery Service, Autotrader, CreditOne` |

## What Wheelman knows

Wheelman only states facts it has been given.

| Source | File or place | How it stays current |
|---|---|---|
| Stock: price, kilometres, availability, inclusions, the written-off, water-damage and major-repairs record, the listing description | The dashboard | Read every few minutes |
| What the dashboard knows about a customer: engagement score, a finance decision, how they found us, how many other cars they asked about on Carsales | The dashboard, with the lead | Read with the lead. Shapes the reply; never stated in it |
| Business facts: deposit, warranty, delivery, payment | `knowledge/business-facts.md` (private; `business-facts.example.md` is what is published) | You edit it |
| How Carbarn works: the steps of a sale, common questions | `knowledge/how-carbarn-works.md` (private; an example file is published) | You edit it |
| The website: policy pages, guides, blog, import pages | `knowledge/website/` | `npm run fetch-website -- --all` |
| Cars in the coming Japan auctions, what similar cars sold for, and what one would cost landed | The website's live auction | Read at the moment an offer is written, and hourly for orders still searching |
| Auction orders: the stage, what was asked for, the car, what is charged and paid | The dashboard | Read every few minutes |
| The wording of messages to auction customers | `voice/auction-messages.md`, `voice/auction-offer.md` | You edit them |
| The messages under **Which message?** in the other sections, and when each fits | `voice/dashboard-messages.md`, `voice/marketplace-messages.md`, `voice/importquery-messages.md` | You edit them |
| Texts that reached the business phone but not the dashboard | The phone add-on, reading Google Messages for web in your browser | Every 30 seconds while the browser is open |
| Import enquiries that came by email | The Send to Wheelman button in Gmail, pressed by you on an open email | When you press it |
| Which models can be imported, and what they land for | The website's own list of import-eligible models, kept in `data\eligible-models.json` | Once a day, and when an email is researched |

In `knowledge/business-facts.md` each topic is marked `CONFIRMED` (stated freely), `WORKING`
(in use, please check) or `NEEDS ANSWER` (Wheelman says nothing and leaves a blank). Write the
answer after `Answer:`, set the status and save. The next suggestion uses it; no restart
needed. The evidence behind each answer is kept in `knowledge/business-facts-evidence.md`, a
local file Wheelman never reads. Topics still without an answer are listed in the black window
at start-up.

The facts were researched on 1 October 2026 from the dashboard's customer messages, sales
records, delivery zones and stock, and from the website. `how-carbarn-works.md` was written
from a study of the same conversations. Both files hold the dealer's own fees, terms and
partners, so they stay on this computer: the repository carries an example of each, with
invented figures, which Wheelman reads whenever the real file is missing (a fresh clone, the
automated checks).

## How Wheelman learns

From dashboard leads and conversations, the website and the dashboard's records, and from the
import email threads sent from Gmail, each kind kept to itself (see the Import Query section).
Never from Marketplace, never from the phone, and not from the Auction section: its messages
come from a wording file, and what a customer wrote on WhatsApp is pasted in, not read from
the dashboard. Never from a follow-up either: its wording is yours in
`voice/dashboard-messages.md`, and copying one teaches nothing.

Wheelman learns two different things from two different places. **What to say** comes from
what the team really sends. **How to say it** comes from the two voices.

- **What the team sends.** For each waiting message, Wheelman looks up the replies the team
  sent in the last year to customers who wrote something similar, whoever sent them and from
  wherever (the dashboard, the phone relayed to the dashboard, or the phone alone once the
  add-on has seen all of a text), and shows itself the closest three, the most recent weeks
  counting for more. Nothing has to go through Wheelman for this: a reply one of the
  salespeople sends from their own phone teaches the same way. From those it takes what to include and leave out (the
  car's link, a booking link, the address, a question back), the order and the length, then
  writes the reply in the house voice. Before they are used, the customer's details and the
  sender's name are removed, and every link and dollar amount is replaced by a label such as
  `[inspection booking link]`, so nothing from another customer's deal can be carried over.
  A label that turns up in a suggestion is rejected. Complaints, automatic texts, texts with
  bank details and texts sent exactly as Wheelman suggested are left out. From an auction
  offer the team sent, only the opening lines are kept: the car, its link, the bid and the
  costs belong to that customer and are cut off.
- **Your edits.** The message box is an editor, and what you type in it is saved as you type.
  When you copy a reply you changed, Wheelman keeps both versions, with the customer's
  details removed, and shows itself the difference next time. A reply you cleared and wrote
  yourself counts the same way. When the reply later appears in the dashboard conversation,
  what was really sent replaces what was copied. Typing alone teaches nothing: a half-written
  change that was never copied, approved or sent is not learned from.
- **Copying as written.** Copying a reply with no blank left and no change counts as approval,
  the same as **Good reply**, on either page. Spacing, the sign-off and our address block at the
  end are not counted as changes, so removing the **Sign-off** block still counts as no change,
  and so does removing the **First-reply details** when no other block sits above them. Removing
  any other block, such as the **Price reply**, is a change, and Wheelman learns from it as from
  an edit. A copy is not approval when a check failed (**Copy anyway**), when the reply is your
  template or standard wording used word for word, when it is one of the standard replies the
  team sends to everyone, or once you marked it **Could be better**. **Could be better**, or
  taking the rating away, takes a copy's approval back as it does a **Good reply**.
- **Remember.** On the new page, a rewrite you ask for with **Tell Wheelman what to say…** can be
  remembered for that kind of reply in that channel. The lesson is put into every later request
  of that kind, the same conversation included. Remember lessons apply to texts and emails, never
  to Marketplace chats. Each time a lesson is used it is counted, and it can be switched off,
  after which it is never used. Remembering the same instruction again keeps the one lesson.
  **Just this once** stores nothing. Marketplace, the phone-only list, auction orders, follow-ups
  and the Auction section teach nothing, so Remember is not offered there.
- **Only what you changed.** A suggestion used word for word is Wheelman's own text, so it
  is not kept as an example of how the team writes. Copying it unchanged counts as approval
  instead (see **Copying as written** above).
- **Only the reply to that message.** A sent reply counts for a suggestion only if it directly
  follows the message the suggestion answered. If the customer wrote again first, the
  suggestion is marked as overtaken and nothing is learned. One lesson per customer message.
- **Our salespeople's own replies.** Once a day it rereads the dashboard conversations and
  refreshes its bank of the two voices' genuine replies. Texts that Wheelman itself wrote are
  skipped.
- **What you say about a suggestion.** A suggestion you mark **Good reply** is shown to the
  AI for similar messages as "approved as written: handle this one the same way". If you had
  changed the text first, it is shown as "corrected by the owner and approved", with what
  Wheelman wrote and what you made of it side by side. What you
  type under **Could be better** is coaching, written to Wheelman and never to a customer.
  One extra AI request turns the note into one to three general lessons: when the lesson
  applies, what to do or avoid, and whether it is internal (to act on, but not to tell the
  customer). Lessons for the kind of message that is waiting, and lessons that apply to
  every reply, go last in the request, where they override the examples and the general
  selling advice. A rewrite that repeats seven of your words in a row is sent back. If no
  AI model is free, the note is kept and its lesson is worked out later.

A reply is not learned from if it still contains a blank, contains bank details, or is
standard wording the team sends to everyone. The standard address block and the sign-off are
never part of a lesson. To change the tone directly, edit `voice/house-voice.md`; to change
how it sells and what it hands to a person, edit `voice/sales-playbook.md`.

`npm run replay` takes real customer messages that one of the two answered, hides their
answer, lets Wheelman write its own, and puts the two side by side in `eval/out/replay.html`.
Add `-- --buyers` for messages from people who had already bought, or `-- --first` for first
replies to new enquiries.

`npm run report` prints how the suggestions are doing: how many were sent as written, edited
or rewritten, split into buyers, new enquiries and the rest, which checks fire most, and how
often you asked for a rewrite. Counts only; no customer text.

## Rules as Carbarn confirmed them

| Topic | Rule |
|---|---|
| Voice | One voice, Carbarn's: formal and corporate, courteous, exact. The team's replies teach content, not tone (12 Oct 2026). See [The voice](#the-voice) |
| Sign-off | "Regards, Team Carbarn" |
| Greeting and sign-off | "Good morning / afternoon / evening" by Sydney time, else "Hello"; never "Hi". Once a day per customer: later replies that day start with the answer |
| Questions | Only when the answer is needed to proceed: which car, a postcode for a delivery quote, trade-in details. No canned question (12 Oct 2026) |
| First reply to a new enquiry | One or two lines that answer the question, then the standard block: the car's page, the booking link if they asked to see it, address, hours, phone |
| Address | 136 Frances Street, Lidcombe NSW 2141, in every message. No map link (12 Oct 2026) |
| Buyers | Answered about their own car. No "which car?", no booking link, no other cars, no amounts |
| What our records say about a customer | Shapes the reply and is never stated: no score, status, source, other dealers or finance decision. "Not recorded as written off" is the register's answer, never "accident-free" (12 Oct 2026) |
| Promises and times | Only what our staff said. Otherwise "We will check and come back to you shortly", or a blank |
| Price | Any discount, best price or offer is decided by a person: `[PRICE?]` |
| Holding deposit | $1,000, refundable while inspecting or arranging finance |
| Inspections | Whenever the customer asks to see or drive a car ("can I inspect tomorrow?", "is it available to see this Saturday?"), the reply carries that car's booking link, or it is sent back. A car at the yard: the in-person link. A customer who says they are far away or cannot come: the online video inspection link. The link also follows a customer who asked earlier and has not been given it, it is offered when a customer asks where we are or when we are open, and it is supplied when a Rewrite instruction asks for it |
| A car not at the yard yet | A car still in Japan or in transit gets no booking link; we let the customer know when it can be inspected. A car that has arrived and is listed on the website is ready to inspect |
| Price | A customer who asks for a discount is not given the price again. They are invited to inspect first; price is talked about once they have seen the car |
| A car that is sold or reserved | The closest available car, and the page listing our other cars of that model when there are any. Not the full stock list |
| Importing a model to order | The reply gives that model's importing page from the website, when there is one |
| Import or auction enquiry, nothing known yet | The asking reply: year range, maximum odometer, grade, landed budget, colour or features; then address, phone, hours |
| Import or auction enquiry, once they say what they want | One car from the live auction: its details and link, a bid rounded up from Carbarn's suggested bid, the landed cost from the website's calculator part by part, and a blank for the deposit link |
| Suggested auction bid | The average of the three closest sold cars on the website's "Japan auction sold prices" list, rounded up to the next ¥50,000. Never below the website's own suggested bid |
| Auction orders | Their own section. The next message for each stage is written from the team's wording, fitted to the customer by the AI with every figure kept as code put it in, signed Team Carbarn. Copy and paste into WhatsApp |
| The deposit link | Always left as a blank and pasted in by hand. It is never stored |
| Amounts on an auction order | What the customer was charged and paid may be kept and stated. Never our costs, and never to the AI |
| Finance and complaints | Answered the way the team answered similar ones. Never a rate, a repayment or a promise of approval; a complaint is always marked for a person |
| "Below" | A reply never points at the address block. It answers in the sentence itself |
| The message box | An editor: change the text or clear it, and it is saved as you type. A changed reply teaches Wheelman when it is copied or approved |
| AI models | The better models are kept for dashboard customers. Marketplace chats use the small one |
| Marketplace | A suggestion for every chat where the buyer wrote last; warm and selling (up to about 90 words, opening with a thank-you, the car's strongest points and what is included, an easy next step), with the car's page link and the booking link when asked, and the invitation once in a chat |
| Your Prompt | Comes first in every section: it decides the length, tone, layout and greeting; only the facts still bind. No price reply or invitation is added under a prompted reply unless the Prompt asks for the booking link |
| The deposit | Proposed only once the price is agreed: booked or seen, asked to hold it, or accepted our figure. Never while the customer is making an offer, says it is too dear, or is leaving |
| Offers | Thanked and left to a person (`[PRICE?]`), never turned down or called too low; the price reply goes once |
| Sending | Marketplace only, by the **Send reply** button. Dashboard and auction replies are copied and pasted |
| Learning | Dashboard only |

The business facts themselves are in `knowledge/business-facts.md`.

## AI models and budget

Three providers can write: Gemini (Google), ChatGPT (OpenAI, paid by the request) and OpenRouter
(free models). Which model does which job is chosen on the page, and the month's spend is
estimated against a budget.

### One model per job

Wheelman gives the AI four jobs, and each has its own model:

| Job | What it is | Where its list starts |
|---|---|---|
| Dashboard, import and auction replies | The suggestions that matter most | The model chosen for it, then the whole list, best first |
| The customer read | How each customer is read before a reply is written (from pull request 7 of the sales programme) | The small model and the free ones after it |
| Marketplace chats | Many, short | The small model and the free ones after it |
| Lessons from your notes | A few a day, from **Could be better** | The small model and the free ones after it |

The small model is `SMALL_MODEL` in `.env` (`gemini-3.5-flash-lite` unless set; `MARKETPLACE_MODEL`,
the old name of the setting, is still read). A small job uses the dashboard's model only when the
page chose it for that job, or when the dashboard's model is one of the small ones already. Nothing
paid is spent on a small job unasked.

### Choosing on the page

The cog at the top right opens **Which AI writes**. The top of the panel lists what writes for
each job right now. Pick the job, then the provider, then the model from the list the provider
itself offers (read with your key and kept for an hour; **Read it again** refreshes it), or type a
model's name under **Another model…**. **Use this model for …** keeps the choice in the database,
so it survives a restart, and that job's next request comes from it. The welcome panel says which
model writes the suggestions, with a **Change** link, and the tooltip on the status line shows the
whole order.

A provider without a key is listed as "no key yet". Choosing it shows where to create a key and a
box to paste it into. The key is tried on the provider first; one the provider rejects is not kept.
An accepted key is written into the `.env` file on this computer and used at once, with no restart.
A key can be pasted only on the computer Wheelman runs on, not through the team link; a model can
be chosen from anywhere the page is open.

ChatGPT is asked in its own request shape: a reasoning model keeps its own temperature and is given
room to think before it answers, and a field a model refuses is dropped and the request sent again.

### The monthly budget

Wheelman counts every request and its tokens by model. What a token costs is the provider's to
say, so the prices are yours to fill in: on first start Wheelman writes `data\ai-prices.json` with
every model it knows and no price, and a note on where each provider publishes its prices (US
dollars per million tokens, in and out). A model that is asked but has no row is added to the file
with blanks, so you can see what to fill in. `audPerUsd` in the same file is the exchange rate used
for the estimate.

From the counts and the prices, **Used so far** in the panel shows each model's requests, tokens
and estimated cost this month, and the month's total against the budget (`AI_MONTHLY_BUDGET_AUD`
in `.env`, A$50 unless set). The status line at the top of the list carries the same figure once
any model has a price. At 80% the panel and the status line warn. At 100% the three small jobs keep
to models known to be free (a 0/0 row in the file, or an OpenRouter model named `:free`) until the
first of the next month, a notice in the list column says so, and the dashboard suggestions
continue on the chosen model. A model with no price counts as paid for that stop, so a missing
price can only make Wheelman more careful. The customer read is counted by model but not against
the daily cap of suggestions (`DAILY_DRAFT_LIMIT`).

The estimate is an upper bound: cached-input discounts are not modelled, and a model's thinking is
counted as tokens out, which is how the paid providers charge it. The provider's own usage page,
linked from the panel, has the bill.

`npm run check-model` prints which model each job asks first and the month's estimate.

### The order models are tried in

For the dashboard job the chosen model goes first. With nothing chosen, and after the chosen model
when it does not answer, the rest follow in this order:

1. `gpt-5.6` (ChatGPT, when it has a key)
2. `gemini-3.8-flash`
3. `gemini-3.7-flash`
4. `gemini-3.5-flash`
5. `gemini-3.5-flash-lite`
6. `google/gemma-4-31b-it:free` (OpenRouter)
7. `google/gemma-4-26b-a4b-it:free` (OpenRouter)

`GEMINI_MODEL`, `OPENAI_MODEL` and `OPENROUTER_MODEL` in `.env` set each provider's first model,
and `GEMINI_FALLBACK_MODELS`, `OPENAI_FALLBACK_MODELS` and `OPENROUTER_FALLBACK_MODELS` the ones
after it. Free models are often busy. A busy model is rested for five minutes and the next one is
tried. Models lower in the list write less polished replies. Hovering over the status line shows
which models are for dashboard customers only.

Each free model also has its own daily allowance. A model that says its day is used up is left
alone until the time it gives, and the next model carries on. A ChatGPT account with no credit
left is set aside for an hour in the same way. Hover over the status line at the top of the list
to see which models are used up. When no model can answer, the suggestion is tried again by itself
a few minutes later, up to three times an hour; nothing red is shown for that. When every model is
used up for the day, the page says suggestions are paused and when they resume.

Wheelman's own cap is 200 AI requests a day. OpenRouter allows 50 free requests a day; a one-off
US$10 credit purchase raises that to 1,000.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `SMALL_MODEL` | Where the list starts for the small jobs; the free models after it follow | `gemini-3.5-flash-lite` |
| `AI_MONTHLY_BUDGET_AUD` | The month's budget for the paid models, in Australian dollars; a warning at 80%, free models for the small jobs at 100% | `50` |
| `AI_PRICES_PATH` | Where the price file is | `data\ai-prices.json` |
| `DAILY_DRAFT_LIMIT` | Wheelman's own cap on requests a day | `200` |

## Reviewing changes side by side

Before a change to the voice, the playbook or the model is merged, it is judged on real
conversations, blind. In a terminal:

```bat
npm.cmd run review -- --b-voice voice-next --n 30 --confirm
npm.cmd run review -- --a-model openai/gpt-5.6 --b-model gemini/gemini-3.8-flash --n 40 --confirm
npm.cmd run review -- --a-voice voice\previous --b-voice voice --n 40 --confirm
```

Side A is the current voice on the dashboard's model unless `--a-voice` or `--a-model` says
otherwise; side B must differ in its voice files (a folder holding `house-voice.md` and
`sales-playbook.md`), its model (`provider/model`, as the cog panel lists them), or both. The
script takes the last past exchanges that one of our people answered (`--n`, 20 unless set;
`--first`, `--buyers`, `--since 60` and `--situation price_negotiation` narrow them), writes each
one both ways as if the real answer had not been sent, and saves the run under `data\review\`.
When a paid model is in the run it prints the requests it will make and the estimated cost from
`data\ai-prices.json`, caps the run at 40 cases, refuses a run that would pass the month's budget,
and needs `--confirm`. The third command compares the voice before 12 October 2026, kept in
`voice\previous`, with the current one.

Then open http://localhost:3210/review. Each case shows what the customer wrote, the team's real
reply folded away, and the two suggestions as Left and Right, shuffled on every case so the rating
is blind, with their checks and their sales score. **Left is better**, **Right is better** or
**Both poor** (keys 1, 2 and 3 for the next unrated case) saves the vote to the run file at once
and then says which side was A. The top of the page keeps the tally: wins per side, both poor, the
sales score out of 6, hard-check failures, median words and the estimated cost, and the wins by
kind of message. The runs hold real customer text, so they live under `data\` and the page is
refused through the team link.

The sales score, out of six, is what the review, `npm run replay` and `npm run report` judge a
reply by: a next step; a question only when one was needed; the right length for the channel; the
brand register (no slang, no apologising, no emoji, at most one exclamation mark); no urgency or
claim outside what the records allow; and the block or the proof that was due.

## Privacy

- Customer details are removed before any text goes to an AI service (RULE-2). Free AI
  services may use what they receive to improve their products, which is why.
- What the dashboard knows about a customer beyond what they wrote (their engagement score, a
  finance decision, how they found us, how many other cars they asked about on Carsales) is kept
  by shape only: the data other dealers hold about them is dropped at intake and never stored,
  and the AI is told the shape ("their engagement is high"), never a number, a name or a
  postcode. None of it is ever said to the customer: a suggestion that mentions it is sent back.
- From Marketplace, Wheelman stores the buyer's name, the messages and the listing. It does
  not store Facebook thread or participant identifiers, photo addresses, or any phone number
  or email the engine captured.
- For an auction order Wheelman keeps the customer's name, phone and email and what they were
  charged and paid, so the order can be shown and its messages written. It does not keep
  their address, licence, date of birth or deposit link. None of it goes to an AI.
- A customer's own payment link that appears in a text is removed before the text goes to an
  AI, like a phone number.
- For a car's photos, videos and documents, the car's full dashboard record is read, and
  reduced at once to its photo addresses and the allowed documents (auction sheet, export
  certificate, import approval, photo albums). Our costs, the supplier, the VIN, the buyer's
  details, the inspection sheet (its address carries the supplier's key), the pro-forma invoice
  and any signed Form 5 are dropped there and then: never kept, logged, shown or sent to an AI.
  The answer is kept in memory for half an hour; the photos are kept as files beside the
  database, like the photos in texts. The chassis number is kept with each car and is never
  sent to an AI or to the page.
- From the phone, Wheelman stores the name or number as the Messages list shows it, the
  latest text of each conversation and its time. Nothing more: no photos, no other contact
  details. The texts are never learned from, and go through the same removal of details as
  any other before an AI sees one.
- From an email thread you send from Gmail, Wheelman stores the subject, and for each message
  the sender's name and address, the time, the text with the quoted history removed, and how
  many attachments it had. Never the HTML, the attachments, the recipients or anything about
  the Gmail account. The customer's address is kept readable, as it is for an auction order,
  so the page can show and copy it; it is removed like any other before an AI sees the text.
- `.env` holds the dashboard password and the AI keys. Git never sees it.
- When the page is shared with the team, what colleagues see and type travels through
  Cloudflare's tunnel, encrypted between their browser and Cloudflare and between Cloudflare
  and this computer. Cloudflare carries it; nothing is stored there. The sign-in cookie holds no
  password, only a signed date.
- The folders that hold real customer details are listed under
  [Where your files live](#where-your-files-live). Git never sees those either.

## Commands

| Command | What it does |
|---|---|
| Double-click `Start Wheelman.cmd` | Runs Wheelman and opens the page |
| Double-click `Share Wheelman.cmd` | The same, and shares the page with the team behind the team password. See [Sharing with the team](#sharing-with-the-team) |
| `npm start` | The same, from a terminal |
| Double-click `Back up Wheelman.cmd` | Writes a backup now, into the backup folder. Works while Wheelman is open |
| Drop a backup onto `Restore Wheelman.cmd` | Puts that backup back; with nothing dropped on it, the newest one. Wheelman must be closed |
| `npm run backup` | The same backup, from a terminal |
| `npm run restore` | The same restore. `-- "C:\path\Wheelman backup ....zip"` names the file |
| `npm run check-login` | Tests the dashboard login |
| `npm run check-model` | Tests the AI keys and shows which models answer |
| `npm run replay` | Compares suggestions with real past replies. `-- 60` for 60 cases, `-- --buyers` or `-- --first` for one kind |
| `npm run review` | Writes the same real conversations two ways for the Review page. `-- --b-voice <folder>` or `-- --b-model provider/model`; `-- --n 40`; `-- --confirm` when a paid model is in the run |
| `npm run report` | Counts how suggestions were used and which checks fired. `-- 30` for 30 days |
| `npm run measure` | Counts what each stage of the redesign is judged on: drafts never used and why, sent as written, open to Copy, first answers, tokens. Reads a copy of the database it makes and deletes; saves the counts in `eval\redesign\` |
| `npm run check-private` | Before a commit: makes sure no setting from `.env`, staff name or key is in a file git would publish |
| `npm run build-voice` | Rebuilds the example bank from stored conversations |
| `npm run fetch-website` | Saves the website's policy pages. `-- --all` for every guide, blog post and import page |
| `npm run import-history` | Loads the saved history in `data/raw` into the database |
| `npm test` | Runs the automated checks |
| `node test/support/preview.js` | Runs Wheelman on invented data at http://127.0.0.1:3211/new/ to look at the new page. Nothing real is read or sent |

## Where your files live

Everything Wheelman reads from the dashboard, the content engine and the phone stays on this
computer. Git never sees any of it.

| Folder | Content |
|---|---|
| `.env` | Dashboard addresses and login, the Marketplace inbox address, our other phone numbers, and the AI keys |
| `voice\people.json` | The real names and logins of the two voices, and other staff names |
| `PLAN.md`, `knowledge\business-facts-evidence.md` | Internal planning notes, and the evidence behind each business fact |
| `data\app.db` | Leads, conversations, messages, stock, the stage of each sale, the auction orders and what you pasted into them, Marketplace chats, the texts the phone add-on saw, every suggestion with its checks and what you typed over it, what was learned, what was dismissed and read |
| `Auction.txt` | Real messages the team sent to auction customers, kept as the source for the wording |
| `knowledge\business-facts.md`, `knowledge\how-carbarn-works.md` | The real business facts and operations guide: fees, terms, partners, practice. Example files with invented figures are published in their place |
| `data\wheelman.log` | What went wrong and when: technical messages only, no customer details |
| `data\raw\` | The history first copied from the dashboard |
| `data\analysis\` | The cleaned samples behind the voice and the business facts |
| `voice\examples.json` | The bank of genuine replies, rebuilt daily |
| `eval\out\` | Replay comparisons against real past replies |
| `eval\redesign\` | The redesign's measurements, replay report and build notes: the business's own counts |
| `knowledge\website\` | Downloaded website pages. Rebuilt with `fetch-website -- --all` |
| `.playwright-mcp\`, `.impeccable\review\` | Captures and screenshots from building the page |
| `data\share-url.txt` | The address the page is shared at, while Wheelman runs shared |
| `%LOCALAPPDATA%\Wheelman\cloudflared.exe` (outside this folder) | Cloudflare's tunnel program, downloaded the first time the page is shared |
| `Documents\Wheelman backups` (outside this folder) | The backups: one dated zip file each, holding the database, `.env`, the staff names, the voice files and the private notes. See [Backups and another computer](#backups-and-another-computer) |

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| "Setup is not finished" | A setting in `.env` is empty | Fill it in, then restart |
| "The dashboard could not be reached" | Wrong username or password, or no internet | `npm run check-login` |
| "The Marketplace inbox could not be reached" | The content engine is down, or no internet | Nothing to do. Dashboard keeps working; Marketplace is tried again every few minutes |
| "A suggestion could not be written" in red at the top of the list | An AI key was rejected, or something in Wheelman failed | `npm run check-model`, and look at `data\wheelman.log` |
| "A suggestion could not be written. No AI model could answer just now" in one conversation | Every free model was busy or used up at that moment | Nothing. It is tried again in a few minutes, or press **Try again** |
| "Suggestions are paused" | Every free model has used up its allowance for the day | It resumes by itself at the time shown |
| "The AI models used for Marketplace have used up their allowance for today" in a chat | The small model's day is used up | Nothing. Dashboard suggestions carry on, and Marketplace resumes at the time shown. Press **Try again** later, or set `MARKETPLACE_MODEL=` (empty) to let Marketplace use every model |
| Something went wrong and the black window has scrolled past it | | Open `data\wheelman.log`: each problem is noted there with its time |
| "The live auction could not be read, so no car was looked for" | The website's auction feed did not answer | Press **Rewrite** to try again. The reply names no car in the meantime |
| An import customer gets the asking reply although they told us what they want | What they want was said on the phone, not in writing | Press **Rewrite** and type it, for example "2015 or newer, under 100,000 km, budget 12k", or paste a live-auction link |
| An auction message says "The wording for ... is missing" | A part was deleted or renamed in `voice/auction-messages.md` | Put the line `===== name =====` back as it was |
| A word in curly brackets, such as `{due}`, is marked red in an auction message | A slip in the wording file: Wheelman does not know that word | Check the spelling against the list at the top of the file |
| **Which message?** does not offer a message you expected | Its `@fits:` line does not name what this conversation shows, or its `@not:` line rules it out | Edit those lines in the section's `voice/*-messages.md` file; the list at the top of the file says what each word means |
| An order shows no message although one should be due | The step happened more than a week ago, or the message was copied or dismissed | Pick it under **Which message?**, or press **Put back in To do** |
| A note says "No ... is in the website's coming auctions right now" and the car is blanks | The website lists none of that model in the next few auction days | Fill the blanks in, or type the car into **Add what you know**. The auction is looked at again within the hour |
| An order cannot be found in the Auction section | It is on another list: one with nothing due is under **In progress** | Type the name, car or order number into the search box. It looks through all three lists |
| "The phone add-on has not reported since …" | Chrome is closed, the Messages tab is closed, or the browser put it to sleep | Open Chrome with the Messages tab in it. The add-on's icon gives the reason |
| "Messages for web is signed out" | Google signs a computer out after weeks without use | Open the Messages tab and sign in again (whoever has the phone taps the matching emoji) |
| "The phone add-on could not read the Messages list" | Google changed its page | Click the add-on's icon, press **Copy page details**, and keep what it copied for fixing the table at the top of `extension/reader.js` |
| The Gmail button says "Could not read this email" | Google changed its page, or nothing is open | Open the email, then press the button again. If it still fails, press **Copy page details** under the button and keep what it copied for fixing the table at the top of `extension/mail.js` |
| The Gmail button says "Wheelman refused it" | The thread could not be checked (nothing readable in it, or the intake is off) | The reason follows the words. A thread with every message folded: press **Expand all** in Gmail first |
| A thread's row says "Folded in Gmail" | Gmail had one or more messages folded when the button was pressed | In Gmail, press **Expand all**, then **Send to Wheelman** again |
| The add-on's icon says "Wheelman is not running" | The black window is closed | Double-click **Start Wheelman.cmd** |
| "Port 3210 is already in use" | Wheelman is already running in another window | Use that window, or close it |
| "Sharing is on (SHARE=1) but TEAM_PASSWORD is empty" | No team password yet | Put one on the `TEAM_PASSWORD` line in `.env`, then start again |
| "The team link could not be opened: cloudflared could not be downloaded" | No internet, or the download is blocked | Download it from the address in the message into `%LOCALAPPDATA%\Wheelman`, or set `CLOUDFLARED_PATH` in `.env` to where it is |
| A colleague's link says the site cannot be reached | Wheelman was restarted (a free address changes each time), or the black window is closed | Give them the address on the welcome panel |
| A colleague sees "Sharing is switched off on the computer that runs Wheelman" | Wheelman was started with **Start Wheelman.cmd** and `SHARE` is `0` | Double-click **Share Wheelman.cmd**, or set `SHARE=1` in `.env` |
| "Too many tries" at the team sign-in | Ten wrong passwords in a row from that computer | Wait a quarter of an hour, then try again |
| "running scripts is disabled on this system" | Windows PowerShell blocks `npm` | Use the double-click file, or type `npm.cmd` |
| The page says Wheelman is not responding | The black window was closed | Double-click **Start Wheelman.cmd** again |
| "The backup could not be written" in the black window or the log | The backup folder is on a drive that is not there, or cannot be written to | Plug the drive in, or set `BACKUP_DIR` in `.env` to a folder that is, then restart |
| "Wheelman is open. Close its black window first" when restoring | Wheelman holds the database open while it runs | Close the black window, then run the restore again |
| "This is not a Wheelman backup file" | The file is some other zip, or a backup that was damaged in copying | Use a file from the backup folder, copied again if need be |
| A change to the code is not showing | The black window still runs the old code | Close it and start again. Page-only changes need just a reload |
| No vehicle matched | The enquiry had no stock number | The reply asks which car, or answers generally |

## Tests

```bat
npm.cmd test
```

307 tests, all on invented data, against a stand-in AI service, a stand-in content engine and
a stand-in auction feed on this computer: who counts as waiting and who does not, stock numbers matched to the right
car however a portal writes them (a year in front, a portal code, upper or lower case), that
no customer detail and no cost figure reaches the AI request, an invented price
rejected and retried, a customer's own price never accepted as ours, a staff figure in a
rewrite accepted, a prompt reaching the AI last with the customer's details removed, one
suggestion written at a time for a message with a plain write joining the one under way and
never overwriting a prompted one, a failed prompt kept for the retry, the automatic write
waiting while the Prompt line is open, a text from the phone written for at once,
nothing drafted for an opt-out, a sold car bringing a similar one into the
request, a message that tries to give orders passed as data, busy models and the daily cap,
learning from copied and sent replies with details removed, that blanks and bank details are
never learned, the greeting and sign-off once a day, the in-person and online inspection links
and how "far away" is recognised, and the Marketplace section: three GET addresses and the one
send address, which only the Send button reaches, redirects refused, identifiers and contact
details not stored, a failed reply not counting as a reply, the auto-reply's price not
trusted, the booking link and the car's page link in the reply itself, nothing learned from a
copied or sent Marketplace suggestion, its own allowance, the engine being down, dismiss with
undo, the unread counts, and Send: the text in the box to the engine's reply address and
nothing else, shown on its way and the chat out of Waiting, a blank refused, a refused or
unreachable engine changing nothing, an offline phone meaning queued, and a queued auto-reply
still counting as waiting. Whole-conversation scenarios cover the rest: a buyer recognised by phone, by
email, by lead status and from our own texts; no amount, buyer name or readable contact
stored or sent; a reply that asks a buyer "which car?" rejected; a reserved car; the standard
first reply exact to the character and never learned; "this afternoon" at 8:44 pm, "tomorrow"
against "this morning", an unbacked promise and a guessed place rejected; failed texts,
thank-yous and automatic notices producing no suggestion; a suggestion overtaken by a new
customer message teaching nothing; the booking link for every way of asking to see a car,
for a customer who asked earlier, and when a Rewrite asks for it; and what the team sent for
a similar message reaching the request with no name, link or amount of the other customer;
"Good reply" teaching by example, and "Could be better" teaching by lesson: the lesson reaches
later requests, the owner's own words do not, and nothing is learned from Marketplace; a
reply that points "below" sent back; the booking link offered on a "where are you" question;
the page of our other cars of a model, and a model's importing page, supplied and accepted.
Import and auction enquiries: the website forms read into plain words; the leads fetched from
their own list and the auction request kept with no name, address, licence or deposit link;
the auction feed limited to four requests with no login and only the bid sent; the asking
reply word for word with no AI request; the car chosen for what was asked; the bid rounded
up; the offer laid out with the calculator's figures and a blank for the deposit link; an
opening that states a price replaced; a bid or a car named in Rewrite or by the customer;
nothing suitable, a request already under way and an unreadable feed; and an offer the team
sent teaching only its opening. A model that has used up its day set aside while the next
one carries on; Marketplace chats asked of the small model only, and only Marketplace
waiting when that model is used up. The message box as an editor: what is typed kept with the
suggestion, a blank that was filled in no longer flagged, a cleared box and the suggestion
brought back, a changed reply teaching when it is copied and when it is seen sent, Good reply
approving the text as it stands and following later changes, an emptied box losing its
approval, and a Marketplace edit kept but never learned from. The Auction section: every
order read as one list with only GET requests; no address, licence, date of birth, deposit
link, staff name, photo or cost of ours stored; an order that changes, leaves and comes back;
an order matched to its lead by phone number; the message due at every stage, and none for a
step that is old; every message written word for word with no AI request and nothing left
unfilled; blanks filled from what is typed, and only from what is plainly said; the bid from
the three closest sold cars, never below the website's suggested bid, and the notes when a
car misses the order; a message always written, with blanks for what cannot be looked up
and one typed line filling them; our own stock offered after a lost bid; Copy counting as done,
the next message coming up, and Put back; a pasted WhatsApp message producing one AI request
with no name, number or amount in it and the figures back in the reply; a marker the AI
made up caught; nothing learned from the section; and an older database upgrading cleanly.
The phone add-on: the short times and lines on the Messages list read into moments and
texts, and the add-on's idea of a phone number agreeing with Wheelman's; a report taken only
from an add-on, on its own route, with its header, and refused everywhere else; the same list
again storing nothing, a new text timed to when it was seen, a text cut short growing when
the list shows more of it, and the same words sent again hours later kept as a new text; a
text the dashboard also has shown once, one it missed shown, marked and answered, and the
dashboard's copy taking over the key when the phone saw the text first; Phone only rows for
unknown numbers with nothing written unasked, codes and sender ids set aside, a saved contact
matched by its name; a Phone only conversation moving under the dashboard's key with its
suggestion and marks; and a reply
typed on the phone counting as sent after a grace period, teaching nothing and kept out of the
example bank. The Import Query section: the Gmail button's parser reading addresses in three
forms, dates, and bodies with the quoted history cut; a thread taken only from the add-on, on
its own route, with its own header; limits, time clamps and which side a sender is on; a thread
sent again adding only what is new, a folded message filled in, and threads without Gmail's ids
still told apart; a thread as an item (waiting, answered, an "unsubscribe" footer not an
opt-out); the section's lists, counts and search, and the section off with the intake;
dismiss, seen and put back; and nothing from a thread reaching what Wheelman has learned.

## Project layout

```
wheelman/
├── Start Wheelman.cmd                 one click: start and open the page
├── Share Wheelman.cmd                 the same, shared with the team through a Cloudflare tunnel
├── .env.example                       settings; copy to .env
├── PRODUCT.md · DESIGN.md             who the page is for, and how it looks
├── extension/                         the browser add-on for Chrome or Edge, loaded unpacked once:
│                                      manifest · background · reader · parse · popup (the phone)
│                                      · mail · mailparse · shape (the Send to Wheelman button in Gmail)
├── knowledge/
│   ├── business-facts.md              what Wheelman may state, topic by topic
│   ├── how-carbarn-works.md           the steps of a sale and the usual answers
│   └── website/                       saved website pages (downloaded, local only)
├── docs/
│   └── selling-by-text.md             what the replies are taught about selling, and the evidence behind it
├── voice/
│   ├── house-voice.md                 the Carbarn voice: the register every reply is written in
│   ├── sales-playbook.md              how it sells: the ladder, the moves, the price reply, a question only when needed
│   ├── previous/                      the voice and the playbook before 12 Oct 2026, for a side-by-side review
│   ├── first-reply.md                 the standard block under a first reply; edit freely
│   ├── import-ask.md                  the first reply to an import or auction enquiry; edit freely
│   ├── auction-offer.md               the layout of an auction offer; edit freely
│   ├── auction-messages.md            every message to an auction customer, stage by stage; edit freely
│   ├── dashboard-messages.md          "Which message?" for texts: price question, trade-in, inspection ...; edit freely
│   ├── marketplace-messages.md        "Which message?" for Facebook chats, in the chat format; edit freely
│   ├── importquery-messages.md        "Which message?" for import emails, with the website's figures; edit freely
│   ├── people.example.json            whose writing sets the voice (invented names; the real file is local)
│   └── exclusions.json                templates and conversations kept out of the example bank
├── src/
│   ├── dashboard.js                   dashboard client: sign in and eight GET addresses
│   ├── vehiclemedia.js                a car's photos, videos and documents, reduced to what may be shown; Find a car
│   ├── media.js                       pictures fetched once and served from Wheelman's own copy
│   ├── notifications.js               the dashboard's notification feed: a new lead sets off a check at once
│   ├── marketplace.js                 content engine client: three GET addresses
│   ├── auction.js                     live auction client: three GET addresses and the cost calculator
│   ├── imports.js                     import enquiries: what they want, which auction car, the bid, the offer
│   ├── orders.js                      auction orders: the stage in plain words, which message is due
│   ├── ordermessages.js               the messages for an order, from the wording file; replies to pasted messages
│   ├── sectiontemplates.js            "Which message?" in Dashboard, Marketplace and Import Query: which fit, filled in
│   ├── templatedraft.js               writes a picked template, fitted by the AI, under its own name
│   ├── fitter.js                      hides every fact from the AI while it fits a template, and puts them back
│   ├── templates.js                   reads the wording files and fills them in
│   ├── phone.js                       the phone add-on's reports: checked, kept, matched by number
│   ├── mail.js                        email threads from the Gmail button: checked, kept, merged
│   ├── eligible.js                    the website's eligible-models list: read daily, kept, matched
│   ├── importquery.js                 the research behind an import email: model, cost, deposit, blanks
│   ├── sync.js · normalize.js         what is read, and what is kept of it
│   ├── items.js                       who is waiting: one shape for a lead and a Marketplace chat
│   ├── situations.js · text.js        what a message is about, by keyword rules
│   ├── deal.js                        who is already a buyer, of which car, at what stage
│   ├── redact.js                      customer details out, first name back in
│   ├── knowledge.js                   business facts, the guide, website passages, vehicle facts,
│   │                                  the importing page for a model
│   ├── people.js                      who the two voices are, read from voice/people.json
│   ├── voice.js · voicebank.js        genuine replies only; the example bank
│   ├── examples.js · learn.js         which examples fit; what was copied, sent and changed
│   ├── practice.js                    what the team really sent for similar messages
│   ├── prompt.js                      the request: facts, rules for the channel, inspection plan
│   ├── selling.js                     where the customer is on the way to a sale, the one move and the one question
│   ├── llm.js                         free models in order, resting busy ones, setting aside
│   │                                  ones that are used up for the day, the daily cap
│   ├── log.js                         what went wrong, written to data/wheelman.log
│   ├── checks.js · drafter.js         figures and links traced, blanks, greeting once a day
│   ├── firstreply.js · promises.js    the standard first reply; promises, days and places
│   ├── parts.js                       finds the blocks Wheelman's code built in a finished reply
│   ├── worker.js                      the loop: read, note what was sent, draft what is waiting
│   ├── server.js                      the local page's data, on 127.0.0.1 only; the team's sign-in
│   ├── share.js                       sharing with the team: the Cloudflare tunnel, the sign-in cookie
│   ├── db.js · time.js · config.js    SQLite, Sydney time, settings
│   └── app.js                         start
├── web/                               the page: index.html · app.js · fonts · signin.html (the team's sign-in)
│   ├── css/                           tokens (every colour, size, space, corner, shadow, duration)
│   │                                  · base · components · views · utilities, in layers
│   ├── views/                         TopBar (sections, status, Find a car) · ListColumn · CarPanel
│   │                                  (the Car tab) · Viewer (photos and videos large) · FindCar
│   ├── lib/                           blank.js: what a blank is, shared with the server's checks;
│   │                                  insert.js: where Add to reply puts a link; copy.js: every word
│   ├── assets/                        brand.svg: the mark, placed with <use>
│   └── new/                           the new page, at /new/ (Dashboard texts first)
│       ├── index.html                 the one page
│       ├── vendor/                    Preact and htm, one file, the only code from elsewhere
│       ├── css/                       tokens, base, components, views, panel, viewer, search, in layers
│       └── js/                        main · model · route · hashsync · store · panelstore · searchstore
│                                      · listview · insertlink · autosave · api · segments (the reply as
│                                      text and blocks) · editorpieces · lessons · remember, and ui/ (the
│                                      pieces on screen: top bar, search, list, conversation, message box,
│                                      trust line, panel with its tabs, viewer)
├── prototype/                         the redesign as a clickable demo on invented data: the design
│                                      the new page is built from. Open prototype.cmd opens it
├── scripts/                           check-login · check-model · replay · report · measure
│                                      build-voice · fetch-website · import-history
│                                      check-private
└── test/                              core · pipeline · greeting · inspection · marketplace
                                       quality · scenarios · stock · models · imports · editor
                                       orders · orders-upgrade · phone · share
    └── support/                       the invented world (fixtures), the stand-in services, the
                                       shared environment every test starts from
```

## Contributing, security and licence

- Changes come as pull requests, with tests on invented data and `npm run check-private` clean.
  The rules are in [CONTRIBUTING.md](CONTRIBUTING.md); every push and pull request runs the tests
  on Windows and Ubuntu and the private-data check.
- What Wheelman never does, what it stores, and how to report a problem: [SECURITY.md](SECURITY.md).
- What changed in each version: [CHANGELOG.md](CHANGELOG.md).
- All rights reserved. The code is published to be read and referred to; see [LICENSE](LICENSE).

## Status

In daily use since 1 October 2026. The dashboard side runs live on a real login. The
Marketplace section has been read live and its first suggestions written; reading was checked
to change nothing on the engine. Every business fact is confirmed. Each of the day's changes (greeting once a day, inspection
links, dismiss with undo, unread counts) was checked on a throwaway copy with invented
customers and on the automated tests, not yet over a full working day.

2 October 2026: buyers, the standard first reply and the promise checks were added after an
audit of every suggestion written so far. Sale records were tallied against stock status
first and agreed in every case, so they are trusted for recognising buyers. The changes were
checked on the automated tests, on invented customers with the real AI models, and by
replaying real past messages from buyers and new enquiries on a private copy of the database.
`npm run report` after a few days of use will show whether more suggestions are sent as
written.

3 October 2026: import and auction enquiries were added. They had never been listed, because
the dashboard keeps them on a separate list that Wheelman did not read. The asking reply and
the auction offer were checked on the automated tests and on a throwaway copy with invented
customers against the real live auction. Not yet used over a working day.

5 October 2026: the message box became an editor (saved as you type, Clear, the suggestion
brought back, Good reply on your own version), and Marketplace chats were moved to the small
AI model so the better ones stay free for dashboard customers. Both were checked on the
automated tests and in a browser on a throwaway copy with invented customers.

5 October 2026, later: the Auction section was added, and the suggested bid now comes from
what similar cars sold for. Checked on the automated tests, in a browser on a throwaway copy
with invented orders, and by one read-only pass over the real orders on a private copy of the
database (every order read, each due message written with no AI and nothing left unfilled).
Not yet used over a working day.

6 October 2026: the phone add-on was added after a customer's text reached the business phone
but not the dashboard. Checked on the automated tests (ten new ones, on invented numbers). The
names it looks for on the Google Messages list come from how that page is known to be built
and have not yet been checked against the live tab: the add-on reports how many conversations
it could read, and the page says if that is none. Not yet used over a working day.

6 October 2026, later: the stand-in services and the invented world moved into `test/support/`,
shared by every test, so no test carries its own copy. A health route (`/api/health`) was added
for anything that needs to know Wheelman is alive. A demo mode built on the same stand-ins was
tried and removed the same day: the real page is the one to look at.

6 October 2026, evening: the list shows every conversation ever stored, newest first, with no
time window. A number with no record takes the name an earlier enquiry gave it, or the name the
customer signed in a text (shown only; never given to the AI). A conversation opens on its newest
twenty messages, with "Load older messages" at the top for the rest. Photos in texts are shown
in the bubble, fetched once from the address the dashboard holds and kept under `data/media`.
Senders on the ignore list (`IGNORED_SENDERS`) are never listed, and the "Not customers" list is
gone with them. The list itself comes twenty conversations at a time, with "Load older
conversations" under the last row; the search looks through every conversation. Only a text from
the last fortnight counts as new for the blue numbers. The default list is "All": every
conversation, newest message first whoever wrote it, so a reply never moves a conversation away;
"Waiting" is the filter for the ones that still need one.

7 October 2026: the replies are taught to sell. A customer is on a ladder (interested, wants
proof, working out fit and cost, ready to commit, a buyer) and every reply aims one rung up with
one concrete next step and at most one question, from a question bank; the deposit is proposed
once interest is clear, with the one true urgency that a deposit takes the car off the market.
New checks refuse pressure wording and claims the records cannot back, and warn on filler, two
questions and a reply with no next step. The next step and the rung are saved with each
suggestion, and the replay and the report score every reply on six points. The evidence is in
`docs/selling-by-text.md`.

7 October 2026, later: the model replies. Thirty-seven invented scenarios, SMS and Marketplace,
each with a reply written to the playbook in the house voice, shown under Standards in the page
one by one in the normal message box with Good reply and Could be better; an approved one is the
standard the AI is shown for messages like it. Every one passes Wheelman's own checks without a
warning. A no from a customer now gets the one move of accepting it, with no next step. Checked
on the automated tests (nine new ones) and in a browser on a throwaway copy. None was ever
rated, and on 16 October 2026 the owner had the Standards section and the model replies removed:
the voice and the playbook were settled, so it had no purpose on the page.

7 October 2026, evening: the dashboard's notification feed is read every 45 seconds, so a new
lead sets off a check at once instead of waiting for the next three-minute one or a press of
"Check for new messages now", and a car's price change or sale refreshes the car list straight
away. The feed is read and never marked as read. A read-only look at the live feed showed why
some announced enquiries never reach the dashboard's lead list: they come from Carbarn's other
sites, and the Sydney list (which Wheelman reads the same way) is filtered to the Australian
platform; those are counted and left alone. Checked on the automated tests (eight new ones) and
by one read-only read of the live feed.

26 October 2026: the redesign moved into this repository. Wheelman is rebuilt here in stages,
keeping its name and its history. The engine comes first, behind today's page. A new page
follows beside the old one, section by section, and the old page goes only after Carbarn says
yes. `prototype/` is the clickable design on invented data. `npm run measure` counts what each
stage is judged on.

26 October 2026, later: the new page for Dashboard texts is at `/new/`, built from the prototype.
Checked on the automated tests and in a browser on invented data. Not yet used over a working day.

27 October 2026: the new page gained the deal panel (the Car and Customer tabs, the viewer, What
Wheelman used) and one search across customers, cars and message words in every section. The
server gained a search route and a stage on each conversation; nothing else about it changed.
Checked on the automated tests and in a browser on invented data. Marketplace, Imports and Auction
still open on the old page.

27 October 2026, later: the new page's message box shows Wheelman's blocks with Remove and Put
back, a trust line with where each fact came from, and Remember after a rewrite. On the server,
copying a draft unchanged counts as approval (not past a failed check, nor for your own wording
used word for word), Remember lessons go into texts and emails but never Marketplace chats,
lessons can be switched off and are counted when used, and a route lists them. Checked on the
automated tests and in a browser on invented data. The page that lists all lessons is not built
yet.

### Open questions for Carbarn

- Blue slips are not stored in the dashboard, only a blue slip date, and only for some cars.
  A "Blue slip" document type on the dashboard would let Wheelman show and offer it like the
  export certificate.
- A Documents section in the details panel (blue slip date, export certificate, auction
  sheet, photos) and document links in suggestions are designed but set aside for now.
- A buyer who texts from a number that is not on the sale, and has no email on file, is
  recognised only from the lead's status or from our own earlier texts.
- A customer who describes what they want without naming a car ("a 2016 or newer HiAce, high
  roof") is asked which one. Wheelman does not search the stock list for them yet.
- Half of `voice/auction-messages.md` is first-draft wording (deposit received, car secured,
  shipping, arrival, ready, thank you, refund). It needs the team's own words.
- Nothing on an order records the ship or an arrival date, so those are typed in each time.
- Only the newest staff note on an order can be read. Wheelman keeps each one as it appears,
  so a history builds from 5 October 2026 on.
- An auction offer covers one car. The feed shows only the next few auction days and the
  makes the website lists, so "nothing suitable right now" is common for rarer models.
- "Far away" is recognised from wording and from states and cities. A small town Wheelman
  does not know gets the in-person link.
