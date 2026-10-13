# Security and privacy

Wheelman runs on one computer, reads a dealer's systems, and shows suggested replies to a person
who copies and sends them. These are the properties it is built around. If you find one broken,
please report it (see below).

## What it never does

- **Sends nothing by itself.** One code path sends a message to a customer: a Marketplace reply,
  to the content engine's own reply address, when a person presses Send on the page. It sends
  exactly the text in the box, refuses while a blank is still to be filled, and never runs on
  its own. Dashboard and auction replies leave only by a person's copy and paste into their
  own system.
- **Read-only, with that one exception.** Every outside system is read through a client with an
  allowlist of addresses. The dashboard client can sign in and GET a fixed set of addresses; the
  Marketplace client can GET three and POST a reply to one; the live-auction client can GET
  three and ask the website's public cost calculator for one figure. Anything else is refused
  before a request is made. Reading marks nothing as read and triggers nothing.
- **Customer details never reach an AI service.** Names, phone numbers, emails, rego plates,
  VINs, street addresses, bank details and payment links are removed on this computer before any
  text is sent to a model, and the first name is put back afterwards. Auction amounts travel as
  markers that code fills in. Marketplace chats are never learned from; a text seen only on the
  phone teaches only once the add-on has seen all of it, and never reaches the example bank.
- **Local only.** The page is served on `127.0.0.1` and refuses any other host or origin, with a
  strict content security policy. The browser add-on may post to two routes only (the phone
  reader's reports, and an email thread from the Send to Wheelman button in Gmail), from an
  extension origin, each with its own header.
- **Shared with the team only behind a password.** With `SHARE=1`, requests also arrive through
  a Cloudflare tunnel that cloudflared dials out from this computer; nothing is opened on it.
  Such a request (Cloudflare marks each one) is let in only when a team password is set and the
  browser holds the cookie the sign-in sets: a signed expiry date (HMAC with a key derived from
  the password; HttpOnly, Secure, SameSite=Lax), never the password itself. A POST through the
  tunnel must come from the shared page's own origin and be JSON. Ten wrong passwords in a row
  from one address lock the sign-in there for a quarter of an hour. Changing the password signs
  everyone out.
- **Nothing private in the repository.** `.env`, the session cookie, the database, the real
  business facts, the staff names and the evidence files are git-ignored. `npm run check-private`
  compares every file git would publish against the values in `.env`, the session, the staff
  names and the usual shapes of API keys; it runs before every push and in CI.

## What is stored on the computer that runs it

Leads, conversations, messages and stock from the dashboard; Marketplace chats without thread,
participant or photo identifiers; auction orders with what the customer was charged and paid,
never the dealer's costs; the latest text of each conversation seen on the phone; the email
threads the owner sends from Gmail (the subject, and each message's sender name and address,
time, plain text with the quoted history removed, and attachment count; never HTML, attachments,
recipients or account identifiers); every suggestion and what the person did with it. All of it
in one SQLite file under `data/`, which git never sees.

## Reporting a problem

Please report anything that sends a message without Send being pressed or to anywhere but the
Marketplace chat it was written for, a customer detail reaching an AI
request, the page being reachable from another origin, or a private value in the repository.
Use GitHub's private vulnerability reporting on this repository ("Security" → "Report a
vulnerability"), or open an issue that describes the kind of problem without the detail. Do not
include customer data in a report.

## Supported versions

The `main` branch and the latest tagged release.
