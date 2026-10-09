# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, who answers customer enquiries for Carbarn by SMS. He works alone on his own Windows computer, replying through the Carbarn dashboard. He is comfortable with everyday software and messaging apps and is not a developer. WhatsApp is the messaging app he knows best. (Confirmed 29 Sep 2026.)

## Product Purpose

Wheelman is Carbarn’s customer representative assistant. It suggests a reply to each customer who is waiting for one, written the way our two lead salespeople write (one brisk and factual, one courteous and a little warmer), and informed by how the business actually runs. The owner reads the suggestion, edits it if needed, copies it, and sends it from the dashboard himself. The product never sends anything.

A separate Marketplace section does the same for buyers on Facebook Marketplace, whose chats are read from Carbarn’s content engine. The owner sends the reply to the buyer from the page with the Send button, through the content engine, or copies it and pastes it into the Marketplace chat himself. Marketplace is the only section that sends. (User’s instructions, 1 and 9 Oct 2026: "Just the marketplace replies, nothing else".)

Success is the owner answering each waiting customer faster, with a reply that is accurate and sounds like the dealership.

## Positioning

The suggestions are written in the blended voice of the dealership's two lead salespeople, learned from their real past replies, and every figure in a suggestion is checked against the dealership's own stock and policy records before it is shown.

## Operating Context

- Runs on the owner’s computer at http://localhost:3210, next to the Carbarn dashboard in another browser tab.
- The loop: see who is waiting, read what they wrote, read the suggestion, fix any blank, copy, paste into the dashboard, send.
- Dozens of customer messages a day need a reply.
- Customers write by SMS and through car portals (Carsales, Autotrader) and the Carbarn website. Buyers also write on Facebook Marketplace, across several seller accounts, where the content engine’s own auto-reply answers many chats first.
- Carbarn is a used-car dealer in Lidcombe, Sydney, selling mostly vehicles imported from Japan.

## Capabilities and Constraints

