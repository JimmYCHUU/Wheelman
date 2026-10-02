# Wheelman 🛞

![Node.js 24](https://img.shields.io/badge/node-24-339933)
![Tests](https://img.shields.io/badge/tests-135%20passing-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)
![Free AI models](https://img.shields.io/badge/AI-free%20models%20only-blue)
![Never sends](https://img.shields.io/badge/sending-never%2C%20copy%20only-orange)

Carbarn's reply assistant. Wheelman reads new enquiries from the Carbarn dashboard and new
chats from Facebook Marketplace, works out who is waiting for an answer, and writes a suggested
reply for each one in the dealership's own voice: brief, factual and polite, with a little
warmth and no pressure. Every figure and
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
- [Non-negotiable rules](#non-negotiable-rules)
- [Install & run](#install--run)
- [The daily workflow](#the-daily-workflow)
- [The page](#the-page)
- [The Marketplace section](#the-marketplace-section)
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

A brand-new enquiry in the Dashboard section gets the reply the team always sends: one or two
lines that answer the question, then the standard block with the address, the map link, the
opening hours, the car's page and the phone number. The AI writes only the opening lines. The
block is added by code from `voice/first-reply.md`, so its wording and symbols are always
exact, and it takes the place of the sign-off on that message. Edit that file to change the
block.

- No car matched, or the car is sold or reserved: the "Check More Details" lines are left out.
- The customer asks to see the car: the opening carries the booking link, then the block.
- If the AI types the address, hours, map link or phone number itself, the reply is sent back.
- Buyers, later replies in a conversation, holding replies and Marketplace chats do not get it.

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

## Non-negotiable rules

Enforced in code, not by convention.

- **RULE-0 Never sends.** There is no code path that sends a message. The only way a reply
  leaves is a person's copy and paste.
- **RULE-1 Read-only.** The dashboard client can sign in and GET four addresses. The content
  engine client can GET three. Any other address or method is refused before a request is
  made. Reading does not mark anything as read, and never triggers the dashboard's own drafts
  or the engine's auto-reply.
- **RULE-2 Customer details stay here.** Names, phone numbers, emails, rego plates, VINs,
  street addresses and bank details are removed on this computer before any text goes to an
  AI service. The first name is put back afterwards.
- **RULE-3 Never guess.** A figure or link that cannot be traced to our records fails the
  check. A price that only the customer mentioned is theirs, not ours. What a person must
  decide becomes a blank: `[PRICE?]`, `[TRADE-IN VALUE?]`, `[DELIVERY COST?]`, `[DATE?]`,
  `[CHECK?]`. The same goes for a time that has passed, a day nobody mentioned, a dated
  promise nobody on our side made, and a place the customer never said.
- **RULE-4 Marketplace never teaches.** Learning accepts dashboard conversations only. It is
  refused in three places: the learning code, the copy route and the database helper.
- **RULE-5 No costs, no sale amounts.** Purchase cost, shipping cost and margin are never
  stored and never sent anywhere. From a sale record Wheelman keeps the stage and the date,
  and whether a deposit or the full amount is recorded. It keeps no amount and no buyer name,
  and the buyer's phone and email only as scrambled match keys.
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

The two addresses are not written in the code on purpose. Then copy
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

The suggestion waits in the message box, marked **not sent**.

- Edit the text directly in the box.
- **Copy reply** copies it. `Ctrl + Enter` also copies.
- **Rewrite** takes an instruction, for example `offer $27,500` or `make it shorter`.

| What you see | Meaning | What to do |
|---|---|---|
| A part highlighted amber, such as `[PRICE?]` | A gap only you can fill | Click its name above the box, then type over it |
| A figure or link highlighted red | It is not in our records | Check it, correct it or remove it |
| A red note about a day, a time, a promise or a place | The reply says something nobody agreed to | Correct it, or use Rewrite |
| A blue note | The reply needs a person's decision | Read the note before sending |
| A blue tick | Figures and links match our records | Read it and send |
| "You have changed the text" | What you typed has not been checked | Check your own figures |

| Gap | When |
|---|---|
| `[PRICE?]` | Any discount, best price or counter-offer |
| `[TRADE-IN VALUE?]` | The value of a customer's trade-in |
| `[DELIVERY COST?]` | A delivery price there is no record of |
| `[DATE?]` | An arrival or pickup date it cannot know |
| `[CHECK?]` | Extra work on the car, or a fact it was not given |

### The details panel

The customer, the car with everything included with it, and the facts the suggestion relied
on. **Dismiss** is at the bottom of this panel, away from Copy and Rewrite. It takes a
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
- **No learning.** The text copied from this section is not kept.

Dashboard customers are drafted first, and Marketplace has its own allowance so it cannot use
up the day's free AI requests.

| Setting in `.env` | What it does | Default |
|---|---|---|
| `MARKETPLACE_URL` | Where the inbox is read from | Empty: the section stays off |
| `MARKETPLACE_ENABLED` | Set to `0` to switch the section off | `1` |
| `MARKETPLACE_DAILY_DRAFTS` | Most Marketplace suggestions in any 24 hours | `60` |

If the content engine cannot be reached, the Dashboard section keeps working and the
Marketplace section says so.

## What Wheelman knows

Wheelman only states facts it has been given.

| Source | File or place | How it stays current |
|---|---|---|
| Stock: price, kilometres, availability, inclusions | The dashboard | Read every few minutes |
| Business facts: deposit, warranty, delivery, payment | `knowledge/business-facts.md` | You edit it |
| How Carbarn works: the steps of a sale, common questions | `knowledge/how-carbarn-works.md` | You edit it |
| The website: policy pages, guides, blog, import pages | `knowledge/website/` | `npm run fetch-website -- --all` |

In `knowledge/business-facts.md` each topic is marked `CONFIRMED` (stated freely), `WORKING`
(in use, please check) or `NEEDS ANSWER` (Wheelman says nothing and leaves a blank). Write the
answer after `Answer:`, set the status and save. The next suggestion uses it; no restart
needed. The evidence behind each answer is kept in `knowledge/business-facts-evidence.md`, a
local file Wheelman never reads. Topics still without an answer are listed in the black window
at start-up.

The facts were researched on 1 October 2026 from 7,138 customer messages, 316 sales records,
the dashboard's delivery zones and stock, and the website. `how-carbarn-works.md` was written
from a study of 664 conversations.

## How Wheelman learns

Only from dashboard leads and conversations, the website and the dashboard's records. Never
from Marketplace.

- **Your edits.** When you change a suggestion before using it, Wheelman keeps both versions,
  with the customer's details removed, and shows itself the difference next time. When the
  reply later appears in the dashboard conversation, what was really sent replaces what was
  copied.
- **Only what you changed.** A suggestion used word for word is Wheelman's own text, so it
  is not kept as an example of how the team writes.
- **Only the reply to that message.** A sent reply counts for a suggestion only if it directly
  follows the message the suggestion answered. If the customer wrote again first, the
  suggestion is marked as overtaken and nothing is learned. One lesson per customer message.
- **Our salespeople's own replies.** Once a day it rereads the dashboard conversations and
  refreshes its bank of the two voices' genuine replies. Texts that Wheelman itself wrote are
  skipped.
- **Ratings.** A copied suggestion marked "Not usable" is forgotten.

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
| First reply to a new enquiry | One or two lines that answer the question, then the team's standard block: address, map link, hours, the car's page, phone |
| Buyers | Answered about their own car. No "which car?", no booking link, no other cars, no amounts |
| Promises and times | Only what our staff said. Otherwise "We will check and come back to you shortly", or a blank |
| Price | Any discount, best price or offer is decided by a person: `[PRICE?]` |
| Holding deposit | $1,000, refundable while inspecting or arranging finance |
| Inspections | Only when the customer asks to see or drive a car. A car at the yard: the in-person booking link for that car. A customer who says they are far away or cannot come: the online video inspection link |
| A car not at the yard yet | No booking link. We let the customer know when it can be inspected |
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
tried. Models lower in the list write less polished replies. There is a cap of 200 AI requests
a day. OpenRouter allows 50 free requests a day; a one-off US$10 credit purchase raises that
to 1,000.

## Privacy

- Customer details are removed before any text goes to an AI service (RULE-2). Free AI
  services may use what they receive to improve their products, which is why.
- From Marketplace, Wheelman stores the buyer's name, the messages and the listing. It does
  not store Facebook thread or participant identifiers, photo addresses, or any phone number
  or email the engine captured.
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

Everything Wheelman reads from the dashboard and the content engine stays on this computer.
Git never sees any of it.

| Folder | Content |
|---|---|
| `.env` | Dashboard address and login, the Marketplace inbox address, and the AI keys |
| `voice\people.json` | The real names and logins of the two voices, and other staff names |
| `PLAN.md`, `knowledge\business-facts-evidence.md` | Internal planning notes, and the evidence behind each business fact |
| `data\app.db` | Leads, conversations, messages, stock, the stage of each sale, Marketplace chats, every suggestion and its checks, what was learned, what was dismissed and read |
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
| "The AI service returned an error" | All free models are busy, or a key is wrong | `npm run check-model` |
| "Suggestions are paused" | The day's free AI allowance is used up | It resumes by itself |
| "Port 3210 is already in use" | Wheelman is already running in another window | Use that window, or close it |
| "running scripts is disabled on this system" | Windows PowerShell blocks `npm` | Use the double-click file, or type `npm.cmd` |
| The page says Wheelman is not responding | The black window was closed | Double-click **Start Wheelman.cmd** again |
| A change to the code is not showing | The black window still runs the old code | Close it and start again. Page-only changes need just a reload |
| No vehicle matched | The enquiry had no stock number | The reply asks which car, or answers generally |

## Tests

```bat
npm.cmd test
```

135 tests, all on invented data, against a stand-in AI service and a stand-in content engine
on this computer: who counts as waiting and who does not, stock numbers matched to the right
car, that no customer detail and no cost figure reaches the AI request, an invented price
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
thank-yous and automatic notices producing no suggestion; and a suggestion overtaken by a new
customer message teaching nothing.

## Project layout

```
wheelman/
├── Start Wheelman.cmd                 one click: start and open the page
├── .env.example                       settings; copy to .env
├── PRODUCT.md · DESIGN.md             who the page is for, and how it looks
├── knowledge/
│   ├── business-facts.md              what Wheelman may state, topic by topic
│   ├── how-carbarn-works.md           the steps of a sale and the usual answers
│   └── website/                       saved website pages (downloaded, local only)
├── voice/
│   ├── house-voice.md                 the tone, from our salespeople's real replies
│   ├── sales-playbook.md              how it sells, and what it hands to a person
│   ├── first-reply.md                 the standard block under a first reply; edit freely
│   ├── people.example.json            whose writing sets the voice (invented names; the real file is local)
│   └── exclusions.json                templates and conversations kept out of the example bank
├── src/
│   ├── dashboard.js                   dashboard client: sign in and four GET addresses
│   ├── marketplace.js                 content engine client: three GET addresses
│   ├── sync.js · normalize.js         what is read, and what is kept of it
│   ├── items.js                       who is waiting: one shape for a lead and a Marketplace chat
│   ├── situations.js · text.js        what a message is about, by keyword rules
│   ├── deal.js                        who is already a buyer, of which car, at what stage
│   ├── redact.js                      customer details out, first name back in
│   ├── knowledge.js                   business facts, the guide, website passages, vehicle facts
│   ├── people.js                      who the two voices are, read from voice/people.json
│   ├── voice.js · voicebank.js        genuine replies only; the example bank
│   ├── examples.js · learn.js         which examples fit; what was copied, sent and changed
│   ├── prompt.js                      the request: facts, rules for the channel, inspection plan
│   ├── llm.js                         free models in order, resting busy ones, the daily cap
│   ├── checks.js · drafter.js         figures and links traced, blanks, greeting once a day
│   ├── firstreply.js · promises.js    the standard first reply; promises, days and places
│   ├── worker.js                      the loop: read, note what was sent, draft what is waiting
│   ├── server.js                      the local page's data, on 127.0.0.1 only
│   ├── db.js · time.js · config.js    SQLite, Sydney time, settings
│   └── app.js                         start
├── web/                               the page: index.html · app.js · styles.css · fonts
├── scripts/                           check-login · check-model · replay · report
│                                      build-voice · fetch-website · import-history
│                                      check-private
└── test/                              core · pipeline · greeting · inspection · marketplace
                                       quality · scenarios
```

## Status

In daily use since 1 October 2026. The dashboard side runs live on a real login. The
Marketplace section has been read live (122 chats in the first fortnight's window) and its
first suggestions written; reading was checked to change nothing on the engine. All 23
business facts are confirmed. Each of the day's changes (greeting once a day, inspection
links, dismiss with undo, unread counts) was checked on a throwaway copy with invented
customers and on the automated tests, not yet over a full working day.

2 October 2026: buyers, the standard first reply and the promise checks were added after an
audit of every suggestion written so far. Sale records were tallied against stock status
first and agreed in every case, so they are trusted for recognising buyers. The changes were
checked on the automated tests, on invented customers with the real AI models, and by
replaying real past messages from buyers and new enquiries on a private copy of the database.
`npm run report` after a few days of use will show whether more suggestions are sent as
written.

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
- "Far away" is recognised from wording and from states and cities. A small town Wheelman
  does not know gets the in-person link.
