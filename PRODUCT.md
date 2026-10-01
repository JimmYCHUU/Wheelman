# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, who answers customer enquiries for Carbarn by SMS. He works alone on his own Windows computer, replying through the Carbarn dashboard. He is comfortable with everyday software and messaging apps and is not a developer. WhatsApp is the messaging app he knows best. (Confirmed 29 Sep 2026.)

## Product Purpose

Wheelman is Carbarn’s customer representative assistant. It suggests a reply to each customer who is waiting for one, written the way our two lead salespeople write (one brisk and factual, one courteous and a little warmer), and informed by how the business actually runs. The owner reads the suggestion, edits it if needed, copies it, and sends it from the dashboard himself. The product never sends anything.

A separate Marketplace section does the same for buyers on Facebook Marketplace, whose chats are read from Carbarn’s content engine. The owner copies the suggestion and pastes it into the Marketplace chat himself. (User’s instruction, 1 Oct 2026.)

Success is the owner answering each waiting customer faster, with a reply that is accurate and sounds like the dealership.

## Positioning

The suggestions are written in the blended voice of the dealership's two lead salespeople, learned from their real past replies, and every figure in a suggestion is checked against the dealership's own stock and policy records before it is shown.

## Operating Context

- Runs on the owner’s computer at http://localhost:3210, next to the Carbarn dashboard in another browser tab.
- The loop: see who is waiting, read what they wrote, read the suggestion, fix any blank, copy, paste into the dashboard, send.
- Roughly 30 to 50 customer messages a day need a reply.
- Customers write by SMS and through car portals (Carsales, Autotrader) and the Carbarn website. Buyers also write on Facebook Marketplace, across several seller accounts, where the content engine’s own auto-reply answers many chats first.
- Carbarn is a used-car dealer in Lidcombe, Sydney, selling mostly vehicles imported from Japan.

## Capabilities and Constraints

- Reads leads, conversations, messages and stock from the dashboard. Read-only.
- Reads Marketplace chats from the content engine. Read-only: three addresses, GET only.
- Two sections, never mixed: Dashboard and Marketplace. A switch at the top of the list chooses one and shows how many are waiting in each.
- Marketplace suggestions are short chat lines: one or two lines, no greeting line, no sign-off. Every chat where the buyer wrote last gets one. (User’s choices, 1 Oct 2026.)
- In Marketplace, the engine’s automatic messages are labelled "Auto-reply", chats handed to a person are marked and listed first, and a figure that only an auto-reply mentioned is never treated as Carbarn’s.
- Writes one suggested reply per waiting customer, using free AI models that are often busy.
- Leaves a marked blank where a person must decide: `[PRICE?]`, `[TRADE-IN VALUE?]`, `[DELIVERY COST?]`, `[DATE?]`, `[CHECK?]`.
- Flags a suggestion when a figure or link is not in the records, when wording is risky, or when it needs input.
- Every number on the page (the Waiting chip, the section switch, the browser tab) counts conversations with messages not yet looked at, and clears when they are opened. The other two chips carry no number.
- The number on a list row counts unread messages. Opening the conversation clears it; a new customer message brings it back. The customer stays under Waiting until a reply is sent. (User’s instruction, 1 Oct 2026.)
- The list column shows notices only for problems that need action now. Reminders, such as business facts still to answer, are not shown there. (User’s instruction, 1 Oct 2026.)
- Never drafts for a customer who opted out.
- Greets a customer and signs off "Regards, Team Carbarn" once a day, on the first reply. Later replies that day start with the answer and carry no sign-off. (User’s instruction, 1 Oct 2026.)
- Actions available on a suggestion: copy, rewrite with an instruction, dismiss, rate. Dismiss sits in the details panel, away from Copy and Rewrite, and never deletes: it can be undone at once, and a dismissed conversation stays under "No reply needed" with a "Put back in Waiting" button. (User’s instruction, 1 Oct 2026.)
- When a customer wants to see a car that is at the yard, the suggestion gives that car’s in-person inspection booking link. When they say they live far away or cannot come, it gives the online video inspection link instead. (User’s instruction, 1 Oct 2026.)
- Learns from replies that were really used: the text copied from the message box and the reply later seen in the dashboard conversation. Learning uses dashboard leads and conversations, the website and the dashboard database only; Marketplace conversations are never learned from. (User’s instruction, 1 Oct 2026.)
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
3. Nothing is sent from here. The interface must never look as though it sends. This holds in both sections.
4. Warnings are plain sentences in the place they apply, not codes or colour alone.
5. Familiar over clever. It should work the way a messaging app already works.