- Reads leads, conversations, messages and stock from the dashboard. Read-only.
- Reads Marketplace chats from the content engine: three addresses, GET only. Sends a Marketplace reply through the engine’s own reply address (the one its inbox page uses), and only when the owner presses Send; the engine’s phone types it into the chat. A blank is never sent. Nothing is sent by itself, and nothing else is sent. (User’s instruction, 9 Oct 2026.)
- Four sections, never mixed: Dashboard, Marketplace, Auction and Import Query, with Standards while a model reply waits for a rating. A switch at the top of the list chooses one and shows how many are waiting in each; four tabs sit two by two. (User’s choice, 9 Oct 2026.)
- Import Query: import enquiries that arrive by email, handed in from Gmail with the add-on’s Send to Wheelman button, one press per thread. Our side is any @carbarn.com.au sender. Replies are copied and pasted into Gmail. (User’s instructions, 9 Oct 2026.)
- An import email is answered from the website: the model is matched against the eligible-models list, and the reply carries its eligibility, landed estimate, deposit and page link. "The reply should contain the exact answer the customer is looking for. The Import part requires this strictly." A reply that puts the answer off ("we will check and update you shortly") is refused; what cannot be found becomes a blank plus research notes under the box. (User’s rule, 9 Oct 2026.) Email replies use the better AI models.
- Marketplace suggestions are short chat lines: one or two lines, no greeting line, no sign-off. Every chat where the buyer wrote last gets one. (User’s choices, 1 Oct 2026.) The car’s page link goes in a first reply, and the inspection booking link whenever the buyer asks to see the car, each on its own line; the earlier practice of giving neither on Marketplace is revoked. (User’s instruction, 9 Oct 2026.)
- In Marketplace, the engine’s automatic messages are labelled "Auto-reply", chats handed to a person are marked and listed first, and a figure that only an auto-reply mentioned is never treated as Carbarn’s.
- Writes one suggested reply per waiting customer, using free AI models that are often busy.
- Leaves a marked blank where a person must decide: `[PRICE?]`, `[TRADE-IN VALUE?]`, `[DELIVERY COST?]`, `[DATE?]`, `[CHECK?]`.
- Flags a suggestion when a figure or link is not in the records, when wording is risky, or when it needs input.
- Every number on the page (the Waiting chip, the section switch, the browser tab) counts conversations with messages not yet looked at, and clears when they are opened. The other two chips carry no number.
- The number on a list row counts unread messages. Opening the conversation clears it; a new customer message brings it back. The customer stays under Waiting until a reply is sent. (User’s instruction, 1 Oct 2026.)
- The list column shows notices only for problems that need action now. Reminders, such as business facts still to answer, are not shown there. (User’s instruction, 1 Oct 2026.)
- Never drafts for a customer who opted out.
- Greets a customer and signs off "Regards, Team Carbarn" once a day, on the first reply. Later replies that day start with the answer and carry no sign-off. (User’s instruction, 1 Oct 2026.)
- The first reply to a brand-new dashboard enquiry is the team’s standard reply: one or two lines answering the question, then the address block exactly as the team sends it (from `voice/first-reply.md`), in place of the sign-off. (User’s choice, 2 Oct 2026.)
- A customer who has already bought is answered as a buyer, about their own car, using only what the dashboard already sends. No new panels or notes on the page: better replies only. (User’s choices, 2 Oct 2026.)
- A suggestion that names a time already passed, a day nobody mentioned, a dated promise nobody on our side made, or a place the customer never said is sent back for one rewrite. Remaining problems show in the existing lines above the message box.
- Each dashboard suggestion can be taught from: "Good reply" approves it as the model for similar messages, and "Could be better" takes what should be different, rewrites the reply and remembers the note. (User’s instruction, 2 Oct 2026: "There should be an option to approve the draft, suggestion, what could be better … so that the agent could learn".)
- Actions available on a suggestion: change the text, clear it, bring the suggestion back, copy, rewrite with an instruction, good reply, could be better, dismiss. Dismiss sits in the details panel, away from Copy and Rewrite, and never deletes: it can be undone at once, and a dismissed conversation stays under "No reply needed" with a "Put back in Waiting" button. (User’s instruction, 1 Oct 2026.)
- When a customer wants to see a car that is at the yard, the suggestion gives that car’s in-person inspection booking link. When they say they live far away or cannot come, it gives the online video inspection link instead. (User’s instruction, 1 Oct 2026.)
- Learns what to say from every reply the team sends on the dashboard, whoever sends it, and then words it in the house voice: "he should learn first". When a customer asks to see a car, the suggestion carries that car's inspection booking link. (User’s instruction, 2 Oct 2026.)
- Learns from replies that were really used: the text copied from the message box and the reply later seen in the dashboard conversation. Learning uses dashboard leads and conversations, the website and the dashboard database only; Marketplace conversations are never learned from. (User’s instruction, 1 Oct 2026.)
- Import and auction enquiries from the website are listed like any other lead. Before we know what the customer wants, the suggestion is the team’s asking reply, word for word (from `voice/import-ask.md`). Once we know, the live auction on the website is searched, one car is chosen, and the suggestion is the team’s offer (from `voice/auction-offer.md`): the car, its link, a suggested bid, the estimated landed cost part by part from the website’s own calculator, and a blank for the deposit link, which the owner pastes in himself. (User’s instruction, 3 Oct 2026.)
- A third section, Auction, lists every auction order from the dashboard with its stage in plain words, under To do, In progress and Finished. For each order the next message to the customer is written from the team’s own wording (`voice/auction-messages.md`) with the facts filled in by code and no AI: every stage, signed Team Carbarn, copied and pasted into WhatsApp by the owner. (User’s instructions, 5 Oct 2026.)
- In the Auction section the owner can paste what a customer wrote on WhatsApp, which Wheelman cannot read, and get a suggested reply that knows the order. A message he sent by hand can be added the same way. Copying a message counts as done, and can be put back.
- The deposit link is always a blank the owner pastes; it is never stored. What a customer was charged and paid on an auction order may be kept and stated in a message; our own costs never are, and no amount from an order goes to the AI. (User’s choices, 5 Oct 2026.)
- The suggested auction bid is the average of the three closest sold cars on the website’s "Japan auction sold prices" list (same grade first, then nearest kilometres), rounded up to the next ¥50,000. It is never below the website’s own suggested bid: when similar cars sold for less, that bid is rounded up instead. (User’s choices, 5 Oct 2026: "Never bid below".)
- The dashboard’s "quiet" mark on an order is ignored. A follow-up marked as due is a reason to write. (User’s instruction, 5 Oct 2026.)
- Nothing is learned from the Auction section for now: its wording is corrected in its file.
- An auction message is always written. What Wheelman cannot look up becomes a blank for the owner to fill in, never a refusal. (User’s instruction, 5 Oct 2026: "Just make the templates … I'll fill them".)
- In the Auction section the search looks through all three lists, and the foot of the list says how many orders were read from the dashboard. (After the owner could not find an order that was under In progress, 5 Oct 2026.)
- The live auction is read without a login. The one request to the website’s cost calculator carries only a bid amount and changes nothing.
- Texts the dashboard missed are caught from the business phone. A browser add-on in the owner’s own Chrome reads the list in Google Messages for web, the latest message of each conversation, every 30 seconds, and hands it to Wheelman. It never opens a conversation, clicks, types or sends, so nothing is marked read on the phone. A text the dashboard also has is shown once; one it missed is shown labelled as seen on the phone and gets a suggestion; a number the dashboard never saw is a "Phone only" row; a reply typed on the phone counts as the reply but teaches nothing. (User’s choices, 6 Oct 2026: his own browser, replies sent from the dashboard, the latest message only, every conversation kept on this computer.)
- The details panel shows what an import customer asked us to find, in place of a car from stock.
- The message box is an editor. The owner can change the suggestion or clear it and write his own; what he types is saved as he types and survives a reload. A changed reply teaches Wheelman when it is copied, approved with "Good reply", or seen sent. (User’s instruction, 5 Oct 2026: "I want that to be realtime editor, where I can edit message, clear suggestions if not needed. And it will learn from my edits".)
- The better AI models are kept for dashboard customers; Marketplace chats are written by the small model. (User’s choice, 5 Oct 2026.)
- Dashboard conversations fall into three groups: waiting for a reply, no reply needed, not customers. Marketplace has the first two.
- No build step and no external dependencies: plain HTML, CSS and JavaScript served locally. A strict content security policy forbids inline styles and scripts.
- Customer text must always be inserted as text, never as HTML.

