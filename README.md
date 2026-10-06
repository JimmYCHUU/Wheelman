# Wheelman 🛞

![Node.js 24](https://img.shields.io/badge/node-24-339933)
![Tests](https://img.shields.io/badge/tests-204%20passing-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)
![Free AI models](https://img.shields.io/badge/AI-free%20models%20only-blue)
![Never sends](https://img.shields.io/badge/sending-never%2C%20copy%20only-orange)

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

`Node.js 24` · `node:sqlite` · `No dependencies` · `Gemini free tier` · `OpenRouter free models`

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
- [The page](#the-page)
- [The Marketplace section](#the-marketplace-section)
- [The Auction section](#the-auction-section)
- [The phone add-on](#the-phone-add-on)
- [What Wheelman knows](#what-wheelman-knows)
- [How Wheelman learns](#how-wheelman-learns)
- [Rules as Carbarn confirmed them](#rules-as-carbarn-confirmed-them)
- [Free AI models](#free-ai-models)
- [Privacy](#privacy)
- [Commands](#commands)
- [Where your files live](#where-your-files-live)
- [Troubleshooting](#troubleshooting)
- [Tests](#tests)
- [Project layout](#project-layout)
- [Status](#status)

---

## The idea

Answering enquiries by hand means, for every message, every day: open the conversation, work
out which car they mean, look up its price, kilometres and whether it is still at the yard,
remember what is included with it, recall the deposit and delivery rules, find the right
booking link, and then write it the way the dealership writes. Thirty to fifty messages a day
need that, on the dashboard and on Marketplace.

Wheelman does the looking-up and the first draft. The facts come only from our own records,
and the tone comes from a couple of hundred replies our two lead salespeople typed themselves,
with templates and AI-polished messages removed. What it cannot know, such as a discount, a
trade-in value or a delivery quote, it hands to the person as a highlighted blank instead of
guessing. It keeps learning from the replies that were really used and from the edits made to
its suggestions.

## The voice

Wheelman does not have a personality of its own. It writes as a blend of the two people who
set the tone of the business, studied from their real messages.

**The first is brisk and factual.** He answers exactly what was asked in one or two short
sentences, then stops. Politely formal, says "we", no emojis, almost no exclamation marks,
no slang. Bad news starts with "Unfortunately," followed by the fact and where to look next.
A price is stated flatly, with no justification. He does not chase; urgency is only ever a
fact, such as a deposit already taken on the car.

**The second is courteous and a little warmer.** He uses the customer's first name, says
"No worries", and adds a short well-wish. He asks plainly for the holding deposit when the
customer is serious. He reduces risk instead of persuading: he shares the export certificate
and the auction sheet, invites the customer's own mechanic, and mentions the refundable
deposit early. He accepts a "no" at once and offers at most one alternative.

**What the blend sounds like.** A busy, experienced dealer texting a customer: plain, polite,
straight to the answer, one next step, never pushy. Grammar is tidied; the tone is not.

The names of the two people, and of other staff, are not in this repository. They live in
`voice/people.json` on the computer that runs Wheelman. `voice/people.example.json` shows the
shape with invented names. The tone guide is `voice/house-voice.md`.

## How a suggestion is written

```
 Carbarn dashboard ──► leads · SMS conversations · stock      (read-only, four addresses)
 Content engine    ──► Facebook Marketplace chats             (read-only, three addresses)
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
that answer the question, then the standard block with the car's page, the booking link when
the customer asked to see the car, the address, the map link, the opening hours and the phone
number. The AI writes only the opening lines. The block is added by code from
`voice/first-reply.md`, so its wording and symbols are always exact, and it takes the place of
the sign-off on that message. Edit that file to change the block.

- No car matched, or the car is sold or reserved: the "Vehicle details" lines are left out.
- The customer asks to see the car: the block carries the booking link under "Book your
  inspection:". Otherwise those lines are left out.
- If the AI types the address, hours, map link, phone number or one of those links itself,
  the line is dropped or the reply is sent back.
- Buyers, later replies in a conversation, holding replies, Marketplace chats and anyone who
  writes to a staff member by name do not get it.

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
instruction typed into **Rewrite** still decides what to say, but it no longer overrides these
rules.

### What gets no suggestion

Thank-yous and laughter, login codes and missed-call notices, texts of ours that failed to
send (the customer is still waiting), and messages more than a day old. Those older messages
stay listed with **Write it now**.

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
| `AUCTION_API_URL` | Where the live auction is read from | The dashboard's address |

## Non-negotiable rules

Enforced in code, not by convention.

- **RULE-0 Never sends.** There is no code path that sends a message. The only way a reply
  leaves is a person's copy and paste.
- **RULE-1 Read-only.** The dashboard client can sign in and GET five addresses. The content
  engine client can GET three. The live auction client uses no login: it can GET three
  addresses (the cars coming up, one car, what similar cars sold for) and ask the website's
  cost calculator for one figure. That one request is a
  POST, because that is how the website's own page asks. It carries the bid amount and
  nothing else, places no bid and stores nothing. Any other address or method is refused
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
  promise nobody on our side made, and a place the customer never said.
- **RULE-4 Marketplace and the phone never teach.** Learning accepts dashboard conversations
  only. It is refused in three places: the learning code, the copy route and the database
  helper. A reply typed on the phone counts as the reply but teaches nothing, and the example
  bank never sees it.
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
refreshes by itself. Close the window to stop Wheelman. For a desktop shortcut, right-click the
file, then **Send to > Desktop (create shortcut)**.

No exe and no installer on purpose: Wheelman has no packages to install. Node.js is all it
needs.

### What you need first

| | |
|---|---|
| Node.js | 24 (22.13 or newer works) |
| Dashboard login | Your own Carbarn dashboard username and password |
| AI key | A free Gemini key from https://aistudio.google.com/apikey |
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
once: see [The phone add-on](#the-phone-add-on).

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
4. Read the suggestion in the message box. Fill in anything highlighted.
5. Press **Copy reply**, paste it into the dashboard or the Marketplace chat, and send it.
6. The customer leaves **Waiting** by themselves once the reply appears in the conversation.
   Wheelman then compares what was sent with what it suggested, and learns from it.

Wheelman checks the dashboard and the Marketplace inbox every three minutes.

## The page

### The list on the left

A switch at the top chooses the section: **Dashboard** for leads and text messages,
**Marketplace** for Facebook Marketplace chats. Every row is one conversation, newest first.

- A **blue number** on a row is how many new messages that customer has sent since you last
  opened the conversation. Opening it clears the number.
- The numbers on **Waiting**, on the section switch and in the browser tab count
  conversations with new messages you have not looked at. They clear the same way. A customer
  stays under Waiting until a reply is sent.
- **Blank to fill:** at the start of a row means the suggestion has a gap only you can fill.
- **Check the reply:** means a figure or link in the suggestion is not in our records.
- Three chips choose what is shown:
  - **Waiting**: customers who said something and have not been answered.
  - **No reply needed**: customers who only said thanks, opted out with STOP, or are no longer
    looking, plus any conversation you dismissed.
  - **Not customers**: texts from suppliers, couriers and marketers on the same phone.
- The search box finds a name, part of a phone number, or a word from a message.
- The list column shows a notice only for a problem that needs action now.

### The open conversation

- Customer messages are on the left in white. Ours are on the right in pale blue, with the
  name of whoever sent them.
- Small centred notes show dates, website events such as a booked inspection, and staff notes.
- The strip under the customer's name shows the car: price, kilometres, availability.
- Click the customer's name, or the round "i" button, for the details panel.

### The message box

The suggestion waits in the message box, marked **not sent**. The box is an editor.

- **Change it.** Click in the text and type. What you type is saved a moment after you stop,
  so it is still there after a reload, a restart or a look at another conversation. The top
  right of the box says when it was saved.
- **Clear** empties the box so you can write your own reply. `Ctrl + Z` undoes it.
- **Bring back the suggestion** returns the box to what Wheelman wrote. It appears as soon as
  the text differs from the suggestion.
- **Copy reply** copies what is in the box. `Ctrl + Enter` also copies, and so does selecting
  the whole text and pressing `Ctrl + C`. When you had changed the text, Wheelman learns from
  the change.
- **Rewrite** takes an instruction, for example `offer $27,500` or `make it shorter`. It
  changes this reply only, and replaces what is in the box.
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

### The details panel

The customer, the car with everything included with it, and the facts the suggestion relied
on. For an import or auction enquiry it shows what the customer asked us to find instead of
a car from our stock: the model, the years, the kilometre limit, the budget, and what we
still do not know. **Dismiss** is at the bottom of this panel, away from Copy and Rewrite. It takes a
conversation out of Waiting, for example when you have already phoned the customer. Nothing is
deleted: press **Undo** in the message that appears, or open the conversation later under
**No reply needed** and press **Put back in Waiting**. It also comes back by itself if the
customer writes again.

### Narrow windows, light and dark

Beside the dashboard in a narrow window, the list and the conversation take turns; the arrow
at the top left goes back to the list. The page follows the computer's light or dark setting.

## The Marketplace section

Wheelman reads the Facebook Marketplace chats from the content engine and suggests a reply for
every chat where the buyer wrote last. It works like the Dashboard section, with these
differences:

- **Short replies.** One or two lines, no greeting line, no "Regards, Team Carbarn".
- **Copy and paste.** Paste the suggestion into the Marketplace chat yourself.
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

### The three lists

| List | What is in it |
|---|---|
| **To do** | The customer wrote and has no reply yet, or a message is due for the order's stage |
| **In progress** | Orders that are under way with nothing due |
| **Finished** | Completed, cancelled and refunded orders. Ended orders are kept for 60 days |

The bottom of the list says how many orders were read from the dashboard and how many are
on each list, so it can be checked against the dashboard's own page. **Search looks through
all three lists at once**: an order found on another list carries a small tag saying which.
An order with nothing due is under In progress, not To do.

Each row shows the customer, the car they want or the car secured, what is due, and the
stage in plain words: Looking for a car · Bid placed, result due · Car secured · Shipping and
compliance · On the way to Australia · Arrived, compliance under way · Completed.

### The message that is due

The message box holds the message for the order's stage, written from your own wording in
`voice/auction-messages.md` with the facts filled in. **No AI is asked.** Figures and links
come from the order, the website's live auction and its cost calculator, and our stock list.
What only a person knows is a highlighted blank.

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

## The phone add-on

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
- The texts stay on this computer, in their own tables, apart from the dashboard's. They are
  never learned from and never used for the example bank. A text that gets a suggestion goes
  through the same removal of names and numbers as any other before an AI sees it.

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
  reply, but it teaches nothing.
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
2. Click the puzzle-piece icon in the toolbar and pin **Wheelman phone reader**.
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

| Setting in `.env` | What it does | Default |
|---|---|---|
| `PHONE_ADDON` | Set to `0` to stop taking the add-on's reports | `1` |
| `PHONE_ADDON_ID` | The add-on's id as `chrome://extensions` shows it, so no other add-on is listened to | Empty: any add-on on this computer |
| `PHONE_STALE_MINUTES` | After this long without a report, the page says the add-on has gone quiet | `10` |
| `IGNORED_SENDERS` | Senders that are never customers and are never listed: a contact saved on the phone under a label, a finance company, a courier. Comma-separated; spaces and case are ignored | `Not customer, OTP, Delivery Service, Autotrader, CreditOne` |

## What Wheelman knows

Wheelman only states facts it has been given.

| Source | File or place | How it stays current |
|---|---|---|
| Stock: price, kilometres, availability, inclusions | The dashboard | Read every few minutes |
| Business facts: deposit, warranty, delivery, payment | `knowledge/business-facts.md` (private; `business-facts.example.md` is what is published) | You edit it |
| How Carbarn works: the steps of a sale, common questions | `knowledge/how-carbarn-works.md` (private; an example file is published) | You edit it |
| The website: policy pages, guides, blog, import pages | `knowledge/website/` | `npm run fetch-website -- --all` |
| Cars in the coming Japan auctions, what similar cars sold for, and what one would cost landed | The website's live auction | Read at the moment an offer is written, and hourly for orders still searching |
| Auction orders: the stage, what was asked for, the car, what is charged and paid | The dashboard | Read every few minutes |
| The wording of messages to auction customers | `voice/auction-messages.md`, `voice/auction-offer.md` | You edit them |
| Texts that reached the business phone but not the dashboard | The phone add-on, reading Google Messages for web in your browser | Every 30 seconds while the browser is open |

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

Only from dashboard leads and conversations, the website and the dashboard's records. Never
from Marketplace, and not from the Auction section: its messages come from a wording file,
and what a customer wrote on WhatsApp is pasted in, not read from the dashboard.

Wheelman learns two different things from two different places. **What to say** comes from
what the team really sends. **How to say it** comes from the two voices.

- **What the team sends.** For each waiting message, Wheelman looks up the replies the team
  sent in the last 45 days to customers who wrote something similar, whoever sent them, and
  shows itself the closest three. From those it takes what to include and leave out (the
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
- **Only what you changed.** A suggestion used word for word is Wheelman's own text, so it
  is not kept as an example of how the team writes.
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
| Voice | One blended voice of the two lead salespeople, grammar tidied. See [The voice](#the-voice) |
| Sign-off | "Regards, Team Carbarn" |
| Greeting and sign-off | Once a day per customer. Later replies that day start with the answer |
| First reply to a new enquiry | One or two lines that answer the question, then the standard block: the car's page, the booking link if they asked to see it, address, map link, hours, phone |
| Buyers | Answered about their own car. No "which car?", no booking link, no other cars, no amounts |
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
| Auction orders | Their own section. The next message for each stage is written from the team's wording with no AI, signed Team Carbarn. Copy and paste into WhatsApp |
| The deposit link | Always left as a blank and pasted in by hand. It is never stored |
| Amounts on an auction order | What the customer was charged and paid may be kept and stated. Never our costs, and never to the AI |
| Finance and complaints | Answered the way the team answered similar ones. Never a rate, a repayment or a promise of approval; a complaint is always marked for a person |
| "Below" | A reply never points at the address block. It answers in the sentence itself |
| The message box | An editor: change the text or clear it, and it is saved as you type. A changed reply teaches Wheelman when it is copied or approved |
| AI models | The better models are kept for dashboard customers. Marketplace chats use the small one |
| Marketplace | A suggestion for every chat where the buyer wrote last; short chat style |
| Sending | Never. Copy and paste, in both sections |
| Learning | Dashboard only |

The business facts themselves are in `knowledge/business-facts.md`.

## Free AI models

Tried in order; the first that answers is used.

1. `gemini-3.8-flash`
2. `gemini-3.7-flash`
3. `gemini-3.5-flash`
4. `gemini-3.5-flash-lite`
5. `google/gemma-4-31b-it:free` (OpenRouter)
6. `google/gemma-4-26b-a4b-it:free` (OpenRouter)

Free models are often busy. A busy model is rested for five minutes and the next one is
tried. Models lower in the list write less polished replies.

Dashboard customers are asked of the whole list, best first. Marketplace chats start at the
fourth model, so the first three are kept for dashboard customers. Hovering over the status
line shows which models are for dashboard customers only.

Each free model also has its own daily allowance, and it is small. On 3 October 2026 Gemini
allowed 20 requests a day to each of the first three models; the fourth has a larger
allowance. A model that says its day is used up is left alone until the time it gives, and
the next model carries on, so on a busy day the later suggestions come from the smaller
models. Hover over the status line at the top of the list to see which models are used up.
When no model can answer, the suggestion is tried again by itself a few minutes later, up to
three times an hour; nothing red is shown for that. When every model is used up for the day,
the page says suggestions are paused and when they resume.

Wheelman's own cap is 200 AI requests a day. OpenRouter allows 50 free requests a day; a
one-off US$10 credit purchase raises that to 1,000.

## Privacy

- Customer details are removed before any text goes to an AI service (RULE-2). Free AI
  services may use what they receive to improve their products, which is why.
- From Marketplace, Wheelman stores the buyer's name, the messages and the listing. It does
  not store Facebook thread or participant identifiers, photo addresses, or any phone number
  or email the engine captured.
- For an auction order Wheelman keeps the customer's name, phone and email and what they were
  charged and paid, so the order can be shown and its messages written. It does not keep
  their address, licence, date of birth or deposit link. None of it goes to an AI.
- A customer's own payment link that appears in a text is removed before the text goes to an
  AI, like a phone number.
- From the phone, Wheelman stores the name or number as the Messages list shows it, the
  latest text of each conversation and its time. Nothing more: no photos, no other contact
  details. The texts are never learned from, and go through the same removal of details as
  any other before an AI sees one.
- `.env` holds the dashboard password and the AI keys. Git never sees it.
- The folders that hold real customer details are listed under
  [Where your files live](#where-your-files-live). Git never sees those either.

## Commands

| Command | What it does |
|---|---|
| Double-click `Start Wheelman.cmd` | Runs Wheelman and opens the page |
| `npm start` | The same, from a terminal |
| `npm run check-login` | Tests the dashboard login |
| `npm run check-model` | Tests the AI keys and shows which models answer |
| `npm run replay` | Compares suggestions with real past replies. `-- 60` for 60 cases, `-- --buyers` or `-- --first` for one kind |
| `npm run report` | Counts how suggestions were used and which checks fired. `-- 30` for 30 days |
| `npm run check-private` | Before a commit: makes sure no setting from `.env`, staff name or key is in a file git would publish |
| `npm run build-voice` | Rebuilds the example bank from stored conversations |
| `npm run fetch-website` | Saves the website's policy pages. `-- --all` for every guide, blog post and import page |
| `npm run import-history` | Loads the saved history in `data/raw` into the database |
| `npm test` | Runs the automated checks |

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
| `knowledge\website\` | Downloaded website pages. Rebuilt with `fetch-website -- --all` |
| `.playwright-mcp\`, `.impeccable\review\` | Captures and screenshots from building the page |

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
| An order shows no message although one should be due | The step happened more than a week ago, or the message was copied or dismissed | Pick it under **Which message?**, or press **Put back in To do** |
| A note says "No ... is in the website's coming auctions right now" and the car is blanks | The website lists none of that model in the next few auction days | Fill the blanks in, or type the car into **Add what you know**. The auction is looked at again within the hour |
| An order cannot be found in the Auction section | It is on another list: one with nothing due is under **In progress** | Type the name, car or order number into the search box. It looks through all three lists |
| "The phone add-on has not reported since …" | Chrome is closed, the Messages tab is closed, or the browser put it to sleep | Open Chrome with the Messages tab in it. The add-on's icon gives the reason |
| "Messages for web is signed out" | Google signs a computer out after weeks without use | Open the Messages tab and sign in again (whoever has the phone taps the matching emoji) |
| "The phone add-on could not read the Messages list" | Google changed its page | Click the add-on's icon, press **Copy page details**, and keep what it copied for fixing the table at the top of `extension/reader.js` |
| The add-on's icon says "Wheelman is not running" | The black window is closed | Double-click **Start Wheelman.cmd** |
| "Port 3210 is already in use" | Wheelman is already running in another window | Use that window, or close it |
| "running scripts is disabled on this system" | Windows PowerShell blocks `npm` | Use the double-click file, or type `npm.cmd` |
| The page says Wheelman is not responding | The black window was closed | Double-click **Start Wheelman.cmd** again |
| A change to the code is not showing | The black window still runs the old code | Close it and start again. Page-only changes need just a reload |
| No vehicle matched | The enquiry had no stock number | The reply asks which car, or answers generally |

## Tests

```bat
npm.cmd test
```

214 tests, all on invented data, against a stand-in AI service, a stand-in content engine and
a stand-in auction feed on this computer: who counts as waiting and who does not, stock numbers matched to the right
car however a portal writes them (a year in front, a portal code, upper or lower case), that
no customer detail and no cost figure reaches the AI request, an invented price
rejected and retried, a customer's own price never accepted as ours, a staff figure in a
rewrite accepted, nothing drafted for an opt-out, a sold car bringing a similar one into the
request, a message that tries to give orders passed as data, busy models and the daily cap,
learning from copied and sent replies with details removed, that blanks and bank details are
never learned, the greeting and sign-off once a day, the in-person and online inspection links
and how "far away" is recognised, and the Marketplace section: only GET requests on three
addresses, redirects refused, identifiers and contact details not stored, a failed reply not
counting as a reply, the auto-reply's price not trusted, nothing learned from a copied
Marketplace suggestion, its own allowance, the engine being down, dismiss with undo, and the
unread counts. Whole-conversation scenarios cover the rest: a buyer recognised by phone, by
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
example bank.

## Project layout

```
wheelman/
├── Start Wheelman.cmd                 one click: start and open the page
├── .env.example                       settings; copy to .env
├── PRODUCT.md · DESIGN.md             who the page is for, and how it looks
├── extension/                         the phone add-on for Chrome or Edge, loaded unpacked once:
│                                      manifest · background · reader · parse · popup
├── knowledge/
│   ├── business-facts.md              what Wheelman may state, topic by topic
│   ├── how-carbarn-works.md           the steps of a sale and the usual answers
│   └── website/                       saved website pages (downloaded, local only)
├── voice/
│   ├── house-voice.md                 the tone, from our salespeople's real replies
│   ├── sales-playbook.md              how it sells, and what it hands to a person
│   ├── first-reply.md                 the standard block under a first reply; edit freely
│   ├── import-ask.md                  the first reply to an import or auction enquiry; edit freely
│   ├── auction-offer.md               the layout of an auction offer; edit freely
│   ├── auction-messages.md            every message to an auction customer, stage by stage; edit freely
│   ├── people.example.json            whose writing sets the voice (invented names; the real file is local)
│   └── exclusions.json                templates and conversations kept out of the example bank
├── src/
│   ├── dashboard.js                   dashboard client: sign in and five GET addresses
│   ├── marketplace.js                 content engine client: three GET addresses
│   ├── auction.js                     live auction client: three GET addresses and the cost calculator
│   ├── imports.js                     import enquiries: what they want, which auction car, the bid, the offer
│   ├── orders.js                      auction orders: the stage in plain words, which message is due
│   ├── ordermessages.js               the messages for an order, from the wording file; replies to pasted messages
│   ├── templates.js                   reads the wording files and fills them in
│   ├── phone.js                       the phone add-on's reports: checked, kept, matched by number
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
│   ├── llm.js                         free models in order, resting busy ones, setting aside
│   │                                  ones that are used up for the day, the daily cap
│   ├── log.js                         what went wrong, written to data/wheelman.log
│   ├── checks.js · drafter.js         figures and links traced, blanks, greeting once a day
│   ├── firstreply.js · promises.js    the standard first reply; promises, days and places
│   ├── worker.js                      the loop: read, note what was sent, draft what is waiting
│   ├── server.js                      the local page's data, on 127.0.0.1 only
│   ├── db.js · time.js · config.js    SQLite, Sydney time, settings
│   └── app.js                         start
├── web/                               the page: index.html · app.js · fonts
│   ├── css/                           tokens (every colour, size, space, corner, shadow, duration)
│   │                                  · base · components · views · utilities, in layers
│   ├── lib/                           blank.js: what a blank is, shared with the server's checks
│   └── assets/                        brand.svg: the mark, placed with <use>
├── scripts/                           check-login · check-model · replay · report
│                                      build-voice · fetch-website · import-history
│                                      check-private
└── test/                              core · pipeline · greeting · inspection · marketplace
                                       quality · scenarios · stock · models · imports · editor
                                       orders · orders-upgrade · phone
    └── support/                       the invented world (fixtures), the stand-in services, the
                                       shared environment every test starts from
```

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
the last fortnight counts as new for the blue numbers.

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
