# Marketplace messages: the "Which message?" list for Facebook Marketplace chats
#
# The same kind of file as voice/dashboard-messages.md: one part per message, its details on the
# @ lines, its facts in curly brackets. See the notes at the top of that file for what the
# conversation can show (@fits, @needs, @not) and what each fact is. Marketplace chats differ,
# in the shape our team sends there (learned from their replies of 18 to 20 October 2026):
#   - the first reply to "is it available?" is the three paragraphs below, as the Marketplace
#     system sends them to every buyer, with this car's figures
#   - later replies start with the answer: no greeting line, no sign-off, no opening thank-you
#   - the next step is the buyer's phone number, not the booking link: a person books the
#     inspection from the number and confirms it by text
#   - a price is the figure for you to fill in, then the number; the deposit only once a price
#     is agreed
#   - every link to our website is tagged as coming from Marketplace when it is sent
#
# Facts as in the dashboard file, and:
#   {hi}                 "Hi {{NAME}}," (just "Hi," when the name is not known)
#   {km_said}            "only 7,405 km" under 60,000 km, otherwise "66,000 km"
#   {import_said}        "a grade 4.5 Japanese import", or "a Japanese import" when no grade is recorded
#   {inclusions_short}   "6 months rego, a fresh roadworthy and a 5-year warranty", from the car's
#                        Included list in that order; {if_inclusions_short} keeps its paragraph
#   {finance_form}       the finance application on the car's page (the finance page when there is no car)
#   {trade_in_form}      the trade-in form on the car's page; {if_trade_in_form} keeps its paragraph
#   {if_no_car}          keeps its paragraph only when no car of ours is in the conversation

===== still_available =====
@label: Still available
@fits: availability, vehicle_details, general, first reply
@needs: car available
@not: car sold
{hi} yes it's still available, {price} with {km_said}.

{if_inclusions_short}It's {import_said}, km verified against the auction documents, and the price includes {inclusions_short}.

Keen to see it? Send me your number and I'll give you a call.

===== car_sold =====
@label: Car sold: our other cars
@fits: availability, inspection_booking, price_negotiation, vehicle_details, general
@needs: car sold
The {car} has been sold. You can see everything we have in stock here:
{stock_link}

===== price_question =====
@label: Price question
@fits: price_negotiation
@needs: car
@not: car sold, their offer
The lowest we can do on the {car} is [PRICE?].

If that works for you, send us your number and the day and time that suit you, and we will get the inspection booked for you.

===== their_offer =====
@label: Their offer
@fits: price_negotiation
@needs: car, their offer
@not: car sold
Thank you for your offer. The lowest we can do on the {car} is [PRICE?].

If that works for you, send us your number and the day and time that suit you, and we will get the inspection booked for you.

===== book_viewing =====
@label: Book a viewing
@fits: inspection_booking, location_hours
@needs: car available
Please send us your number and let us know what day and time suit you, and we will get the inspection booked for you and confirm it by text.

Location: 136 Frances St, Lidcombe NSW
Hours: 7 days a week, 8 AM to 5 PM

===== number_received =====
@label: Their number: we will call
@fits: inspection_booking, general
@needs: car available
Thank you for your number. We will give you a call shortly to get the inspection booked for you.

===== finance =====
@label: Finance
@fits: finance
Yes, we do. Please submit the finance form here and let us know once it is done:
{finance_form}

===== trade_in =====
@label: Trade-in
@fits: trade_in
Yes, we accept trade-ins against a car from our stock.

{if_trade_in_form}Please fill in the trade-in form here with the rego number and state, the kilometres, the condition, a few clear photos and your number, and let us know once it is done:
{trade_in_form}

{if_no_car}Please send us the rego number and state, the kilometres, the condition and a few clear photos, and we will give you a figure, subject to inspection.

===== delivery =====
@label: Delivery
@fits: delivery_interstate, far away
Yes, we deliver Australia-wide by car carrier. Delivery within Greater Sydney is included; send us your suburb and postcode and we will get you a quote for anywhere else.

===== polite_close =====
@label: Polite close
@fits: parting
Thank you for letting us know. All the best with your search, and we are here if anything changes.