## Brand Commitments

- Name: "Wheelman", shown as an uppercase wordmark with the line "by Carbarn". (User’s instruction, 1 Oct 2026.)
- Follows Carbarn’s own branding: the blue of the Carbarn wordmark (#0073EA), navy text (#061D33), pale blue surfaces (#DEEEFF), white ground, and the Manrope typeface used on carbarn.com.au. The mark is a white steering wheel on a blue disc, in the style of Carbarn’s round "C" icon. (User’s instruction, 1 Oct 2026.)
- Interface layout follows a messaging app, WhatsApp being the familiar reference. (User's instruction, 29 Sep 2026.)
- The suggested reply lives in the message box at the bottom of the conversation. (User's choice, 29 Sep 2026.)

## Evidence on Hand

- Real conversations, leads and stock in the local database (`data/app.db`). Real customer data: never used in screenshots or examples that leave this computer.
- Brand reference: carbarn.com.au (logo file /carbarn-logo.svg, icon /icon.png). Fonts are self-hosted in web/fonts: Manrope and Montserrat, both under the Open Font Licence.
- Business knowledge Wheelman reads: knowledge/business-facts.md, knowledge/how-carbarn-works.md and the saved website pages in knowledge/website/.

## Product Principles

1. One conversation at a time. Show who is waiting, then give full attention to the one selected.
2. It must always be obvious who said what: the customer, us, or the agent's unsent suggestion.
3. Nothing is sent by itself. The one Send button, in a Marketplace chat, says what it does and sends exactly the text in the box. Everywhere else the interface must never look as though it sends.
4. Warnings are plain sentences in the place they apply, not codes or colour alone.
5. Familiar over clever. It should work the way a messaging app already works.
