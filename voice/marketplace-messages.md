# Marketplace messages: the "Which message?" list for Facebook Marketplace chats
#
# The same kind of file as voice/dashboard-messages.md: one part per message, its details on the
# @ lines, its facts in curly brackets. See the notes at the top of that file for what the
# conversation can show (@fits, @needs, @not) and what each fact is. Marketplace chats differ:
#   - no greeting line and no sign-off: a chat opens with a thank-you ({thanks})
#   - short and warm, the car's strongest points for this buyer, up to about 90 words
#   - every link to our website is tagged as coming from Facebook when it is sent
#   - the invitation to see the car once per chat; the deposit only once a price is agreed
#
# Facts as in the dashboard file, and:
#   {thanks}   "Thank you for your message, {{NAME}}." (without the name when it is not known)

===== still_available =====
@label: Still available
@fits: availability, vehicle_details, general, first reply
@needs: car
@not: car sold
{thanks} Yes, the {car} is still available. It is {where}, with {km} on the odometer.

{if_inclusions}It comes with {inclusions}, ready to drive away.

{car_link}

===== car_sold =====
@label: Car sold: our other cars
@fits: availability, inspection_booking, price_negotiation, vehicle_details, general
@needs: car sold
{thanks} The {car} has now been sold, but we have more cars available now:
{stock_link}

===== price_question =====
@label: Price question
@fits: price_negotiation
@needs: car
@not: car sold, their offer
{thanks}

{price_reply}

===== their_offer =====
@label: Their offer
@fits: price_negotiation
@needs: car, their offer
@not: car sold
Thank you for your offer. Regarding your offer, [PRICE?].

{if_inclusions}The {car} comes with {inclusions}, ready to drive away.

===== book_viewing =====
@label: Book a viewing
@fits: inspection_booking, location_hours
@needs: car available
{thanks} You are very welcome to come and see the {car} at our Lidcombe showroom.

{invitation}

===== finance =====
@label: Finance
@fits: finance
{thanks} Yes, we can help with finance through our lending partners. Applying uses a soft credit check that does not affect your credit score:
{finance_link}

===== trade_in =====
@label: Trade-in
@fits: trade_in
{thanks} Yes, we accept trade-ins. Please send us its rego, odometer reading, condition and a few photos, and we will give you a value, subject to inspection.

===== delivery =====
@label: Delivery
@fits: delivery_interstate, far away
{thanks} Yes, we deliver Australia-wide by car carrier. Delivery within Greater Sydney is included; send us your suburb and postcode and we will get you a quote for anywhere else.

===== polite_close =====
@label: Polite close
@fits: parting
Thank you for letting us know. All the best with your search, and we are here if you need us.
