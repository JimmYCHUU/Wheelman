# Marketplace replies in the shape the team sends: design

20 October 2026. The owner: "The reply structure for facebook marketplace has changed. Study the
last two days replies and learn how replies were sent. Also change the link from
?utm_source=facebook to ?utm_source=marketplace." Later: the replies sent from the Wheelman page
in those two days were a colleague's, and the new wording is the content engine's, "personalized
messages curated by google gemini".

## What the two days showed

Every Marketplace message from 18 to 20 October 2026, read from Wheelman's own copy of the engine's
inbox (no names or numbers kept here; the figures are counts):

- **How replies were sent.** Every reply still leaves through the engine's one reply address.
  The engine now sends it from the account's phone through a companion app: its record of each
  message says `sent_via: companion` (90 of 101 outgoing messages; the rest `messenger`), and
  each conversation says how the next one will go (`will_send_via`). Wheelman's Send was used
  eight times in the two days and worked each time. Sources: `auto` (the engine's automatic
  first reply, 30), `dashboard` (a person, in the engine's inbox or from Wheelman, 68),
  `agent` (the engine's own AI, 5 short lines), `followup` (drafts only).
- **The first reply.** The engine's automatic first reply is now written by an AI for each buyer,
  in one fixed shape: "Hi <first name>, yes it's still available, $<price> with [only] <km> km." /
  "It's a [grade <grade>] Japanese import, km verified against the auction documents, and the
  price includes 6 months rego, a fresh roadworthy and a 5-year warranty." / "Keen to see it?
  Send me your number and I'll give you a call." "only" appears under about 60,000 km; the grade
  is left out when the car has none; the inclusions shrink to what the car has. The old short
  reply ("Hello. Yes, it's available! Call: ...") appeared once. When the engine had not replied,
  the colleague sent the same three paragraphs from the Wheelman page, typed by hand, three
  times in one day.
- **Later replies**, against the fortnight before: median 34 words (was 40), a third under 20
  words; "Thank you" opener 7% (was 5%); "Hi name" opener 7% (was 33%); the buyer's name used 7%
  (was 29%); asks for the phone number 35% (was 25%), "call" 22% (was 9%); the booking link 6%
  (was 13%); the car page's finance form 12% (was 3%); a trade-in form 6%; the inclusions list 12%
  (was 17%); a question 16% (was 37%); a sign-off 0% (was 5%); emoji 4%.
- **The moves.** A buyer who wants to see the car: "Please send me your phone number and let me
  know what time you would like to come in, and I will get that inspection booked for you", then
  the location and hours on two lines; after the number: "Our team just sent a booking link over
  to that number" or "Your inspection is booked for tomorrow at 3 PM. We have sent a confirmation
  message to your number." A price: the figure ("The absolute lowest we can do on the price is
  $X", "We can do a final price of $X") and then the number. Finance: "Yes, we do! Please submit
  the finance form at the link below and let me know once you're done:" and the car page's
  `#finance` form. A trade-in: "We do trade-in" and the car page's `#trade-in` form with what to
  put in it. A thank-you only when the buyer gave something ("Thank you, <name>. Your inspection
  is booked...", "Thank you for letting us know").

## What changes

1. **The channel rules** (`MARKETPLACE_RULES` in `src/prompt.js`, `voice/house-voice.md`,
   `voice/sales-playbook.md`): the first reply is the engine's three paragraphs with the car's
   figures from VEHICLE FACTS; later replies start with the answer, usually 20 to 50 words, no
   greeting line of its own, no sign-off, no opening thank-you; the next step is the buyer's
   number, once in a chat; the price is "The lowest we can do on the <car> is [PRICE?]." then the
   number; finance and a trade-in go to the forms on the car's page; the car's page only when
   details or photos are asked for; the booking link only when the buyer asks for a link or a
   Prompt asks for it. The length warning stays above 90 words (the team's longest was 92).
2. **The plans.** On Marketplace the inspection plan asks for the number and adds no invitation
   under the lines (`inspectionPlan` returns `number: true`; the drafter's inspection-link check
   stands down); the price plan adds no block there; the sales moves have Marketplace wording
   (`CHAT_MOVES` in `src/selling.js`); asking for the number counts as the invitation already
   given, in `selling.js` and in `askedEarlier`.
3. **The finish.** `chatStyle` keeps paragraph breaks (the first reply is three paragraphs) and
   still strips a greeting on a line of its own; `fixGreeting` keeps "Hi {{NAME}}," inside the
   first sentence on Marketplace (a text still gets "Hello").
4. **The messages** in `voice/marketplace-messages.md`: Still available in the engine's shape,
   Price question and Their offer as the figure then the number, Book a viewing as the number
   ask with the location and hours, a new "Their number: we will call", Finance and Trade-in
   with the forms on the car's page. New facts: `{hi}`, `{km_said}`, `{import_said}`,
   `{inclusions_short}` (built by `inclusionsShort` in `src/pricereply.js`), `{finance_form}`,
   `{trade_in_form}`, `{if_no_car}`.
5. **The vehicle facts** list "Start a finance application: <page>#finance" beside the trade-in
   form, so the AI may give it.
6. **The link tag** is `utm_source=marketplace` (`config.marketplace.linkSource`); a link already
   tagged `facebook` is retagged; `insider.js` reads either tag as a Marketplace lead.
7. **Sending** is unchanged in code. The README, PRODUCT and the page's "Sending" note say the
   engine sends from the phone through its companion app.

## Calls made without the owner (reversible)

- The booking link is no longer added under Marketplace replies. The team sent it in 6% of
  replies against the number ask in 35%; the colleague's own sends kept a link twice. If the
  owner wants the link back as well as the number, the Marketplace branch in `inspectionPlan`
  is the one place to change.
- The price reply block is no longer added on Marketplace (the owner's 12 Oct template still
  goes under dashboard replies). Nothing in the two days carried it.
- "Hi {{NAME}}," opens the Marketplace first reply, as the engine's message does; the dashboard
  rule ("Hello", never "Hi") is unchanged.
- The length warning threshold stays at 90 words; the rules say 20 to 50 is usual.
- Nothing is learned from Marketplace replies by the software (RULE-4 stands): the shape was
  learned by reading, once, and written into the rules and the message file.
